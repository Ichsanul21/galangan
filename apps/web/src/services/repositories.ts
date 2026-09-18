// Kontrak repository async — dipakai halaman hari ini via adapter lokal,
// besok via adapter HTTP tanpa mengubah halaman.
// Bentuk record longgar (StoreItem) agar kompatibel dengan store saat ini.

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

/** Adapter HTTP: dipakai otomatis saat VITE_API_URL diisi. */
export function remoteRepository(resource: string): Repository {
  return {
    list: () => apiFetch<StoreItem[]>(`/api/${resource}`),
    create: (item) => apiFetch<StoreItem>(`/api/${resource}`, { method: "POST", body: JSON.stringify(item) }),
    patch: (id, patch) => apiFetch<StoreItem>(`/api/${resource}/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(patch) }),
    remove: (id) => apiFetch<void>(`/api/${resource}/${encodeURIComponent(id)}`, { method: "DELETE" }),
  };
}

export function pickRepository(resource: string, prefix: string, snapshot: Snapshot, onWrite?: () => void): Repository {
  if (isBackendConfigured()) return remoteRepository(resource);
  return localRepository(prefix, snapshot, onWrite);
}
