// Skema notifikasi per modul - SATU SUMBER untuk banner + highlight.
// Badge sidebar DIHAPUS (per 2026-09-26): yang stay hanya banner + highlight
// per halaman modul, murni ikut KONDISI data (tanpa read-state).
// Builder per modul agar hook halaman hanya hitung 1 modul (murah) -
// buildModuleAlertItems (semua) dipertahankan untuk kompatibilitas.
import type { StoreShape, StoreItem } from "../data/store";
import { effectiveMinStock, ruleOf, warnLevelOf } from "./inventoryWarn";
import { computeAlerts } from "./alerts";
import { getSetting } from "./settings";
import { createdAtOf, lastTouchedAt } from "./timestamps";
import { fmtRupiah as rupiah } from "./format";

export type ModuleAlertKey =
  | "proyek" | "drydock" | "inventori" | "equipment" | "subkontraktor"
  | "qc" | "crm" | "procurement" | "keuangan" | "sdm" | "payroll"
  | "kapal" | "dokumen";

/**
 * Tiga tingkat, bukan "penting tidak penting". Level ini diturunkan dari
 * severity yang SUDAH ADA di data - tidak ada klasifikasi baru yang harus
 * diisi pengguna, jadi tidak bisa lagi melenceng dari warna aslinya.
 *
 *   kritis     - ada yang rusak/terlambat dan dampaknya sudah nyata atau termin
 *                sudah lewat. Butuh tindakan hari ini.
 *   perhatian   - perlu ditindaklanjuti, belum ada kerugian irrevocabel.
 *   info       - duniawi. SELALU tampil, hanya beda warna. Kalau ini ikut
 *                dihitung ke badge sidebar, badge jadi alasan untuk
 *               berulang dismiss alert yang memang tidak perlu ditutup.
 */
export type AlertLevel = "kritis" | "perhatian" | "info";

export const ALERT_LEVELS: readonly AlertLevel[] = ["kritis", "perhatian", "info"];

/** Urutan untuk group + cap. Kritis selalu di atas. */
export const ALERT_LEVEL_RANK: Record<AlertLevel, number> = { kritis: 0, perhatian: 1, info: 2 };

/** Warna banner/ikon per level. Satu sumber, dipakai banner + dashboard. */
export const ALERT_LEVEL_TONE: Record<AlertLevel, "red" | "amber" | "blue"> = {
  kritis: "red",
  perhatian: "amber",
  info: "blue",
};

export interface ModuleAlertItem {
  /** id stabil per baris kondisi (dipakai highlight + key React). */
  id: string;
  /** id baris di koleksi (untuk highlight). */
  rowId: string;
  label: string;
  detail: string;
  /**
   * Wajib. Builder lama tidak mengisinya, jadi `normalizeItem` yang= menjamin
   * tidak pernah `undefined` - probe F1 memeriksa ini, karena badge dan
   * group Dashboard salah hitung begitu ada satu `undefined`.
   */
  level: AlertLevel;
  /** Tanggal batas/batas waktu (ISO atau YYYY-MM-DD). */
  due?: string;
  /** Kapan kondisi ini muncul (ISO). */
  since?: string;
  /** Dampak terukur: rupiah, kuantitas, atau nama. */
  impact?: string;
}

export const MODULE_ALERT_TO: Record<ModuleAlertKey, string> = {
  proyek: "/proyek",
  drydock: "/drydock",
  inventori: "/inventori",
  equipment: "/equipment",
  subkontraktor: "/subkontraktor",
  qc: "/qc-safety",
  crm: "/crm",
  procurement: "/procurement",
  keuangan: "/keuangan",
  sdm: "/sdm",
  payroll: "/payroll",
  kapal: "/kapal",
  dokumen: "/dokumen",
};

const num = (v: unknown): number => Number(v) || 0;

function daysUntil(iso: string | null | undefined): number | null {
  if (!iso || iso === "-") return null;
  const raw = String(iso).length === 7 ? `${iso}-01` : String(iso);
  const t = new Date(`${raw}T00:00:00`).getTime();
  if (Number.isNaN(t)) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((t - today) / 86400000);
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type Ctx = {
  data: StoreShape;
  list: (k: string) => StoreItem[];
  today: string;
};

/** Petakan tone engine alerts lama ke tiga level. Satu sumber, bukan tiga. */
function levelFromTone(tone: string | undefined): AlertLevel {
  if (tone === "red") return "kritis";
  if (tone === "amber") return "perhatian";
  return "info";
}

/** `Critical`/`Major`/`Minor` (NCR) dan `Tinggi`/`Sedang`/`Rendah` (insiden). */
function levelFromSeverity(sev: unknown): AlertLevel {
  const s = String(sev ?? "").trim().toLowerCase();
  if (["critical", "tinggi", "high", "kritis"].includes(s)) return "kritis";
  if (["major", "sedang", "medium", "moderate"].includes(s)) return "perhatian";
  return "info";
}

/** Umur kondisi: dari field yang paling dekat ke "kapan ini muncul". */
function sinceOf(row: StoreItem, explicit?: unknown): string {
  const v = explicit !== undefined && explicit !== null && String(explicit) !== "" ? String(explicit) : "";
  if (v !== "" && Number.isFinite(Date.parse(v))) return v;
  return lastTouchedAt(row) ?? createdAtOf(row) ?? "";
}

function buildProyek(ctx: Ctx): ModuleAlertItem[] {
  const out: ModuleAlertItem[] = [];
  // Reuse engine alerts yang mengarah ke /proyek* (bell ikut turun).
  // rowId = id proyek (untuk highlight baris), KECUALI alert agregat yang
  // tujuannya bukan satu proyek. Versi lama regexp-nya tanpa kecuali,
  // sehingga `to: "/proyek/monitoring"` ikut terambil sebagai rowId
  // "monitoring" - tidak ada baris bernama itu di tabel, jadi klik banner
  // tidak pernah menyorot apa pun.
  const rows = ctx.list("projects");
  for (const al of computeAlerts(ctx.data)) {
    if (!al.to.startsWith("/proyek/")) continue;
    const m = /^\/proyek\/([^/]+)$/.exec(al.to);
    if (!m) continue;
    const row = rows.find((p) => String(p.id) === m[1]);
    out.push({
      id: `alert-${al.id}`,
      rowId: m[1],
      label: al.text,
      detail: `Tujuan: ${al.to}`,
      level: levelFromTone(al.tone),
      since: row ? sinceOf(row) : "",
    });
  }
  return out;
}

function buildDrydock(ctx: Ctx): ModuleAlertItem[] {
  const out: ModuleAlertItem[] = [];
  // Slot konflik (sama dengan engine #7, per slot).
  const slots = ctx.list("dockSlots");
  const conflicted = new Set<string>();
  for (const s of slots) {
    const clash = slots.some(
      (o) => String(o.id) !== String(s.id) && String(o.dockId) === String(s.dockId) &&
        Number(s.from) < Number(o.to) && Number(o.from) < Number(s.to),
    );
    if (clash) conflicted.add(String(s.id));
  }
  for (const s of slots) {
    if (!conflicted.has(String(s.id))) continue;
    out.push({
      id: `mod-dock-${s.id}`, rowId: String(s.id),
      label: `Slot ${s.id} konflik di ${s.dockId ?? "-"}`,
      detail: `${s.vessel ?? "-"} · ${s.from}→${s.to}`,
      /* Kontrak jadwal yang bentrok berarti dua kapal dipeskan untuk
         satu dock. Ini bukan "perhatian" - jadwal konsolidasi salah. */
      level: "kritis",
      since: sinceOf(s),
    });
  }
  return out;
}

function buildInventori(ctx: Ctx): ModuleAlertItem[] {
  const out: ModuleAlertItem[] = [];
  /* Klasifikasi memakai warnLevelOf dari utils/inventoryWarn, bukan
     `stock > minStock` telanjang seperti sebelumnya.

     Aturan telanjang itu bertentangan dengan sengaja Designed di
     inventoryWarn: kategori Service/Jasa tidak punya stok fisik sehingga
     ignoresMin=true (stok 0 = belum ada paket jasa terjual, bukan barang
     hilang), dan minStok per-gudang (minStockByWarehouse) menggeser
     ambang per lokasi. Dengan aturan lama semua item jasa alarm terus
     di sidebar, di kartu Dashboard, dan di /notifikasi - persis alert
     palsu yang inventoryWarn dibuat untuk menghilangkannya.

     Akibatnya katalog (pakai katalogBadge -> warnLevelOf) dan badge
     sidebar (pakai buildInventori ini) bisa menampilkan level yang
     berbeda untuk item yang sama. Sekarang keduanya satu sumber. */
  for (const i of ctx.list("inventory")) {
    const level = warnLevelOf(i).level;
    if (level !== "critical" && level !== "low") continue;
    const min = effectiveMinStock(i);
    out.push({
      id: `mod-inv-${i.id}`, rowId: String(i.id),
      label: `${i.name ?? i.id} ${level === "critical" ? "kritis" : "menipis"} `
        + `(${num(i.stock)} ${i.unit ?? ""} vs min ${num(min)})`,
      detail: `Gudang: ${i.warehouse ?? "-"} · ${ruleOf(i.category).key || "Umum"}`,
      level: level === "critical" ? "kritis" : "perhatian",
      /* Yang hilang, bukan yang tersisa. Stokfisik tidak punya tanggal
         dibuat, jadi impact-nya diisi ANGKA yang hilang. */
      impact: `${rupiah(num(min) - num(i.stock))} (${num(i.stock) - num(min)} ${i.unit ?? ""})`,
      since: sinceOf(i),
    });
  }
  return out;
}

function buildEquipment(ctx: Ctx): ModuleAlertItem[] {
  const out: ModuleAlertItem[] = [];
  for (const e of ctx.list("equipment")) {
    const due = daysUntil(String(e.nextService ?? ""));
    if (String(e.status ?? "") === "Maintenance") {
      out.push({
        id: `mod-eq-${e.id}`, rowId: String(e.id),
        label: `${e.name ?? e.id} dalam maintenance`,
        detail: String(e.maintenanceNote ?? e.code ?? ""),
        level: "perhatian",
        due: e.nextService ? String(e.nextService) : undefined,
        impact: e.rate ? `tarif ${rupiah(num(e.rate))}/jam` : undefined,
        since: sinceOf(e),
      });
} else if (due !== null && due >= 0 && due <= 14) {
      out.push({
        id: `mod-eq-${e.id}`, rowId: String(e.id),
        label: `${e.name ?? e.id} servis H-${due}`,
        detail: `Jadwal: ${e.nextService}`,
        /* Cabang ini hanya untuk servis yang MASIH akan datang (due >= 0).
           Servis yang sudah lewat tidak pernah sampai ke sini - ia tidak
           dihitung sebagai alert sama sekali, dan itu disengaja: "belum
           dijadwalkan ulang" bukan hal yang perlu dikejar lewat banner. */
        level: "perhatian",
        due: String(e.nextService),
        since: sinceOf(e),
      });
    }
  }
  return out;
}

function buildSubkontraktor(ctx: Ctx): ModuleAlertItem[] {
  const out: ModuleAlertItem[] = [];
  for (const t of ctx.list("termins")) {
    if (String(t.status ?? "") !== "Diajukan") continue;
    const amount = num(t.amount);
    out.push({
      id: `mod-sub-${t.id}`, rowId: String(t.id),
      label: `Termin ${t.id} menunggu persetujuan (${t.sub ?? "-"})`,
      detail: `${t.milestone ?? ""} · ${amount}`,
      level: "perhatian",
      impact: amount > 0 ? rupiah(amount) : undefined,
      since: sinceOf(t),
    });
  }
  return out;
}

function buildQc(ctx: Ctx): ModuleAlertItem[] {
  const out: ModuleAlertItem[] = [];
  for (const n of ctx.list("ncr")) {
    if (String(n.status ?? "") === "Tertutup") continue;
    const level = levelFromSeverity(n.severity);
    out.push({
      id: `mod-qc-${n.id}`, rowId: String(n.id),
      label: `NCR ${n.id} terbuka (${n.severity ?? "-"})`,
      detail: String(n.issue ?? n.project ?? ""),
      level,
      /* `raised` = kapan NCR dibuat - field paling dekat ke "sejak berapa
         lama ini belum ditutup". */
      since: sinceOf(n, n.raised),
    });
  }
  for (const i of ctx.list("incidents")) {
    out.push({
      id: `mod-qc-${i.id}`, rowId: String(i.id),
      label: `Insiden: ${i.desc ?? i.type ?? i.id}`,
      detail: `${i.date ?? ""} · ${i.location ?? ""}`,
      level: levelFromSeverity(i.severity),
      since: sinceOf(i, i.date),
    });
  }
  return out;
}

function buildCrm(ctx: Ctx): ModuleAlertItem[] {
  const out: ModuleAlertItem[] = [];
  for (const r of ctx.list("requests")) {
    if (!["Baru", "Disurvei"].includes(String(r.status ?? ""))) continue;
    out.push({
      id: `mod-crm-${r.id}`, rowId: String(r.id),
      label: `Request ${r.id} ${r.status} (${r.vessel ?? "-"})`,
      detail: String(r.client ?? ""),
      /* Request masuk bukan masalah - info. */
      level: "info",
      since: sinceOf(r, r.date),
    });
  }
  return out;
}

function buildProcurement(ctx: Ctx): ModuleAlertItem[] {
  const out: ModuleAlertItem[] = [];
  for (const r of ctx.list("requisitions")) {
    const st = String(r.status ?? "");
    if (!st.toLowerCase().includes("menunggu") && st.toUpperCase() !== "RFQ") continue;
    const amount = num(r.amount);
    out.push({
      id: `mod-proc-${r.id}`, rowId: String(r.id),
      label: `PR ${r.id} ${st} (${r.item ?? "-"})`,
      detail: String(r.by ?? ""),
      level: "perhatian",
      impact: amount > 0 ? rupiah(amount) : undefined,
      since: sinceOf(r),
    });
  }
  for (const p of ctx.list("purchaseOrders")) {
    const st = String(p.status ?? "");
    const canon = st === "Menunggu Persetujuan" ? "Diajukan" : st;
    if (canon !== "Diajukan") continue;
    const total = num(p.total ?? p.amount);
    out.push({
      id: `mod-proc-${p.id}`, rowId: String(p.id),
      label: `PO ${p.id} menunggu persetujuan (${p.vendor ?? "-"})`,
      detail: String(p.item ?? ""),
      level: "perhatian",
      impact: total > 0 ? rupiah(total) : undefined,
      since: sinceOf(p),
    });
  }
  return out;
}

function buildKeuangan(ctx: Ctx): ModuleAlertItem[] {
  const out: ModuleAlertItem[] = [];
  for (const i of ctx.list("invoices")) {
    const st = String(i.status ?? "");
    if (!["Belum Dibayar", "Terlambat"].includes(st)) continue;
    const due = String(i.due ?? "");
    /* Terlambat sudah lewat tanggal. "Belum Dibayar" yang sudah lewat juga
       kritis - statusnya belum diperbarui, tapi uangnya tetap menua. */
    const lewat = due !== "" && due < ctx.today;
    const total = num(i.grandTotal || i.amount);
    out.push({
      id: `mod-fin-${i.id}`, rowId: String(i.id),
      label: `Invoice ${i.id} ${st} (${i.client ?? "-"})`,
      detail: `Jatuh tempo: ${i.due ?? "-"} · ${rupiah(total)}`,
      level: st === "Terlambat" || lewat ? "kritis" : "perhatian",
      due: due !== "" ? due : undefined,
      impact: total > 0 ? rupiah(total) : undefined,
      since: sinceOf(i, i.date),
    });
  }
  for (const a of ctx.list("payables")) {
    if (String(a.st ?? "") === "Lunas") continue;
    const due = String(a.due ?? "");
    if (!due || due >= ctx.today) continue;
    const total = num(a.total ?? a.amount);
    out.push({
      id: `mod-fin-${a.id}`, rowId: String(a.id),
      label: `Hutang ${a.po ?? a.id} jatuh tempo (${a.v ?? "-"})`,
      detail: `Jatuh tempo: ${due}`,
      level: "kritis",
      due,
      impact: total > 0 ? rupiah(total) : undefined,
      since: sinceOf(a),
    });
  }
  return out;
}

function buildSdm(ctx: Ctx): ModuleAlertItem[] {
  const out: ModuleAlertItem[] = [];
  for (const l of ctx.list("leaves")) {
    if (String(l.status ?? "") !== "Diajukan") continue;
    out.push({
      id: `mod-sdm-${l.id}`, rowId: String(l.id),
      label: `Cuti ${l.employeeId ?? "-"} menunggu (${l.type ?? "-"})`,
      detail: `${l.from ?? ""}→${l.to ?? ""} · ${l.days ?? "?"} hari`,
      level: "info",
      since: sinceOf(l),
    });
  }
  return out;
}

function buildPayroll(ctx: Ctx): ModuleAlertItem[] {
  const out: ModuleAlertItem[] = [];
  for (const p of ctx.list("payroll")) {
    if (String(p.status ?? "") !== "Draft") continue;
    out.push({
      id: `mod-pay-${p.id}`, rowId: String(p.id),
      label: `Payroll ${p.employeeId ?? "-"} ${p.period ?? ""} masih Draft`,
      detail: String(p.type ?? "Gaji"),
      level: "info",
      impact: num(p.net) > 0 ? rupiah(num(p.net)) : undefined,
      since: sinceOf(p),
    });
  }
  return out;
}

function buildKapal(ctx: Ctx): ModuleAlertItem[] {
  const out: ModuleAlertItem[] = [];
  // Sertifikat kritis/warning ≤ 60 hari.
  const warnDays = getSetting(ctx.data, "ALERT_CERT_60", 60);
  for (const v of ctx.list("vessels")) {
    const certs = Array.isArray(v.certificates) ? (v.certificates as { name?: unknown; expires?: unknown }[]) : [];
    for (const c of certs) {
      const d = daysUntil(String(c.expires ?? ""));
      if (d === null || d > warnDays) continue;
      out.push({
        id: `mod-vsl-${v.id}-${String(c.name ?? "cert")}`,
        rowId: String(v.id),
        label: `${v.name ?? v.id}: ${c.name ?? "sertifikat"} ${d < 0 ? `lewat ${-d} hari` : `sisa ${d} hari`}`,
        detail: `Berlaku hingga: ${c.expires ?? "-"}`,
        /* Sertifikat sudah lewat = kapal tidak boleh berlayar. */
        level: d < 0 ? "kritis" : "perhatian",
        due: String(c.expires ?? ""),
        since: sinceOf(v),
      });
    }
  }
  return out;
}

function buildDokumen(ctx: Ctx): ModuleAlertItem[] {
  const out: ModuleAlertItem[] = [];
  for (const d of ctx.list("documents")) {
    const st = String(d.status ?? "");
    const needAppr = st === "Diajukan" || st === "Draft" || st === "Menunggu Approval";
    if (st === "Kedaluwarsa") {
      out.push({
        id: `mod-doc-${d.id}`, rowId: String(d.id),
        label: `Dokumen ${d.id} kedaluwarsa`,
        detail: String(d.title ?? d.type ?? ""),
        level: "kritis",
        due: d.berlakuHingga ? String(d.berlakuHingga) : undefined,
        since: sinceOf(d),
      });
    } else if (needAppr) {
      out.push({
        id: `mod-doc-${d.id}`, rowId: String(d.id),
        label: `Dokumen ${d.id} perlu approval (${st})`,
        detail: String(d.title ?? d.type ?? ""),
        level: "perhatian",
        due: d.berlakuHingga ? String(d.berlakuHingga) : undefined,
        since: sinceOf(d),
      });
    }
  }
  return out;
}

const BUILDERS: Record<ModuleAlertKey, (ctx: Ctx) => ModuleAlertItem[]> = {
  proyek: buildProyek,
  drydock: buildDrydock,
  inventori: buildInventori,
  equipment: buildEquipment,
  subkontraktor: buildSubkontraktor,
  qc: buildQc,
  crm: buildCrm,
  procurement: buildProcurement,
  keuangan: buildKeuangan,
  sdm: buildSdm,
  payroll: buildPayroll,
  kapal: buildKapal,
  dokumen: buildDokumen,
};

function makeCtx(data: StoreShape): Ctx {
  const items = data as unknown as Record<string, StoreItem[] | undefined>;
  return {
    data,
    list: (k: string): StoreItem[] => (Array.isArray(items[k]) ? (items[k] as StoreItem[]) : []),
    today: todayISO(),
  };
}

function isAlertLevel(v: unknown): v is AlertLevel {
  return v === "kritis" || v === "perhatian" || v === "info";
}

function isStamp(v: unknown): boolean {
  return typeof v === "string" && v !== "" && Number.isFinite(Date.parse(v));
}

/**
 * Jaring pengaman. Builder baru akan lupa mengeset `level` - dan `undefined`
 * diam-diam hilang dari group Dashboard (filter tidak cocok) tapi TETAP
 * terhitung di badge (sum berjalan). Dua tempat itu jadi berbeda jumlahnya,
 * dan itu jauh lebih sulit noticed daripada alert yang hilang.
 *
 * Default-nya "perhatian", bukan "kritis": kalau builder lupa, lebih baik
 * satu alert penting muncul di kelompoknya daripada angka badge yang tidak
 * yang tidak cocok dengan banner.
 */
function normalizeItems(items: ModuleAlertItem[]): ModuleAlertItem[] {
  return items.map((it) => {
    const out: ModuleAlertItem = { ...it, level: isAlertLevel(it.level) ? it.level : "perhatian" };
    /* `due`/`since` yang tidak bisa diparse membuat "umur X hari" jadi
       NaN atau "Invalid Date" - lebih baik kosong daripada ditampilkan
       salah. */
    if (out.due !== undefined && !isStamp(out.due)) delete out.due;
    if (out.since !== undefined && !isStamp(out.since)) delete out.since;
    if (out.impact !== undefined && out.impact.trim() === "") delete out.impact;
    return out;
  });
}

/** Urut untuk group/cap: kritis dulu, lalu yang paling mendesak. */
export function sortByLevel(items: ModuleAlertItem[]): ModuleAlertItem[] {
  return [...items].sort((a, b) => {
    const ra = ALERT_LEVEL_RANK[a.level];
    const rb = ALERT_LEVEL_RANK[b.level];
    if (ra !== rb) return ra - rb;
    const da = a.due ?? "9999";
    const db = b.due ?? "9999";
    if (da !== db) return da < db ? -1 : 1;
    return a.label.localeCompare(b.label, "id-ID");
  });
}

/** Hitung per level - sumber angka untuk badge sidebar & header banner. */
export function countByLevel(items: readonly ModuleAlertItem[]): Record<AlertLevel, number> {
  const out: Record<AlertLevel, number> = { kritis: 0, perhatian: 0, info: 0 };
  for (const it of items) out[isAlertLevel(it.level) ? it.level : "perhatian"] += 1;
  return out;
}

/**
 * Badge sidebar = kritis + perhatian saja.
 *
 * `info` sengaja DIHILANGKAN. Info selalu tampil di banner, jadi menghitungnya
 * di badge hanya menambah angka yang tidak bisa ditindaklanjuti: badge jadi
 * alasan untuk menutup banner, padahal isinya memang tidak perlu ditutup.
 */
export function badgeCount(counts: Record<AlertLevel, number>): number {
  return counts.kritis + counts.perhatian;
}

/** Group + cap per level. Yang lewat cap tidak dihapus, hanya disembunyikan. */
export function groupByLevel(
  items: readonly ModuleAlertItem[],
  cap = 5,
): Array<{ level: AlertLevel; items: ModuleAlertItem[]; total: number; hidden: number }> {
  const counts = countByLevel(items);
  const out: Array<{ level: AlertLevel; items: ModuleAlertItem[]; total: number; hidden: number }> = [];
  for (const level of ALERT_LEVELS) {
    const total = counts[level];
    if (total === 0) continue;
    const bucket = sortByLevel(items.filter((it) => it.level === level));
    out.push({ level, items: bucket.slice(0, cap), total, hidden: Math.max(0, total - cap) });
  }
  return out;
}

/** Hitung 1 modul saja (murah) - dipakai hook halaman. */
export function buildModuleAlertItemsFor(data: StoreShape, key: ModuleAlertKey): ModuleAlertItem[] {
  return normalizeItems(BUILDERS[key](makeCtx(data)));
}

export function buildModuleAlertItems(data: StoreShape): Record<ModuleAlertKey, ModuleAlertItem[]> {
  const ctx = makeCtx(data);
  return {
    proyek: normalizeItems(buildProyek(ctx)),
    drydock: normalizeItems(buildDrydock(ctx)),
    inventori: normalizeItems(buildInventori(ctx)),
    equipment: normalizeItems(buildEquipment(ctx)),
    subkontraktor: normalizeItems(buildSubkontraktor(ctx)),
    qc: normalizeItems(buildQc(ctx)),
    crm: normalizeItems(buildCrm(ctx)),
    procurement: normalizeItems(buildProcurement(ctx)),
    keuangan: normalizeItems(buildKeuangan(ctx)),
    sdm: normalizeItems(buildSdm(ctx)),
    payroll: normalizeItems(buildPayroll(ctx)),
    kapal: normalizeItems(buildKapal(ctx)),
    dokumen: normalizeItems(buildDokumen(ctx)),
  };
}
