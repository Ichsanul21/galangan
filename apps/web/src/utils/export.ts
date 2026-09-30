import writeXlsxFile, { type SheetData } from "write-excel-file/browser";
import html2pdf from "html2pdf.js";

/** Awalan sel berbahaya untuk injeksi formula Excel saat dibuka. */
const FORMULA_LEAD = ["=", "+", "-", "@", "\t", "|"];

function sanitizeCell(v: string): string {
  if (FORMULA_LEAD.some((p) => v.startsWith(p))) return `'${v}`;
  return v;
}

export async function exportExcel(data: unknown[][], filename: string, sheetName = "Export"): Promise<void> {
  const widths: number[] = [];
  const rows: SheetData = (data ?? []).map((row, r) =>
    (row ?? []).map((c, cIdx) => {
      let raw = c instanceof Date || typeof c === "string" || typeof c === "number" || typeof c === "boolean" ? c : c === null || c === undefined ? undefined : String(c);
      if (typeof raw === "string") raw = sanitizeCell(raw);
      widths[cIdx] = Math.max(widths[cIdx] ?? 10, Math.min(String(raw ?? "").length + 2, 45));
      // Baris 0 = judul (besar, navy), baris 1 = header (tebal + fill).
      if (r === 0) return { value: raw, fontWeight: "bold" as const, fontSize: 14, color: "#0B3A63" };
      if (r === 1) return { value: raw, fontWeight: "bold" as const, backgroundColor: "#E9EFF4" };
      return raw ?? null;
    })
  );
  await writeXlsxFile(rows, {
    sheet: (sheetName || "Export").slice(0, 31),
    columns: widths.map((w) => ({ width: w })),
    stickyRowsCount: 1,
  }).toFile(`${filename}.xlsx`);
}

/** Rasterisasi <svg> (recharts) jadi <img> PNG agar chart ikut ter-capture.
 *  html2canvas sering gagal menggambar SVG foreignObject → PDF kosong. */
async function svgToImg(svg: SVGElement): Promise<HTMLImageElement | null> {
  const clone = svg.cloneNode(true) as SVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const box = svg.getBoundingClientRect();
  const w = Math.max(1, Math.round(box.width || Number(svg.getAttribute("width")) || 600));
  const h = Math.max(1, Math.round(box.height || Number(svg.getAttribute("height")) || 300));
  clone.setAttribute("width", String(w));
  clone.setAttribute("height", String(h));
  const xml = new XMLSerializer().serializeToString(clone);
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
  try {
    const img = new Image();
    img.width = w;
    img.height = h;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("svg gagal diraster"));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = w * 2;
    canvas.height = h * 2;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const out = new Image();
    out.src = canvas.toDataURL("image/png");
    out.width = w;
    out.height = h;
    return out;
  } catch {
    return null;
  }
}

export interface ExportPDFOptions {
  /** true = charts (SVG) ikut diraster ke gambar. Default true. */
  charts?: boolean;
  orientation?: "portrait" | "landscape";
  format?: string;
}

export async function exportPDF(elementId: string, filename: string, options: ExportPDFOptions = {}): Promise<void> {
  const el = document.getElementById(elementId);
  if (!el) throw new Error(`Elemen #${elementId} tidak ditemukan`);

  const { charts = true, orientation = "landscape", format = "a4" } = options;

  /* 1. Buka semua area scroll supaya konten panjang tidak terpotong. */
  const opened: HTMLElement[] = [];
  el.querySelectorAll<HTMLElement>("*").forEach((n) => {
    const cs = getComputedStyle(n);
    const scrollable = cs.overflowY === "auto" || cs.overflowY === "scroll"
      || cs.overflowX === "auto" || cs.overflowX === "scroll" || cs.maxHeight !== "none";
    if (scrollable) {
      opened.push(n);
      n.dataset.pdfPrevMaxh = n.style.maxHeight;
      n.dataset.pdfPrevOvy = n.style.overflowY;
      n.style.maxHeight = "none";
      n.style.overflow = "visible";
    }
  });
  const prevMaxh = el.style.maxHeight;
  const prevOvy = el.style.overflow;
  el.style.maxHeight = "none";
  el.style.overflow = "visible";

  /* 2. SVG recharts -> <img> supaya chart benar-benar masuk PDF. */
  const imgSwaps: { parent: Node; next: Node | null; img: HTMLImageElement }[] = [];
  if (charts) {
    const svgs = Array.from(el.querySelectorAll<SVGElement>("svg"));
    for (const svg of svgs) {
      const img = await svgToImg(svg);
      if (!img) continue;
      imgSwaps.push({ parent: svg.parentNode as Node, next: svg.nextSibling, img });
      svg.parentNode?.replaceChild(img, svg);
    }
  }

  /* 3. Pindahkan ke layar agar html2canvas tidak menghasilkan halaman kosong. */
  const prev = { position: el.style.position, left: el.style.left, top: el.style.top, zIndex: el.style.zIndex, background: el.style.background, width: el.style.width };
  el.style.position = "fixed";
  el.style.left = "0";
  el.style.top = "0";
  el.style.zIndex = "99999";
  el.style.background = "#ffffff";
  el.style.width = "1000px";
  // Beri waktu font & layout settle sebelum raster.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await new Promise((r) => (document as any).fonts?.ready ?? r);
  await new Promise((r) => setTimeout(r, 120));

  const opts = {
    margin: 10,
    filename: `${filename}.pdf`,
    image: { type: "jpeg", quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, logging: false, scrollX: 0, scrollY: 0, windowWidth: 1200 },
    jsPDF: { unit: "mm", format, orientation },
    // Anti-potong: hormati CSS page-break + fallback legacy bila CSS tak terbaca.
    pagebreak: { mode: ["css", "legacy"] },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;

  try {
    await (html2pdf() as unknown as { set: (o: unknown) => { from: (e: HTMLElement) => { save: () => Promise<void> } } }).set(opts).from(el).save();
  } finally {
    /* 4. Kembalikan semua style & gambar. */
    imgSwaps.forEach(({ parent, next, img }) => {
      if (next && next.parentNode === parent) parent.replaceChild(next, img);
      else parent.removeChild(img);
    });
    opened.forEach((n) => {
      n.style.maxHeight = n.dataset.pdfPrevMaxh ?? "";
      n.style.overflowY = n.dataset.pdfPrevOvy ?? "";
      delete n.dataset.pdfPrevMaxh;
      delete n.dataset.pdfPrevOvy;
    });
    el.style.maxHeight = prevMaxh;
    el.style.overflow = prevOvy;
    el.style.position = prev.position;
    el.style.left = prev.left;
    el.style.top = prev.top;
    el.style.zIndex = prev.zIndex;
    el.style.background = prev.background;
    el.style.width = prev.width;
  }
}

export { fmtRupiah, fmtJumlah, fmtMiliar, fmtTanggal, fmtRentang } from "./format";
