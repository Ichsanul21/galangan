// Label status multibahasa TANPA mengubah nilai data.
// Nilai canonical = Bahasa Indonesia (kunci logika, filter, API).
// EN hanya untuk tampil — panggil statusLabel(value, dict).
const EN_LABEL: Record<string, string> = {
  Draft: "Draft",
  Draf: "Draft",
  Diajukan: "Submitted",
  Disetujui: "Approved",
  Ditolak: "Rejected",
  Lunas: "Paid",
  "Belum Dibayar": "Unpaid",
  Terlambat: "Overdue",
  Selesai: "Done",
  Terbuka: "Open",
  Tertutup: "Closed",
  Aktif: "Active",
  Nonaktif: "Inactive",
  Berjalan: "In progress",
  Ditahan: "On hold",
  "Dibayar Sebagian": "Partially paid",
  Berlaku: "Valid",
  Kedaluwarsa: "Expired",
  Critical: "Critical",
  Tersedia: "Available",
  Terpakai: "In use",
  Maintenance: "Maintenance",
};

/** Label tampil status sesuai locale; nilai tak dikenal dikembalikan apa adanya. */
export function statusLabel(value: unknown, locale: string): string {
  const s = String(value ?? "");
  if (locale !== "en") return s;
  return EN_LABEL[s] ?? s;
}
