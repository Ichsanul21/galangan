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
import { useStore, type CollectionKey, type WbsItem } from "./store";
import { apiFetch } from "../services/http";

let lastBatchSyncAt = 0;
let batchInFlight = 0;

/** true bila ada halaman yang baru saja menarik batch-nya sendiri (< withinMs).
 *  Dipakai AppShell untuk melewati resync penuh saat pindah route.
 *
 *  Dua kondisi yang WAJIB ikut dicek, bukan hanya cap waktu:
 *   - batch sedang berjalan: resync penuh menambah ~55 request sia-sia hanya
 *     untuk mengambil data yang sedang dirakit. AppShell memanggil ini di
 *     efek parent yang berjalan di commit yang SAMA dengan efek halaman, jadi
 *     cap waktu "baru saja" belum pernah ditulis - hasilnya dua tarikan
 *     paralel di setiap pindah rute, dan jendela "snapshot basi" yang
 *     menimpa tulis lokal ikut memanjang.
 *   - lebih dari satu batch jalan bersamaan: 15 modul bisa memicu
 *     resyncCollections sekaligus; setiap Tarikan punya snapshot basi sendiri. */
export function recentModuleSync(withinMs = 4000): boolean {
  return batchInFlight > 0 || Date.now() - lastBatchSyncAt < withinMs;
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

/* Koleksi yang gagal ditarik di batch modul mana pun. dulu kegagalan ini
   ditelan tanpa jejak, jadi halaman menampilkan cache lokal seolah-olah itu
   data server terkini dan pengguna tidak pernah diberi tahu.
   Semuanya per-koleksi: batch yang sukses membersihkan entri koleksi itu,
   jadi halaman A yang gagal tidak tertimpa halaman B yang sukses. */
const failedCollections = new Set<string>();
const failedListeners = new Set<(names: string[]) => void>();

function publishFailed(batch: string[], failed: string[]): void {
  for (const col of batch) failedCollections.delete(col);
  for (const col of failed) failedCollections.add(col);
  const snapshot = [...failedCollections];
  failedListeners.forEach((l) => l(snapshot));
}

/** Nama koleksi yang gagal sync, digabung dari semua batch modul. */
export function useFailedCollections(): string[] {
  const [names, setNames] = useState<string[]>(() => [...failedCollections]);
  useEffect(() => {
    failedListeners.add(setNames);
    setNames([...failedCollections]);
    return () => {
      failedListeners.delete(setNames);
    };
  }, []);
  return names;
}

export interface ModuleSync {
  /** Batch sedang berjalan - pakai untuk skeleton / disable tombol. */
  syncing: boolean;
  /** Tarik ulang batch secara manual (tombol refresh). */
  refresh: () => void;
  /** Koleksi pada batch terakhir yang GAGAL ditarik. Kosong = semua berhasil
   *  atau belum ada percobaan. Sebelumnya kegagalan ditelan diam-diam sehingga
   *  halaman menampilkan data seed/IndexedDB seolah-olah itu data terkini. */
  failed: CollectionKey[];
  /** Kapan batch terakhir selesai (epoch ms), 0 = belum pernah. */
  lastSyncAt: number;
}

/** Tarik batch `cols` saat mount dan setiap `deps` berubah (mis. [tab]). */
export function useModuleSync(cols: CollectionKey[], deps: unknown[] = []): ModuleSync {
  const { resyncCollections } = useStore();
  const [syncing, setSyncing] = useState(false);
  const [failed, setFailed] = useState<CollectionKey[]>([]);
  const [lastSyncAt, setLastSyncAt] = useState(0);
  const runningRef = useRef(false);
  /* Satu re-run tertunda: permintaan yang masuk saat batch berjalan tidak
     dibuang, tapi dijalankan setelahnya. */
  const rerunRef = useRef(false);
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
    if (!colsKey) return;
    /* Tidak membuang permintaan yang datang saat batch lain berjalan: antrekan
       satu re-run. Versi lama `return` di sini, jadi perubahan tab yang cepat
       membuat sinkronisasi hilang tanpa jejak - itulah complaints "delay"
       yang tidak pernah bisa direproduksi. */
    if (runningRef.current) {
      rerunRef.current = true;
      return;
    }
    const batch = colsKey.split("|") as CollectionKey[];
    runningRef.current = true;
    batchInFlight += 1;
    setSyncActive(1);
    setSyncing(true);
    void resyncCollections(batch)
      .then((bad) => {
        if (aliveRef.current) {
          setFailed(bad);
          setLastSyncAt(Date.now());
        }
        publishFailed(colsKey.split("|"), bad);
        /* lastBatchSyncAt dicetak SETELAH batch selesai, bukan sebelum.
           Kalau dicetak sebelum dan batch GAGAL, recentModuleSync() tetap
           mengembalikan true dan menahan full resync() yang jadi jaring
           pengaman - jadi kegagalan justru mematikan pengamannya sendiri. */
        lastBatchSyncAt = Date.now();
      })
      .catch(() => {
        /* resyncCollections menolak hanya untuk kegagalan tak terduga
           (mis. isApiCompatible). Tandai seluruh batch gagal agar UI
           tidak mengklaim data sudah segar. */
        if (aliveRef.current) {
          setFailed(batch);
          setLastSyncAt(Date.now());
        }
        publishFailed(colsKey.split("|"), colsKey.split("|"));
      })
      .finally(() => {
        runningRef.current = false;
        batchInFlight = Math.max(0, batchInFlight - 1);
        setSyncActive(-1);
        if (aliveRef.current) setSyncing(false);
        if (rerunRef.current) {
          rerunRef.current = false;
          refresh();
        }
      });
  }, [colsKey, resyncCollections]);

  useEffect(() => {
    refresh();
  }, [refresh, depsKey]);

  return { syncing, refresh, failed, lastSyncAt };
}

/**
 * Tarik WBS untuk sekumpulan proyek lalu simpan ke state lokal pemanggil.
 *
 * useModuleSync() hanya bisa menarik KOLEKSI ARRAY (resyncCollections ->
 * remoteRepository(key).list()). wbsByProject adalah peta project_id -> baris,
 * jadi TIDAK bisa ikut batch - harus lewat GET /api/projects/:id/wbs.
 *
 * Dampaknya nyata: Laporan merender kartu "WBS Teratas" + sheet Excel
 * "WBS Teratas" dari wbsFor(), tapi wbsByProject tidak pernah masuk batch
 * sync. Di mode remote kartu itu hanya menampilkan cache lokal yang basi,
 * dan di proyek yang belum pernah dibuka halaman detail isinya kosong sama
 * sekali. Hook ini menutup celah itu.
 *
 * Catatan: WBS TIDAK ditulis balik ke store lewat setWbs() karena itu akan
 * meng-trigger PUSH (menimpa data server). Ini murni pembacaan.
 *
 * Return: { syncing, byProject } - `byProject` adalah peta id -> WbsItem[].
 */
export function useProjectWbsSync(
  projectIds: string[],
): { syncing: boolean; byProject: Record<string, WbsItem[]> } {
  /* Kunci stabil: id unik + diurutkan supaya urutan berbeda tidak memicu
     fetch ulang yang sama berulang kali. */
  const key = [...new Set(projectIds.filter((id) => id !== ""))].sort().join("|");
  const [syncing, setSyncing] = useState(false);
  const [byProject, setByProject] = useState<Record<string, WbsItem[]>>({});
  const runningRef = useRef(false);

  useEffect(() => {
    const ids = key === "" ? [] : key.split("|");
    if (ids.length === 0) return;
    if (runningRef.current) return;
    runningRef.current = true;
    lastBatchSyncAt = Date.now();
    setSyncActive(1);
    setSyncing(true);
    void (async () => {
      const found: Record<string, WbsItem[]> = {};
      for (const projectId of ids) {
        try {
          const res = await apiFetch<{ projectId: string; wbs: WbsItem[] }>(
            `/api/projects/${encodeURIComponent(projectId)}/wbs`,
          );
          if (Array.isArray(res.wbs)) found[projectId] = res.wbs;
        } catch {
          // Cache lokal / template store tetap dipakai untuk proyek ini.
        }
      }
      if (Object.keys(found).length > 0) {
        setByProject((prev) => ({ ...prev, ...found }));
      }
    })()
      .catch(() => undefined)
      .finally(() => {
        runningRef.current = false;
        setSyncActive(-1);
        setSyncing(false);
      });
  }, [key]);

  return { syncing, byProject };
}
