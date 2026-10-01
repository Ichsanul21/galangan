// Pola standar fetch API per-batch saat perpindahan modul/tab.
//
// Masalah pola lama: setiap halaman memanggil resync() penuh (50+ koleksi +
// WBS/team per proyek) tiap kali dibuka - lambat dan memboroskan bandwidth,
// padahal satu modul hanya butuh beberapa koleksi.
//
// Pola baru:
//   const COLS: CollectionKey[] = ["projects", "invoices", ...]; // batch modul
//   const { syncing, refresh } = useModuleSync(COLS);            // saat mount
//   const { syncing } = useModuleSync(COLS_TAB, [tab]);          // saat ganti tab
//
// - Mount / deps berubah (mis. tab) → batch koleksi ditarik paralel dari
//   backend (data selalu paling baru); mode lokal → no-op senyap.
// - `syncing` untuk skeleton/disable aksi; `refresh()` untuk tombol muat ulang.
// - Anti spam: permintaan berjalan tidak pernah didobel (guard ref).
// - AppShell membaca recentModuleSync() agar resync penuh tidak kembar
//   dengan batch halaman yang baru saja jalan.

import { useCallback, useEffect, useRef, useState } from "react";
import { useStore, type CollectionKey } from "./store";

let lastBatchSyncAt = 0;

/** true bila ada halaman yang baru saja menarik batch-nya sendiri (< withinMs).
 *  Dipakai AppShell untuk melewati resync penuh saat pindah route. */
export function recentModuleSync(withinMs = 4000): boolean {
  return Date.now() - lastBatchSyncAt < withinMs;
}

/* Penghitung batch berjalan global: agar tak ada jeda tanpa umpan balik,
   AppShell menampilkan badge topbar selama batch halaman mana pun berjalan. */
let syncActiveCount = 0;
const syncListeners = new Set<(active: boolean) => void>();

function setSyncActive(delta: 1 | -1): void {
  syncActiveCount = Math.max(0, syncActiveCount + delta);
  const active = syncActiveCount > 0;
  syncListeners.forEach((l) => l(active));
}

/** true bila ada batch modul yang sedang berjalan (semua halaman).
 *  Dipakai AppShell untuk badge topbar; halaman juga bisa memakainya untuk
 *  menonaktifkan tombol ekspor selama batch berjalan. */
export function useModuleSyncing(): boolean {
  const [active, setActive] = useState(syncActiveCount > 0);
  useEffect(() => {
    syncListeners.add(setActive);
    setActive(syncActiveCount > 0);
    return () => {
      syncListeners.delete(setActive);
    };
  }, []);
  return active;
}

export interface ModuleSync {
  /** Batch sedang berjalan - pakai untuk skeleton / disable tombol. */
  syncing: boolean;
  /** Tarik ulang batch secara manual (tombol refresh). */
  refresh: () => void;
}

/** Tarik batch `cols` saat mount dan setiap `deps` berubah (mis. [tab]). */
export function useModuleSync(cols: CollectionKey[], deps: unknown[] = []): ModuleSync {
  const { resyncCollections } = useStore();
  const [syncing, setSyncing] = useState(false);
  const runningRef = useRef(false);
  const aliveRef = useRef(true);
  const colsKey = cols.join("|");
  const depsKey = JSON.stringify(deps);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const refresh = useCallback(() => {
    if (!colsKey || runningRef.current) return;
    runningRef.current = true;
    lastBatchSyncAt = Date.now();
    setSyncActive(1);
    setSyncing(true);
    void resyncCollections(colsKey.split("|") as CollectionKey[])
      .catch(() => undefined)
      .finally(() => {
        runningRef.current = false;
        setSyncActive(-1);
        if (aliveRef.current) setSyncing(false);
      });
  }, [colsKey, resyncCollections]);

  useEffect(() => {
    refresh();
  }, [refresh, depsKey]);

  return { syncing, refresh };
}
