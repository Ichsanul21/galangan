import type { StoreItem } from "../data/store";

/**
 * Klasifikasi dokumen - SATU sumber untuk modul Dokumen dan untuk form
 * dokumen di dalam Detail Proyek.
 *
 * Kenapa dipisah ke util: sebelumnya `Documents.tsx` punya `TYPES`/`SUB_TYPES`
 * sendiri sementara `ProjectDetail.tsx` menulis daftar tipenya lagi secara
 * literal. Dua daftar itu berkhianat:
 *
 *   Documents.tsx  (11) Kontrak, Drawing, Prosedur, Sertifikat, Laporan,
 *                        Invoice, NCR, Penawaran, Dock Space, Surat Jalan,
 *                        Tanda Terima
 *   ProjectDetail  (8)  Laporan, Kontrak, "Kontrak Kerja", Drawing, Prosedur,
 *                        Sertifikat, Invoice, NCR
 *
 * Akibatnya dokumen Penawaran/Dock Space/Surat Jalan/Tanda Terima tidak bisa
 * dibuat dari tab proyek sama sekali, dan "Kontrak Kerja" - satu-satunya tipe
 * yang HANYA ada di daftar proyek - tidak punya sub-tipe apa pun, sehingga
 * dropdown sub-tipenya akan selalu kosong meskipun sudah ditambahkan.
 */

/** Semua jenis dokumen. `type` menentukan prefix nomor + masa retensi. */
export const DOC_TYPES = [
  "Kontrak",
  "Drawing",
  "Prosedur",
  "Sertifikat",
  "Laporan",
  "Invoice",
  "NCR",
  "Penawaran",
  "Dock Space",
  "Surat Jalan",
  "Tanda Terima",
] as const;

export type DocType = (typeof DOC_TYPES)[number];

/**
 * Sub-tipe disimpan sebagai field TERPISAH, bukan digabung ke `type`:
 * `type` menentukan prefix nomor dokumen (PREFIX) dan masa retensi (RETENSI).
 * Menggabungkannya akan mengganti CTR/SRT jadi "SRT-K3" dsb dan membuat nomor
 * yang sudah terbit tidak lagi dikenali.
 *
 * "Kontrak Kerja" masuk di sini, bukan sebagai tipe sendiri - ia memang
 * bentuk dari kontrak, dan selama ia jadi tipe terpisah ia tidak punya sub-tipe
 * apa pun sehingga formnya tidak bisa membedakan apa pun.
 */
export const SUB_TYPES: Record<string, string[]> = {
  Sertifikat: [
    "Sertifikat QC",
    "Sertifikat K3",
    "Sertifikat Kelas",
    "Sertifikat Otoritas",
    "Sertifikat Kualifikasi",
    "Sertifikat Lainnya",
  ],
  Drawing: ["Shop Drawing", "As Built Drawing", "Gauss Drawing", "Drawing Lainnya"],
  Prosedur: ["SOP Produksi", "SOP K3", "SOP Mutu", "SOP Pemeliharaan", "Prosedur Lainnya"],
  Laporan: ["Laporan Progres", "Laporan Mutu", "Laporan K3", "Laporan Keuangan", "BoQ / RAB", "Laporan Lainnya"],
  Kontrak: ["Kontrak Utama", "Kontrak Kerja", "Addendum", "Perubahan Bright", "Kontrak Lainnya"],
  Invoice: ["Invoice Progres", "Invoice Retensi", "Invoice Penutup"],
};

/** Sub-tipe yang berlaku untuk satu jenis dokumen. */
export function subTypesOf(type: string): string[] {
  return SUB_TYPES[type] ?? [];
}

/** Sub-tipe sertifikat yang WAJIB punya rujukan ke Sertifikat QC. */
export const NEEDS_QC_LINK = new Set(subTypesOf("Sertifikat").filter((s) => s !== "Sertifikat Lainnya"));

/** Nama kanonik sertifikat QC. Satu string, bukan dicocokkan per tempat. */
export const QC_CERT_SUBTYPE = "Sertifikat QC";

/**
 * Dokumen yang boleh dipilih sebagai rujukan QC untuk satu proyek.
 *
 * Dua perbaikan terhadap versi lama, yang hanya memfilter
 * `type === "Sertifikat" && project === ...`:
 *
 * 1. Kandidat dengan sub-tipe yang SAMA dikecualikan. dulu "Sertifikat K3"
 *    bisa dipilih sebagai bukti QC untuk "Sertifikat K3" lain - relasi yang
 *    secara makna tidak ada, tapi tidak ada yang menolak.
 * 2. Kalau proyek belum punya satu pun "Sertifikat QC" (semua dokumen lama
 *    belum punya `subType`), kandidat jatuh ke sertifikat tanpa sub-tipe.
 *    Tanpa fallback ini dropdownnya kosong untuk seluruh data yang sudah ada,
 *    dan fitur yang diminta client terlihat seperti tidak berfungsi.
 */
export function qcCertCandidates(
  docs: readonly StoreItem[],
  project: string,
  excludeId: string,
  selfSubType?: string,
): StoreItem[] {
  const inProject = docs.filter(
    (d) => String(d.type ?? "") === "Sertifikat" && String(d.project ?? "") === project,
  );
  /* Fallback ditentukan dari KANDIDAT proyek, bukan dari pool setelah
     pengecualian. Kalau dicek dari pool, mengedit "Sertifikat QC" itu
     sendiri bisa membuat proyek kehilangan QC-nya dan fallback aktif -
     form yang sedang diisi tiba-tiba menawarkan sertifikat yang tidak
     berhubungan sebagai bukti QC. */
  const projectHasQc = inProject.some((d) => String(d.subType ?? "") === QC_CERT_SUBTYPE);
  const self = String(selfSubType ?? "").trim();
  /* Pengecualian berdasarkan sub-tipe HANYA berlaku kalau dokumen ini memang
     sudah punya sub-tipe. Tanpa penjagaan ini, dokumen baru (`selfSubType`
     kosong) dibandingkan dengan kandidat yang juga kosong - `"" !== ""`
     bernilai false sehingga SELURUH kandidat tersingkir dan dropdownnya
     kosong persis di form baru, yang justru paling butuh isinya. */
  const pool = inProject.filter(
    (d) => String(d.id ?? "") !== excludeId && (self === "" || String(d.subType ?? "").trim() !== self),
  );
  return projectHasQc
    ? pool.filter((d) => String(d.subType ?? "") === QC_CERT_SUBTYPE)
    : pool.filter((d) => String(d.subType ?? "") === "");
}