import { useState, type ReactNode } from "react";
import { StickyNote, Trash2 } from "lucide-react";
import { Modal, Field, ConfirmModal, toast, AsyncButton } from "./ui";
import { DocumentPreviewCell } from "./DocumentPreview";
import { FileUploadButton } from "./ui";
import type { StoreItem } from "../data/store";

/* ==========================================================================
   CATATAN SERVIS PER UNIT EQUIPMENT
   ==========================================================================

   Ini BEDA dari `catatan` pada siklus maintenance. `catatan` menempel pada
   satu siklus: begitu siklus selesai, catatannya ikut tertutup di arsip
   siklus itu saja.

   Yang tidak pernah punya tempat adalah pengamatan yang berlaku lintas
   siklus - "titik las di sambungan ini selalu retak setelah lapis ketiga",
   "pelumas ini hanya cocok untuk unit ini", "operator harus turun dulu
   sebelum start". Informasi seperti itu sekarang hanya ada di kepala
   teknisi atau di grup chat, sehingga setiap teknisi baru harus belajar
   ulang, dan tidak ada yang bisa menunjukkan bukti ketika klaimnya
   dipertanyakan.

   Disimpan sebagai array di record equipment (equipment.serviceNotes):
     { at, by, text, fileUrl }

   Tidak butuh tabel atau migrasi baru karena kolom `data` pada CRUD API
   sudah JSON generik - field baru cukup masuk lewat update() biasa.
   ========================================================================== */

export interface ServiceNote {
  at?: unknown;
  by?: unknown;
  text?: unknown;
  fileUrl?: unknown;
}

export function notesOf(e: StoreItem): ServiceNote[] {
  const raw = e.serviceNotes;
  return Array.isArray(raw) ? (raw as ServiceNote[]) : [];
}

export interface ServiceNotesLabels {
  title: string;
  subtitle: string;
  observation: string;
  observationPh: string;
  attachment: string;
  attachmentHint: string;
  recorded: string;
  empty: string;
  save: string;
  close: string;
  delete: string;
  deleteTitle: string;
  deleteDesc: string;
  added: string;
  removed: string;
  notes: string;
  notesTitle: string;
  emptyNote: string;
  saveFail: string;
  fmtDate: (v: unknown) => string;
}

interface ServiceNotesProps {
  equip: StoreItem | null;
  labels: ServiceNotesLabels;
  onClose: () => void;
  onSave: (id: string, notes: ServiceNote[]) => Promise<void>;
}

/** Modal catatan servis. Dipasang sebagai sibling di dalam JSX utama. */
export function ServiceNotesModal({ equip, labels, onClose, onSave }: ServiceNotesProps) {
  const [draft, setDraft] = useState({ text: "", fileUrl: "" });
  const [busy, setBusy] = useState(false);
  const [delIdx, setDelIdx] = useState<number | null>(null);

  const list = equip ? notesOf(equip) : [];
  const L = labels;

  const add = async (): Promise<void> => {
    if (!equip) return;
    const text = draft.text.trim();
    if (text === "" && draft.fileUrl.trim() === "") {
      toast(L.emptyNote, "info");
      return;
    }
    setBusy(true);
    try {
      const next = [...list, {
        at: `${new Date().toISOString().slice(0, 10)} ${new Date().toTimeString().slice(0, 5)}`,
        by: "Anda",
        text,
        fileUrl: draft.fileUrl.trim(),
      }];
      await onSave(String(equip.id), next);
      setDraft({ text: "", fileUrl: "" });
      toast(L.added);
    } catch (e) {
      toast(e instanceof Error ? e.message : L.saveFail, "info");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (idx: number): Promise<void> => {
    if (!equip) return;
    setBusy(true);
    try {
      await onSave(String(equip.id), list.filter((_, i) => i !== idx));
      setDelIdx(null);
      toast(L.removed);
    } catch (e) {
      toast(e instanceof Error ? e.message : L.saveFail, "info");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Modal
        open={equip !== null}
        onClose={onClose}
        title={equip ? L.title.replace("{a}", String(equip.name ?? equip.id)) : ""}
        subtitle={L.subtitle}
        wide
        footer={
          <>
            <button className="btn-secondary" onClick={onClose}>{L.close}</button>
            <AsyncButton className="btn-primary" disabled={busy} onAction={add}>{L.save}</AsyncButton>
          </>
        }
      >
        <div className="space-y-4">
          <Field label={L.observation}>
            <textarea
              className="input"
              rows={3}
              value={draft.text}
              onChange={(e) => setDraft((d) => ({ ...d, text: e.target.value }))}
              placeholder={L.observationPh}
              aria-label={L.observation}
            />
          </Field>

          <Field label={L.attachment} hint={L.attachmentHint}>
            <div className="flex flex-wrap items-center gap-2">
              <input
                className="input flex-1 font-mono"
                value={draft.fileUrl}
                onChange={(e) => setDraft((d) => ({ ...d, fileUrl: e.target.value }))}
                placeholder="https://..."
                aria-label={L.attachment}
              />
              <FileUploadButton
                label={L.attachment.split("/")[0] === "Lampiran" ? "Unggah" : "Upload"}
                onUploaded={(u: string) => setDraft((d) => ({ ...d, fileUrl: u }))}
              />
            </div>
          </Field>

          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-steel-500">
              {L.recorded.replace("{n}", String(list.length))}
            </p>
            {list.length === 0 ? (
              <p className="rounded-lg bg-surface px-3 py-2 text-xs text-steel-400">{L.empty}</p>
            ) : (
              <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                {list.map((n, i) => (
                  <div key={i} className="rounded-lg border border-steel-200 p-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-medium text-navy-900">
                        {L.fmtDate(String(n.at ?? "").slice(0, 10))}
                        <span className="ml-1.5 font-normal text-steel-400">{String(n.by ?? "")}</span>
                      </p>
                      <button
                        className="shrink-0 rounded p-1 text-steel-400 hover:bg-rose-50 hover:text-rose-600"
                        title={L.delete}
                        aria-label={`${L.delete} ${i + 1}`}
                        onClick={() => setDelIdx(i)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {String(n.text ?? "").trim() !== "" && (
                      <p className="mt-1 whitespace-pre-wrap text-sm text-steel-700">{String(n.text)}</p>
                    )}
                    {String(n.fileUrl ?? "").trim() !== "" && (
                      <div className="mt-1.5">
                        <DocumentPreviewCell
                          doc={{
                            title: `${L.notes} ${i + 1}`,
                            subtitle: L.fmtDate(String(n.at ?? "").slice(0, 10)),
                            fileUrl: String(n.fileUrl),
                          }}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={delIdx !== null}
        title={L.deleteTitle}
        desc={L.deleteDesc}
        confirmLabel={L.delete}
        danger
        onCancel={() => setDelIdx(null)}
        onConfirm={() => { if (delIdx !== null) void remove(delIdx); }}
      />
    </>
  );
}

/** Tombol pembuka modal, dipakai di baris tabel Register. */
export function ServiceNotesButton({
  count,
  labels,
  onClick,
}: {
  count: number;
  labels: Pick<ServiceNotesLabels, "notes" | "notesTitle">;
  onClick: () => void;
}): ReactNode {
  return (
    <button className="btn-secondary text-xs" onClick={onClick} title={labels.notesTitle}>
      <StickyNote className="h-3.5 w-3.5" /> {labels.notes}
      {count > 0 && (
        <span className="rounded-full bg-navy-700 px-1.5 text-[10px] font-bold text-white">{count}</span>
      )}
    </button>
  );
}