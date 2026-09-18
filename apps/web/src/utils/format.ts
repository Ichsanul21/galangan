// Sistem format tunggal — semua tampilan tanggal/angka/uah lewat sini.
// Data mentah tetap ISO (YYYY-MM-DD / YYYY-MM / "-"), UI selalu lokal id-ID.

const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

function parseISO(v: string | null | undefined): { y: string; m: string; d: string } | null {
  if (!v || v === "-") return null;
  const m = String(v).match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/);
  if (!m) return null;
  return { y: m[1], m: m[2], d: m[3] ?? "" };
}

/** "2026-08-01" → "1 Agu 2026" · "2026-08" → "Agu 2026" · "-" → "—" */
export function fmtTanggal(v: string | null | undefined): string {
  const p = parseISO(v);
  if (!p) return "—";
  const mi = Number(p.m) - 1;
  const bulan = BULAN[mi] ?? p.m;
  if (!p.d) return `${bulan} ${p.y}`;
  return `${Number(p.d)} ${bulan} ${p.y}`;
}

/** "2026-08-01" → "Agu 2026" */
export function fmtBulan(v: string | null | undefined): string {
  const p = parseISO(v);
  if (!p) return "—";
  return `${BULAN[Number(p.m) - 1] ?? p.m} ${p.y}`;
}

/** "2026-08-01" → "2026-08-31" jadi "1 → 31 Agu 2026", beda bulan/tahun ditulis penuh */
export function fmtRentang(a: string | null | undefined, b: string | null | undefined): string {
  const pa = parseISO(a);
  const pb = parseISO(b);
  if (!pa && !pb) return "—";
  if (!pa) return fmtTanggal(b);
  if (!pb) return `${fmtTanggal(a)} → …`;
  if (pa.y === pb.y && pa.m === pb.m && pa.d && pb.d) {
    return `${Number(pa.d)} → ${Number(pb.d)} ${BULAN[Number(pa.m) - 1]} ${pa.y}`;
  }
  return `${fmtTanggal(a)} → ${fmtTanggal(b)}`;
}

export function fmtRupiah(n: number): string {
  if (!Number.isFinite(n)) return "Rp 0";
  return "Rp " + Math.round(n).toLocaleString("id-ID");
}

export function fmtMiliar(n: number): string {
  if (!Number.isFinite(n)) return "Rp 0 M";
  return "Rp " + (n / 1_000_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 }) + " M";
}

export function fmtJumlah(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString("id-ID");
}

export function fmtPersen(n: number): string {
  if (!Number.isFinite(n)) return "0%";
  return n.toLocaleString("id-ID", { maximumFractionDigits: 1 }) + "%";
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function monthISO(): string {
  return new Date().toISOString().slice(0, 7);
}

/** Kamus satuan baku seluruh aplikasi */
export const SATUAN = ["pcs", "unit", "set", "ton", "kg", "m", "m²", "m³", "liter", "meter", "batang", "roll", "package", "jam", "service"] as const;

/** Label Indonesia untuk status yang disimpan dalam EN di data */
export const STATUS_BOQ_ID: Record<string, string> = {
  Draft: "Draf",
  Pending: "Menunggu",
  Approved: "Disetujui",
  Completed: "Selesai",
  Rejected: "Ditolak",
};

export const STATUS_SVC_ID: Record<string, string> = {
  Scheduled: "Dijadwalkan",
  "In Progress": "Sedang",
  Done: "Selesai",
};
