/* Risiko otomatis dari WBS dan milestone WO.
 *
 * Client meminta risiko dihasilkan otomatis ketika WBS/SOW ditambahkan,
 * bukan diinput manual. Alasannya praktis: milestone yang mendekati jatuh
 * tempo atau yang terlambat adalah risiko nyata yang paling mungkin terjadi,
 * dan mencatatnya manual setiap kali WBS berubah adalah pekerjaan yang tidak
 * sepadan - user akan lupa, dan risiko yang terlupa tidak membantu siapa pun.
 *
 * Desain:
 * - Risiko disimpan di koleksi `risks` (sama seperti input manual).
 * - Setiap risiko otomatis punya field `source` ("WBS" atau "WO") dan
 *   `wbsTask` (nama task/milestone) supaya bisa dideduplikasi.
 * - Deduplikasi berdasarkan `source` + `wbsTask`: kalau risiko dengan sumber
 *   yang sama sudah ada, tidak dibuat ulang.
 * - Saat milestone sudah selesai (progress >= 100 atau doneAt terisi),
 *   risiko yang terkait otomatis ditutup.
 * - Field `source` tidak ada di StoreItem interface, tapi StoreItem menerima
 *   field tambahan apa pun tanpa ubah type.
 */

import type { StoreItem } from "../data/store";
import { woMilestonesOf } from "./woMilestones";

export interface RiskDraft {
  project: string;
  title: string;
  likelihood: "Rendah" | "Sedang" | "Tinggi";
  impact: "Rendah" | "Sedang" | "Tinggi";
  mitigation: string;
  status: "Aktif" | "Dipantau" | "Tertutup";
  source: "WBS" | "WO";
  wbsTask: string;
}

export interface RiskAutoResult {
  /** Risiko baru yang perlu ditambahkan ke koleksi `risks`. */
  add: RiskDraft[];
  /** ID risiko yang sudah ada dan perlu ditutup (milestone selesai). */
  close: string[];
}

/** Selisih hari dari hari ini ke akhir bulan `YYYY-MM`; negatif = lewat. */
function daysUntilMonthEnd(month: string, today: string): number | null {
  const m = month.match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const day = new Date(Number(m[1]), Number(m[2]), 0); // akhir bulan
  const from = new Date(`${today}T00:00:00`);
  return Math.round((day.getTime() - from.getTime()) / 86400000);
}

/** Selisih hari dari hari ini ke tanggal `YYYY-MM-DD`; negatif = lewat. */
function daysUntilDate(date: string, today: string): number | null {
  const d = date.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
  if (!d) return null;
  const day = d[3]
    ? new Date(Number(d[1]), Number(d[2]) - 1, Number(d[3]))
    : new Date(Number(d[1]), Number(d[2]), 0);
  const from = new Date(`${today}T00:00:00`);
  return Math.round((day.getTime() - from.getTime()) / 86400000);
}

/** Likelihood berdasarkan selisih hari ke jatuh tempo. */
function likelihoodFromDays(days: number): "Rendah" | "Sedang" | "Tinggi" {
  if (days < 3) return "Tinggi";
  if (days < 7) return "Sedang";
  return "Rendah";
}

/** Impact berdasarkan bobot WBS atau persentase milestone WO. */
function impactFromWeight(weight: number): "Rendah" | "Sedang" | "Tinggi" {
  if (weight >= 10) return "Tinggi";
  if (weight >= 5) return "Sedang";
  return "Rendah";
}

/** Deduplikasi: apakah risiko dengan source+wbsTask yang sama sudah ada? */
function hasExisting(
  existing: readonly StoreItem[],
  source: "WBS" | "WO",
  wbsTask: string,
): boolean {
  return existing.some(
    (r) => String(r.source ?? "") === source && String(r.wbsTask ?? "") === wbsTask,
  );
}

/** ID risiko yang terkait dengan source+wbsTask tertentu. */
function existingId(
  existing: readonly StoreItem[],
  source: "WBS" | "WO",
  wbsTask: string,
): string | null {
  const hit = existing.find(
    (r) => String(r.source ?? "") === source && String(r.wbsTask ?? "") === wbsTask,
  );
  return hit ? String(hit.id) : null;
}

/** Task WBS — hanya butuh task, progress, weight, start, end. */
interface WbsTaskLike {
  task: string;
  progress: number;
  weight: number;
  start: string;
  end: string;
}

/**
 * Hasilkan risiko dari WBS sebuah proyek.
 *
 * Aturan:
 * 1. Task dengan progress < 100% dan end dalam `milestoneDays` hari →
 *    risiko "milestone hampir jatuh tempo".
 * 2. Task dengan progress < 100% dan end sudah lewat → risiko "terlambat".
 * 3. Task dengan progress == 0 dan start sudah lewat → risiko "belum mulai".
 *
 * Task yang sudah selesai (progress >= 100) → risiko terkait ditutup.
 */
export function generateRisksFromWbs(
  projectId: string,
  wbs: readonly WbsTaskLike[],
  existingRisks: readonly StoreItem[],
  today: string,
  milestoneDays: number,
): RiskAutoResult {
  const add: RiskDraft[] = [];
  const close: string[] = [];

  for (const w of wbs) {
    const task = String(w.task ?? "").trim();
    if (!task) continue;
    const progress = Number(w.progress ?? 0);
    const weight = Number(w.weight ?? 0);
    const end = String(w.end ?? "");
    const start = String(w.start ?? "");
    const id = existingId(existingRisks, "WBS", task);

    // Task selesai → tutup risiko terkait.
    if (progress >= 100) {
      if (id) close.push(id);
      continue;
    }

    const endDays = daysUntilMonthEnd(end, today);
    const startDays = daysUntilMonthEnd(start, today);

    let likelihood: "Rendah" | "Sedang" | "Tinggi" | null = null;
    let title = "";
    let mitigation = "";

    if (endDays !== null && endDays < 0) {
      // Terlambat: end sudah lewat.
      likelihood = "Tinggi";
      title = `[WBS] ${task} — terlambat ${Math.abs(endDays)} hari`;
      mitigation = `Percepat ${task} atau negosiasi timeline dengan klien`;
    } else if (endDays !== null && endDays <= milestoneDays) {
      // Mendekati jatuh tempo.
      likelihood = likelihoodFromDays(endDays);
      title = `[WBS] ${task} — milestone H-${endDays}`;
      mitigation = `Percepat ${task} atau negosiasi timeline`;
    } else if (startDays !== null && startDays < 0 && progress === 0) {
      // Belum mulai padahal start sudah lewat.
      likelihood = "Sedang";
      title = `[WBS] ${task} — belum mulai, start sudah lewat`;
      mitigation = `Mulai ${task} secepatnya atau tinjau jadwal`;
    }

    if (likelihood === null || !title) {
      // Tidak ada risiko untuk task ini; kalau ada risiko lama, tutup.
      if (id) close.push(id);
      continue;
    }

    // Belum ada risiko untuk task ini → buat baru.
    if (!hasExisting(existingRisks, "WBS", task)) {
      add.push({
        project: projectId,
        title,
        likelihood,
        impact: impactFromWeight(weight),
        mitigation,
        status: "Aktif",
        source: "WBS",
        wbsTask: task,
      });
    }
  }

  return { add, close };
}

/**
 * Hasilkan risiko dari milestone WO sebuah proyek.
 *
 * Aturan:
 * 1. Milestone tanpa doneAt dan due dalam `milestoneDays` hari →
 *    risiko "termin hampir jatuh tempo".
 * 2. Milestone tanpa doneAt dan due sudah lewat → risiko "termin terlambat".
 *
 * Milestone yang sudah punya doneAt → risiko terkait ditutup.
 */
export function generateRisksFromWo(
  projectId: string,
  wos: readonly StoreItem[],
  existingRisks: readonly StoreItem[],
  today: string,
  milestoneDays: number,
): RiskAutoResult {
  const add: RiskDraft[] = [];
  const close: string[] = [];

  for (const wo of wos) {
    const milestones = woMilestonesOf(wo);
    const woId = String(wo.id ?? "");
    const scope = String(wo.scope ?? "").trim();

    for (const ms of milestones) {
      const title = ms.title.trim();
      if (!title) continue;
      const doneAt = String(ms.doneAt ?? "").trim();
      const key = `${woId}:${title}`;
      const id = existingId(existingRisks, "WO", key);

      // Milestone selesai → tutup risiko terkait.
      if (doneAt) {
        if (id) close.push(id);
        continue;
      }

      const dueDays = daysUntilDate(ms.due, today);

      let likelihood: "Rendah" | "Sedang" | "Tinggi" | null = null;
      let riskTitle = "";
      let mitigation = "";

      if (dueDays !== null && dueDays < 0) {
        likelihood = "Tinggi";
        riskTitle = `[WO ${woId}] ${title} — termin terlambat ${Math.abs(dueDays)} hari`;
        mitigation = scope
          ? `Kejar ${scope} atau negosiasi termin dengan subkontraktor`
          : `Kejar pengerjaan atau negosiasi termin dengan subkontraktor`;
      } else if (dueDays !== null && dueDays <= milestoneDays) {
        likelihood = likelihoodFromDays(dueDays);
        riskTitle = `[WO ${woId}] ${title} — termin H-${dueDays}`;
        mitigation = scope
          ? `Pastikan ${scope} selesai sebelum termin`
          : `Pastikan pengerjaan selesai sebelum termin`;
      }

      if (likelihood === null || !riskTitle) {
        if (id) close.push(id);
        continue;
      }

      if (!hasExisting(existingRisks, "WO", key)) {
        add.push({
          project: projectId,
          title: riskTitle,
          likelihood,
          impact: impactFromWeight(Math.round(ms.pct)),
          mitigation,
          status: "Aktif",
          source: "WO",
          wbsTask: key,
        });
      }
    }
  }

  return { add, close };
}