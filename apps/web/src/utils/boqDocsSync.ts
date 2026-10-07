// D6: sinkron lampiran BoQ ke koleksi `documents`.
//
// Client: "dokumen boq seharusnya ada masuk di dokumen & laporan".
// BoQ punya `fileUrl` sendiri; tab Dokumen & Laporan membaca `data.documents`.
// Util ini menyalin lampiran BoQ menjadi baris documents secara idempoten
// (sourceModule + sourceId) supaya klik Sinkron dua kali tidak menduplikasi.

import type { StoreItem } from "../data/store";
import { docAttachment } from "./docAttachment";
import { todayISO } from "./format";

export interface BoQDocSyncResult {
  created: number;
  skipped: number;
}

const STATUS_MAP: Record<string, string> = {
  Draft: "Draft",
  Pending: "Diajukan",
  Approved: "Disetujui",
  Completed: "Disetujui",
  Rejected: "Ditolak",
};

export async function syncBoqDocsToDocuments(opts: {
  data: { boq?: StoreItem[]; documents?: StoreItem[] };
  projectId: string;
  add: (collection: "documents", item: Record<string, unknown>, meta?: Record<string, unknown>) => Promise<StoreItem>;
  log: (action: string, target?: string, module?: string) => void;
  owner?: string;
}): Promise<BoQDocSyncResult> {
  const { data, projectId, add, log, owner } = opts;
  const existing = data.documents ?? [];
  const boqs = (data.boq ?? []).filter((b) => String(b.projectId ?? "") === projectId);
  let created = 0;
  let skipped = 0;

  for (const b of boqs) {
    const att = docAttachment(b);
    if (att.url === "") continue;
    const already = existing.some(
      (d) => String(d.sourceModule ?? "") === "BoQ" && String(d.sourceId ?? "") === String(b.id),
    );
    if (already) { skipped += 1; continue; }
    const surat = String(b.suratNo ?? "-");
    const name = String(b.name ?? b.id);
    await add("documents", {
      title: `BoQ ${surat} – ${name}`,
      type: "Laporan",
      subType: "BoQ / RAB",
      project: projectId,
      vessel: "",
      version: "v1.0",
      status: STATUS_MAP[String(b.status ?? "Draft")] ?? "Draft",
      updated: todayISO(),
      owner: owner ?? "Sistem",
      archived: false,
      docCopy: "Terkendali",
      related: [],
      sharedWith: [],
      approvalStatus: "Draft",
      sourceModule: "BoQ",
      sourceId: String(b.id),
      fileUrl: att.url,
      ...(att.fileName ? { fileName: att.fileName } : {}),
      branch: "",
    }, { action: "sinkron dokumen BoQ", target: `${b.id} · ${name}`, module: "Dokumen" });
    created += 1;
  }

  if (created > 0) {
    log("mensinkronkan lampiran BoQ ke Dokumen", `${projectId} · ${created} dokumen baru`, "Dokumen");
  }
  return { created, skipped };
}
