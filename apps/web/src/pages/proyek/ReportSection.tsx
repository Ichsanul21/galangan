import { useState, useMemo } from "react";
import { useStore } from "../../data/store";
import { Card, StatusBadge, Modal, Field, toast, Badge, ProgressBar, KpiCard, EmptyState } from "../../components/ui";
import { Send, CheckCircle2, XCircle, FileDown, FileText } from "lucide-react";
import { exportPDF, exportExcel, fmtRupiah } from "../../utils/export";
import { fmtMiliar } from "../../data";

interface Props {
  projectId: string;
}

export default function ReportSection({ projectId }: Props) {
  const { data, update, log, wbsFor } = useStore();
  const project = (data.projects ?? []).find((p: any) => p.id === projectId);

  const docs = useMemo(() => ((data.documents ?? []) as any[]).filter((d: any) => d.project === projectId), [data.documents, projectId]);
  const wbs = useMemo(() => wbsFor(projectId), [wbsFor, projectId, data.projects]);
  const boq = useMemo(() => ((data.boq ?? []) as any[]).filter((b: any) => b.projectId === projectId), [data.boq, projectId]);
  const invoices = useMemo(() => ((data.invoices ?? []) as any[]).filter((i: any) => i.project === projectId), [data.invoices, projectId]);
  const ncrs = useMemo(() => ((data.ncr ?? []) as any[]).filter((n: any) => n.project === projectId), [data.ncr, projectId]);
  const wos = useMemo(() => ((data.workOrders ?? []) as any[]).filter((w: any) => w.project === projectId), [data.workOrders, projectId]);
  const slots = useMemo(() => ((data.dockSlots ?? []) as any[]).filter((s: any) => s.project === projectId), [data.dockSlots, projectId]);
  const svc = useMemo(() => ((data.services ?? []) as any[]).filter((s: any) => s.projectId === projectId), [data.services, projectId]);
  const spare = useMemo(() => ((data.spareparts ?? []) as any[]).filter((s: any) => s.projectId === projectId), [data.spareparts, projectId]);
  const activities = useMemo(
    () => ((data.activities ?? []) as any[]).filter((a: any) => String(a.target ?? "").includes(projectId)).slice(0, 5),
    [data.activities, projectId]
  );

  const totalBoq = useMemo(() => boq.reduce((s, b) => s + Number(b.totalPrice || 0), 0), [boq]);
  const approvedBoq = useMemo(() => boq.filter((b) => ["Approved", "Completed"].includes(b.status)).reduce((s, b) => s + Number(b.totalPrice || 0), 0), [boq]);
  const wbsDone = wbs.filter((w) => w.status === "Selesai" || Number(w.progress) >= 100).length;
  const budgetPct = project?.budget ? Math.round((Number(project.actual || 0) / Number(project.budget)) * 100) : 0;
  const openNcr = ncrs.filter((n) => n.status !== "Tertutup").length;
  const unpaidInv = invoices.filter((i) => i.status !== "Lunas").length;

  const [showShare, setShowShare] = useState(false);
  const [shareForm, setShareForm] = useState({ docId: "", to: "" });

  const submitReport = (docId: string, action: "approve" | "reject") => {
    update("documents", docId, {
      approvalStatus: action === "approve" ? "Approved" : "Rejected",
      approvedBy: "Anda",
    });
    log(`${action === "approve" ? "menyetujui" : "menolak"} laporan`, `${docId}`, "Dokumen");
    toast(`Laporan ${action === "approve" ? "disetujui" : "ditolak"}`);
  };

  const handleExportPDF = () => {
    exportPDF(`report-summary-${projectId}`, `Report-${projectId}`);
    toast("Export PDF dimulai");
  };

  const handleExportExcel = () => {
    const rows: any[][] = [
      ["REPORT SUMMARY", project?.vessel ?? projectId, projectId],
      ["Client", project?.client ?? "-", "Manager", project?.manager ?? "-"],
      ["Periode", `${project?.start ?? "-"} → ${project?.end ?? "-"}`, "Status", project?.status ?? "-"],
      [],
      ["KPI", "Nilai"],
      ["Anggaran", String(project?.budget ?? 0)],
      ["Realisasi", String(project?.actual ?? 0)],
      ["% Terpakai", `${budgetPct}%`],
      ["Progres", `${project?.progress ?? 0}%`],
      ["WBS selesai", `${wbsDone}/${wbs.length}`],
      ["Total BoQ", String(totalBoq)],
      ["BoQ Approved+Completed", String(approvedBoq)],
      ["NCR terbuka", String(openNcr)],
      ["Invoice belum lunas", String(unpaidInv)],
      [],
      ["WBS", "Progres"],
      ...wbs.map((w) => [w.task, `${w.progress}%`]),
      [],
      ["BoQ", "Qty", "Total", "Status"],
      ...boq.map((b) => [b.name, String(b.quantity), String(b.totalPrice), b.status]),
    ];
    exportExcel(rows, `Report-${projectId}`);
    toast("Export Excel dimulai");
  };

  const submitShare = () => {
    if (!shareForm.docId || !shareForm.to) { toast("Pilih dokumen dan tujuan", "info"); return; }
    const doc = docs.find((d: any) => d.id === shareForm.docId);
    update("documents", shareForm.docId, { sharedWith: [...(doc?.sharedWith ?? []), shareForm.to] });
    log("berbagi dokumen dengan atasan", `${shareForm.docId} → ${shareForm.to}`, "Dokumen");
    toast(`Dokumen dibagikan ke ${shareForm.to}`);
    setShowShare(false);
    setShareForm({ docId: "", to: "" });
  };

  return (
    <div className="space-y-4">
      <div id={`report-summary-${projectId}`}>
        <Card className="p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-semibold text-navy-900"><FileText className="h-4 w-4" /> Report Summary — {project?.vessel ?? projectId}</h3>
              <p className="text-xs text-steel-500">{projectId} · {project?.type ?? "-"} · {project?.client ?? "-"} · {project?.manager ?? "-"} · {project?.start ?? "-"} → {project?.end ?? "-"}</p>
            </div>
            <div className="flex gap-2">
              <button className="btn-secondary text-xs" onClick={handleExportPDF}>📄 PDF</button>
              <button className="btn-secondary text-xs" onClick={handleExportExcel}><FileDown className="h-3.5 w-3.5" /> Excel</button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <KpiCard label="Anggaran vs Realisasi" value={fmtMiliar(Number(project?.actual || 0))} delta={`${budgetPct}% dari ${fmtMiliar(Number(project?.budget || 0))}`} deltaDirection={budgetPct > 100 ? "down" : "up"} hint="Biaya aktual proyek" />
            <KpiCard label="Progres" value={`${project?.progress ?? 0}%`} delta={`WBS ${wbsDone}/${wbs.length} selesai`} deltaDirection="flat" hint="Dihitung dari WBS" />
            <KpiCard label="Total BoQ" value={fmtRupiah(totalBoq)} delta={`${fmtRupiah(approvedBoq)} approved`} deltaDirection="flat" hint={`${boq.length} item`} />
            <KpiCard label="NCR Terbuka" value={String(openNcr)} delta={`${unpaidInv} invoice belum lunas`} deltaDirection={openNcr > 0 ? "down" : "flat"} hint={`${ncrs.length} total NCR`} />
          </div>
        </Card>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card className="p-4">
            <h4 className="mb-2 text-sm font-semibold text-navy-900">Progres WBS ({wbsDone}/{wbs.length})</h4>
            {wbs.length === 0 ? (
              <p className="text-xs text-steel-400">Belum ada tahapan WBS.</p>
            ) : (
              <div className="space-y-2">
                {wbs.slice(0, 6).map((w) => (
                  <div key={w.task}>
                    <div className="flex justify-between text-xs"><span className="font-medium text-navy-900">{w.task}</span><span className="text-steel-500">{w.progress}%</span></div>
                    <ProgressBar value={Number(w.progress) || 0} className="mt-1" tone={Number(w.progress) >= 100 ? "green" : "navy"} />
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card className="p-4">
            <h4 className="mb-2 text-sm font-semibold text-navy-900">BoQ Ringkas ({boq.length})</h4>
            {boq.length === 0 ? (
              <p className="text-xs text-steel-400">Belum ada BoQ untuk proyek ini.</p>
            ) : (
              <div className="space-y-1.5">
                {boq.slice(0, 6).map((b) => (
                  <div key={b.id} className="flex items-center justify-between text-sm">
                    <span className="text-steel-700">{b.name} <span className="text-xs text-steel-400">× {b.quantity} {b.unit}</span></span>
                    <span className="flex items-center gap-2"><span className="font-mono text-xs">{fmtRupiah(Number(b.totalPrice || 0))}</span><StatusBadge status={b.status} /></span>
                  </div>
                ))}
                <p className="pt-1 text-right text-xs font-semibold text-navy-900">Total {fmtRupiah(totalBoq)}</p>
              </div>
            )}
          </Card>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="p-4">
            <h4 className="mb-2 text-sm font-semibold text-navy-900">Invoice ({invoices.length})</h4>
            {invoices.length === 0 ? <p className="text-xs text-steel-400">Belum ada invoice.</p> : invoices.slice(0, 5).map((i) => (
              <div key={i.id} className="flex items-center justify-between py-1 text-sm">
                <span className="font-mono text-navy-900">{i.id}</span>
                <span className="text-steel-600">{fmtMiliar(Number(i.amount || 0))}</span>
                <StatusBadge status={i.status} />
              </div>
            ))}
          </Card>
          <Card className="p-4">
            <h4 className="mb-2 text-sm font-semibold text-navy-900">NCR / WO / Dock</h4>
            <p className="text-xs text-steel-500">NCR terbuka: <b>{openNcr}</b> · WO: <b>{wos.length}</b> · Slot dock: <b>{slots.length}</b></p>
            <div className="mt-2 space-y-1">
              {ncrs.slice(0, 3).map((n) => (
                <div key={n.id} className="flex items-center justify-between text-sm"><span className="font-mono text-navy-900">{n.id}</span><StatusBadge status={n.status} /></div>
              ))}
              {wos.slice(0, 3).map((w) => (
                <div key={w.id} className="flex items-center justify-between text-sm"><span className="text-steel-600">{w.id} · {w.sub}</span><Badge tone="blue">{w.progress}%</Badge></div>
              ))}
              {(ncrs.length === 0 && wos.length === 0) && <p className="text-xs text-steel-400">Belum ada NCR / WO terkait.</p>}
            </div>
          </Card>
          <Card className="p-4">
            <h4 className="mb-2 text-sm font-semibold text-navy-900">Service & Sparepart</h4>
            <p className="text-xs text-steel-500">Service: <b>{svc.length}</b> · Sparepart: <b>{spare.length}</b></p>
            <div className="mt-2">
              <p className="text-xs text-steel-500">Sparepart — Akan: {spare.filter((s) => s.status === "Akan").length} · Sedang: {spare.filter((s) => s.status === "Sedang").length} · Selesai: {spare.filter((s) => s.status === "Selesai").length}</p>
              <p className="mt-1 text-xs text-steel-500">Service — Selesai: {svc.filter((s) => s.status === "Done").length} · Berjalan: {svc.filter((s) => s.status === "In Progress").length} · Terjadwal: {svc.filter((s) => s.status === "Scheduled").length}</p>
            </div>
            <h4 className="mb-1 mt-3 text-xs font-semibold text-steel-500">AKTIVITAS TERAKHIR</h4>
            {activities.length === 0 ? <p className="text-xs text-steel-400">Belum ada aktivitas tercatat.</p> : activities.map((a) => (
              <p key={a.id} className="py-0.5 text-xs text-steel-600"><b>{a.actor}</b> {a.action} <span className="font-mono">{a.target}</span></p>
            ))}
          </Card>
        </div>
      </div>

      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-navy-900">Persetujuan & Distribusi ({docs.length})</h3>
          <button className="btn-secondary text-xs" onClick={() => setShowShare(true)}><Send className="h-3.5 w-3.5" /> Bagikan ke Atasan</button>
        </div>
        {docs.length === 0 ? (
          <EmptyState icon={<FileText className="h-6 w-6" />} title="Belum ada dokumen" subtitle="Dokumen proyek akan muncul di sini untuk disetujui / dibagikan." />
        ) : (
          <div className="space-y-3">
            {docs.map((d: any) => (
              <div key={d.id} className="rounded-xl border border-steel-100 p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-navy-900">{d.title}</p>
                    <p className="text-xs text-steel-500">{d.id} · {d.type} · {d.version} · {d.updated} · {d.owner}</p>
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
