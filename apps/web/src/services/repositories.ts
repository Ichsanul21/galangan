// Kontrak repository async — dipakai halaman hari ini via adapter lokal,
// besok via adapter HTTP tanpa mengubah halaman.
// Bentuk record longgar (StoreItem) agar kompatibel dengan store saat ini.
//
// Format baris backend (services/api, envelope sudah dibuka oleh apiFetch):
// - GET /api/<table>      → BackendRow[]  ({ id, branch, data, updated_at })
// - GET /api/<table>/:id  → BackendRow
// - POST /api/<table>     ← { id?, branch?, data }  → BackendRow (201)
// - PATCH /api/<table>/:id← { branch?, data? }      → BackendRow
// - DELETE /api/<table>/:id → { id, deleted: true }

import type { StoreItem } from "../data/store";
import { apiFetch, isBackendConfigured } from "./http";
import { newId } from "./ids";

export interface Repository {
  list(): Promise<StoreItem[]>;
  create(item: Omit<StoreItem, "id"> & { id?: string }): Promise<StoreItem>;
  patch(id: string, patch: Record<string, unknown>): Promise<StoreItem>;
  remove(id: string): Promise<void>;
}

export interface Snapshot {
  load(): StoreItem[];
  save(rows: StoreItem[]): void;
}

/** Adapter lokal: baca/tulis snapshot (sessionStorage) dengan API async. */
export function localRepository(prefix: string, snapshot: Snapshot, onWrite?: () => void): Repository {
  return {
    async list() {
      return snapshot.load();
    },
    async create(item) {
      const rows = snapshot.load();
      const full: StoreItem = { ...item, id: item.id || newId(prefix) };
      snapshot.save([full, ...rows]);
      onWrite?.();
      return full;
    },
    async patch(id, patch) {
      const rows = snapshot.load().map((r) => (r.id === id ? { ...r, ...patch } : r));
      snapshot.save(rows);
      onWrite?.();
      const found = rows.find((r) => r.id === id);
      if (!found) throw new Error(`Record ${id} tidak ditemukan`);
      return found;
    },
    async remove(id) {
      snapshot.save(snapshot.load().filter((r) => r.id !== id));
      onWrite?.();
    },
  };
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
  return item;
}

function itemToCreateBody(item: Omit<StoreItem, "id"> & { id?: string }): {
  id?: string;
  branch: string;
  data: Record<string, unknown>;
} {
  const { id, branch, ...rest } = item;
  return {
    ...(id ? { id } : {}),
    branch: typeof branch === "string" ? branch : "",
    data: rest as Record<string, unknown>,
  };
}

function patchToUpdateBody(patch: Record<string, unknown>): {
  branch?: string;
  data?: Record<string, unknown>;
} {
  const { branch, ...rest } = patch;
  return {
    ...(typeof branch === "string" ? { branch } : {}),
    data: rest as Record<string, unknown>,
  };
}

/** Adapter HTTP: dipakai otomatis saat VITE_API_URL diisi. */
export function remoteRepository(resource: string): Repository {
  const base = `/api/${resource}`;
  return {
    async list() {
      const rows = await apiFetch<BackendRow[]>(base);
      return (Array.isArray(rows) ? rows : []).map(rowToItem);
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

export function pickRepository(resource: string, prefix: string, snapshot: Snapshot, onWrite?: () => void): Repository {
  if (isBackendConfigured()) return remoteRepository(resource);
  return localRepository(prefix, snapshot, onWrite);
}
