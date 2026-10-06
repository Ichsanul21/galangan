// Kontrak repository async - dipakai halaman hari ini via adapter lokal,
// besok via adapter HTTP tanpa mengubah halaman.
// Bentuk record longgar (StoreItem) agar kompatibel dengan store saat ini.
//
// Format baris backend (services/api, envelope sudah dibuka oleh apiFetch):
// - GET /api/<table>?limit=&offset= → { rows: BackendRow[], total, limit, offset }
// - GET /api/<table>/:id  → BackendRow
// - POST /api/<table>     ← { id?, branch?, data }  → BackendRow (201)
// - PATCH /api/<table>/:id← { branch?, data? }      → BackendRow
// - DELETE /api/<table>/:id → { id, deleted: true }

import type { StoreItem } from "../data/store";
import { apiFetch } from "./http";

export interface ListFilter {
  q?: string;
  branch?: string;
}

/** Query paginasi server-side (GET /api/<table>?limit=&offset=). */
export interface PagedQuery extends ListFilter {
  /** Halaman 1-based. Default 1. */
  page?: number;
  /** Baris per halaman (1..500). Default 100. */
  size?: number;
}

export interface PagedResult {
  rows: StoreItem[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

export interface Repository {
  list(): Promise<StoreItem[]>;
  /** Filter server-side (q/branch) - opsional agar adapter lama tak rusak. */
  listFiltered?(opts?: ListFilter): Promise<StoreItem[]>;
  /** Satu halaman data (limit/offset) + total - untuk tabel server-side paging. */
  listPaged?(opts?: PagedQuery): Promise<PagedResult>;
  create(item: Omit<StoreItem, "id"> & { id?: string }): Promise<StoreItem>;
  patch(id: string, patch: Record<string, unknown>): Promise<StoreItem>;
  remove(id: string): Promise<void>;
}

export interface Snapshot {
  load(): StoreItem[];
  save(rows: StoreItem[]): void;
}

/* ============ PEMETAAN BARIS BACKEND ⇄ StoreItem ============ */

interface BackendRow {
  id: string;
  branch: string;
  data: Record<string, unknown>;
  updated_at: string;
}

function rowToItem(row: BackendRow): StoreItem {
  const item: StoreItem = { ...(row.data ?? {}), id: row.id };
  if (row.branch) item.branch = row.branch;
  /* Pertahankan updated_at server sebagai basis optimistic concurrency
     (dipakai store.update sebagai baseUpdatedAt; BE lama mengabaikannya). */
  if (row.updated_at) item.updated_at = row.updated_at;
  return item;
}

function itemToCreateBody(item: Omit<StoreItem, "id"> & { id?: string }): {
  id?: string;
  branch: string;
  data: Record<string, unknown>;
} {
  const { id, branch, updated_at, baseUpdatedAt, ...rest } = item as StoreItem & {
    baseUpdatedAt?: unknown;
    updated_at?: unknown;
  };
  void updated_at;
  void baseUpdatedAt;
  return {
    ...(id ? { id } : {}),
    branch: typeof branch === "string" ? branch : "",
    data: rest as Record<string, unknown>,
  };
}

function patchToUpdateBody(patch: Record<string, unknown>): {
  branch?: string;
  data?: Record<string, unknown>;
  baseUpdatedAt?: string;
} {
  const { branch, baseUpdatedAt, updated_at, ...rest } = patch;
  void updated_at;
  return {
    ...(typeof branch === "string" ? { branch } : {}),
    data: rest as Record<string, unknown>,
    /* Optimistic concurrency best-effort: BE saat ini (crud.ts PatchSchema)
       hanya kenal branch+data dan men-strip unknown keys via zod default,
       jadi field ini diabaikan dengan aman sampai BE mendukung 409. */
    ...(typeof baseUpdatedAt === "string" && baseUpdatedAt !== "" ? { baseUpdatedAt } : {}),
  };
}

interface BackendPage {
  rows: BackendRow[];
  total: number;
  limit: number;
  offset: number;
  /** Kursor untuk halaman berikutnya; null = ini halaman terakhir. */
  nextCursor?: string | null;
}

function isBackendPage(v: unknown): v is BackendPage {
  return typeof v === "object" && v !== null && Array.isArray((v as { rows?: unknown }).rows);
}

/** Adapter HTTP: dipakai otomatis saat VITE_API_URL diisi. */
export function remoteRepository(resource: string): Repository {
  const base = `/api/${resource}`;
  /* Kumpulkan halaman sambil men-DE-DUP per id.
     Paginasi OFFSET memang rapuh: kalau ada INSERT atau DELETE di tengah
     pembacaan, satu baris bisa terlewat dan baris lain terambil dua kali.
     Server sudah diurutkan stabil (updated_at, id) sehingga duplikat segera
     hilang, tapi de-dup di sisi ini menutup kelas bug yang sama untuk server
     lama yang belum diperbarui - dan menjaga React key tetap unik. */
  const collect = (pages: StoreItem[], limit: number): StoreItem[] => {
    const seen = new Set<string>();
    const out: StoreItem[] = [];
    for (const item of pages) {
      const id = String(item.id ?? "");
      if (id !== "" && seen.has(id)) continue;
      if (id !== "") seen.add(id);
      out.push(item);
    }
    void limit;
    return out;
  };
  return {
    async list() {
      /* Keyset pagination, bukan OFFSET. OFFSET di atas `updated_at` yang
         berubah-ubah berarti baris yang diperbarui saat pagination berjalan
         melompati jendela OFFSET dan TIDAK PERNAH dikirim - itu penyebab
         "data hilang setelah POST sukses" yang dilaporkan client: tidak ada
         error, hanya baris yang tidak pernah sampai ke perangkat lain.
         Cursor menandai "sudah baca sampai baris ini", jadi baris yang baru
         diperbarui hanya tertunda ke tarikan berikutnya, tidak hilang. */
      const limit = 5000;
      let cursor: string | null = null;
      const all: StoreItem[] = [];
      for (;;) {
        /* Anotasi eksplisit: `qs` dan `next` saling bergantung tipe
         * (`cursor` <- `next` <- `page` <- `qs` <- `cursor`), dan tanpa
         * anotasi TypeScript memberi TS7022 "implicitly any" padahal tidak
         * ada `any` di mana pun. */
        const qs: string = `limit=${limit}${cursor === null ? "" : `&after=${encodeURIComponent(cursor)}`}`;
        const page: BackendRow[] | BackendPage = await apiFetch<BackendRow[] | BackendPage>(
          `${base}?${qs}`,
          { background: true },
        );
        if (Array.isArray(page)) return collect((page as BackendRow[]).map(rowToItem), limit);
        if (!isBackendPage(page)) return [];
        const rows = Array.isArray(page.rows) ? page.rows : [];
        for (const row of rows) all.push(rowToItem(row));
        if (rows.length < limit) break;
        /* Server lama (belum punya nextCursor) tidak akan mengirim field ini.
           Cursor jadi null -> berhenti daripada memutar tak hingga. Offset
           sengaja TIDAK dipakai sebagai fallback: itu justru bug-nya. */
        const next: string | null | undefined = page.nextCursor;
        if (typeof next !== "string" || next === "" || next === cursor) break;
        cursor = next;
      }
      return collect(all, limit);
    },
    async listFiltered(opts) {
      const baseParams = new URLSearchParams();
      if (opts?.q?.trim()) baseParams.set("q", opts.q.trim());
      if (opts?.branch?.trim()) baseParams.set("branch", opts.branch.trim());
      const limit = 200;
      let offset = 0;
      const all: StoreItem[] = [];
      for (;;) {
        const params = new URLSearchParams(baseParams);
        params.set("limit", String(limit));
        params.set("offset", String(offset));
        const page = await apiFetch<BackendRow[] | BackendPage>(`${base}?${params.toString()}`, { background: true });
        if (Array.isArray(page)) return collect((page as BackendRow[]).map(rowToItem), limit);
        if (!isBackendPage(page)) return [];
        const rows = Array.isArray(page.rows) ? page.rows : [];
        for (const row of rows) all.push(rowToItem(row));
        const total = typeof page.total === "number" ? page.total : all.length;
        if (rows.length < limit) break;
        if (all.length >= total) break;
        offset += limit;
      }
      return collect(all, limit);
    },
    async listPaged(opts) {
      const page = Math.max(1, Math.trunc(opts?.page ?? 1));
      const size = Math.min(500, Math.max(1, Math.trunc(opts?.size ?? 100)));
      const params = new URLSearchParams();
      if (opts?.q?.trim()) params.set("q", opts.q.trim());
      if (opts?.branch?.trim()) params.set("branch", opts.branch.trim());
      params.set("limit", String(size));
      params.set("offset", String((page - 1) * size));
      const res = await apiFetch<BackendRow[] | BackendPage>(`${base}?${params.toString()}`, { background: true });
      /* BE lawas mengembalikan array polos tanpa total - anggap satu halaman. */
      if (Array.isArray(res)) {
        const rows = res.map(rowToItem);
        return { rows, total: rows.length, page: 1, size, pages: 1 };
      }
      if (!isBackendPage(res)) return { rows: [], total: 0, page, size, pages: 1 };
      const rows = (Array.isArray(res.rows) ? res.rows : []).map(rowToItem);
      const total = typeof res.total === "number" ? res.total : rows.length;
      return { rows, total, page, size, pages: Math.max(1, Math.ceil(total / size)) };
    },
    async create(item) {
      const row = await apiFetch<BackendRow>(base, { method: "POST", body: JSON.stringify(itemToCreateBody(item)) });
      return rowToItem(row);
    },
    async patch(id, patch) {
      const row = await apiFetch<BackendRow>(`${base}/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(patchToUpdateBody(patch)),
      });
      return rowToItem(row);
    },
    async remove(id) {
      await apiFetch<unknown>(`${base}/${encodeURIComponent(id)}`, { method: "DELETE" });
    },
  };
}
