/* Util jam 24 jam, dipakai lintas modul.
   Seluruh jam di aplikasi format 24 jam (00:00-23:59, tanpa AM/PM).

   Helper ini tadinya terkunci di Equipment.tsx, jadi modul lain (Absensi,
   KaryawanDetail, Finance) tidak bisa memakainya tanpa menyalin - dan
   hasil salinannya justru tidak sekadar duplikat: banding jam telat
   Absensi memakai perbandingan STRING ("08:05" > "08:00"), yang benar
   hanya selama kedua sisi sudah dipadatkan 2 digit. Data warisan
   "8:05 AM" lolos ke store apa adanya dan terbaca "tidak telat".

  * norm24() menolak nilai di luar rentang, bukan menjepitnya. Versi lama
   memakai Math.min/Math.max sehingga "25:00" disimpan jadi "23:00" -
   jam salahiat masuk tanpa jejak. Karena toMinutes() memanggil norm24()
   lebih dulu, guard "h > 23" di dalamnya tidak pernah menyala. */

const RE_AMPM = /^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp])\.?\s?[Mm]\.?$/;
const RE_PLAIN = /^(\d{1,2}):(\d{2})(?::\d{2})?$/;

/**
 * Normalkan satu nilai jam ke "HH:MM" 24 jam.
 *
 * Mengembalikan string kosong untuk input yang tidak bisa dipercaya:
 * di luar 0-23 / 0-59, atau bentuknya bukan jam. Sengaja tidak dijepit -
   pemanggil yang butuh menampilkan data mentah bisa memakai fmtJam24()
   yang mempertahankan teks aslinya.
 */
export function norm24(t: unknown): string {
  const s = String(t ?? "").trim();
  if (!s) return "";
  let h: number;
  let min: number;
  const ampm = RE_AMPM.exec(s);
  if (ampm) {
    h = Number(ampm[1]) % 12;
    if (/^[Pp]/.test(ampm[3])) h += 12;
    min = Number(ampm[2]);
  } else {
    const plain = RE_PLAIN.exec(s);
    if (!plain) return "";
    h = Number(plain[1]);
    min = Number(plain[2]);
  }
  if (!Number.isFinite(h) || !Number.isFinite(min)) return "";
  if (h > 23 || min > 59) return "";
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** Jam ke menit sejak tengah malam, atau null kalau nilai jam tidak valid. */
export function toMinutes(t: unknown): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(norm24(t));
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Bandingkan dua nilai jam. null bila salah satu tidak valid. */
export function cmpJam(a: unknown, b: unknown): number | null {
  const x = toMinutes(a);
  const y = toMinutes(b);
  if (x === null || y === null) return null;
  return x === y ? 0 : x < y ? -1 : 1;
}

/** Dua jam beririsan (mulai < akhir lain && mulai lain < akhir). */
export function jamOverlap(a0: number, a1: number, b0: number, b1: number): boolean {
  return a0 < b1 && b0 < a1;
}

/**
 * Jam ke "HH:MM" untuk tampilan. Berbeda dari norm24, nilai yang tidak
 * valid ditampilkan apa adanya - lebih berguna daripada jadi string
 * kosong saat users melihat data lama yang rusak.
 */
export function fmtJam24(jam: unknown): string {
  const raw = String(jam ?? "");
  const parts = raw.split(/\s*[–—-]\s*/);
  if (parts.length >= 2) {
    const a = norm24(parts[0]);
    const b = norm24(parts.slice(1).join("-"));
    if (/^\d{2}:\d{2}$/.test(a) && /^\d{2}:\d{2}$/.test(b)) return `${a}–${b}`;
  }
  const single = norm24(raw);
  return /^\d{2}:\d{2}$/.test(single) ? single : raw || "-";
}

/** Pecah rentang jam "08:00-17:00" (atau "7:00 AM-5:00 PM") jadi dua jam. */
export function parseJam(jam: unknown): { mulai: string; selesai: string } | null {
  const s = String(jam ?? "").replace(/([AaPp])\.?\s?[Mm]\.?/g, (x) => ` ${x.toUpperCase()}`);
  const m = /(\d{1,2}:\d{2}(?:\s*[AP]M)?)\s*[–—-]\s*(\d{1,2}:\d{2}(?:\s*[AP]M)?)/i.exec(s);
  if (!m) return null;
  return { mulai: norm24(m[1]), selesai: norm24(m[2]) };
}

/** Lama durasi dalam jam, satu angka desimal. Rentang tengah malam dihitung 24 jam. */
export function durasiJam(mulai: unknown, selesai: unknown): number {
  const a = toMinutes(mulai);
  const b = toMinutes(selesai);
  if (a === null || b === null) return 0;
  const menit = b > a ? b - a : b + 24 * 60 - a;
  return Math.round((menit / 60) * 10) / 10;
}

/** Jam dari nilai apa pun - dipakai sumbu heatmap yang butuh angka jam saja. */
export function jamOf(t: unknown): number | null {
  const m = toMinutes(t);
  return m === null ? null : Math.floor(m / 60);
}