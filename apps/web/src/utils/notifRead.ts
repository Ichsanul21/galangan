/* Status baca notifikasi — persist per perangkat agar tidak hilang saat reload. */

const KEY = "isms.notifRead";

export function loadNotifRead(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(arr) ? arr.map(String) : []);
  } catch {
    return new Set();
  }
}

export function saveNotifRead(ids: Set<string>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify([...ids].slice(0, 500)));
  } catch {
    /* abaikan */
  }
}

/* Ubah label waktu relatif-ID ("baru saja", "N menit/jam/hari lalu", "kemarin")
   menjadi menit-yang-lalu agar bisa di-sort dan dikelompokkan. */
export function relMinutes(time: string | null | undefined): number {
  const t = String(time ?? "").trim().toLowerCase();
  if (!t || t === "baru saja" || t === "baru") return 0;
  let m = t.match(/(\d+)\s*menit/);
  if (m) return Number(m[1]);
  m = t.match(/(\d+)\s*jam/);
  if (m) return Number(m[1]) * 60;
  m = t.match(/(\d+)\s*hari/);
  if (m) return Number(m[1]) * 1440;
  if (t.includes("kemarin")) return 1440;
  const parsed = Date.parse(String(time ?? ""));
  if (!Number.isNaN(parsed)) return Math.max(0, Math.round((Date.now() - parsed) / 60000));
  return Number.POSITIVE_INFINITY;
}

export type DayGroup = "Hari ini" | "Kemarin" | "Lebih lama";

export function dayGroup(minAgo: number): DayGroup {
  if (!Number.isFinite(minAgo) || minAgo >= 2880) return "Lebih lama";
  if (minAgo >= 1440) return "Kemarin";
  return "Hari ini";
}
