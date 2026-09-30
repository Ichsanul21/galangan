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

export interface Repository {
  list(): Promise<StoreItem[]>;
  /** Filter server-side (q/branch) - opsional agar adapter lama tak rusak. */
  listFiltered?(opts?: ListFilter): Promise<StoreItem[]>;
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
}

function isBackendPage(v: unknown): v is BackendPage {
  return typeof v === "object" && v !== null && Array.isArray((v as { rows?: unknown }).rows);
}

/** Adapter HTTP: dipakai otomatis saat VITE_API_URL diisi. */
export function remoteRepository(resource: string): Repository {
  const base = `/api/${resource}`;
  return {
    async list() {
      const limit = 5000;
      let offset = 0;
      const all: StoreItem[] = [];
      for (;;) {
        const page = await apiFetch<BackendRow[] | BackendPage>(
          `${base}?limit=${limit}&offset=${offset}`,
        );
        if (Array.isArray(page)) return (page as BackendRow[]).map(rowToItem);
        if (!isBackendPage(page)) return [];
        const rows = Array.isArray(page.rows) ? page.rows : [];
        for (const row of rows) all.push(rowToItem(row));
        const total = typeof page.total === "number" ? page.total : all.length;
        if (rows.length < limit) break;
        if (all.length >= total) break;
        offset += limit;
      }
      return all;
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
        const page = await apiFetch<BackendRow[] | BackendPage>(`${base}?${params.toString()}`);
        if (Array.isArray(page)) return (page as BackendRow[]).map(rowToItem);
        if (!isBackendPage(page)) return [];
        const rows = Array.isArray(page.rows) ? page.rows : [];
        for (const row of rows) all.push(rowToItem(row));
        const total = typeof page.total === "number" ? page.total : all.length;
        if (rows.length < limit) break;
        if (all.length >= total) break;
        offset += limit;
      }
      return all;
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
