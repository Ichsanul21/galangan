/* Persistensi store offline berbasis IndexedDB.
 *
 * Kenapa bukan localStorage: movements di produksi 18.937 baris (~6 MB JSON),
 * sedangkan kuota localStorage hanya 5 MB per origin - satu koleksi saja
 * sudah tidak muat, sehingga seluruh cache store tak pernah berhasil
 * ditulis dan edit offline hilang saat reload. IndexedDB tidak punya batas
 * 5 MB danbaca-tulisnya async sehingga tidak memblokir UI.
 *
 * Bentuk: satu object store "collections", key = nama koleksi,
 * value = array baris. Satu record per koleksi supaya penulisan hanya
 * menyentuh koleksi yang benar-benar berubah.
 *
 * Semua fungsi gagal-safe: kalau IndexedDB tidak tersedia (mode privat,
 * dikunci browser, storage penuh), pemanggil diam-diam memakai fallback
 * dan/setara localStorage sehingga aplikasi tetap jalan.
 */

const DB_NAME = "isms-offline";
const DB_VERSION = 1;
const STORE = "collections";
/* Fallback kalau IndexedDB tidak bisa dipakai: hanya koleksi kecil, dan
 * jumlah baris per koleksi dibatasi supaya muat di kuota 5 MB. */
const LS_PREFIX = "isms.parts.";
const LS_ROW_CAP = 400;

export type Row = Record<string, unknown>;

let dbPromise: Promise<IDBDatabase | null> | null = null;
let idbBroken = false;

function openDb(): Promise<IDBDatabase | null> {
  if (idbBroken) return Promise.resolve(null);
  if (dbPromise) return dbPromise;
  if (typeof indexedDB === "undefined") {
    idbBroken = true;
    return Promise.resolve(null);
  }
  dbPromise = new Promise<IDBDatabase | null>((resolve) => {
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      idbBroken = true;
      resolve(null);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => {
      const db = req.result;
      // Tutup koneksi bila tab lain menaikkan versi - mencegah deadlock.
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => {
      idbBroken = true;
      resolve(null);
    };
    req.onblocked = () => {
      idbBroken = true;
      resolve(null);
    };
  });
  return dbPromise;
}

/** true bila IndexedDB aktif dipakai (false = sedang fallback localStorage). */
export async function idbAvailable(): Promise<boolean> {
  return (await openDb()) !== null;
}

function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  return openDb().then((db) => {
    if (!db) return null;
    return new Promise<T | null>((resolve) => {
      try {
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  });
}

/** Tulis satu koleksi. Kembalikan false bila gagal (kuota/private mode). */
export async function idbPut(col: string, rows: Row[]): Promise<boolean> {
  const res = await tx("readwrite", (s) => s.put(rows, col) as IDBRequest<IDBValidKey>);
  return res !== null;
}

/** Baca semua koleksi sekaligus (satu transaksi) - untuk hidrasi boot. */
export async function idbGetAll(): Promise<Record<string, Row[]> | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise<Record<string, Row[]> | null>((resolve) => {
    try {
      const t = db.transaction(STORE, "readonly");
      const store = t.objectStore(STORE);
      const out: Record<string, Row[]> = {};
      const keysReq = store.getAllKeys();
      const valsReq = store.getAll();
      let done = 0;
      const finish = () => {
        done += 1;
        if (done < 2) return;
        const keys = keysReq.result ?? [];
        const vals = valsReq.result ?? [];
        for (let i = 0; i < keys.length; i += 1) {
          const k = String(keys[i]);
          if (Array.isArray(vals[i])) out[k] = vals[i] as Row[];
        }
        resolve(out);
      };
      keysReq.onsuccess = finish;
      keysReq.onerror = finish;
      valsReq.onsuccess = finish;
      valsReq.onerror = finish;
    } catch {
      resolve(null);
    }
  });
}

/* idbDelete/idbClear sengaja tidak dibuat: belum ada aksi "bersihkan cache" di UI, jadi menambahkannya hanya menambah kode mati. */

export function lsPut(col: string, rows: Row[]): boolean {
  try {
    localStorage.setItem(LS_PREFIX + col, JSON.stringify(rows.slice(-LS_ROW_CAP)));
    return true;
  } catch {
    return false;
  }
}

export function lsGet(col: string): Row[] | null {
  try {
    const raw = localStorage.getItem(LS_PREFIX + col);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as Row[]) : null;
  } catch {
    return null;
  }
}

export function lsClearAll(): void {
  try {
    const kill: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k && k.startsWith(LS_PREFIX)) kill.push(k);
    }
    for (const k of kill) localStorage.removeItem(k);
  } catch {
    /* abaikan */
  }
}
