import { useState } from "react";
import { useStore } from "../../data/store";
import { Card, StatusBadge, Modal, Field, toast } from "../../components/ui";
import { Send, CheckCircle2, XCircle } from "lucide-react";
import { exportPDF, exportExcel } from "../../utils/export";

interface Props {
  projectId: string;
}

export default function ReportSection({ projectId }: Props) {
  const { data, update, log } = useStore();
  const docs = (data.documents as any[]).filter((d: any) => d.project === projectId);
  const [showShare, setShowShare] = useState(false);
  const [shareForm, setShareForm] = useState({ docId: "", to: "" });

  const submitReport = (docId: string, action: "approve" | "reject") => {
    update("documents", docId, {
      approvalStatus: action === "approve" ? "Approved" : "Rejected",
      approvedBy: "Anda",
    });
    log(`${action === "approve" ? "menyetujui" : "menolak"} laporan`, `${docId}`, "Dokumen");
    toast(`Laporan ${action === "approve" ? "disetujui" : "ditolak"}`);
    setShowShare(false);
  };

  const handleExportPDF = (docId: string) => {
    const doc = docs.find((d: any) => d.id === docId);
    if (!doc) return;
    const el = document.getElementById(`doc-${docId}`);
    if (el) exportPDF(el.id ?? `doc-${docId}`, doc.title ?? "Report");
    toast("Export PDF dimulai");
  };

  const handleExportExcel = (docId: string) => {
    const doc = docs.find((d: any) => d.id === docId);
    if (!doc) return;
    const rows = [["Field", "Value"], ["ID", doc.id], ["Title", doc.title], ["Type", doc.type], ["Version", doc.version], ["Status", doc.status], ["Updated", doc.updated], ["Owner", doc.owner]];
    exportExcel(rows, doc.title ?? "Report");
    toast("Export Excel dimulai");
  };

  const submitShare = () => {
    if (!shareForm.docId || !shareForm.to) { toast("Pilih dokumen dan tujuan", "info"); return; }
    update("documents", shareForm.docId, { sharedWith: [...(docs.find((d: any) => d.id === shareForm.docId)?.sharedWith ?? []), shareForm.to] });
    log("berbagi dokumen dengan atasan", `${shareForm.docId} → ${shareForm.to}`, "Dokumen");
    toast(`Dokumen dibagikan ke ${shareForm.to}`);
    setShowShare(false);
    setShareForm({ docId: "", to: "" });
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-navy-900">Daftar Laporan ({docs.length})</h3>
          <button className="btn-secondary text-xs" onClick={() => setShowShare(true)}><Send className="h-3.5 w-3.5" /> Bagikan ke Atasan</button>
        </div>

        {docs.length === 0 ? (
          <p className="text-sm text-steel-400">Belum ada laporan untuk proyek ini.</p>
        ) : (
          <div className="space-y-3">
            {docs.map((d: any) => (
              <div key={d.id} id={`doc-${d.id}`} className="rounded-xl border border-steel-100 p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-navy-900">{d.title}</p>
                    <p className="text-xs text-steel-500">{d.id} · {d.type} · {d.version} · {d.updated} · {d.owner}</p>
                  </div>
                  <div className="flex gap-2">
                    <button className="btn-secondary text-xs" onClick={() => handleExportPDF(d.id)}>📄 PDF</button>
                    <button className="btn-secondary text-xs" onClick={() => handleExportExcel(d.id)}>📊 Excel</button>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <StatusBadge status={d.approvalStatus === "Approved" ? "Selesai" : d.approvalStatus === "Submitted" ? "Dalam Proses" : "Draft"} />
                  {d.approvalStatus === "Submitted" && (
                    <div className="flex gap-1">
                      <button className="rounded bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700 hover:bg-green-200" onClick={() => submitReport(d.id, "approve")}><CheckCircle2 className="h-3 w-3 inline" /> Setujui</button>
                      <button className="rounded bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700 hover:bg-rose-200" onClick={() => submitReport(d.id, "reject")}><XCircle className="h-3 w-3 inline" /> Tolak</button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal open={showShare} onClose={() => setShowShare(false)} title="Bagikan Laporan ke Atasan"
        footer={<><button className="btn-secondary" onClick={() => setShowShare(false)}>Batal</button><button className="btn-primary" onClick={submitShare}>Kirim</button></>}>
        <div className="space-y-3">
          <Field label="Dokumen">
            <select className="input" value={shareForm.docId} onChange={(e) => setShareForm({ ...shareForm, docId: e.target.value })}>
              <option value="">Pilih dokumen…</option>
              {docs.map((d: any) => <option key={d.id} value={d.id}>{d.title}</option>)}
            </select>
          </Field>
          <Field label="Ditujukan ke"><input className="input" value={shareForm.to} onChange={(e) => setShareForm({ ...shareForm, to: e.target.value })} placeholder="cth: Andi Darman (Direktur)" /></Field>
        </div>
      </Modal>
    </div>
  );
}
