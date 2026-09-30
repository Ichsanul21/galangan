import { useState, useMemo } from "react";
import { useStore } from "../../data/store";
import { useT } from "../../i18n/LanguageContext";
import { n_prj } from "../../i18n/n_prj";
import { Card, StatusBadge, Modal, Field, toast, Badge, ProgressBar, KpiCard, EmptyState, useBusy } from "../../components/ui";
import { Send, CheckCircle2, XCircle, FileDown, FileText } from "lucide-react";
import { exportPDF, exportExcel, fmtRupiah, fmtRentang } from "../../utils/export";
import { STATUS_BOQ_ID } from "../../utils/format";
import { fmtMiliar } from "../../data";

interface Props {
  projectId: string;
}

export default function ReportSection({ projectId }: Props) {
  const busy = useBusy();
  const { locale } = useT();
  const S = n_prj[locale];
  const { data, update, log, wbsFor } = useStore();
  const project = (data.projects ?? []).find((p: any) => p.id === projectId);

  const docs = useMemo(() => ((data.documents ?? []) as any[]).filter((d: any) => d.project === projectId), [data.documents, projectId]);
  const wbs = useMemo(
    () => (data.wbsByProject?.[projectId]?.length ? wbsFor(projectId) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [wbsFor, projectId, data.projects, data.wbsByProject],
  );
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
  const critNcr = ncrs.filter((n) => n.status !== "Tertutup" && n.severity === "Critical").length;
  const unpaidInv = invoices.filter((i) => i.status !== "Lunas").length;

  const [showShare, setShowShare] = useState(false);
  const [shareForm, setShareForm] = useState({ docId: "", to: "" });
  const [wbsQ, setWbsQ] = useState("");
  const [boqQ, setBoqQ] = useState("");
  const [invQ, setInvQ] = useState("");
  const [ncrWoQ, setNcrWoQ] = useState("");

  const submitReport = async (docId: string, action: "approve" | "reject") => {
    await update("documents", docId, {
      approvalStatus: action === "approve" ? "Approved" : "Rejected",
      approvedBy: "Anda",
    });
    log(`${action === "approve" ? "menyetujui" : "menolak"} laporan`, `${docId}`, "Dokumen");
    toast(action === "approve" ? S.repToastApproved : S.repToastRejected);
  };

  const handleExportPDF = () => {
    // Anti-potong: kembangkan container scroll (max-h/overflow-y-auto) sebelum
    // html2pdf memotret, lalu kembalikan. Chart (recharts SVG) tidak selalu
    // ikut ter-render di kanvas — fallback teks KPI/tabel di bawah memastikan
    // PDF tidak blank walau SVG gagal di-capture.
    const elementId = `report-summary-${projectId}`;
    const el = document.getElementById(elementId);
    const touched: { node: HTMLElement; overflow: string; maxHeight: string }[] = [];
    try {
      if (el) {
        el.classList.add("print-expand");
        const nodes = el.querySelectorAll<HTMLElement>(".overflow-y-auto, [style*='max-h'], [style*='max-height']");
        nodes.forEach((n) => {
          touched.push({ node: n, overflow: n.style.overflow, maxHeight: n.style.maxHeight });
          n.style.overflow = "visible";
          n.style.maxHeight = "none";
        });
      }
      void exportPDF(elementId, `Report-${projectId}`)
        .then(() => toast(S.repToastPdf))
        .catch(() => toast(S.saveFail, "info"))
        .finally(() => {
          touched.forEach((t) => { t.node.style.overflow = t.overflow; t.node.style.maxHeight = t.maxHeight; });
          el?.classList.remove("print-expand");
        });
    } catch {
      touched.forEach((t) => { t.node.style.overflow = t.overflow; t.node.style.maxHeight = t.maxHeight; });
      el?.classList.remove("print-expand");
      toast(S.saveFail, "info");
    }
  };

  const handleExportExcel = () => {
    const rows: any[][] = [
      ["REPORT SUMMARY", project?.vessel ?? projectId, projectId],
      ["Client", project?.client ?? "-", "Manager", project?.manager ?? "-"],
      ["Periode", fmtRentang(project?.start, project?.end), "Status", project?.status ?? "-"],
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
    toast(S.repToastExcel);
  };

  const submitShare = async () => {
    if (!shareForm.docId || !shareForm.to) { toast(S.detToastPickDoc, "info"); return; }
    const doc = docs.find((d: any) => d.id === shareForm.docId);
    await update("documents", shareForm.docId, { sharedWith: [...(doc?.sharedWith ?? []), shareForm.to] });
    log("berbagi dokumen dengan atasan", `${shareForm.docId} → ${shareForm.to}`, "Dokumen");
    toast(S.detToastShared.replace("{a}", shareForm.to));
    setShowShare(false);
    setShareForm({ docId: "", to: "" });
  };

  return (
    <div className="space-y-4">
      <style>{`@media print { #report-summary-${projectId}, #report-summary-${projectId} .print-expand { overflow: visible !important; max-height: none !important; } #report-summary-${projectId} .overflow-y-auto { overflow: visible !important; max-height: none !important; } .report-card, .doc-card { break-inside: avoid; page-break-inside: avoid; } table, thead, tbody, tr { break-inside: auto; page-break-inside: auto; } } .print-expand .overflow-y-auto { overflow: visible !important; max-height: none !important; }`}</style>
      <div id={`report-summary-${projectId}`}>
        <Card className="p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-semibold text-navy-900"><FileText className="h-4 w-4" /> {S.repTitle.replace("{a}", project?.vessel ?? projectId)}</h3>
              <p className="text-xs text-steel-500">{projectId} · {project?.type ?? "-"} · {project?.client ?? "-"} · {project?.manager ?? "-"} · {fmtRentang(project?.start, project?.end)}</p>
            </div>
            <div className="flex gap-2">
              <button className="btn-secondary text-xs" onClick={() => void busy.run("handleExportPDF", handleExportPDF)} disabled={busy.isBusy("handleExportPDF")}><FileText className="h-3.5 w-3.5" /> {S.repPdf}</button>
              <button className="btn-secondary text-xs" onClick={() => void busy.run("handleExportExcel", handleExportExcel)} disabled={busy.isBusy("handleExportExcel")}><FileDown className="h-3.5 w-3.5" /> {S.excelBtn}</button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <KpiCard label={S.repKpiBudget} value={fmtMiliar(Number(project?.actual || 0))} delta={S.repKpiBudgetDelta.replace("{a}", String(budgetPct)).replace("{b}", fmtMiliar(Number(project?.budget || 0)))} deltaDirection={budgetPct > 100 ? "down" : "up"} hint={S.repKpiCostHint} />
            <KpiCard label={S.progLabel} value={`${project?.progress ?? 0}%`} delta={S.repKpiWbs.replace("{a}", String(wbsDone)).replace("{b}", String(wbs.length))} deltaDirection="flat" hint={S.repKpiWbsHint} />
            <KpiCard label={S.boqKpiTotal} value={fmtRupiah(totalBoq)} delta={S.repKpiBoqOk.replace("{a}", fmtRupiah(approvedBoq))} deltaDirection="flat" hint={S.repKpiBoqHint.replace("{n}", String(boq.length))} />
            <KpiCard label={S.repKpiNcr} value={String(openNcr)} delta={S.repKpiInv.replace("{n}", String(unpaidInv))} deltaDirection={openNcr > 0 ? "down" : "flat"} hint={S.repKpiNcrHint.replace("{n}", String(ncrs.length))} />
          </div>
        </Card>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card className="p-4">
            <h4 className="mb-2 text-sm font-semibold text-navy-900">{S.repWbsTitle.replace("{a}", String(wbsDone)).replace("{b}", String(wbs.length))}</h4>
            <input className="input mb-2" value={wbsQ} onChange={(e) => setWbsQ(e.target.value)} placeholder={S.cardSearchPh} aria-label={S.cardSearchPh} />
            {wbs.length === 0 ? (
              <p className="text-xs text-steel-400">{S.repNoWbs}</p>
            ) : (
              <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                {wbs.filter((w) => !wbsQ.trim() || `${w.task ?? ""} ${w.progress ?? ""}`.toLowerCase().includes(wbsQ.trim().toLowerCase())).map((w) => (
                  <div key={w.task}>
                    <div className="flex justify-between text-xs"><span className="font-medium text-navy-900">{w.task}</span><span className="text-steel-500">{w.progress}%</span></div>
                    <ProgressBar value={Number(w.progress) || 0} className="mt-1" tone={Number(w.progress) >= 100 ? "green" : "navy"} />
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card className="p-4">
            <h4 className="mb-2 text-sm font-semibold text-navy-900">{S.repBoqTitle.replace("{n}", String(boq.length))}</h4>
            <input className="input mb-2" value={boqQ} onChange={(e) => setBoqQ(e.target.value)} placeholder={S.cardSearchPh} aria-label={S.cardSearchPh} />
            {boq.length === 0 ? (
              <p className="text-xs text-steel-400">{S.repNoBoq}</p>
            ) : (
              <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
                {boq.filter((b) => !boqQ.trim() || `${b.name ?? ""} ${b.id ?? ""} ${b.status ?? ""}`.toLowerCase().includes(boqQ.trim().toLowerCase())).map((b) => (
                  <div key={b.id} className="flex items-center justify-between text-sm">
                    <span className="text-steel-700">{b.name} <span className="text-xs text-steel-400">× {b.quantity} {b.unit}</span></span>
                    <span className="flex items-center gap-2"><span className="font-mono text-xs">{fmtRupiah(Number(b.totalPrice || 0))}</span><StatusBadge status={b.status} label={STATUS_BOQ_ID[b.status] ?? b.status} /></span>
                  </div>
                ))}
                <p className="pt-1 text-right text-xs font-semibold text-navy-900">{S.repBoqTotal.replace("{a}", fmtRupiah(totalBoq))}</p>
              </div>
            )}
          </Card>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="p-4">
            <h4 className="mb-2 text-sm font-semibold text-navy-900">{S.repInvTitle.replace("{n}", String(invoices.length))}</h4>
            <input className="input mb-2" value={invQ} onChange={(e) => setInvQ(e.target.value)} placeholder={S.cardSearchPh} aria-label={S.cardSearchPh} />
            {invoices.length === 0 ? <p className="text-xs text-steel-400">{S.repNoInv}</p> : <div className="max-h-64 overflow-y-auto pr-1">{invoices.filter((i) => !invQ.trim() || `${i.id ?? ""} ${i.status ?? ""}`.toLowerCase().includes(invQ.trim().toLowerCase())).map((i) => (
              <div key={i.id} className="flex items-center justify-between py-1 text-sm">
                <span className="font-mono text-navy-900">{i.id}</span>
                <span className="text-steel-600">{fmtMiliar(Number(i.amount || 0))}</span>
                <StatusBadge status={i.status} />
              </div>
            ))}</div>}
          </Card>
          <Card className="p-4">
            <h4 className="mb-2 text-sm font-semibold text-navy-900">{S.repNcrTitle}</h4>
            <p className="text-xs text-steel-500">{S.repNcrOpenLbl}<b>{openNcr}</b>{critNcr > 0 ? <> · <b className="text-rose-600">{S.repCritCount.replace("{n}", String(critNcr))}</b></> : null}{S.repWoLbl}<b>{wos.length}</b>{S.repDockLbl}<b>{slots.length}</b></p>
            <input className="input mb-2 mt-2" value={ncrWoQ} onChange={(e) => setNcrWoQ(e.target.value)} placeholder={S.cardSearchPh} aria-label={S.cardSearchPh} />
            <div className="mt-2 max-h-64 space-y-1 overflow-y-auto pr-1">
              {ncrs.filter((n) => !ncrWoQ.trim() || `${n.id ?? ""} ${n.status ?? ""}`.toLowerCase().includes(ncrWoQ.trim().toLowerCase())).map((n) => (
                <div key={n.id} className="flex items-center justify-between text-sm"><span className="font-mono text-navy-900">{n.id}</span><StatusBadge status={n.status} /></div>
              ))}
              {wos.filter((w) => !ncrWoQ.trim() || `${w.id ?? ""} ${w.sub ?? ""}`.toLowerCase().includes(ncrWoQ.trim().toLowerCase())).map((w) => (
                <div key={w.id} className="flex items-center justify-between text-sm"><span className="text-steel-600">{w.id} · {w.sub}</span><Badge tone="blue">{w.progress}%</Badge></div>
              ))}
              {(ncrs.length === 0 && wos.length === 0) && <p className="text-xs text-steel-400">{S.repNoNcrWo}</p>}
            </div>
          </Card>
          <Card className="p-4">
            <h4 className="mb-2 text-sm font-semibold text-navy-900">{S.repSvcTitle}</h4>
            <p className="text-xs text-steel-500">{S.repSvcCountA}<b>{svc.length}</b>{S.repSvcCountB}<b>{spare.length}</b></p>
            <div className="mt-2">
              <p className="text-xs text-steel-500">{S.repSpAkan}{spare.filter((s) => s.status === "Akan").length}{S.repSpSedang}{spare.filter((s) => s.status === "Sedang").length}{S.repSpSelesai}{spare.filter((s) => s.status === "Selesai").length}</p>
              <p className="mt-1 text-xs text-steel-500">{S.repSvcDone}{svc.filter((s) => s.status === "Done").length}{S.repSvcRun}{svc.filter((s) => s.status === "In Progress").length}{S.repSvcSched}{svc.filter((s) => s.status === "Scheduled").length}</p>
            </div>
            <h4 className="mb-1 mt-3 text-xs font-semibold text-steel-500">{S.repActivity}</h4>
            {activities.length === 0 ? <p className="text-xs text-steel-400">{S.repNoActivity}</p> : activities.map((a) => (
              <p key={a.id} className="py-0.5 text-xs text-steel-600"><b>{a.actor}</b> {a.action} <span className="font-mono">{a.target}</span></p>
            ))}
          </Card>
        </div>
      </div>

      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-navy-900">{S.repApprTitle.replace("{n}", String(docs.length))}</h3>
          <button className="btn-secondary text-xs" onClick={() => setShowShare(true)}><Send className="h-3.5 w-3.5" /> {S.repShareBtn}</button>
        </div>
        {docs.length === 0 ? (
          <EmptyState icon={<FileText className="h-6 w-6" />} title={S.repEmptyTitle} subtitle={S.repEmptySub} />
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
                  <StatusBadge status={d.approvalStatus === "Approved" ? "Selesai" : d.approvalStatus === "Submitted" ? "Sedang Berjalan" : "Draft"} />
                  {d.approvalStatus === "Submitted" && (
                    <div className="flex gap-1">
                      <button className="rounded bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700 hover:bg-green-200" onClick={() => submitReport(d.id, "approve")}><CheckCircle2 className="h-3 w-3 inline" /> {S.detApproveBtn}</button>
                      <button className="rounded bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700 hover:bg-rose-200" onClick={() => submitReport(d.id, "reject")}><XCircle className="h-3 w-3 inline" /> {S.detRejectBtn}</button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal open={showShare} onClose={() => setShowShare(false)} title={S.detShareModal}
        footer={<><button className="btn-secondary" onClick={() => setShowShare(false)}>{S.cancelBtn}</button><button className="btn-primary" onClick={() => void busy.run("submitShare", submitShare)} disabled={busy.isBusy("submitShare")}>{S.detSendBtn}</button></>}>
        <div className="space-y-3">
          <Field label={S.detDocField}>
            <select className="input" value={shareForm.docId} onChange={(e) => setShareForm({ ...shareForm, docId: e.target.value })}>
              <option value="">{S.detPickDocFull}</option>
              {docs.map((d: any) => <option key={d.id} value={d.id}>{d.title}</option>)}
            </select>
          </Field>
          <Field label={S.detShareTo}><input className="input" value={shareForm.to} onChange={(e) => setShareForm({ ...shareForm, to: e.target.value })} placeholder={S.repShareToPh} /></Field>
        </div>
      </Modal>
    </div>
  );
}
