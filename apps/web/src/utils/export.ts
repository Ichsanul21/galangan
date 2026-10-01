import writeXlsxFile, { type SheetData } from "write-excel-file/browser";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

/* ============ E K S E L ============ */

/** Awalan sel berbahaya untuk injeksi formula Excel saat dibuka. */
const FORMULA_LEAD = ["=", "+", "-", "@", "\t", "|"];

function sanitizeCell(v: string): string {
  if (FORMULA_LEAD.some((p) => v.startsWith(p))) return `'${v}`;
  return v;
}

type CellRaw = string | number | boolean | Date | undefined;

function normalizeCell(c: unknown): CellRaw {
  if (c instanceof Date || typeof c === "string" || typeof c === "number" || typeof c === "boolean") return c;
  if (c === null || c === undefined) return undefined;
  return String(c);
}

export async function exportExcel(data: unknown[][], filename: string, sheetName = "Export"): Promise<void> {
  const widths: number[] = [];
  const rows: SheetData = (data ?? []).map((row, r) =>
    (row ?? []).map((c, cIdx) => {
      let raw = normalizeCell(c);
      if (typeof raw === "string") raw = sanitizeCell(raw);
      widths[cIdx] = Math.max(widths[cIdx] ?? 10, Math.min(String(raw ?? "").length + 2, 45));
      // Baris 0 = judul (besar, navy), baris 1 = header (tebal + fill).
      if (r === 0) return { value: raw, fontWeight: "bold" as const, fontSize: 14, color: "#0B3A63" };
      if (r === 1) return { value: raw, fontWeight: "bold" as const, backgroundColor: "#E9EFF4" };
      return raw ?? null;
    })
  );
  await writeXlsxFile(rows, {
    sheet: cleanSheetName(sheetName),
    columns: widths.map((w) => ({ width: w })),
    stickyRowsCount: 1,
  }).toFile(`${filename}.xlsx`);
}

export interface ExcelSheet {
  /** Nama tab sheet (otomatis dibersihkan: maks 31 karakter, tanpa []:*?/\ ). */
  name: string;
  /** Baris 0 = header tabel (tebal + fill), baris berikutnya = data. */
  rows: unknown[][];
}

const SHEET_NAME_BANNED = /[[\]:*?/\\]/g;

function cleanSheetName(name: string): string {
  return (String(name || "").trim() || "Sheet").replace(SHEET_NAME_BANNED, "-").slice(0, 31);
}

/** Workbook multi-sheet bergaya seragam: header tebal, lebar kolom otomatis,
 *  sanitasi anti-injeksi formula, baris kepala menempel saat di-scroll. */
export async function exportExcelSheets(sheets: ExcelSheet[], filename: string): Promise<void> {
  const usedNames = new Set<string>();
  const built = (sheets ?? []).map((s) => {
    let name = cleanSheetName(s.name);
    let n = 2;
    while (usedNames.has(name)) name = cleanSheetName(`${s.name} ${n++}`);
    usedNames.add(name);
    const widths: number[] = [];
    const data: SheetData = (s.rows ?? []).map((row, r) =>
      (row ?? []).map((c, cIdx) => {
        let raw = normalizeCell(c);
        if (typeof raw === "string") raw = sanitizeCell(raw);
        widths[cIdx] = Math.max(widths[cIdx] ?? 10, Math.min(String(raw ?? "").length + 2, 45));
        if (r === 0) return { value: raw ?? "", fontWeight: "bold" as const, backgroundColor: "#E9EFF4" };
        return raw ?? "";
      })
    );
    return {
      data,
      sheet: name,
      columns: widths.map((w) => ({ width: w })),
      stickyRowsCount: 1,
    };
  });
  if (built.length === 0) throw new Error("Tidak ada sheet untuk diekspor");
  await writeXlsxFile(built).toFile(`${filename}.xlsx`);
}

/* ============ P D F ============ */

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
  /** Format halaman jsPDF, mis. "a4" (default) atau "letter". */
  format?: string;
  /** Margin halaman dalam mm. Default 10. */
  marginMm?: number;
  /** Skala raster html2canvas (diturunkan otomatis bila kanvas terlalu tinggi). */
  scale?: number;
}

/* Status "sedang export PDF". Chart harus animasi seperti biasa saat
   aplikasi normal dipakai, tapi tidak boleh bergerak saat html2canvas
   memotret - SVG yang diambil di tengah animasi menghasilkan garis terputus
   atau belum tergambar. Versi lama menyelesaikannya dengan mematikan
   animasi permanen di tiap chart, jadi grafik selalu diam. */
let pdfExporting = false;

/* Nilai untuk prop isAnimationActive recharts: aktif normal, mati saat export. */
export function chartAnim(): boolean {
  return !pdfExporting;
}

/* Batas aman dimensi kanvas lintas browser. Melewatinya = hasil blank atau
   alokasi gagal - penyebab utama PDF kosong pada konten panjang. */
const MAX_CANVAS_SIDE = 16384;

interface SliceRect {
  y: number;
  h: number;
}

/** Baris "bersih" terdekat di atas batas potong yang diusulkan: pemotongan
 *  halaman digeser ke celah kosong (padding antar baris teks/tabel) sehingga
 *  teks, baris tabel, dan chart tidak pernah terpotong di tengah. */
function findCleanCutY(ctx: CanvasRenderingContext2D, width: number, proposedY: number, maxUp: number): number | null {
  const top = Math.max(0, proposedY - maxUp);
  const stripH = proposedY - top;
  if (stripH <= 0 || width <= 0) return null;
  let pixels: Uint8ClampedArray;
  try {
    pixels = ctx.getImageData(0, top, width, stripH).data;
  } catch {
    return null;
  }
  const step = 2;
  const sampled = Math.max(1, Math.ceil(width / step));
  for (let row = stripH - 1; row >= 0; row -= 1) {
    const base = row * width * 4;
    let painted = 0;
    for (let x = 0; x < width; x += step) {
      const i = base + x * 4;
      if (pixels[i] < 242 || pixels[i + 1] < 242 || pixels[i + 2] < 242) painted += 1;
    }
    // <2% piksel berwarna = celah kosong (garis tepi vertikal tabel tetap lolos).
    if (painted / sampled < 0.02) return top + row;
  }
  return null;
}

function planSlices(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, pageSlicePx: number): SliceRect[] {
  const slices: SliceRect[] = [];
  let y = 0;
  while (y < canvas.height) {
    let h = Math.min(pageSlicePx, canvas.height - y);
    if (y + h < canvas.height) {
      const cut = findCleanCutY(ctx, canvas.width, y + h, Math.min(Math.floor(pageSlicePx * 0.45), 600));
      if (cut !== null && cut > y) h = cut - y;
    }
    slices.push({ y, h });
    y += h;
  }
  return slices.length > 0 ? slices : [{ y: 0, h: Math.max(1, canvas.height) }];
}

function captureElement(el: HTMLElement, scale: number): Promise<HTMLCanvasElement> {
  return html2canvas(el, {
    scale,
    useCORS: true,
    allowTaint: false,
    logging: false,
    backgroundColor: "#ffffff",
    scrollX: 0,
    scrollY: 0,
    width: el.scrollWidth,
    height: el.scrollHeight,
    windowWidth: Math.max(1024, el.scrollWidth),
    windowHeight: el.scrollHeight,
  });
}

/** Ekspor elemen DOM → file PDF yang LANGSUNG terunduh utuh.
 *
 *  Pipeline: html2canvas (satu kanvas penuh, skala diturunkan otomatis bila
 *  melewati batas browser) → pemotongan per halaman pada celah bersih →
 *  jsPDF addImage per halaman → pdf.save() (unduhan penuh, bukan preview).
 *
 *  Elemen boleh tersembunyi off-screen (section cetak khusus) maupun konten
 *  hidup; keduanya dipindahkan ke layar selama capture lalu dipulihkan. */
export async function exportPDF(elementId: string, filename: string, options: ExportPDFOptions = {}): Promise<void> {
  const el = document.getElementById(elementId);
  if (!el) throw new Error(`Elemen #${elementId} tidak ditemukan`);

  const { charts = true, orientation = "landscape", format = "a4", marginMm = 10, scale = 2 } = options;

  /* Bekukan animasi chart selama seluruh proses capture - berlaku juga saat
     options.charts=false, karena html2canvas tetap memotret elemen yang
     berisi SVG. Flag ini dibaca chartAnim() oleh tiap series recharts. */
  pdfExporting = true;
  await new Promise((r) => setTimeout(r, 60));

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

  /* 1b. Sembunyikan kontrol UI (input cari, tombol) saat capture.
     Versi lama ikut memotretnya sehingga dokumen resmi memuat kotak berisi
     kata kunci/URL yang tidak profesional. */
  const hidden: HTMLElement[] = [];
  el.querySelectorAll<HTMLElement>("[data-export-hide]").forEach((n) => {
    hidden.push(n);
    n.dataset.pdfPrevDisplay = n.style.display;
    n.style.display = "none";
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
  try {
    await document.fonts.ready;
  } catch {
    /* abaikan - font siap atau tidak, capture tetap jalan */
  }
  await new Promise((r) => requestAnimationFrame(() => r(undefined)));
  await new Promise((r) => setTimeout(r, 120));

  try {
    /* 4. Raster penuh. Skala diturunkan bila tinggi konten melewati batas
          kanvas browser - inilah akar bug "PDF blank" pada laporan panjang. */
    const heightPx = Math.max(1, el.scrollHeight);
    const safeScale = Math.max(0.5, Math.min(scale, MAX_CANVAS_SIDE / heightPx));
    let canvas = await captureElement(el, safeScale);
    if (!canvas || canvas.width === 0 || canvas.height === 0) {
      canvas = await captureElement(el, Math.max(0.5, safeScale / 2));
    }
    if (!canvas || canvas.width === 0 || canvas.height === 0) {
      throw new Error("Konten gagal diraster (kanvas kosong)");
    }

    /* 5. Susun halaman: potong kanvas setinggi satu halaman isi, geser titik
          potong ke celah bersih terdekat agar baris/teks tidak terpenggal. */
    const pdf = new jsPDF({ unit: "mm", format, orientation, compress: true });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const contentW = pageW - marginMm * 2;
    const contentH = pageH - marginMm * 2;
    const pxPerMm = canvas.width / contentW;
    const pageSlicePx = Math.max(1, Math.floor(contentH * pxPerMm));
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Canvas 2D tidak didukung browser ini");
    const slices = planSlices(ctx, canvas, pageSlicePx);

    slices.forEach((s, i) => {
      if (i > 0) pdf.addPage();
      const slice = document.createElement("canvas");
      slice.width = canvas.width;
      slice.height = s.h;
      const sctx = slice.getContext("2d");
      if (!sctx) return;
      sctx.fillStyle = "#ffffff";
      sctx.fillRect(0, 0, slice.width, slice.height);
      sctx.drawImage(canvas, 0, s.y, canvas.width, s.h, 0, 0, canvas.width, s.h);
      const imgH = s.h / pxPerMm;
      pdf.addImage(slice.toDataURL("image/jpeg", 0.92), "JPEG", marginMm, marginMm, contentW, imgH, undefined, "FAST");
      pdf.setFontSize(8);
      pdf.setTextColor(120, 130, 140);
      pdf.text(`Halaman ${i + 1} dari ${slices.length}`, pageW / 2, pageH - marginMm / 2, { align: "center" });
    });

    /* 6. Unduh file langsung (bukan preview / tab baru). */
    pdf.save(`${filename}.pdf`);
  } finally {
    pdfExporting = false;
    /* 7. Kembalikan semua style & gambar. */
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
    hidden.forEach((n) => {
      n.style.display = n.dataset.pdfPrevDisplay ?? "";
      delete n.dataset.pdfPrevDisplay;
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
