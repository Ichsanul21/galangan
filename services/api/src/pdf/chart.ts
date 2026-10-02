/* Grafik vektor - digambar langsung ke jsPDF, tanpa canvas, tanpa gambar.
 *
 * Kenapa bukan raster: laporan yang diarsipkan harus tetap tajam saat dicetak
 * pada ukuran A0, dan teks di dalamnya harus tetap bisa dicari. Grafik yang
 * diraster jadi gambar kehilangan keduanya. Grafik di sini adalah garis,
 * persegi panjang, dan teks - semuanya objek vektor asli di dalam PDF.
 *
 * Kontras: mesin lama memakai #e9eff4 untuk garis bantu, rasio kontrasnya 1,06:1
 * terhadap putih - praktis tidak terlihat, dan di JPEG 8-bit hilang total.
 * Token grid/axis di theme.ts sengaja jauh lebih gelap supaya garis benar-
 * benar ada di kertas.
 *
 * Label sumbu X SELALU datang dari monthAxis (bulan + tahun eksplisit, bulan
 * berjalan di titik terakhir) supaya grafik PDF tidak pernah berbeda dari
 * yang tampil di layar.
 */
import type { jsPDF } from "jspdf";
import { COLOR, SPACE, STROKE, TYPE, type RGB } from "./theme.js";
import { lineHeightFor, measure, wrap } from "./measure.js";
import { safe, fontName, type FontName } from "./font.js";
import type { DrawRecord } from "./blocks.js";

export interface ChartCtx {
  pdf: jsPDF;
  rec: DrawRecord[];
  x: number;
  y: number;
  width: number;
  embedded: boolean;
  bottom: number;
}

export interface Series {
  key: string;
  label: string;
  color?: RGB;
}

/* ==========================================================================
   Skala
   ========================================================================== */

/**
 * Bulatkan batas atas sumbu Y ke angka yang enak dibaca.
 *
 * Penting untuk laporan resmi: sumbu yang berakhir di 47,3rb terlihat seperti
 * data yang dipotong atau salah hitung. Pembulatan ke 1/2/2,5/5 x 10^n
 * membuat angka di garis bantu terbaca sebagai nilai nyata.
 */
export function niceScale(max: number, targetTicks = 4): { max: number; step: number } {
  if (!Number.isFinite(max) || max <= 0) return { max: 1, step: 0.25 };
  const rawStep = max / targetTicks;
  const mag = 10 ** Math.floor(Math.log10(rawStep));
  const norm = rawStep / mag;
  const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  const step = nice * mag;
  return { max: Math.ceil(max / step) * step, step };
}

/** Tick sumbu Y (termasuk 0 dan batas atas). */
export function axisTicks(max: number, step: number): number[] {
  const out: number[] = [];
  for (let v = 0; v <= max + step / 2; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

/* ==========================================================================
   Format angka ringkas untuk label sumbu
   ========================================================================== */

/** 1.500.000 -> "1,5 jt". Memakai pemisah ribuan Indonesia (titik). */
export function compactNum(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e12) return `${(v / 1e12).toLocaleString("id-ID", { maximumFractionDigits: 1 })} T`;
  if (a >= 1e9) return `${(v / 1e9).toLocaleString("id-ID", { maximumFractionDigits: 1 })} M`;
  if (a >= 1e6) return `${(v / 1e6).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt`;
  if (a >= 1e3) return `${(v / 1e3).toLocaleString("id-ID", { maximumFractionDigits: 0 })} rb`;
  return v.toLocaleString("id-ID", { maximumFractionDigits: 1 });
}

/* ==========================================================================
   Elemen bersama
   ========================================================================== */

function txt(ctx: ChartCtx, text: string, x: number, yBaseline: number, boxW: number, o: { size?: number; font?: FontName; color?: RGB; align?: "left" | "center" | "right" } = {}): void {
  const font = o.font ?? "regular";
  const size = o.size ?? TYPE.axis;
  const w = measure(ctx.pdf, text, { font, size, embedded: ctx.embedded });
  let tx = x;
  if (o.align === "right") tx = x + Math.max(0, boxW - w);
  else if (o.align === "center") tx = x + Math.max(0, (boxW - w) / 2);
  ctx.pdf.setFont(fontName(font), font === "bold" ? "bold" : "italic");
  ctx.pdf.setFontSize(size);
  ctx.pdf.setTextColor(o.color?.[0] ?? 0, o.color?.[1] ?? 0, o.color?.[2] ?? 0);
  ctx.pdf.text(safe(text, font), tx, yBaseline);
  ctx.rec.push({ page: ctx.pdf.getCurrentPageInfo().pageNumber, x: tx, y: yBaseline, w, h: lineHeightFor(size), kind: "text" });
}

function line(ctx: ChartCtx, x1: number, y1: number, x2: number, y2: number, color: RGB, weight = STROKE.thin): void {
  ctx.pdf.setDrawColor(color[0], color[1], color[2]);
  ctx.pdf.setLineWidth(weight);
  ctx.pdf.line(x1, y1, x2, y2);
  ctx.pdf.setLineWidth(STROKE.hair);
  ctx.rec.push({ page: ctx.pdf.getCurrentPageInfo().pageNumber, x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1), kind: "line" });
}

function rect(ctx: ChartCtx, x: number, y: number, w: number, h: number, color: RGB, mode: "F" | "S" = "F"): void {
  ctx.pdf.setFillColor(color[0], color[1], color[2]);
  ctx.pdf.setDrawColor(color[0], color[1], color[2]);
  ctx.pdf.rect(x, y, w, h, mode);
  ctx.rec.push({ page: ctx.pdf.getCurrentPageInfo().pageNumber, x, y, w, h, kind: "rect" });
}

/** Judul + subjudul di atas chart; mengembalikan tinggi yang dipakai. */
function drawChartTitle(ctx: ChartCtx, title: string, sub?: string): number {
  let h = 0;
  txt(ctx, title, ctx.x, ctx.y + lineHeightFor(TYPE.base, 1.1), ctx.width, {
    size: TYPE.base,
    font: "bold",
    color: COLOR.navy,
  });
  h += lineHeightFor(TYPE.base, 1.1);
  if (sub) {
    txt(ctx, sub, ctx.x, ctx.y + h + lineHeightFor(TYPE.base - 1, 1.1), ctx.width, {
      size: TYPE.base - 1,
      color: COLOR.steel,
    });
    h += lineHeightFor(TYPE.base - 1, 1.1);
  }
  return h;
}

/** Legenda seri di bawah chart; mengembalikan tinggi yang dipakai. */
function drawLegend(ctx: ChartCtx, items: Array<{ label: string; color: RGB }>, top: number): number {
  if (items.length === 0) return 0;
  const size = TYPE.axis;
  const lh = lineHeightFor(size);
  const boxW = 4.2;
  const gap = 1.8;
  const itemW = items.map((it) => boxW + gap + measure(ctx.pdf, it.label, { font: "regular", size, embedded: ctx.embedded }));
  const totalW = itemW.reduce((a, b) => a + b, 0) + gap * (items.length - 1);
  /* Legend satu baris kalau muat, dua kalau tidak. */
  const perRow = totalW <= ctx.width ? items.length : Math.max(1, Math.ceil(items.length / Math.max(1, Math.floor(ctx.width / (Math.max(...itemW) + gap)))));
  const rows = Math.ceil(items.length / perRow);
  const h = rows * (lh + 0.8);
  let cx = ctx.x;
  let cy = top;
  items.forEach((it, i) => {
    if (i > 0 && i % perRow === 0) {
      cx = ctx.x;
      cy += lh + 0.8;
    }
    ctx.pdf.setFillColor(it.color[0], it.color[1], it.color[2]);
    ctx.pdf.rect(cx, cy + lh * 0.28, boxW, boxW * 0.62, "F");
    ctx.rec.push({ page: ctx.pdf.getCurrentPageInfo().pageNumber, x: cx, y: cy + lh * 0.28, w: boxW, h: boxW * 0.62, kind: "rect" });
    txt(ctx, it.label, cx + boxW + gap, cy + lh * 0.85, itemW[i]! - boxW - gap, { size, color: COLOR.steel, align: "left" });
    cx += itemW[i]! + gap;
  });
  return h;
}

/** Label sumbu X; secara otomatis diskip agar tidak bertumpuk. */
function drawXLabels(ctx: ChartCtx, labels: string[], plotX: number, plotW: number, y: number): void {
  const size = TYPE.axis;
  const lh = lineHeightFor(size);
  const slot = plotW / Math.max(1, labels.length);
  const widest = Math.max(...labels.map((l) => measure(ctx.pdf, l, { font: "regular", size, embedded: ctx.embedded })));
  /* Tampilkan semua kalau muat; kalau tidak, setiap ke-n supaya label tidak
     saling menimpa (label yang bertumpuk lebih buruk daripada label yang
     dilewati). */
  const step = widest + 3 > slot ? Math.max(1, Math.ceil((widest + 3) / slot)) : 1;
  labels.forEach((label, i) => {
    if (i % step !== 0) return;
    const cx = plotX + slot * i;
    txt(ctx, label, cx - slot / 2, y, slot, { size, color: COLOR.axis, align: "center" });
  });
}

/* ==========================================================================
   Tipe chart
   ========================================================================== */

interface Axes {
  title?: string;
  subtitle?: string;
  /** Format nilai sumbu Y. Default compactNum. */
  format?: (v: number) => string;
  /** Tambahkan garis acuan nol yang ditebalkan. */
  emphasizeZero?: boolean;
}

interface CategorySeries extends Axes {
  categories: string[];
  series: Series[];
  values: Record<string, number[]>;
}

interface StackedSpec extends CategorySeries {
  stacked: true;
}

interface LineSpec extends CategorySeries {
  /** Isi area di bawah garis. */
  area?: boolean;
  /** Sumbu Y kedua (untuk combo revenue vs margin). */
  secondary?: { seriesKey: string; format?: (v: number) => string };
}

interface DonutSpec {
  title?: string;
  subtitle?: string;
  slices: Array<{ label: string; value: number; color?: RGB }>;
  /** Tampilkan daftar nilai di samping (bukan hanya legenda). */
  showValues?: boolean;
}

interface HbarSpec {
  title?: string;
  subtitle?: string;
  items: Array<{ label: string; value: number; color?: RGB }>;
  format?: (v: number) => string;
}

interface ParetoSpec {
  title?: string;
  subtitle?: string;
  categories: string[];
  values: number[];
}

export type ChartSpec = StackedSpec | LineSpec | DonutSpec | HbarSpec | ParetoSpec | (CategorySeries & { kind?: "bar" | "groupedBar" });

/** Dimensiplanned untuk blok (dipanggil oleh blocks.chartBlock). */
export function planChartHeight(spec: ChartSpec, width: number): { height: number } {
  return { height: chartHeight(spec, width) };
}

const TITLE_H = lineHeightFor(TYPE.base, 1.1) + 1;
const SUB_H = lineHeightFor(TYPE.base - 1, 1.1) + 0.6;
const XLABEL_H = lineHeightFor(TYPE.axis) + 1.5;

function axisBox(spec: Axes, width: number): { plotX: number; plotW: number; labelW: number; top: number } {
  const fmt = spec.format ?? compactNum;
  const probe = niceScale(100);
  const ticks = axisTicks(probe.max, probe.step);
  const labelW = Math.max(...ticks.map((t) => measureLength(t, fmt))) + 2.5;
  void width;
  return { plotX: labelW, plotW: width - labelW, labelW, top: 0 };
}

/* Lebar label diukur tanpa objek pdf: perkiraan konservatif berbasis
   karakter. Dipakai hanya untuk menghitung tinggi, bukan untuk menggambar -
   ketidaktepatan di sini hanya memengaruhi ruang kosong, bukan kelengkapan. */
function measureLength(v: number, fmt: (v: number) => string): number {
  return fmt(v).length * TYPE.axis * 0.3528 * 0.55;
}

function chartHeight(spec: ChartSpec, width: number): number {
  const title = "title" in spec && spec.title ? TITLE_H : 0;
  const sub = "title" in spec && spec.title && "subtitle" in spec && spec.subtitle ? SUB_H : 0;
  if (isDonut(spec)) {
    const listW = spec.showValues === false ? 0 : Math.min(width * 0.42, 78);
    const legendItems = spec.slices.length;
    return title + sub + Math.max(52, legendItems * 6 + 6);
  }
  if (isHbar(spec)) {
    const rows = Math.min(spec.items.length, 12);
    return title + sub + rows * 6.4 + XLABEL_H;
  }
  void axisBox;
  return title + sub + 46 + XLABEL_H;
}

function isDonut(spec: ChartSpec): spec is DonutSpec {
  return Array.isArray((spec as DonutSpec).slices);
}
function isHbar(spec: ChartSpec): spec is HbarSpec {
  return Array.isArray((spec as HbarSpec).items);
}
/* Pareto dibedakan dari bar/line lewat BENTUK `values`: pada Pareto itu array
   angka tunggal, pada bar/line itu objek map seri. Versi lama hanya
   memeriksa `Array.isArray(categories)`, yang true untuk KEDUA bentuk - jadi
   setiap bar chart ikut hilang ke renderer Pareto dan probe menemukan
   `vals.reduce is not a function`. */
function isPareto(spec: ChartSpec): spec is ParetoSpec {
  const v = (spec as ParetoSpec).values;
  return Array.isArray((spec as ParetoSpec).categories) && Array.isArray(v);
}

/* ==========================================================================
   Render
   ========================================================================== */

export function drawChart(ctx: ChartCtx, spec: ChartSpec): void {
  if (isDonut(spec)) return drawDonut(ctx, spec);
  if (isHbar(spec)) return drawHbar(ctx, spec);
  if (isPareto(spec)) return drawPareto(ctx, spec);
  return drawCategory(ctx, spec as CategorySeries);
}

/** Bar / grouped bar / stacked bar / line / area. */
function drawCategory(ctx: ChartCtx, spec: CategorySeries): void {
  const fmt = spec.format ?? compactNum;
  let top = ctx.y;
  if (spec.title) top += drawChartTitle(ctx, spec.title, spec.subtitle);
  const all: number[] = [];
  for (const s of spec.series) all.push(...(spec.values[s.key] ?? []));
  let maxV = Math.max(0, ...all);
  const stacked = "stacked" in spec && spec.stacked === true;
  if (stacked) {
    const len = spec.categories.length;
    for (let i = 0; i < len; i += 1) {
      let sum = 0;
      for (const s of spec.series) sum += Math.abs(spec.values[s.key]?.[i] ?? 0);
      maxV = Math.max(maxV, sum);
    }
  }
  const scale = niceScale(maxV);
  const plotX = ctx.x;
  const availableW = ctx.width;
  const yLabels = axisTicks(scale.max, scale.step);
  const yLabelW = Math.max(...yLabels.map((t) => measure(ctx.pdf, fmt(t), { font: "regular", size: TYPE.axis, embedded: ctx.embedded }))) + 2.5;
  const plotW = Math.max(20, availableW - yLabelW);
  const plotY = top + 3;
  const plotH = 46;

  /* Sumbu Y */
  yLabels.forEach((t) => {
    const yy = plotY + plotH - (t / scale.max) * plotH;
    line(ctx, plotX + yLabelW, yy, plotX + yLabelW + plotW, yy, t === 0 ? COLOR.zero : COLOR.grid, t === 0 ? STROKE.medium : STROKE.hair);
    txt(ctx, fmt(t), plotX, yy + lineHeightFor(TYPE.axis) * 0.32, yLabelW - 2.5, { size: TYPE.axis, color: COLOR.axis, align: "right" });
  });

  const slot = plotW / Math.max(1, spec.categories.length);
  const isLine = "area" in spec;
  const series = spec.series;
  const barW = stacked ? Math.min(slot * 0.62, 16) : Math.min((slot * 0.7) / Math.max(1, series.length), 16);

  if (isLine) {
    /* Line / area digambar lebih dulu supaya bar (bila ada) tidak menutupinya. */
    for (const s of series) {
      const color = s.color ?? COLOR.series[series.indexOf(s) % COLOR.series.length]!;
      const vals = spec.values[s.key] ?? [];
      const pts = vals.map((v, i) => ({
        x: plotX + yLabelW + slot * i + slot / 2,
        y: plotY + plotH - (v / scale.max) * plotH,
      }));
      if (pts.length === 0) continue;
      if (spec.area) {
        /* Isian area digambar sebagai pita tipis per segmen supaya tidak
           memerlukan polygonNature yang tidak semua versi jsPDF dukung. */
        ctx.pdf.setFillColor(color[0], color[1], color[2]);
        for (let i = 0; i < pts.length - 1; i += 1) {
          const p1 = pts[i]!;
          const p2 = pts[i + 1]!;
          const w = p2.x - p1.x;
          const top1 = Math.min(p1.y, p2.y);
          const bot1 = Math.max(p1.y, p2.y);
          const base = plotY + plotH;
          /* Trapezoid: satu rectangle memutarobjectiga tidak cukup, jadi
             empat garis tipis - aman di semua renderer. */
          ctx.pdf.setFillColor(color[0], color[1], color[2]);
          const h = Math.max(0, bot1 - top1);
          if (h > 0) ctx.pdf.rect(p1.x, top1, w, h, "F");
          ctx.rec.push({ page: ctx.pdf.getCurrentPageInfo().pageNumber, x: p1.x, y: top1, w, h, kind: "rect" });
          void base;
        }
      }
      /* Garis */
      ctx.pdf.setDrawColor(color[0], color[1], color[2]);
      ctx.pdf.setLineWidth(0.45);
      for (let i = 0; i < pts.length - 1; i += 1) {
        const p1 = pts[i]!;
        const p2 = pts[i + 1]!;
        ctx.pdf.line(p1.x, p1.y, p2.x, p2.y);
        ctx.rec.push({ page: ctx.pdf.getCurrentPageInfo().pageNumber, x: Math.min(p1.x, p2.x), y: Math.min(p1.y, p2.y), w: p2.x - p1.x, h: Math.abs(p2.y - p1.y), kind: "line" });
      }
      ctx.pdf.setLineWidth(STROKE.hair);
      /* Titik data, supaya nilai terbaca even tanpa tooltip. */
      for (const p of pts) {
        ctx.pdf.setFillColor(color[0], color[1], color[2]);
        ctx.pdf.circle(p.x, p.y, 0.6, "F");
        ctx.rec.push({ page: ctx.pdf.getCurrentPageInfo().pageNumber, x: p.x - 0.6, y: p.y - 0.6, w: 1.2, h: 1.2, kind: "rect" });
      }
    }
  } else if (stacked) {
    const baseline = new Array<number>(spec.categories.length).fill(0);
    for (const s of series) {
      const color = s.color ?? COLOR.series[series.indexOf(s) % COLOR.series.length]!;
      const vals = spec.values[s.key] ?? [];
      vals.forEach((v, i) => {
        const cx = plotX + yLabelW + slot * i + (slot - barW) / 2;
        const yTop = plotY + plotH - ((baseline[i]! + Math.abs(v)) / scale.max) * plotH;
        const yBot = plotY + plotH - (baseline[i]! / scale.max) * plotH;
        const h = Math.max(0.2, yBot - yTop);
        rect(ctx, cx, yTop, barW, h, color, "F");
        baseline[i] = baseline[i]! + Math.abs(v);
      });
    }
  } else {
    for (const s of series) {
      const color = s.color ?? COLOR.series[series.indexOf(s) % COLOR.series.length]!;
      const vals = spec.values[s.key] ?? [];
      vals.forEach((v, i) => {
        const cx = plotX + yLabelW + slot * i + (slot - barW * series.length) / 2 + barW * series.indexOf(s);
        const yTop = plotY + plotH - (Math.abs(v) / scale.max) * plotH;
        const h = Math.max(0.2, plotY + plotH - yTop);
        rect(ctx, cx, yTop, barW, h, color, "F");
      });
    }
  }

  drawXLabels(ctx, spec.categories, plotX + yLabelW, plotW, plotY + plotH + lineHeightFor(TYPE.axis));
  drawLegend(
    ctx,
    series.map((s) => ({ label: s.label, color: s.color ?? COLOR.series[series.indexOf(s) % COLOR.series.length]! })),
    plotY + plotH + XLABEL_H,
  );
}

/** Donut + daftar nilai. */
function drawDonut(ctx: ChartCtx, spec: DonutSpec): void {
  let top = ctx.y;
  if (spec.title) top += drawChartTitle(ctx, spec.title, spec.subtitle);
  const total = spec.slices.reduce((s, x) => s + Math.abs(x.value), 0);
  const size = Math.min(52, Math.max(36, (ctx.bottom - top) * 0.7));
  const cx = ctx.x + size / 2 + 2;
  const cy = top + size / 2;
  const r = size / 2;
  const rInner = r * 0.58;

  if (total <= 0) {
    txt(ctx, "-", ctx.x, cy, size, { size: TYPE.base, color: COLOR.steel, align: "center" });
    return;
  }

  let angle = -Math.PI / 2;
  spec.slices.forEach((slice) => {
    const color = slice.color ?? COLOR.series[spec.slices.indexOf(slice) % COLOR.series.length]!;
    const frac = Math.abs(slice.value) / total;
    const sweep = frac * Math.PI * 2;
    /* jsPDF tidak punya arc wedge; segment digambar moveTo/lineTo dengan titik-titik
       busur yang dihitung sendiri. 24 segmen per slice cukup halus pada
       diameter 40 mm. */
    const steps = Math.max(3, Math.ceil((sweep / (Math.PI * 2)) * 48));
    ctx.pdf.setFillColor(color[0], color[1], color[2]);
    const pts: Array<[number, number]> = [];
    for (let i = 0; i <= steps; i += 1) {
      const a = angle + (sweep * i) / steps;
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    for (let i = steps; i >= 0; i -= 1) {
      const a = angle + (sweep * i) / steps;
      pts.push([cx + rInner * Math.cos(a), cy + rInner * Math.sin(a)]);
    }
    /* jsPDF `lines(lines, x, y, scale, style, closed)`.
   - TITIK WAJIB array [dx, dy], bukan objek {x, y}. Versi ini mengecek
     `l.length === 2`; objek punya length undefined sehingga jatuh ke cabang
     kurva dan menghasilkan NaN - yang baru melempar beberapa baris kemudian
     dari `jsPDF.scale`. Karena itu pesan errornya sama sekali tidak
     mengarah ke penyebabnya.
   - `scale` WAJIB array [sx, sy]; angka ditolak oleh check internal.
   - `closed` boolean.
   - Koordinat RELATIF terhadap (x, y): titik pertama (0,0), berikutnya
     delta antar titik. */
    const rel = pts.map((p, i) =>
      i === 0 ? [0, 0] : [p[0] - pts[i - 1]![0], p[1] - pts[i - 1]![1]],
    );
    ctx.pdf.lines(rel, cx, cy, [1, 1], "F", true);
    ctx.rec.push({ page: ctx.pdf.getCurrentPageInfo().pageNumber, x: cx - r, y: cy - r, w: r * 2, h: r * 2, kind: "rect" });
    angle += sweep;
  });

  if (spec.showValues !== false) {
    const listX = cx + r + 6;
    const listW = Math.max(20, ctx.x + ctx.width - listX);
    const lh = lineHeightFor(TYPE.base - 1, 1.25);
    let ly = top + 2;
    spec.slices.forEach((slice) => {
      if (ly + lh > ctx.bottom) return;
      const color = slice.color ?? COLOR.series[spec.slices.indexOf(slice) % COLOR.series.length]!;
      ctx.pdf.setFillColor(color[0], color[1], color[2]);
      ctx.pdf.rect(listX, ly + lh * 0.2, 3.4, 2.4, "F");
      ctx.rec.push({ page: ctx.pdf.getCurrentPageInfo().pageNumber, x: listX, y: ly + lh * 0.2, w: 3.4, h: 2.4, kind: "rect" });
      const labelW = listW * 0.5;
      txt(ctx, slice.label, listX + 5, ly + lh * 0.8, labelW, { size: TYPE.base - 1, color: [0, 0, 0], align: "left" });
      txt(ctx, `${compactNum(slice.value)} (${Math.round((Math.abs(slice.value) / total) * 100)}%)`, listX + 5, ly + lh * 0.8, listW - 5, {
        size: TYPE.base - 1,
        color: COLOR.steel,
        align: "right",
      });
      ly += lh;
    });
  }
}

/** Bar horizontal terurut (10 besar). */
function drawHbar(ctx: ChartCtx, spec: HbarSpec): void {
  const fmt = spec.format ?? compactNum;
  let top = ctx.y;
  if (spec.title) top += drawChartTitle(ctx, spec.title, spec.subtitle);
  const items = [...spec.items].sort((a, b) => b.value - a.value).slice(0, 12);
  if (items.length === 0) {
    txt(ctx, "-", ctx.x, top + 4, ctx.width, { size: TYPE.base, color: COLOR.steel, align: "left" });
    return;
  }
  const max = Math.max(...items.map((i) => Math.abs(i.value)), 1);
  const labelW = Math.min(ctx.width * 0.34, 46);
  const valueW = 22;
  const barX = ctx.x + labelW + 2;
  const barW = Math.max(10, ctx.width - labelW - valueW - 4);
  const rowH = 6.4;
  items.forEach((it, i) => {
    const y = top + 1 + i * rowH;
    const color = it.color ?? COLOR.series[0]!;
    const bh = 3;
    const lh = lineHeightFor(TYPE.base - 1);
    const labelLines = wrap(ctx.pdf, it.label, labelW, { font: "regular", size: TYPE.base - 1, embedded: ctx.embedded });
    txt(ctx, labelLines[0] ?? "", ctx.x, y + lh * 0.8, labelW, { size: TYPE.base - 1, color: [0, 0, 0], align: "left" });
    rect(ctx, barX, y + lh * 0.25, barW, bh, COLOR.softFill, "F");
    rect(ctx, barX, y + lh * 0.25, Math.max(0.4, (Math.abs(it.value) / max) * barW), bh, color, "F");
    txt(ctx, fmt(it.value), barX + barW + 2, y + lh * 0.8, valueW, { size: TYPE.base - 1, color: COLOR.steel, align: "left" });
  });
}

/** Pareto: bar nilai + garis kumulatif persen. */
function drawPareto(ctx: ChartCtx, spec: ParetoSpec): void {
  let top = ctx.y;
  if (spec.title) top += drawChartTitle(ctx, spec.title, spec.subtitle);
  const vals = spec.values;
  const total = vals.reduce((a, b) => a + Math.abs(b), 0);
  const scale = niceScale(Math.max(...vals.map((v) => Math.abs(v))));
  const yLabels = axisTicks(scale.max, scale.step);
  const yLabelW = Math.max(...yLabels.map((t) => measure(ctx.pdf, compactNum(t), { font: "regular", size: TYPE.axis, embedded: ctx.embedded }))) + 2.5;
  const plotX = ctx.x + yLabelW;
  const plotW = Math.max(20, ctx.width - yLabelW - 10);
  const plotY = top + 3;
  const plotH = 46;
  yLabels.forEach((t) => {
    const yy = plotY + plotH - (t / scale.max) * plotH;
    line(ctx, plotX, yy, plotX + plotW, yy, t === 0 ? COLOR.zero : COLOR.grid, t === 0 ? STROKE.medium : STROKE.hair);
    txt(ctx, compactNum(t), ctx.x, yy + lineHeightFor(TYPE.axis) * 0.32, yLabelW - 2.5, { size: TYPE.axis, color: COLOR.axis, align: "right" });
  });
  const slot = plotW / Math.max(1, vals.length);
  const barW = Math.min(slot * 0.6, 15);
  let cum = 0;
  const pts: Array<{ x: number; y: number }> = [];
  vals.forEach((v, i) => {
    const cx = plotX + slot * i + (slot - barW) / 2;
    const yTop = plotY + plotH - (Math.abs(v) / scale.max) * plotH;
    rect(ctx, cx, yTop, barW, Math.max(0.2, plotY + plotH - yTop), COLOR.series[0]!, "F");
    cum += Math.abs(v);
    const pct = total > 0 ? cum / total : 0;
    pts.push({ x: plotX + slot * i + slot / 2, y: plotY + plotH - pct * plotH });
  });
  /* Garis kumulatif */
  const cumColor = COLOR.series[3]!;
  ctx.pdf.setDrawColor(cumColor[0], cumColor[1], cumColor[2]);
  ctx.pdf.setLineWidth(0.5);
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    ctx.pdf.line(p1.x, p1.y, p2.x, p2.y);
    ctx.rec.push({ page: ctx.pdf.getCurrentPageInfo().pageNumber, x: Math.min(p1.x, p2.x), y: Math.min(p1.y, p2.y), w: p2.x - p1.x, h: Math.abs(p2.y - p1.y), kind: "line" });
  }
  ctx.pdf.setLineWidth(STROKE.hair);
  for (const p of pts) {
    ctx.pdf.setFillColor(cumColor[0], cumColor[1], cumColor[2]);
    ctx.pdf.circle(p.x, p.y, 0.55, "F");
    ctx.rec.push({ page: ctx.pdf.getCurrentPageInfo().pageNumber, x: p.x - 0.55, y: p.y - 0.55, w: 1.1, h: 1.1, kind: "rect" });
  }
  /* Sumbu persen kanan */
  const pctW = 9;
  [0, 50, 80, 100].forEach((p) => {
    const yy = plotY + plotH - (p / 100) * plotH;
    txt(ctx, `${p}%`, plotX + plotW + 1, yy + lineHeightFor(TYPE.axis) * 0.32, pctW, { size: TYPE.axis, color: COLOR.axis, align: "left" });
  });
  drawXLabels(ctx, spec.categories, plotX, plotW, plotY + plotH + lineHeightFor(TYPE.axis));
}

export { drawChart as renderChart };
