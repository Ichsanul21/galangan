import type { StoreItem } from "../data/store";

/**
 * Milestone milik Work Order.
 *
 * Bentuknya sengaja sama dengan milestone SOW milik subkontraktor
 * (`{ title, pct, due }`). Keduanya berarti "bagian mana dari nilai kontrak
 * subkontraktor yang sudah/~akan dikerjakan", sehingga cap termin bisa
 * dihitung dengan rumus yang sama untuk keduanya: nilai kontrak x pct/100.
 * Kalau bentuknya dibedakan, tiap tempat yang memvalidasi termin harus
 * punya dua cabang, dan cabang kedua tidak akan pernah diuji.
 *
 * Kenapa milestone ini milik WO dan bukan cuma milik subkontraktor:
 * satu subkontraktor bisa punya beberapa WO, dan tiap WO punya tahap kerja
 * yang berbeda. Milestone yang menempel di subkontraktor tidak bisa
 * membedakan "fabrikasi 40%" milik WO A dari "coating 40%" milik WO B.
 *
 * `pct` adalah PERSEN DARI KONTRAK SUBKONTRAKTOR (bukan persen dari nilai
 * WO), supaya bobotnya bisa langsung dipakai sebagai cap termin.
 */
export interface WoMilestone {
  title: string;
  pct: number;
  due: string;
  /** TanggalCAP milestonesini selesai. Kosong = belum selesai. */
  doneAt?: string;
}

export const WO_MILESTONE_STATUSES = ["Belum", "Proses", "Selesai"] as const;

/** Milestone milik satu WO. Aman untuk `milestones` yang bukan array. */
export function woMilestonesOf(wo: StoreItem | null | undefined): WoMilestone[] {
  if (!wo) return [];
  const raw = wo.milestones;
  if (!Array.isArray(raw)) return [];
  const out: WoMilestone[] = [];
  for (const m of raw as unknown[]) {
    if (!m || typeof m !== "object") continue;
    const r = m as Record<string, unknown>;
    const title = String(r.title ?? "").trim();
    if (title === "") continue;
    const pct = Number(r.pct);
    out.push({
      title,
      /* Bobot rusak (NaN, negatif, > 1000) disimpan 0 supaya tidak
         mengacaukan pembobotan; UI tetap menampilkan apa yang diketik. */
      pct: Number.isFinite(pct) && pct > 0 ? pct : 0,
      due: String(r.due ?? ""),
      doneAt: String(r.doneAt ?? ""),
    });
  }
  return out;
}

/**
 * Progress WO sebagai PERSEN, dihitung dari milestone bila ada.
 *
 * Dua aturan yang membuat fungsi ini bisa dipercaya:
 *
 * 1. Bobot dijumlahkan dari milestone yang SUDAH SELESAI saja (`doneAt`
 *    terisi), lalu dibagi TOTAL bobot semua milestone - bukan dibagi 100.
 *    Kalau totale 100%, membagi 100 sama saja; kalau user hanya mengisi
 *    tiga tahap 30/30/40, membagi 100 membuat progres tersedak ke 90% di
 *    tahap kedua.
 *
 * 2. Kalau WO punya milestone tapi belum ada yang selesai, hasilnya 0 - bukan
 *    jatuh ke angka manual. Kalau ada satu tahap selesai dari total 100%,
 *    progressnya tepat 100%, bukan "hanya tahap pertama yang selesai".
 *
 * WO tanpa milestone sama sekali memakai `wo.progress` yang diketik
 * manual, supaya WO lama tidak ikut jadi 0%.
 */
export function woProgressOf(wo: StoreItem | null | undefined): number {
  const ms = woMilestonesOf(wo);
  if (ms.length === 0) {
    const manual = Number(wo?.progress);
    return Number.isFinite(manual) ? clampPct(manual) : 0;
  }
  const totalPct = ms.reduce((s, m) => s + m.pct, 0);
  if (totalPct <= 0) return 0;
  const donePct = ms.reduce((s, m) => (m.doneAt !== "" ? s + m.pct : s), 0);
  return clampPct(Math.round((donePct / totalPct) * 100));
}

function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * Label progress untuk form termin.dulu ini teks bebas `"WO-2026-041 (70%)"`
 * yang harus diketik atau disalin manual - kalau tidak sinkron dengan WO,
 * angka yang tampil di form termin sama sekali tidak flickering dengan
 * kenyataan pekerjaan.
 */
export function woProgressLabel(wo: StoreItem | null | undefined): string {
  const id = String(wo?.id ?? "-");
  return `${id} (${woProgressOf(wo)}%)`;
}

/** Pencarian milestone WO berdasarkan judul - dipakai validasi cap termin. */
export function woMilestoneByTitle(wo: StoreItem | null | undefined, title: string): WoMilestone | undefined {
  return woMilestonesOf(wo).find((m) => m.title === title);
}

/**
 * Gabungan milestone yang boleh dipilih di form termin: milestone SOW
 * subkontraktor PLUS milestone WO yang dipilih.
 *
 * Digabung, bukan diganti: milestone SOW sudah dipakai oleh termin yang
 * sudah terbit. Kalau diganti, cap termin lama ikut hilang dan nilainya
 * tidak bisa diverifikasi lagi.
 */
export function terminMilestoneOptions(
  sub: StoreItem | null | undefined,
  wo: StoreItem | null | undefined,
): WoMilestone[] {
  const seen = new Set<string>();
  const out: WoMilestone[] = [];
  const push = (m: WoMilestone): void => {
    const key = m.title.trim().toLowerCase();
    if (key === "" || seen.has(key)) return;
    seen.add(key);
    out.push(m);
  };
  const subMs = Array.isArray(sub?.milestones) ? (sub?.milestones as unknown[]) : [];
  for (const m of subMs) {
    if (!m || typeof m !== "object") continue;
    const r = m as Record<string, unknown>;
    const title = String(r.title ?? "").trim();
    if (title === "") continue;
    push({ title, pct: Number(r.pct) || 0, due: String(r.due ?? ""), doneAt: "" });
  }
  for (const m of woMilestonesOf(wo)) push(m);
  return out;
}
