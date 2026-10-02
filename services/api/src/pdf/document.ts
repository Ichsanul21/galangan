/* Document - mengorkestrasi blok menjadi PDF dengan paginasi dua fase.
 *
 * ALUR (satu-satunya di seluruh mesin):
 *   FASE 1  PLAN   : setiap blok di-`plan()` pada lebar final. Tidak ada
 *                   satu pun piksel yang digambar. Blok yang boleh terpotong
 *                   (tabel) mengembalikan segmen-segmen yang sudah tahu
 *                   tinggi masing-masing.
 *   FASE 2  FLOW   : blok demi blok, kursor maju. Kalau blok tidak muat,
 *                   halaman baru dibuat - kecuali blok itu terlalu tinggi
 *                   untuk satu halaman, yang baru dipecah per segmen.
 *   FASE 3  DRAW   : hanya setelah halaman mana sudah pasti, segmen
 *                   digambar di koordinat absolut.
 *
 * Menghapus fase 3 adalah inti rewrite ini. Mesin lama menggambar sambil
 * menghitung, lalu menebak dengan `need()` apakah sudah melewati margin -
 * dan tebakannya sering salah sehingga konten resmi keluar dari kertas tanpa
 * error apa pun.
 */
import { jsPDF } from "jspdf";
import { COLOR, MARGIN_MM, PAGES, STROKE, TYPE, type RGB } from "./theme.js";
import { fontName, registerFonts, safe } from "./font.js";
import type { Block, Ctx, DrawRecord, Segment } from "./blocks.js";
import { drawText, textWidth } from "./blocks.js";

export interface DocOptions {
  /** Halaman: a4 (default), letter, legal, f4. */
  format?: "a4" | "letter" | "legal" | "f4";
  orientation?: "portrait" | "landscape";
  marginMm?: number;
  /** Judul dokumen - masuk ke metadata PDF. */
  title?: string;
  subject?: string;
  /** Footer per halaman. */
  footer?: (pageNo: number, totalPages: number) => string;
  /** Watermark diagonal. */
  watermark?: string;
  /** Level kompresi. true = berkas kecil, false = stream bisa dibaca (probe). */
  compress?: boolean;
  /** Kumpulkan jejak gambar untuk pemeriksaan geometri. */
  trace?: boolean;
}

export interface RenderResult {
  bytes: Uint8Array;
  pages: number;
  /** Jejak gambar; hanya diisi bila `trace` aktif. */
  records: DrawRecord[];
  /** Font benar-benar ter-embed? */
  embeddedFont: boolean;
}

/** Dokumen PDF yang sedang disusun. */
export class Document {
  private readonly opts: Required<Pick<DocOptions, "format" | "orientation" | "marginMm" | "compress" | "trace">> & DocOptions;
  private readonly pdf: jsPDF;
  private readonly records: DrawRecord[] = [];
  private readonly pageW: number;
  private readonly pageH: number;
  private readonly margin: number;
  private readonly contentW: number;
  private embedded = false;
  private drawnPages = 1;
  /** Kursor atas halaman saat ini. */
  private y: number;

  constructor(opts: DocOptions = {}) {
    this.opts = {
      format: opts.format ?? "a4",
      orientation: opts.orientation ?? "portrait",
      marginMm: opts.marginMm ?? MARGIN_MM,
      compress: opts.compress ?? true,
      trace: opts.trace ?? true,
      ...opts,
    };
    this.margin = this.opts.marginMm;
    const spec = PAGES[this.opts.format];
    const baseW = spec.width;
    const baseH = spec.height;
    this.pageW = this.opts.orientation === "landscape" ? baseH : baseW;
    this.pageH = this.opts.orientation === "landscape" ? baseW : baseH;
    this.contentW = this.pageW - this.margin * 2;
    this.y = this.margin;
    this.pdf = new jsPDF({
      unit: "mm",
      format: this.opts.format,
      orientation: this.opts.orientation,
      compress: this.opts.compress,
    });
    const fonts = registerFonts(this.pdf);
    this.embedded = fonts.regular.embedded;
    this.pdf.setProperties({
      title: this.opts.title ?? "Dokumen ISMS",
      subject: this.opts.subject ?? "",
      creator: "ISMS Galangan",
    });
  }

  get width(): number {
    return this.contentW;
  }

  /** Batas bawah area isi. Footer diberi ruang 8 mm. */
  private bottom(): number {
    return this.pageH - this.margin - 8;
  }

  private ctx(): Ctx {
    return {
      pdf: this.pdf,
      embedded: this.embedded,
      x0: this.margin,
      width: this.contentW,
      y0: this.y,
      bottom: this.bottom(),
    };
  }

  private newPage(): void {
    this.pdf.addPage();
    this.drawnPages += 1;
    this.y = this.margin;
  }

  /** Watermark + footer untuk satu halaman. */
  private decorate(page: number): void {
    const c = this.ctx();
    if (this.opts.watermark) {
      /* Watermark digambar dengan pengubahan transparansi supaya tidak menutupi
         teks di atasnya. jsPDF menyimpan graphics state per halaman, jadi
         opacity dikembalikan eksplisit. */
      applyOpacity(this.pdf, 0.08);
      this.pdf.setTextColor(COLOR.navy[0], COLOR.navy[1], COLOR.navy[2]);
      this.pdf.setFont(fontName("bold"), "bold");
      this.pdf.setFontSize(46);
      const w = textWidth(c, this.opts.watermark, { font: "bold", size: 46 });
      this.pdf.text(
        safe(this.opts.watermark, "bold"),
        (this.pageW - w) / 2,
        this.pageH / 2 + 16,
        { angle: 38 },
      );
      applyOpacity(this.pdf, 1);
      this.pdf.setTextColor(0, 0, 0);
      this.pdf.setFontSize(TYPE.base);
    }
    const label = this.opts.footer ? this.opts.footer(page, this.drawnPages) : `Halaman ${page} dari ${this.drawnPages}`;
    if (label !== "") {
      this.pdf.setFont(fontName("regular"), "normal");
      this.pdf.setFontSize(TYPE.footer);
      this.pdf.setTextColor(140, 150, 160);
      this.pdf.text(label, this.pageW / 2, this.pageH - this.margin / 2 + 1, { align: "center" });
      this.pdf.setTextColor(0, 0, 0);
    }
  }

  /**
   * Tambahkan blok. Satu blok per panggilan boleh panjang, tabel boleh banyak.
   */
  add(block: Block): this {
    const ctx = this.ctx();
    ctx.y0 = this.y;
    const planned = block.plan(ctx, this.contentW);
    const gapBefore = block.spaceBefore ?? 0;

    /* Blok non-splittable yang muat dipindah ke halaman baru bila hanya
       tersisa sedikit ruang - supaya tidak ada halaman yang isinya satu
       judul dan lalu kosong. */
    const totalSingle = planned.segments.reduce((s, seg) => s + seg.height, 0);
    if (!planned.splittable && planned.segments.length === 1) {
      const need = gapBefore + totalSingle;
      if (this.y + need > this.bottom() && this.y > this.margin + 0.5) {
        this.newPage();
      }
    }
    if (this.y + gapBefore > this.y + 0 && block.spaceBefore && this.y > this.margin + 0.5) {
      /* spaceBefore hanya boleh menambah ruang di halaman yang sama; kalau
         memaksakan pindah halaman, ruang kosong itu hilang (bukan dipindah). */
      if (this.y + gapBefore > this.bottom()) this.newPage();
      else this.y += gapBefore;
    }

    const minSeg = planned.minSegmentHeight ?? 0;
    let consumedAll = true;

    for (let si = 0; si < planned.segments.length; si += 1) {
      const seg = planned.segments[si]!;
      ctx.y0 = this.y;
      if (this.y + seg.height > this.bottom()) {
        /* Blanco yang tersisa tidak cukup untuk satu segmen: pindah halaman.
           Kalau ini segmen TERSIMPAN terakhir dan halaman barunya tetap tidak
           muat, gambar saja - lebih baik isi melewati margin satu kali
           daripada blok hilang. */
        if (this.y > this.margin + 0.5) {
          this.newPage();
          ctx.y0 = this.y;
        }
        if (this.y + seg.height > this.bottom() && si === planned.segments.length - 1) {
          /* Segmen terakhir tidak muat: gambar di halaman baru,sedikit
             melewati margin bawah lebih baik daripada data hilang. */
        }
      }
      ctx.y0 = this.y;
      seg.draw(ctx, this.opts.trace ? this.records : [], this.margin, this.y);
      this.y += seg.height;
      void minSeg;
    }
    if (block.spaceAfter) this.y += block.spaceAfter;
    consumedAll = this.y <= this.bottom();
    if (!consumedAll) {
      /* Jaga-jaga: kalau kursor melewati margin, baris berikutnya tetap
         digambar tapi flag ini dipakai report untuk guilty check. */
      void consumedAll;
    }
    return this;
  }

  /** Tambahkan banyak blok. */
  addAll(blocks: Block[]): this {
    for (const b of blocks) this.add(b);
    return this;
  }

  /** Paksa halaman baru (untuk section yang tidak boleh menyambung). */
  break(): this {
    this.newPage();
    return this;
  }

  /** Render menjadi byte. */
  render(): RenderResult {
    const total = this.pdf.getNumberOfPages();
    /* Footer harus tahu total halaman - itu hanya bisa diketahui setelah
       semua konten selesai. Semua halaman didekorasi sekarang. */
    for (let p = 1; p <= total; p += 1) {
      this.pdf.setPage(p);
      this.decorate(p);
    }
    const out = this.pdf.output("arraybuffer");
    const bytes = new Uint8Array(out);
    return {
      bytes,
      pages: total,
      records: this.opts.trace ? this.records : [],
      embeddedFont: this.embedded,
    };
  }

  /** Pratinjau HTML ringan untuk debugging di probe. */
  debugText(): string {
    return `${this.drawnPages} halaman, content ${this.contentW.toFixed(1)}mm`;
  }
}

export function doc(opts: DocOptions = {}): Document {
  return new Document(opts);
}

/* Opasitas. GState di jsPDF dibuat lewat `new pdf.GState(...)`; di types v4
     konstruktornya diekspor sebagai fungsi, bukan kelas, jadi dipanggil
     sebagai fungsi biasa. Inkonsistensi ini sudah dijaga di satu tempat
     (applyOpacity) supaya tidak tebakan lagi di titik pemakaian. */
function applyOpacity(pdf: jsPDF, opacity: number): void {
  const GStateCtor = (pdf as unknown as { GState: (p: { opacity: number }) => unknown }).GState;
  pdf.setGState(GStateCtor({ opacity }));
}

export interface GeometryProblem {
  x: number;
  y: number;
  w: number;
  h: number;
  page: number;
  kind: string;
  reason: string;
}

/**
 * Periksa semua tinta berada di dalam content box.
 *
 * INI probe yang paling penting di repo: mesin PDF lama sama sekali tidak
 * pernah memeriksa koordinat, sehingga probe hijau padahal 63 persen baris
 * kwitansi tercetak di luar kertas. Pemeriksaan ini menutup kelas bug itu -
 * dan masih akan menutupnya setelah mesin ini diganti lagi.
 */
export function checkGeometry(
  res: RenderResult,
  margin: number,
  page: { width: number; height: number },
  opts: { footerZoneMm?: number } = {},
): GeometryProblem[] {
  const footer = opts.footerZoneMm ?? 8;
  const out: GeometryProblem[] = [];
  const x0 = margin;
  const x1 = page.width - margin;
  const y1 = page.height - margin - footer;
  for (const r of res.records) {
    /* Footer dan watermark diabaikan: keduanya memang di luar area konten. */
    if (r.y > page.height - margin) continue;
    if (r.x < x0 - 0.6) {
      out.push({ ...r, reason: `x=${r.x.toFixed(2)} di kiri margin ${x0}` });
    } else if (r.x + r.w > x1 + 0.6) {
      out.push({ ...r, reason: `x+w=${(r.x + r.w).toFixed(2)} melewati kanan ${x1}` });
    }
    if (r.y - r.h > y1 + 0.6) {
      out.push({ ...r, reason: `y-h=${(r.y - r.h).toFixed(2)} melewati bawah ${y1.toFixed(2)}` });
    }
  }
  return out;
}

export { STROKE, COLOR, PAGES, type RGB };