import { apiFetch, isBackendConfigured } from "../services/http";

/**
 * Reader "kapan baris ini dihapus" dari audit log.
 *
 * Penghapusan di sistem ini TETAP hard delete (keputusan client), jadi tanggal
 * hapus tidak ada di tabel utama - barisnya sudah hilang. Satu-satunya sumber
 * yang benar adalah `audit_log`, yang menyimpan `action=delete`, `table_name`,
 * `row_id`, dan payload pra-hapus.
 *
 * Endpoint `GET /api/audit` sudah ada sejak awal; yang ditambahkan di F0.5
 * hanya `?action=` dan `?rowId=` tepat, karena `?q=` yang substring akan salah
 * cocok: "INV-001" ikut cocok "INV-0012".
 */

export interface AuditDeleteRow {
  id: string;
  action: string;
  table_name: string;
  row_id: string;
  created_at: string;
}

const cacheKey = (table: string, rowId: string): string => `${table}::${rowId}`;
const cache = new Map<string, string | null>();

/**
 * Kosongkan cache. WAJIB dipanggil setelah logout/ganti akun: cache bersifat
 * per-tab dan tidak tahu batas sesi, jadi tanpa ini user berikutnya di tab
 * yang sama bisa membaca tanggal hapus milik user sebelumnya.
 */
export function forgetDeleteDates(): void {
  cache.clear();
}

async function fetchDeleteDate(table: string, rowId: string): Promise<string | null> {
  const params = new URLSearchParams({
    table,
    action: "delete",
    rowId,
    limit: "1",
  });
  const res = await apiFetch<{ rows?: AuditDeleteRow[] } | AuditDeleteRow[]>(
    `/api/audit?${params.toString()}`,
    { background: true },
  );
  const rows = Array.isArray(res) ? res : (res.rows ?? []);
  const first = rows[0];
  if (first === undefined) return null;
  return typeof first.created_at === "string" && first.created_at !== "" ? first.created_at : null;
}

/**
 * Tanggal hapus satu baris, atau `null` kalau tidak pernah dihapus / offline /
 * backend belum terkonfigurasi. Tidak pernah melempar error: kolom "dihapus"
 * tidak boleh membuat halaman gagal render hanya karena satu query gagal.
 */
export async function deleteDateOf(table: string, rowId: string): Promise<string | null> {
  if (rowId === "" || !isBackendConfigured()) return null;
  const key = cacheKey(table, rowId);
  const cached = cache.get(key);
  if (cached !== undefined) return cached;
  try {
    const value = await fetchDeleteDate(table, rowId);
    cache.set(key, value);
    return value;
  } catch {
    /* Sengaja TIDAK di-cache: kegagalan jaringan harus bisa dicoba lagi. */
    return null;
  }
}

/**
 * Versi massal untuk render tabel. Satu request per baris tetap, tapi pemanggil
 * cukup sekali jadi tidak perlu menyusuri `await` di dalam loop render.
 */
export async function deleteDatesOf(
  table: string,
  rowIds: readonly string[],
): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {};
  await Promise.all(
    rowIds.map(async (id) => {
      out[id] = await deleteDateOf(table, id);
    }),
  );
  return out;
}