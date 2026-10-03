/* Blok dokumen - deklaratif, murni, tanpa efek samping.
 *
 * SETIAP blok melakukan dua hal yang TERPISAH:
 *   - `plan(width)` memberitahu document berapa tinggi blok itu pada lebar
 *     tertentu, dan (untuk blok yang boleh terpotong) bagaimana ia dipecah.
 *   - `draw(...)` menggambar di koordinat absolut yang sudah ditentukan.
 *
 * Pemisahan inilah yang menutup kelas bug paling berbahaya di mesin lama:
 *Di sana lebar dihitung dulu, lalu digambar sambil menghitung cursor, lalu
 * `need()` dipanggil "kalau-kalau". Akibatnya tinggi yang benar sering
 * dihitung setelah gambar pertama sudah keluar dari area cetak. Di sini
 * tidak ada yang digambar sebelum document tahu halaman mana yang dipakai.
 *
 * ATURAN YANG WAJIB DIPEGANG setiap primitive:
 *   1. Semua teks melewati `measure()`/`wrap()` dengan font yang SAMA dengan
 *      yang dipakai menggambar.
 *   2. Tidak ada operasi yang menggambar di luar kotak yang diberikan.
 *   3. Tinggi yang dikembalikan `plan()` >= tinggi yang benar-benar digambar.
 *      Kalau tidak, blok berikutnya menimpa isi yang ini.
 */
import type { jsPDF } from "jspdf";
import { COLOR, MARGIN_MM, SPACE, STROKE, TYPE, type RGB } from "./theme.js";
import { lineHeightFor, measure, wrap } from "./measure.js";
import { safe, fontName, type FontName } from "./font.js";
import { planChartHeight, renderChart, type ChartSpec } from "./chart.js";

/* ==========================================================================
   Konteks gambar
   ========================================================================== */

export interface Ctx {
  pdf: jsPDF;
  /** Font ter-embed (true) atau standard-14 (false). */
  embedded: boolean;
  /** Batas kiri area isi. */
  x0: number;
  /** Lebar area isi. */
  width: number;
  /** Kursor atas halaman saat ini; tinggi tersedia = bottom - y0. */
  y0: number;
  /** Batas bawah area isi (tidak termasuk footer). */
  bottom: number;
}

/** Kumpulkan semua jejak gambar untuk pemeriksaan geometri. */
export interface DrawRecord {
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  kind: "text" | "line" | "rect" | "image";
  /** Isi teks yang digambar (hanya untuk kind "text").
   *  traced saat opts.trace aktif. Dipakai untuk memeriksa glyph yang tidak
   *  ada di font - huruf CJK tanpa font CJK tercetak sebagai kotak dan
   *  geometrinya tetap normal, jadi kotak itu tidak terlihat dari koordinat. */
  text?: string;
}

export interface TextOpts {
  font?: FontName;
  size?: number;
  color?: RGB;
  /** Rata kiri / tengah / kanan DIDASARKAN pada kotak, bukan anchor. */
  align?: "left" | "center" | "right";
  /** Tinggi baris. Default TYPE.base. */
  lineHeight?: number;
}

/** Lebar teks mm dengan gaya yang diberikan. */
export function textWidth(ctx: Ctx, text: string, o: TextOpts = {}): number {
  return measure(ctx.pdf, text, {
    font: o.font ?? "regular",
    size: o.size ?? TYPE.base,
    embedded: ctx.embedded,
  });
}

/**
 * Gambar satu baris teks pada (x, y) dengan perataan berbasis KOTAK.
 *
 * BUG YANG DITUTUP: mesin lama menulis
 *   `const tx = margin + indent; pdf.text(line, tx, y, { align })`
 * sehingga `align: "right"` menganchor tepi KANAN di margin KIRI - teks
 * sepanjang 40 mm mulai dari x = -25 dan 63 persennya tercetak di luar
 * kertas. Itu sebabnya nominal kwitansi terlihat terpotong. Di sini anchor
 * dihitung dari kotak: right = x + w - textWidth.
 */
export function drawText(
  ctx: Ctx,
  rec: DrawRecord[],
  text: string,
  x: number,
  yBaseline: number,
  boxW: number,
  o: TextOpts = {},
): void {
  const font = o.font ?? "regular";
  const size = o.size ?? TYPE.base;
  const color = o.color ?? [0, 0, 0];
  const w = textWidth(ctx, text, { font, size });
  let tx = x;
  let align: "left" | "center" | "right" = o.align ?? "left";
  if (align === "right") {
    tx = x + Math.max(0, boxW - w);
  } else if (align === "center") {
    tx = x + Math.max(0, (boxW - w) / 2);
  }
  ctx.pdf.setFont(fontName(font), font === "regular" ? "normal" : font === "bold" ? "bold" : "italic");
  ctx.pdf.setFontSize(size);
  ctx.pdf.setTextColor(color[0], color[1], color[2]);
  ctx.pdf.text(safe(text, font), tx, yBaseline);
  rec.push({
    page: ctx.pdf.getCurrentPageInfo().pageNumber,
    x: tx,
    y: yBaseline,
    w,
    h: lineHeightFor(size),
    kind: "text",
    /* Teks ASLI, bukan hasil safe(): safe() membuang karakter yang tidak
       terpetakan saat fallback standard-14, jadi memeriksa hasil safe()
       tidak akan pernah menemukan huruf CJK - justru hilang dari sana.
       Yang perlu diperiksa adalah apa yang PENGGUNA lihat di form. */
    text: String(text ?? ""),
  });
  ctx.pdf.setTextColor(0, 0, 0);
}

export function drawLine(ctx: Ctx, rec: DrawRecord[], x1: number, y1: number, x2: number, y2: number, color: RGB, weight = STROKE.thin): void {
  ctx.pdf.setDrawColor(color[0], color[1], color[2]);
  ctx.pdf.setLineWidth(weight);
  ctx.pdf.line(x1, y1, x2, y2);
  ctx.pdf.setLineWidth(STROKE.hair);
  rec.push({
    page: ctx.pdf.getCurrentPageInfo().pageNumber,
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    w: Math.abs(x2 - x1),
    h: Math.abs(y2 - y1),
    kind: "line",
  });
}

export function drawRect(ctx: Ctx, rec: DrawRecord[], x: number, y: number, w: number, h: number, color: RGB, mode: "F" | "S" = "F"): void {
  ctx.pdf.setFillColor(color[0], color[1], color[2]);
  ctx.pdf.setDrawColor(color[0], color[1], color[2]);
  ctx.pdf.rect(x, y, w, h, mode);
  rec.push({ page: ctx.pdf.getCurrentPageInfo().pageNumber, x, y, w, h, kind: "rect" });
}

/* ==========================================================================
   Definisi blok
   ========================================================================== */

/** Segmen: satu bagian blok yang muat satu halaman. */
export interface Segment {
  /** Tinggi segmen ini dalam mm. */
  height: number;
  draw: (ctx: Ctx, rec: DrawRecord[], x: number, y: number) => void;
}

export interface BlockPlan {
  /** true bila blok boleh dipecah antar halaman. */
  splittable: boolean;
  /** Segmen; untuk blok tidak splittable selalu berisi tepat satu. */
  segments: Segment[];
  /** Berapa banyak blok identik yang diulang (untuk tabel berheader). */
  minSegmentHeight?: number;
}

export interface Block {
  /** Berapa tinggi blok ini pada lebar `width`. */
  plan: (ctx: Ctx, width: number) => BlockPlan;
  /** Ruang kosong sebelum blok, dalam mm. */
  spaceBefore?: number;
  /** namesake ruang kosong sesudah. */
  spaceAfter?: number;
  /** true = jangan pernah pisahkan dari blok sebelumnya (mis. judul + tabel). */
  keepWithNext?: boolean;
}

/* ==========================================================================
   Primitif
   ========================================================================== */

export interface KopSpec {
  name?: string;
  line1?: string;
  hq?: string;
  addr?: string;
  /** true = tanpa garis pemisah. */
  noRule?: boolean;
}

/** Kop surat: nama perusahaan, subjudul, alamat, garis. */
export function kopBlock(spec: KopSpec = {}): Block {
  return {
    spaceAfter: SPACE.afterKop,
    plan: (ctx, width) => {
      const lines: Array<{ text: string; size: number; color: RGB; font: FontName; align: "left" | "center" | "right" }> = [];
      if (spec.name) lines.push({ text: spec.name, size: TYPE.kop, color: COLOR.navy, font: "bold", align: "center" });
      if (spec.line1) lines.push({ text: spec.line1, size: TYPE.kopSub, color: COLOR.navy, font: "regular", align: "center" });
      if (spec.hq) lines.push({ text: spec.hq, size: TYPE.kopSub, color: COLOR.steel, font: "regular", align: "center" });
      if (spec.addr) lines.push({ text: spec.addr, size: TYPE.kopSub, color: COLOR.steel, font: "regular", align: "center" });
      /* Tinggi dihitung dari GABUNGAN semua baris yang benar-benar akan
         digambar. Versi lama me-reserve angka tetap (24 mm) lalu menghitung
         tinggi sebenarnya dari teks yang sudah di-wrap - ketika alamat_wrap
         jadi dua baris, isinya melewati margin bawah. */
      const laid: Array<{ text: string; lh: number; meta: (typeof lines)[number] }> = [];
      for (const meta of lines) {
        for (const text of wrap(ctx.pdf, meta.text, width, { font: meta.font, size: meta.size, embedded: ctx.embedded })) {
          laid.push({ text, lh: lineHeightFor(meta.size), meta });
        }
      }
      const bodyH = laid.reduce((s, l) => s + l.lh, 0);
      const ruleH = spec.noRule ? 0 : 3;
      const total = bodyH + ruleH + 2;
      return {
        splittable: false,
        segments: [
          {
            height: total,
            draw: (c, rec, x, y) => {
              let cy = y;
              for (const l of laid) {
                drawText(c, rec, l.text, x, cy + l.lh * 0.78, width, {
                  font: l.meta.font,
                  size: l.meta.size,
                  color: l.meta.color,
                  align: "center",
                });
                cy += l.lh;
              }
              if (!spec.noRule) {
                drawLine(c, rec, x, cy + 1.4, x + width, cy + 1.4, COLOR.navy, STROKE.heavy);
              }
            },
          },
        ],
      };
    },
  };
}

/** Judul dokumen + nomor/tanggal di bawahnya. */
export function titleBlock(text: string, ref?: string): Block {
  return {
    spaceBefore: 1,
    spaceAfter: SPACE.block,
    plan: (ctx, width) => {
      const parts: Array<{ text: string; lh: number; size: number; color: RGB; font: FontName }> = [];
      for (const t of wrap(ctx.pdf, text.toUpperCase(), width, { font: "bold", size: TYPE.title, embedded: ctx.embedded })) {
        parts.push({ text: t, lh: lineHeightFor(TYPE.title), size: TYPE.title, color: COLOR.navy, font: "bold" });
      }
      if (ref) {
        for (const t of wrap(ctx.pdf, ref, width, { font: "regular", size: TYPE.subtitle, embedded: ctx.embedded })) {
          parts.push({ text: t, lh: lineHeightFor(TYPE.subtitle), size: TYPE.subtitle, color: COLOR.steel, font: "regular" });
        }
      }
      const total = parts.reduce((s, p) => s + p.lh, 0);
      return {
        splittable: false,
        segments: [
          {
            height: total,
            draw: (c, rec, x, y) => {
              let cy = y;
              for (const p of parts) {
                drawText(c, rec, p.text, x, cy + p.lh * 0.78, width, {
                  font: p.font,
                  size: p.size,
                  color: p.color,
                  align: "center",
                });
                cy += p.lh;
              }
            },
          },
        ],
      };
    },
  };
}

/** Judul section di dalam laporan. */
export function sectionBlock(text: string, sub?: string): Block {
  return {
    spaceBefore: SPACE.block,
    spaceAfter: 1.6,
    keepWithNext: true,
    plan: (ctx, width) => {
      const parts: Array<{ text: string; lh: number; size: number; color: RGB; font: FontName; align: "left" | "center" | "right" }> = [];
      for (const t of wrap(ctx.pdf, text, width, { font: "bold", size: TYPE.section, embedded: ctx.embedded })) {
        parts.push({ text: t, lh: lineHeightFor(TYPE.section), size: TYPE.section, color: COLOR.navy, font: "bold", align: "left" });
      }
      if (sub) {
        for (const t of wrap(ctx.pdf, sub, width, { font: "regular", size: TYPE.base, embedded: ctx.embedded })) {
          parts.push({ text: t, lh: lineHeightFor(TYPE.base), size: TYPE.base, color: COLOR.steel, font: "regular", align: "left" });
        }
      }
      const total = parts.reduce((s, p) => s + p.lh, 0) + 1.4;
      return {
        splittable: false,
        segments: [
          {
            height: total,
            draw: (c, rec, x, y) => {
              let cy = y;
              for (const p of parts) {
                drawText(c, rec, p.text, x, cy + p.lh * 0.78, width, {
                  font: p.font,
                  size: p.size,
                  color: p.color,
                  align: p.align,
                });
                cy += p.lh;
              }
              drawLine(c, rec, x, cy + 1, x + width, cy + 1, COLOR.hair, STROKE.thin);
            },
          },
        ],
      };
    },
  };
}

export interface ParagraphSpec {
  text: string;
  size?: number;
  font?: FontName;
  color?: RGB;
  align?: "left" | "center" | "right";
  /** Indentasi kiri dalam mm. */
  indent?: number;
  leading?: number;
}

/** Paragraf yang di-wrap otomatis. */
export function paragraph(spec: ParagraphSpec): Block {
  return {
    spaceAfter: SPACE.para,
    plan: (ctx, width) => {
      const size = spec.size ?? TYPE.base;
      const font = spec.font ?? "regular";
      const indent = spec.indent ?? 0;
      const leading = spec.leading ?? 1.32;
      const boxW = Math.max(1, width - indent);
      const lines = wrap(ctx.pdf, spec.text, boxW, { font, size, embedded: ctx.embedded });
      const lh = lineHeightFor(size, leading);
      const total = lines.length * lh;
      return {
        splittable: false,
        segments: [
          {
            height: total,
            draw: (c, rec, x, y) => {
              lines.forEach((line, i) => {
                drawText(c, rec, line, x + indent, y + i * lh + lh * 0.78, boxW, {
                  font,
                  size,
                  color: spec.color ?? [0, 0, 0],
                  align: spec.align ?? "left",
                });
              });
            },
          },
        ],
      };
    },
  };
}

export interface KvSpec {
  pairs: Array<{ label: string; value: string; color?: RGB; bold?: boolean }>;
  /** Lebar kolom label dalam mm. */
  labelW?: number;
  size?: number;
  /** true = label rata kanan ke kolom label (untuk daftar angka). */
  labelRight?: boolean;
}

/** Blok label/nilai: nilai mulai dari kolom tetap sehingga label panjang
 *  tidak mendorong angka. */
export function keyValue(spec: KvSpec): Block {
  return {
    plan: (ctx, width) => {
      const size = spec.size ?? TYPE.label;
      const labelW = Math.min(spec.labelW ?? 46, width * 0.5);
      const valueX = labelW + 2.5;
      const valueW = Math.max(10, width - valueX);
      const rows: Array<{ labelLines: string[]; valueLines: string[]; lh: number; color?: RGB; bold?: boolean }> = [];
      for (const p of spec.pairs) {
        const labelLines = wrap(ctx.pdf, p.label, Math.max(4, labelW - 2), { font: "regular", size, embedded: ctx.embedded });
        const valueLines = wrap(ctx.pdf, p.value, valueW, { font: p.bold ? "bold" : "regular", size, embedded: ctx.embedded });
        const lines = Math.max(labelLines.length, valueLines.length);
        rows.push({ labelLines, valueLines, lh: lines * lineHeightFor(size), color: p.color, bold: p.bold });
      }
      const total = rows.reduce((s, r) => s + r.lh + SPACE.cellPadY, 0);
      return {
        splittable: false,
        segments: [
          {
            height: total,
            draw: (c, rec, x, y) => {
              let cy = y;
              for (const r of rows) {
                r.labelLines.forEach((line, i) => {
                  drawText(c, rec, line, x, cy + i * lineHeightFor(size) + lineHeightFor(size) * 0.78, labelW, {
                    font: "regular",
                    size,
                    color: COLOR.steel,
                    align: spec.labelRight ? "right" : "left",
                  });
                });
                r.valueLines.forEach((line, i) => {
                  drawText(c, rec, line, x + valueX, cy + i * lineHeightFor(size) + lineHeightFor(size) * 0.78, valueW, {
                    font: r.bold ? "bold" : "regular",
                    size,
                    color: r.color ?? [0, 0, 0],
                    align: "left",
                  });
                });
                cy += r.lh + SPACE.cellPadY;
              }
            },
          },
        ],
      };
    },
  };
}

/** Baris "Tempat, tanggal ....... : nilai" dengan nilai rata kanan. */
export function lineKVPair(label: string, value: string, size = TYPE.label): Block {
  return keyValue({ pairs: [{ label, value }], size });
}

export type CellValue = string | number | null | undefined;

export interface TableSpec {
  head?: string[];
  rows: CellValue[][];
  /** Lebar tiap kolom dalam mm, atau "auto" untuk sisa ruang dibagi rata. */
  widths: (number | "auto")[];
  align?: ("left" | "right" | "center")[];
  /** Indeks baris yang ditebalkan + diberi garis atas. */
  totalRow?: number;
  /** Indeks kolom label untuk baris total. */
  labelCol?: number;
  fontSize?: number;
  headFontSize?: number;
  /** Gaya baris: isi setiap sel boleh bring own warna lewat cellColors. */
  cellColors?: Record<number, (c: number) => RGB | undefined>;
  /** Baris yang warnanya ditampilkan penuh (mis. baris "Total"). */
  zebra?: boolean;
}

/** Lebar efektif tiap kolom; dijamin >= MIN_COL_MM. */
function resolveWidths(spec: TableSpec, width: number): number[] {
  const min = 8;
  const fixed = spec.widths.map((w) => (typeof w === "number" ? w : 0));
  const autoCount = spec.widths.filter((w) => w === "auto").length;
  const fixedSum = fixed.reduce((a, b) => a + b, 0);
  /* Kalau kolom fixed sudah melebihi lebar halaman, tinggi bukan yang
     dipotong - kolom auto-lah yang dipotong, dan kolom fixed dikecilkan
     proporsional sampai muat. Angka yang keluar dari kartu lebih baik
     daripada halaman yang isinya jatuh ke tepi. */
  let scale = 1;
  if (autoCount === 0 && fixedSum > width) scale = width / fixedSum;
  const effectiveFixed = fixed.map((f) => f * scale);
  const autoW = autoCount > 0 ? Math.max(min, (width - effectiveFixed.reduce((a, b) => a + b, 0)) / autoCount) : 0;
  return spec.widths.map((w, i) => (typeof w === "number" ? effectiveFixed[i] : autoW));
}

interface LaidCell {
  lines: string[];
  h: number;
}

interface LaidRow {
  cells: LaidCell[];
  h: number;
  isTotal: boolean;
}

/**
 * Tabel dengan two-pass: semua tinggi baris dihitung lebih dulu, baru
 * document memutuskan paginasi. Baris tidak pernah terpotong antar halaman,
 * dan header diulang di setiap halaman lanjutan - dua hal yang mustahil
 * dilakukan html2canvas.
 */
export function table(spec: TableSpec): Block {
  return {
    plan: (ctx, width) => {
      const fontSize = spec.fontSize ?? TYPE.base;
      const headFontSize = spec.headFontSize ?? fontSize;
      const widths = resolveWidths(spec, width);
      const align = spec.align ?? [];
      const padX = SPACE.cellPadX;

      const headRows: LaidRow[] = [];
      if (spec.head) {
        const cells = spec.head.map((h, i) => {
          const inner = Math.max(3, widths[i] - padX * 2);
          const lines = wrap(ctx.pdf, String(h ?? ""), inner, { font: "bold", size: headFontSize, embedded: ctx.embedded });
          const lh = lineHeightFor(headFontSize);
          return { lines, h: lines.length * lh + SPACE.cellPadY * 2 };
        });
        headRows.push({ cells, h: Math.max(...cells.map((c) => c.h)), isTotal: false });
      }
      const headH = headRows.reduce((s, r) => s + r.h, 0);

      const bodyRows: LaidRow[] = spec.rows.map((row, r) => {
        const isTotal = spec.totalRow === r;
        const cells = row.map((raw, c) => {
          const inner = Math.max(3, (widths[c] ?? 10) - padX * 2);
          const lines = wrap(ctx.pdf, String(raw ?? ""), inner, {
            font: isTotal ? "bold" : "regular",
            size: fontSize,
            embedded: ctx.embedded,
          });
          const lh = lineHeightFor(fontSize);
          return { lines, h: lines.length * lh + SPACE.cellPadY * 2 };
        });
        return { cells, h: Math.max(1, ...cells.map((c) => c.h)), isTotal };
      });

      /* Greedy pack: satu segmen per halaman, header selalu diulang.
   PENTING: `headH` HARUS ikut dihitung dalam pembatas ruang. Versi pertama
   hanya membandingkan `used + rowH` dengan tinggi tersedia, sehingga
   setiap halaman meluap sebesar tinggi header - kira-kira 6 mm. Probe
   geometri menangkapnya persis di nilai itu (279,86 mm pada halaman A4
   dengan area isi berakhir di 274 mm). */
      const segments: Segment[] = [];
      let idx = 0;
      let guard = 0;
      while (idx < bodyRows.length) {
        if (++guard > 100000) break;
        const avail = ctx.bottom - ctx.y0;
        let used = 0;
        const take: LaidRow[] = [];
        for (let i = idx; i < bodyRows.length; i += 1) {
          const rowH = bodyRows[i]!.h;
          const need = headH + used + rowH;
          if (need > avail && take.length > 0) break;
          if (used === 0 && need > avail) {
            /* Baris tunggal lebih tinggi dari satu halaman: gambar utuh di
               halaman sendiri. Lebih baik satu baris melintasi halaman
               daripada baris hilang. */
            take.push(bodyRows[i]!);
            used += rowH;
            idx = i + 1;
            break;
          }
          take.push(bodyRows[i]!);
          used += rowH;
        }
        if (take.length === 0) break;
        const startIdx = idx;
        idx += take.length;
        const segH = headH + used + 1;
        const segRows = take;
        segments.push({
          height: segH,
          draw: (c, rec, x, y) => {
            let cy = y;
            /* Header */
            for (const hr of headRows) {
              c.pdf.setFillColor(COLOR.headFill[0], COLOR.headFill[1], COLOR.headFill[2]);
              c.pdf.rect(x, cy, width, hr.h, "F");
              rec.push({ page: c.pdf.getCurrentPageInfo().pageNumber, x, y: cy, w: width, h: hr.h, kind: "rect" });
              let hx = x;
              for (let i = 0; i < hr.cells.length; i += 1) {
                const cw = widths[i] ?? 10;
                drawText(c, rec, hr.cells[i]!.lines.join(" "), hx + padX, cy + SPACE.cellPadY + lineHeightFor(headFontSize) * 0.78, cw - padX * 2, {
                  font: "bold",
                  size: headFontSize,
                  color: COLOR.navy,
                  align: align[i] ?? "left",
                });
                hx += cw;
              }
              cy += hr.h;
            }
            /* Baris isi */
            for (const row of segRows) {
              const rowH = row.h;
              if (row.isTotal) {
                drawLine(c, rec, x, cy, x + width, cy, COLOR.steel, STROKE.medium);
              }
              if (spec.zebra && !row.isTotal) {
                const zebra = ((startIdx + segRows.indexOf(row)) % 2) === 1;
                if (zebra) {
                  c.pdf.setFillColor(COLOR.softFill[0], COLOR.softFill[1], COLOR.softFill[2]);
                  c.pdf.rect(x, cy, width, rowH, "F");
                  rec.push({ page: c.pdf.getCurrentPageInfo().pageNumber, x, y: cy, w: width, h: rowH, kind: "rect" });
                }
              }
              const cellColor = spec.cellColors?.[startIdx];
              let cx = x;
              for (let i = 0; i < row.cells.length; i += 1) {
                const cw = widths[i] ?? 10;
                const custom = cellColor?.(i);
                const lh = lineHeightFor(fontSize);
                row.cells[i]!.lines.forEach((line, li) => {
                  drawText(c, rec, line, cx + padX, cy + SPACE.cellPadY + li * lh + lh * 0.78, cw - padX * 2, {
                    font: row.isTotal ? "bold" : "regular",
                    size: fontSize,
                    color: custom ?? (row.isTotal ? COLOR.navy : [0, 0, 0]),
                    align: align[i] ?? "left",
                  });
                });
                cx += cw;
              }
              cy += rowH;
              drawLine(c, rec, x, cy, x + width, cy, COLOR.hair, STROKE.hair);
            }
            /* Label baris total bisa menyatu ke kiri. */
            if (spec.labelCol !== undefined && segRows.some((r) => r.isTotal)) {
              const totalRow = segRows.find((r) => r.isTotal);
              if (totalRow) {
                const lines = spec.rows[startIdx + segRows.indexOf(totalRow)] ?? [];
                const blank = Array.from({ length: lines.length }, (_, i) => (i === spec.labelCol ? String(lines[i] ?? "") : ""));
                let lx = x;
                for (let i = 0; i < totalRow.cells.length; i += 1) {
                  const cw = widths[i] ?? 10;
                  if (blank[i]) {
                    drawText(c, rec, blank[i] ?? "", lx + padX, cy - totalRow.h + SPACE.cellPadY + lineHeightFor(fontSize) * 0.78, cw - padX * 2, {
                      font: "bold",
                      size: fontSize,
                      color: COLOR.navy,
                      align: align[i] ?? "left",
                    });
                  }
                  lx += cw;
                }
              }
            }
          },
        });
      }

      if (segments.length === 0) {
        segments.push({
          height: headH,
          draw: (c, rec, x, y) => {
            let cy = y;
            for (const hr of headRows) {
              c.pdf.setFillColor(COLOR.headFill[0], COLOR.headFill[1], COLOR.headFill[2]);
              c.pdf.rect(x, cy, width, hr.h, "F");
              let hx = x;
              for (let i = 0; i < hr.cells.length; i += 1) {
                const cw = widths[i] ?? 10;
                drawText(c, rec, hr.cells[i]!.lines.join(" "), hx + padX, cy + SPACE.cellPadY + lineHeightFor(headFontSize) * 0.78, cw - padX * 2, {
                  font: "bold",
                  size: headFontSize,
                  color: COLOR.navy,
                  align: align[i] ?? "left",
                });
                hx += cw;
              }
              cy += hr.h;
            }
          },
        });
      }

      return { splittable: true, segments, minSegmentHeight: headH + 4 };
    },
  };
}

/** Blok kosong dengan tinggi tetap. */
export function spacer(mm: number): Block {
  return {
    plan: () => ({ splittable: false, segments: [{ height: mm, draw: () => undefined }] }),
  };
}

/** Garis pemisah full width. */
export function divider(color: RGB = COLOR.hair, weight = STROKE.thin, space = 2): Block {
  return {
    spaceBefore: space,
    spaceAfter: space,
    plan: () => ({
      splittable: false,
      segments: [{ height: 0.2, draw: (c, rec, x, y) => drawLine(c, rec, x, y, x + c.width, y, color, weight) }],
    }),
  };
}

/** Kotak dengan isian + border; dipakai untuk ringkasan dan catatan. */
export function callout(lines: string[], opts: { fill?: RGB; border?: RGB; size?: number; bold?: boolean } = {}): Block {
  return {
    spaceBefore: 1.5,
    spaceAfter: 2.5,
    plan: (ctx, width) => {
      const size = opts.size ?? TYPE.base;
      const font: FontName = opts.bold ? "bold" : "regular";
      const pad = 3;
      const laid: string[][] = lines.map((l) => wrap(ctx.pdf, l, Math.max(4, width - pad * 2), { font, size, embedded: ctx.embedded }));
      const lh = lineHeightFor(size);
      const inner = laid.reduce((s, ls) => s + ls.length * lh, 0);
      const total = inner + pad * 2;
      return {
        splittable: false,
        segments: [
          {
            height: total,
            draw: (c, rec, x, y) => {
              if (opts.fill) drawRect(c, rec, x, y, width, total, opts.fill, "F");
              if (opts.border) {
                c.pdf.setDrawColor(opts.border[0], opts.border[1], opts.border[2]);
                c.pdf.setLineWidth(STROKE.thin);
                c.pdf.rect(x, y, width, total, "S");
                rec.push({ page: c.pdf.getCurrentPageInfo().pageNumber, x, y, w: width, h: total, kind: "rect" });
              }
              let cy = y + pad;
              for (const ls of laid) {
                for (const line of ls) {
                  drawText(c, rec, line, x + pad, cy + lh * 0.78, width - pad * 2, { font, size, color: [0, 0, 0], align: "left" });
                  cy += lh;
                }
              }
            },
          },
        ],
      };
    },
  };
}

export interface SignatureSpec {
  role: string;
  name: string;
  /** Jumlah baris kosong untuk ruang tanda tangan. */
  rows?: number;
}

/**
 * Blok tanda tangan: ATOMIK.
 *
 * Tidak boleh pernah terbelah antar halaman - tanda tangan yang terpisah dari
 * tabelnya oleh garis halaman membuat dokumen tidak sah. Tinggi dihitung
 * penuh dan satu segmen tunggal, jadi document pasti memindahkannya ke
 * halaman baru bila tidak muat.
 */
export function signatures(sigs: SignatureSpec[]): Block {
  return {
    spaceBefore: SPACE.block,
    plan: (ctx, width) => {
      const rows = Math.max(3, Math.min(20, Math.max(...sigs.map((s) => s.rows ?? 4), 4)));
      const colW = width / Math.max(1, sigs.length);
      const roleH = SPACE.sigRole;
      const total = roleH + rows * SPACE.sigRow + 4;
      return {
        splittable: false,
        segments: [
          {
            height: total,
            draw: (c, rec, x, y) => {
              sigs.forEach((s, i) => {
                const cx = x + colW * (i + 0.5);
                /* Role dan nama dibungkus: nama panjang (PT BANGUNAN PERMANEN
                   NUSANTARA) di luar lebar kolom akan menimpa blok tetangga,
                   dan mesin lama tidak pernah mengeceknya. */
                for (const [k, text, size, bold] of [
                  [0, s.role, TYPE.label, true],
                  [1, s.name || "-", TYPE.label, false],
                ] as Array<[number, string, number, boolean]>) {
                  const ls = wrap(c.pdf, text, colW - 6, { font: bold ? "bold" : "regular", size, embedded: c.embedded });
                  const yBase = k === 0 ? y + lineHeightFor(size) * 0.9 : y + roleH + rows * SPACE.sigRow;
                  ls.forEach((line, li) => {
                    drawText(c, rec, line, cx - (colW - 6) / 2, yBase + li * lineHeightFor(size), colW - 6, {
                      font: bold ? "bold" : "regular",
                      size,
                      color: [0, 0, 0],
                      align: "center",
                    });
                  });
                }
                const nameW = textWidth(c, s.name || "-", { font: "regular", size: TYPE.label });
                const half = Math.min(colW / 2 - 2, Math.max(18, nameW / 2 + 4));
                const yLine = y + roleH + rows * SPACE.sigRow + lineHeightFor(TYPE.label);
                drawLine(c, rec, cx - half, yLine, cx + half, yLine, COLOR.rule, STROKE.thin);
              });
            },
          },
        ],
      };
    },
  };
}

export interface ImageSpec {
  /** Data URL (png/jpeg) atau base64. */
  src: string;
  /** Tinggi gambar dalam mm; lebar dihitung dari rasio. */
  height: number;
  /** Lebar maksimal dalam mm. */
  maxWidth?: number;
  caption?: string;
}

/** Gambar (foto pindaian, tanda tangan basah) - satu-satunya blok raster. */
export function image(spec: ImageSpec): Block {
  return {
    spaceBefore: 1.5,
    spaceAfter: 1.5,
    plan: (ctx, width) => {
      const capH = spec.caption ? lineHeightFor(TYPE.base) + 1 : 0;
      const total = spec.height + capH + 2;
      return {
        splittable: false,
        segments: [
          {
            height: total,
            draw: (c, rec, x, y) => {
              try {
                const dims = sizeOf(spec.src);
                const ratio = dims ? dims.w / dims.h : 1;
                const w = Math.min(spec.maxWidth ?? width, width, spec.height * ratio);
                const h = w / ratio;
                /* Format dibaca dari data URL; tanpa itu jsPDF menebak dari
                   magic byte dan kadang gagal untuk JPEG grayscale. */
                const fmt = /\.png(?:;|,)/i.test(spec.src) ? "PNG" : /\.jpe?g(?:;|,)/i.test(spec.src) ? "JPEG" : undefined;
                if (fmt) c.pdf.addImage(spec.src, fmt, x, y, w, h);
                else c.pdf.addImage(spec.src, x, y, w, h);
                rec.push({ page: c.pdf.getCurrentPageInfo().pageNumber, x, y, w, h, kind: "image" });
              } catch {
                /* Gambar rusak tidak boleh menjatuhkan seluruh dokumen:
                   dokumen resmi lebih penting daripada satu lampiran foto. */
              }
              if (spec.caption) {
                drawText(c, rec, spec.caption, x, y + spec.height + lineHeightFor(TYPE.base) * 0.8, width, {
                  font: "regular",
                  size: TYPE.base,
                  color: COLOR.steel,
                  align: "center",
                });
              }
            },
          },
        ],
      };
    },
  };
}

/** Dimensi gambar PNG/JPEG dari header base64, tanpa memuat seluruh berkas. */
function sizeOf(src: string): { w: number; h: number } | null {
  const comma = src.indexOf(",");
  const b64 = comma >= 0 ? src.slice(comma + 1) : src;
  try {
    const buf = Buffer.from(b64, "base64");
    /* PNG: IHDR di byte 16..24 */
    if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50) {
      return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    }
    /* JPEG: scan marker SOFn */
    let o = 2;
    while (o + 9 < buf.length) {
      if (buf[o] !== 0xff) {
        o += 1;
        continue;
      }
      const marker = buf[o + 1]!;
      const len = buf.readUInt16BE(o + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { w: buf.readUInt16BE(o + 7), h: buf.readUInt16BE(o + 5) };
      }
      o += 2 + len;
    }
  } catch {
    return null;
  }
  return null;
}

/** Grafik vektor - blok warga layout, bukan gambar. */
export function chartBlock(spec: ChartSpec): Block {
  return {
    spaceBefore: 2,
    spaceAfter: 3,
    keepWithNext: true,
    plan: (ctx, width) => {
      const planned = planChartHeight(spec, width);
      return {
        splittable: false,
        segments: [
          {
            height: planned.height,
            draw: (c, rec, x, y) => {
              renderChart({ pdf: c.pdf, rec, x, y, width, embedded: c.embedded, bottom: c.bottom }, spec);
            },
          },
        ],
      };
    },
  };
}

/** Ringkasan nilaiMetric: label kecil di atas, angka besar di bawah. */
export function metricGrid(items: Array<{ label: string; value: string; color?: RGB }>, opts: { cols?: number } = {}): Block {
  return {
    spaceBefore: 1.5,
    spaceAfter: 2.5,
    plan: (ctx, width) => {
      const cols = Math.max(1, Math.min(opts.cols ?? items.length, items.length || 1));
      const colW = width / cols;
      const rows = Math.ceil(items.length / cols);
      const labelH = lineHeightFor(TYPE.base);
      const valueH = lineHeightFor(TYPE.emphasis, 1.1);
      const rowH = labelH + valueH + 3;
      const total = rows * rowH;
      return {
        splittable: false,
        segments: [
          {
            height: total,
            draw: (c, rec, x, y) => {
              items.forEach((it, i) => {
                const r = Math.floor(i / cols);
                const cc = i % cols;
                const bx = x + colW * cc;
                const by = y + rowH * r;
                drawText(c, rec, it.label, bx, by + labelH * 0.8, colW - 2, {
                  font: "regular",
                  size: TYPE.base,
                  color: COLOR.steel,
                  align: "left",
                });
                drawText(c, rec, it.value, bx, by + labelH + valueH * 0.85, colW - 2, {
                  font: "bold",
                  size: TYPE.emphasis,
                  color: it.color ?? COLOR.navy,
                  align: "left",
                });
                if (cc > 0) drawLine(c, rec, bx - 1.5, by, bx - 1.5, by + rowH - 2, COLOR.hair, STROKE.hair);
              });
              drawLine(c, rec, x, y + total - 1, x + width, y + total - 1, COLOR.hair, STROKE.thin);
            },
          },
        ],
      };
    },
  };
}

export { MARGIN_MM };