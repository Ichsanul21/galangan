/**
 * FE RBAC matrix + runtime checks (T6-MON2 / W7).
 * Sumber kebenaran yang sama dengan halaman Peran; backend tetap
 * enforce via services/api/src/rbac.ts (per-collection write policy).
 *
 * Role sesi (demo/backend) dinormalisasi ke kunci matriks lewat
 * normalizeRole() supaya "Manager" → "Project Manager", dst.
 */

export const ACTIONS = ["Lihat", "Buat", "Ubah", "Hapus", "Setujui", "Bayar", "Ekspor"] as const;
export type RoleAction = (typeof ACTIONS)[number];

export const MODULES = [
  "Proyek",
  "Drydock",
  "Inventori",
  "Equipment",
  "Subkontraktor",
  "QC & Safety",
  "CRM",
  "Procurement",
  "Keuangan",
  "SDM",
  "Kapal",
  "Dokumen",
  "Analytics",
  "Notifikasi",
  "Absensi",
  "Payroll",
  "Laporan",
  "Monitoring",
  "Pengaturan",
];

export const ROLES = [
  "Direktur",
  "Project Manager",
  "Foreman/Tim",
  "QC Inspector",
  "QC/HSE Manager",
  "Warehouse",
  "Procurement",
  "Finance",
  "HR",
  "Sales",
  "Client (eks)",
  "Admin",
];

export type MatrixRole = string;

/** Sel yang tidak tercantum = tanpa akses. */
export const ROLE_MATRIX: Record<string, Record<string, RoleAction[]>> = {
  Direktur: {
    Proyek: ["Lihat", "Buat", "Ubah", "Setujui", "Ekspor"],
    Drydock: ["Lihat", "Setujui", "Ekspor"],
    Inventori: ["Lihat", "Ekspor"],
    Equipment: ["Lihat", "Ekspor"],
    Subkontraktor: ["Lihat", "Buat", "Ubah", "Setujui", "Ekspor"],
    "QC & Safety": ["Lihat", "Ekspor"],
    CRM: ["Lihat", "Buat", "Ubah", "Setujui", "Ekspor"],
    Procurement: ["Lihat", "Setujui", "Ekspor"],
    Keuangan: ["Lihat", "Setujui", "Bayar", "Ekspor"],
    SDM: ["Lihat", "Setujui", "Ekspor"],
    Kapal: ["Lihat", "Ekspor"],
    Dokumen: ["Lihat", "Ekspor"],
    Analytics: ["Lihat", "Ekspor"],
    Notifikasi: ["Lihat"],
    Absensi: ["Lihat", "Setujui", "Ekspor"],
    Payroll: ["Lihat", "Setujui", "Bayar", "Ekspor"],
    Laporan: ["Lihat", "Ekspor"],
    Monitoring: ["Lihat", "Ekspor"],
    Pengaturan: ["Lihat", "Ekspor"],
  },
  "Project Manager": {
    Proyek: ["Lihat", "Buat", "Ubah", "Setujui", "Ekspor"],
    Drydock: ["Lihat", "Buat", "Ubah", "Ekspor"],
    Inventori: ["Lihat", "Buat", "Ekspor"],
    Equipment: ["Lihat", "Buat", "Ubah", "Ekspor"],
    Subkontraktor: ["Lihat", "Buat", "Ubah", "Setujui", "Ekspor"],
    "QC & Safety": ["Lihat", "Buat"],
    CRM: ["Lihat"],
    Procurement: ["Lihat", "Buat", "Ekspor"],
    Keuangan: ["Lihat", "Ekspor"],
    SDM: ["Lihat", "Ekspor"],
    Kapal: ["Lihat"],
    Dokumen: ["Lihat", "Buat", "Ubah", "Ekspor"],
    Analytics: ["Lihat", "Ekspor"],
    Notifikasi: ["Lihat"],
    Absensi: ["Lihat", "Setujui", "Ekspor"],
    Payroll: ["Lihat"],
    Laporan: ["Lihat", "Buat", "Ekspor"],
    Monitoring: ["Lihat", "Buat", "Ubah", "Ekspor"],
  },
  "Foreman/Tim": {
    Proyek: ["Lihat", "Ubah"],
    Drydock: ["Lihat"],
    Inventori: ["Lihat", "Buat"],
    Equipment: ["Lihat", "Buat"],
    Subkontraktor: ["Lihat"],
    "QC & Safety": ["Lihat", "Buat"],
    Dokumen: ["Lihat"],
    Notifikasi: ["Lihat"],
    Absensi: ["Lihat", "Buat"],
    Laporan: ["Lihat"],
    Monitoring: ["Lihat", "Ubah"],
  },
  "QC Inspector": {
    Proyek: ["Lihat"],
    Monitoring: ["Lihat"],
    Inventori: ["Lihat"],
    Equipment: ["Lihat"],
    "QC & Safety": ["Lihat", "Buat", "Ubah", "Ekspor"],
    Dokumen: ["Lihat", "Buat", "Ubah", "Ekspor"],
    Notifikasi: ["Lihat"],
    Laporan: ["Lihat", "Ekspor"],
  },
  "QC/HSE Manager": {
    Proyek: ["Lihat", "Setujui"],
    Monitoring: ["Lihat"],
    Equipment: ["Lihat"],
    "QC & Safety": ["Lihat", "Buat", "Ubah", "Setujui", "Ekspor"],
    SDM: ["Lihat"],
    Dokumen: ["Lihat", "Buat", "Ubah", "Setujui", "Ekspor"],
    Notifikasi: ["Lihat"],
    Absensi: ["Lihat"],
    Laporan: ["Lihat", "Buat", "Ekspor"],
  },
  Warehouse: {
    Proyek: ["Lihat"],
    Inventori: ["Lihat", "Buat", "Ubah", "Ekspor"],
    Equipment: ["Lihat"],
    Procurement: ["Lihat", "Buat"],
    Dokumen: ["Lihat"],
    Notifikasi: ["Lihat"],
    Laporan: ["Lihat", "Ekspor"],
  },
  Procurement: {
    Proyek: ["Lihat"],
    Inventori: ["Lihat", "Buat", "Ubah", "Ekspor"],
    Subkontraktor: ["Lihat", "Buat", "Ubah"],
    Procurement: ["Lihat", "Buat", "Ubah", "Setujui", "Ekspor"],
    Keuangan: ["Lihat"],
    Dokumen: ["Lihat", "Buat", "Ekspor"],
    Notifikasi: ["Lihat"],
    Laporan: ["Lihat", "Ekspor"],
  },
  Finance: {
    Proyek: ["Lihat"],
    CRM: ["Lihat"],
    Procurement: ["Lihat"],
    Keuangan: ["Lihat", "Buat", "Ubah", "Setujui", "Bayar", "Ekspor"],
    Payroll: ["Lihat", "Buat", "Ubah", "Bayar", "Ekspor"],
    Dokumen: ["Lihat", "Ekspor"],
    Analytics: ["Lihat", "Ekspor"],
    Notifikasi: ["Lihat"],
    Laporan: ["Lihat", "Buat", "Ekspor"],
  },
  HR: {
    Proyek: ["Lihat"],
    SDM: ["Lihat", "Buat", "Ubah", "Hapus", "Setujui", "Ekspor"],
    Dokumen: ["Lihat", "Buat", "Ekspor"],
    Notifikasi: ["Lihat"],
    Absensi: ["Lihat", "Buat", "Ubah", "Setujui", "Ekspor"],
    Payroll: ["Lihat", "Buat", "Ubah", "Ekspor"],
    Laporan: ["Lihat", "Ekspor"],
  },
  Sales: {
    Proyek: ["Lihat"],
    CRM: ["Lihat", "Buat", "Ubah", "Ekspor"],
    Keuangan: ["Lihat"],
    Kapal: ["Lihat"],
    Dokumen: ["Lihat", "Buat", "Ekspor"],
    Analytics: ["Lihat"],
    Notifikasi: ["Lihat"],
    Laporan: ["Lihat", "Ekspor"],
  },
  "Client (eks)": {
    Proyek: ["Lihat"],
    Dokumen: ["Lihat"],
    Notifikasi: ["Lihat"],
    Laporan: ["Lihat"],
    Monitoring: ["Lihat"],
  },
  Admin: {
    Proyek: ["Lihat", "Buat", "Ubah", "Hapus", "Setujui", "Bayar", "Ekspor"],
    Drydock: ["Lihat", "Buat", "Ubah", "Hapus", "Setujui", "Bayar", "Ekspor"],
    Inventori: ["Lihat", "Buat", "Ubah", "Hapus", "Setujui", "Bayar", "Ekspor"],
    Equipment: ["Lihat", "Buat", "Ubah", "Hapus", "Setujui", "Bayar", "Ekspor"],
    Subkontraktor: ["Lihat", "Buat", "Ubah", "Hapus", "Setujui", "Bayar", "Ekspor"],
    "QC & Safety": ["Lihat", "Buat", "Ubah", "Hapus", "Setujui", "Bayar", "Ekspor"],
    CRM: ["Lihat", "Buat", "Ubah", "Hapus", "Setujui", "Bayar", "Ekspor"],
    Procurement: ["Lihat", "Buat", "Ubah", "Hapus", "Setujui", "Bayar", "Ekspor"],
    Keuangan: ["Lihat", "Buat", "Ubah", "Hapus", "Setujui", "Bayar", "Ekspor"],
    SDM: ["Lihat", "Buat", "Ubah", "Hapus", "Setujui", "Bayar", "Ekspor"],
    Kapal: ["Lihat", "Buat", "Ubah", "Hapus", "Setujui", "Bayar", "Ekspor"],
    Dokumen: ["Lihat", "Buat", "Ubah", "Hapus", "Setujui", "Bayar", "Ekspor"],
    Analytics: ["Lihat", "Buat", "Ubah", "Hapus", "Setujui", "Bayar", "Ekspor"],
    Notifikasi: ["Lihat", "Buat", "Ubah", "Hapus", "Setujui", "Bayar", "Ekspor"],
    Absensi: ["Lihat", "Buat", "Ubah", "Hapus", "Setujui", "Bayar", "Ekspor"],
    Payroll: ["Lihat", "Buat", "Ubah", "Hapus", "Setujui", "Bayar", "Ekspor"],
    Laporan: ["Lihat", "Buat", "Ubah", "Hapus", "Setujui", "Bayar", "Ekspor"],
    Monitoring: ["Lihat", "Buat", "Ubah", "Hapus", "Setujui", "Bayar", "Ekspor"],
    Pengaturan: ["Lihat", "Buat", "Ubah", "Hapus", "Setujui", "Bayar", "Ekspor"],
  },
};

/**
 * Petakan role sesi (demo login / backend) ke kunci matriks.
 * Kembalikan "" bila tidak dikenal → can() selalu false (deny-by-default).
 */
export function normalizeRole(role: string | null | undefined): string {
  const r = String(role ?? "").trim().toLowerCase();
  if (!r) return "";
  if (r.includes("developer") || r.includes("admin")) return "Admin";
  if (r.includes("direktur") || r.includes("direksi")) return "Direktur";
  if (r.includes("project manager") || r === "manager" || r.includes("manager proyek") || r.includes("pm")) return "Project Manager";
  if (r.includes("foreman") || r.includes("tukang") || r === "tim") return "Foreman/Tim";
  if (r.includes("qc/hse") || r.includes("qc hse") || r.includes("hse")) return "QC/HSE Manager";
  if (r.includes("qc") || r.includes("inspector") || r.includes("inspeksi") || r.includes("quality")) return "QC Inspector";
  if (r.includes("warehouse") || r.includes("gudang") || r.includes("logistik")) return "Warehouse";
  if (r.includes("procurement") || r.includes("purchasing") || r.includes("pembelian")) return "Procurement";
  if (r.includes("finance") || r.includes("keuangan") || r.includes("account")) return "Finance";
  if (r.includes("hr") || r.includes("sdm") || r.includes("human")) return "HR";
  if (r.includes("sales") || r.includes("crm") || r.includes("marketing")) return "Sales";
  if (r.includes("client") || r.includes("viewer") || r.includes("customer")) return "Client (eks)";
  return "";
}

/** Cek izin runtime. Role tidak dikenal = tanpa akses. */
export function can(role: string | null | undefined, modul: string, aksi: RoleAction): boolean {
  return ROLE_MATRIX[normalizeRole(role)]?.[modul]?.includes(aksi) ?? false;
}

export function canAny(role: string | null | undefined, modul: string, actions: RoleAction[]): boolean {
  return actions.some((a) => can(role, modul, a));
}
