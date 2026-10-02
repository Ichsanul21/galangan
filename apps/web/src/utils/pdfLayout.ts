import { jsPDF } from "jspdf";
import { SB_KOP } from "./sb";

/* ==========================================================================
   MESIN PDF TEKS BERBASIS LAYOUT DEKLARATIF
   ==========================================================================

   Kenapa ada file ini, kalau export.ts sudah bisa membuat PDF?

   export.ts meraster DOM: html2canvas -> satu kanvas besar -> dipotong per
   halaman -> JPEG -> addImage. Hasilnya PDF berisi GAMBAR. Teks di dalamnya
   tidak bisa dicari, tidak bisa disalin, tidak bisa dibaca screen reader,
   dan ukurannya besar karena tiap halaman adalah foto.

   Untuk surat resmi - SP1, PO, surat jalan, kwitansi - itu tidak layak.
   Berkas seperti itu dibaca orang lain, disimpanVirus scanner, Sometimes
   diarsipkan. Teks harus teks.

   File ini menulis teks dan garis langsung ke jsPDF, jadi:
     - teks searchable/selectable, ukuran file kecil
     - tidak ada batas kanvas browser sama sekali
     - tidak ada heuristik pemotongan piksel (planSlices/findCleanCutY)
     - layout dalam milimeter, deterministik - tidak berubah menurut
       lebar layar pengguna seperti grid Tailwind sekarang

   Yang TIDAK bisa dilakukan di sini: badge bulat, ProgressBar gradien,
   kartu berbayang, dan grid responsif. Untuk itu tetap pakai export.ts.
   Chart pun tetap harus di-raster (addImage) - lihat image().

   Font: standard-14 jsPDF (helvetica/courier). Semua isi dokumen resmi di
   repo ini hanya memakai karakter WinAnsi (· U+00B7, × U+00D7, — U+2014),
   jadi TIDAK perlu embedding TTF. Guard sanitize() ada sebagai jaring
   pengaman kalau suatu saat ada karakter di luar itu yang ikut masuk.
   ========================================================================== */

/** Karakter di luar WinAnsi akan hilang/berantakan di standard-14 jsPDF.
 *  Dipetakan ke ejaan ASCII yang setara - lebih baik "50% - 60%" daripada
 *  kotak kosong di dokumen resmi. */
const NON_WINANSI: Record<string, string> = {
  "\u2192": "->", // →
  "\u2190": "<-", // ←
  "\u2264": "<=", // ≤
  "\u2265": ">=", // ≥
  "\u2248": "~",  // ≈
  "\u2713": "v",  // ✓
  "\u26a0": "!",  // ⚠
  "\u03a3": "S",  // Σ
  "\u2018": "'",  // ‘
  "\u2019": "'",  // ’
  "\u201c": '"',  // “
  "\u201d": '"',  // ”
  "\u2026": "...",// …
  "\u00a0": " ",  // nbsp
};

/** Bersihkan teks agar aman dicetak dengan font standard-14. */
export function sanitizePdf(s: unknown): string {
  return String(s ?? "")
    .replace(/[\u2190-\u27BF\u2B00-\u2BFF\u0380-\u03FF\u2018\u2019\u201C\u201D\u2026\u00A0]/g, (ch) => NON_WINANSI[ch] ?? "?");
}

/** Angka dengan pemisah ribuan titik, tanpa desimal bila bulat.
 *  Ini bentuk yang dipakai semua dokumen resmi repo ini (Rp 1.234.567). */
export function pdfNum(v: unknown, decimals = 0): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return "-";
  return n.toLocaleString("id-ID", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** Tanggal ISO -> "2 Oktober 2026". Kosong -> "-". */
export function pdfDate(iso: unknown): string {
  const s = String(iso ?? "").trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return s === "" ? "-" : s;
  const bulan = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  return `${Number(m[3])} ${bulan[Number(m[2]) - 1] ?? m[2]} ${m[1]}`;
}

export interface PdfDocOptions {
  orientation?: "portrait" | "landscape";
  format?: string;
  marginMm?: number;
  fontSize?: number;
}

export type PdfCell = string | number | null | undefined;

export interface PdfTableSpec {
  /** Baris kepala. Hilangkan (undefined) untuk tabel tanpa header -
   *  slip gaji dan transittal memang begitu. */
  head?: string[];
  rows: PdfCell[][];
  /** Lebar tiap kolom: angka = mm, "auto" = sisa ruang dibagi rata. */
  widths: (number | "auto")[];
  align?: ("left" | "right" | "center")[];
  /** Indeks baris yang ditebalkan + digaris atas (baris Total). */
  totalRow?: number;
  /** Indeks kolom yang jadi label (baris label di kiri, nilai di kanan).
   *  PO memakai ini: ["Total", "", "", "", nilai]. */
  labelCol?: number;
  fontSize?: number;
  headFontSize?: number;
}

export interface PdfKvPair {
  label: string;
  value: string;
}

export interface PdfSignature {
  role: string;
  name: string;
  /** Baris kosong untuk tangan di atas nama. */
  rows?: number;
}

const NAVY: [number, number, number] = [11, 58, 99];
const STEEL: [number, number, number] = [82, 105, 124];
const LINE: [number, number, number] = [150, 150, 150];
const HEAD_FILL: [number, number, number] = [233, 239, 244];

/**
 * Dokumen PDF berorientasi cursor dalam milimeter.
 *
   * Prinsipnya: setiap primitive yang dipanggil menambah tinggi ke
 * cursor, dan otomatis MEMBUAT HALAMAN BARU bila ruang tersisa tidak
 * cukup. Primitive TIDAK pernah menggambar melebihi margin bawah - inilah
 * yang membuat file ini tidak butuh heuristik pemotongan piksel seperti
 * planSlices() di export.ts.
 *
 * Cara pakai:
 *   const doc = new PdfDoc({ orientation: "portrait" });
 *   doc.kop();
 *   doc.title("SURAT JALAN", no);
 *   doc.kv([{ label: "Tujuan", value: "..." }]);
 *   doc.table({ head: ["No", "Nama Barang", "Jumlah"], rows, widths: [15, "auto", 25] });
 *   doc.signatures([{ role: "Yang Menerima", name: "..." }, { role: "Yang Menyerahkan", name: "..." }]);
 *   doc.save(`SJ-${no}`);
 */
export class PdfDoc {
  private readonly pdf: jsPDF;
  private readonly marginMm: number;
  private readonly pageW: number;
  private readonly pageH: number;
  private readonly contentW: number;
  private readonly defaultFontSize: number;
  private y = 0;
  private pageCount = 0;

  constructor(opts: PdfDocOptions = {}) {
    const { orientation = "portrait", format = "a4", marginMm = 15, fontSize = 9 } = opts;
    this.pdf = new jsPDF({ unit: "mm", format, orientation, compress: true });
    this.marginMm = marginMm;
    this.defaultFontSize = fontSize;
    this.pageW = this.pdf.internal.pageSize.getWidth();
    this.pageH = this.pdf.internal.pageSize.getHeight();
    this.contentW = this.pageW - marginMm * 2;
    this.pageCount = 1;
    this.y = marginMm;
    this.pdf.setFont("helvetica", "normal");
    this.pdf.setFontSize(fontSize);
    this.pdf.setTextColor(0, 0, 0);
  }

  /** Lebar area isi dalam mm. */
  get width(): number {
    return this.contentW;
  }

  private get bottom(): number {
    return this.pageH - this.marginMm;
  }

  /** Sisa tinggi halaman dalam mm. Dipakai primitive untuk memutuskan page break. */
  private get spaceLeft(): number {
    return this.bottom - this.y;
  }

  private newPage(): void {
    this.pdf.addPage();
    this.pageCount += 1;
    this.y = this.marginMm;
  }

  /** Buat ruang `h` mm; pindah halaman otomatis bila tidak cukup. */
  private need(h: number): void {
    if (this.spaceLeft < h) this.newPage();
  }

  private setFont(size: number, bold = false): void {
    this.pdf.setFont("helvetica", bold ? "bold" : "normal");
    this.pdf.setFontSize(size);
  }

  /** Lebar teks dalam mm untuk ukuran font saat ini. */
  private widthOf(text: string): number {
    return this.pdf.getTextWidth(text);
  }

  /** Potong teks agar muat `maxW` mm; kembalikan array baris. */
  private wrap(text: string, maxW: number): string[] {
    const clean = sanitizePdf(text);
    if (clean === "") return [""];
    if (this.widthOf(clean) <= maxW) return [clean];
    return this.pdf.splitTextToSize(clean, maxW) as string[];
  }

  /**
   * Kop surat: nama perusahaan besar, subjudul, alamat. Teks rata tengah.
   * `line2` menggabungkan alamat + HP secara default.
   */
  kop(opts: { name?: string; line1?: string; hq?: string; addr?: string; rule?: boolean } = {}): void {
    const name = opts.name ?? SB_KOP.name;
    const line1 = opts.line1 ?? SB_KOP.line1;
    const hq = opts.hq ?? SB_KOP.hq;
    const addr = opts.addr ?? `${SB_KOP.addr1} · Telp. ${SB_KOP.hp}`;
    this.need(24);
    const cx = this.marginMm + this.contentW / 2;
    this.pdf.setTextColor(...NAVY);
    this.setFont(15, true);
    this.pdf.text(sanitizePdf(name), cx, this.y, { align: "center" });
    this.y += 5.5;
    this.setFont(9);
    this.pdf.text(sanitizePdf(line1), cx, this.y, { align: "center" });
    this.y += 4;
    this.setFont(8);
    this.pdf.setTextColor(...STEEL);
    for (const line of [hq, addr]) {
      for (const wrapped of this.wrap(line, this.contentW)) {
        this.pdf.text(wrapped, cx, this.y, { align: "center" });
        this.y += 3.6;
      }
    }
    this.pdf.setTextColor(0, 0, 0);
    if (opts.rule !== false) {
      this.y += 1.5;
      this.pdf.setDrawColor(...NAVY);
      this.pdf.setLineWidth(0.8);
      this.pdf.line(this.marginMm, this.y, this.marginMm + this.contentW, this.y);
      this.pdf.setLineWidth(0.2);
    }
    this.y += 5;
  }

  /** Judul dokumen besar + nomor/tanggal di bawahnya, rata tengah. */
  title(text: string, ref?: string): void {
    this.need(14);
    const cx = this.marginMm + this.contentW / 2;
    this.pdf.setTextColor(...NAVY);
    this.setFont(12, true);
    this.pdf.text(sanitizePdf(text).toUpperCase(), cx, this.y, { align: "center" });
    this.y += 5.5;
    if (ref) {
      this.setFont(9, false);
      this.pdf.setTextColor(...STEEL);
      this.pdf.text(sanitizePdf(ref), cx, this.y, { align: "center" });
      this.y += 5;
    }
    this.pdf.setTextColor(0, 0, 0);
  }

  /**
   * Blok label/nilai. Default `labelCol` 46mm: label rata kiri, nilai mulai
   * dari kolom yang sama, jadi label panjang tidak mendorong nilai.
   */
  kv(pairs: PdfKvPair[], opts: { labelW?: number; fontSize?: number; gap?: number } = {}): void {
    const { labelW = 46, fontSize = this.defaultFontSize, gap = 1.6 } = opts;
    const valueW = this.contentW - labelW - 2;
    for (const p of pairs) {
      const lines = this.wrap(p.value, valueW);
      const h = Math.max(1, lines.length) * (fontSize * 0.42) + gap;
      this.need(h);
      this.setFont(fontSize, false);
      this.pdf.setTextColor(...STEEL);
      this.pdf.text(sanitizePdf(p.label), this.marginMm, this.y);
      this.pdf.setTextColor(0, 0, 0);
      const vx = this.marginMm + labelW + 2;
      let vy = this.y;
      for (const line of lines) {
        this.pdf.text(line, vx, vy);
        vy += fontSize * 0.42;
      }
      this.y = vy + gap;
    }
  }

  /**
   * Tabel dengan lebar kolom eksplisit, header opsional, perataan per kolom,
   * dan baris total.
   *
   * Lebar kolom="auto" dibagi rata dari sisa ruang. Sel panjang di-wrap dan
   * menambah tinggi baris, bukan terpotong diam-diam. Header diulang
   * otomatis setiap kali tabel melewati batas halaman - tidak ada di
   * html2canvas, sehingga `<thead>` di laporan yang terpotong selalu hilang.
   */
  table(spec: PdfTableSpec): void {
    const { head, rows, widths, align, totalRow, labelCol, fontSize = this.defaultFontSize, headFontSize = fontSize } = spec;
    const cols = widths.length;
    const alignOf = (i: number): "left" | "right" | "center" => align?.[i] ?? "left";

    // Bagi lebar "auto" rata dari sisa ruang.
    const autoCount = widths.filter((cw) => cw === "auto").length;
    const fixedSum = widths.reduce((sum: number, cw) => sum + (typeof cw === "number" ? cw : 0), 0);
    const autoW = autoCount > 0 ? Math.max(12, (this.contentW - fixedSum) / autoCount) : 0;
    const w = (i: number): number => (typeof widths[i] === "number" ? (widths[i] as number) : autoW);

    const headHeight = headFontSize * 0.42 + 3;

    const drawHead = (): void => {
      if (!head) return;
      this.need(headHeight);
      // Isi header.
      this.pdf.setFillColor(...HEAD_FILL);
      this.pdf.rect(this.marginMm, this.y - 2, this.contentW, headHeight, "F");
      this.setFont(headFontSize, true);
      let x = this.marginMm;
      for (let i = 0; i < cols; i += 1) {
        const cw = w(i);
        const al = alignOf(i);
        const tx = al === "right" ? x + cw - 1.5 : al === "center" ? x + cw / 2 : x + 1.5;
        this.pdf.text(sanitizePdf(head[i] ?? ""), tx, this.y, { align: al === "left" ? "left" : al });
        x += cw;
      }
      this.y += headHeight;
      this.gridRow(this.y - 2, this.contentW, 0.2);
    };

    if (head) drawHead();

    for (let r = 0; r < rows.length; r += 1) {
      const isTotal = totalRow === r;
      // Sel yang tinggi satu baris minimum, atau lebih kalau perlu wrap.
      const cells: string[][] = [];
      let linesMax = 1;
      for (let c = 0; c < cols; c += 1) {
        const raw = rows[r]?.[c];
        const cellW = w(c) - 3;
        const wrapped = isTotal && labelCol === c && !String(raw ?? "").trim()
          ? []
          : this.wrap(String(raw ?? ""), cellW);
        cells.push(wrapped);
        if (wrapped.length > linesMax) linesMax = wrapped.length;
      }
      const h = linesMax * (fontSize * 0.42) + 2.6;

      // Baris yang tidak muat -> pindah halaman, header diulang, baris ini
      // digambar ulang dari awal (mencegah teks terpotong antar halaman).
      if (this.spaceLeft < h + 2) {
        this.newPage();
        if (head) drawHead();
      }

      if (isTotal) this.gridRow(this.y - 2, this.contentW, 0.5);
      this.setFont(fontSize, isTotal);
      let x = this.marginMm;
      for (let c = 0; c < cols; c += 1) {
        const cw = w(c);
        const al = alignOf(c);
        const tx = al === "right" ? x + cw - 1.5 : al === "center" ? x + cw / 2 : x + 1.5;
        const valign = { baseline: "middle" as const };
        let ty = this.y;
        for (const line of cells[c]) {
          this.pdf.text(line, tx, ty, valign);
          ty += fontSize * 0.42;
        }
        x += cw;
      }
      this.y += h;
      this.gridRow(this.y - 2, this.contentW, 0.15);
    }
    this.y += 3;
  }

  /** Garis horizontal tipis sepanjang `w` mm mulai posisi cursor. */
  private gridRow(atY: number, w: number, weight: number): void {
    this.pdf.setDrawColor(...LINE);
    this.pdf.setLineWidth(weight);
    this.pdf.line(this.marginMm, atY, this.marginMm + w, atY);
    this.pdf.setLineWidth(0.2);
  }

  /** Garis pemisah lebar penuh (dipakai sebelum blok tanda tangan). */
  rule(weight = 0.4): void {
    this.need(6);
    this.y += 1.5;
    this.gridRow(this.y, this.contentW, weight);
    this.y += 4;
  }

  /**
   * Paragraf teks yang di-wrap otomatis. Dipakai untuk isi surat HR dan
   * syarat-something seperti "Syarat pembayaran: NET 30".
   */
  para(text: string, opts: { align?: "left" | "center" | "right" | "justify"; indentMm?: number; fontSize?: number; width?: number } = {}): void {
    const { align = "left", indentMm = 0, fontSize = this.defaultFontSize, width } = opts;
    const boxW = width ?? this.contentW - indentMm;
    const lines = this.wrap(text, boxW);
    const lh = fontSize * 0.46;
    for (const line of lines) {
      this.need(lh);
      this.setFont(fontSize);
      const tx = this.marginMm + indentMm;
      this.pdf.text(line, tx, this.y, { align });
      this.y += lh;
    }
    this.y += 1.5;
  }

  /** Baris label: nilai dalam satu baris, untuk paragraf "Tempat, tanggal". */
  paraKV(label: string, value: string, opts: { fontSize?: number } = {}): void {
    const fontSize = opts.fontSize ?? this.defaultFontSize;
    this.need(fontSize * 0.46);
    this.setFont(fontSize);
    this.pdf.setTextColor(...STEEL);
    this.pdf.text(sanitizePdf(label), this.marginMm, this.y);
    this.pdf.setTextColor(0, 0, 0);
    this.pdf.text(sanitizePdf(value), this.marginMm + this.contentW, this.y, { align: "right" });
    this.y += fontSize * 0.46 + 1.4;
  }

  /**
   * Blok tanda tangan. Minimal satu blok dipindah ke halaman baru bila
   * tidak muut - tanda tangan yang terpisah dari tabelnya olehoracic
   * page break tidak sah sebagai dokumen.
   */
  signatures(sigs: PdfSignature[], opts: { rows?: number; fontSize?: number } = {}): void {
    const { rows = 4, fontSize = 9 } = opts;
    const colW = this.contentW / Math.max(1, sigs.length);
    const blockH = 8 + rows * 5.2;
    this.need(blockH);

    let x = this.marginMm + colW / 2;
    for (const s of sigs) {
      this.setFont(fontSize, true);
      this.pdf.text(sanitizePdf(s.role), x, this.y, { align: "center" });
    }
    let sy = this.y + 6;
    for (let i = 0; i < rows; i += 1) {
      sy += 5.2;
    }
    this.setFont(fontSize, false);
    for (const s of sigs) {
      const name = sanitizePdf(s.name || "-");
      this.pdf.text(name, x, this.y + 6 + rows * 5.2, { align: "center" });
      const nw = this.widthOf(name);
      this.pdf.setDrawColor(...LINE);
      this.pdf.line(x - Math.max(18, nw / 2 + 4), this.y + 6 + rows * 5.2 + 1, x + Math.max(18, nw / 2 + 4), this.y + 6 + rows * 5.2 + 1);
    }
    this.y += blockH;
  }

  /** Pindah halaman eksplisit. */
  pageBreak(): void {
    this.newPage();
  }

  /** Sisakan ruang kosong, pindah halaman bila perlu. */
  space(mm: number): void {
    this.need(mm);
    this.y += mm;
  }

  /** Tutup dokumen: tulis footer "Halaman N dari M" di setiap halaman lalu simpan. */
  save(filename: string): void {
    const total = this.pageCount;
    for (let p = 1; p <= total; p += 1) {
      this.pdf.setPage(p);
      this.setFont(7.5);
      this.pdf.setTextColor(140, 150, 160);
      this.pdf.text(`Halaman ${p} dari ${total}`, this.marginMm + this.contentW / 2, this.pageH - 7, { align: "center" });
    }
    this.pdf.save(`${sanitizePdf(filename)}.pdf`);
  }

  /** Akses underlying jsPDF untuk kasus khusus (mis. gambar). */
  raw(): jsPDF {
    return this.pdf;
  }
}
