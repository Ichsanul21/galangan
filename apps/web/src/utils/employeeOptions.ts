/* Opsi pilihan karyawan untuk EntityPicker - satu sumber untuk semua modul.
 *
 * Field "penanggung jawab" / PIC tersebar di banyak modul (Equipment,
 * Inventory, QC, Drydock, Dokumen, ProjectDetail, dan beberapa select lama
 * yang masih `<select>`). Semula tiap modul membangun daftarnya sendiri, dan
 * tidak semuanya sama: satu memakai `nip`, satu tidak; satu menyimpan `id`,
 * satu menyimpan `name`. Akibatnya nama yang sama bisa tersimpan dalam dua
 * bentuk berbeda, dan pencarian orang yang sama gagal di sebagian form -
 * persis masalah yang dikeluhkan client.
 *
 * ATURAN PENYIMPANAN: simpan `name`, bukan `id`. Field PIC di hampir semua
 * tabel adalah teks bebas, dan mencocokkannya dengan `employees` dilakukan
 * lewat nama di banyak tempat (lihat utils/names.ts sameName). Mengubahnya
 * jadi id berarti menulis ulang setiap pembacaan lama. `allowCustom` pada
 * EntityPicker tetap menyisakan jalan untuk nama yang belum ada di master -
 * nama tidak boleh terkunci hanya karena belum masuk data pegawai.
 *
 * PERINGATAN vs LARANGAN: `isKnownEmployee` di sini dipakai untuk menandai
 * field (Border merah + aria-invalid), bukan untuk memblokir simpan. Sengaja
 * berbeda dari Documents, yang memang menolak nama di luar master karena
 * kolom "oleh" di revisi dokumen adalah jawaban hukum. Untuk PIC perawatan,
 * PIC dock, dan PIC mutasi, orangnya bisa awak kapal atau subkontraktor yang
 * tidak terdaftar sebagai karyawan - memblokir simpan hanya karena itu akan
 * membuat form tidak bisa dipakai di lapangan.
 */

import type { PickerOption } from "../components/ui";
import type { StoreItem } from "../data/store";

export interface EmployeeOptionExtra {
  /** Sertakan NIP di hint. Berguna di form yang butuh pembeda nama sama. */
  withNip?: boolean;
}

/**
 * Bangun daftar pilihan karyawan. Nama yang kosong dibuang supaya tidak ada
 * opsi kosong yang bisa dipilih.
 */
export function employeeOptions(
  employees: readonly StoreItem[],
  extra: EmployeeOptionExtra = {},
): PickerOption[] {
  return employees
    .map((e) => {
      const name = String(e.name ?? "").trim();
      const parts = [String(e.role ?? "").trim()];
      if (extra.withNip === true) parts.push(String(e.nip ?? "").trim());
      parts.push(String(e.id ?? "").trim());
      return {
        value: name,
        label: name,
        hint: parts.filter((x) => x !== "").join(" - "),
      };
    })
    .filter((o) => o.value !== "");
}

/** True kalau nilai PIC cocok dengan salah satu karyawan yang tercatat. */
export function isKnownEmployee(employees: readonly StoreItem[], name: unknown): boolean {
  const n = String(name ?? "").trim().toLowerCase();
  if (n === "") return false;
  return employees.some((e) => String(e.name ?? "").trim().toLowerCase() === n);
}