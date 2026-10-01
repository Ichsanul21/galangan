import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Send } from "lucide-react";
import { Card, CardHeader, PageHeader, StatusBadge, Badge, Modal, Field, FormGrid, EmptyState, toast,
  NumInput,
  AsyncButton,
} from "../../components/ui";
import { useStore } from "../../data/store";
import type { StoreItem } from "../../data/store";
import { fmtRupiah, fmtTanggal, todayISO } from "../../utils/format";
import { sameName } from "../../utils/names";
import { exportExcel } from "../../utils/export";
import { SB_KOP } from "../../utils/sb";
import { useDraftState } from "../../utils/draft";
import { useT } from "../../i18n/LanguageContext";
import { n_crm } from "../../i18n/n_crm";

const FLOW = ["Lead", "Penawaran", "Negosiasi", "Menang"];
const num = (v: unknown): number => Number(v) || 0;

const HO_ITEMS = ["Dokumen kontrak tersedia", "Scope pekerjaan jelas", "Jadwal disepakati", "PIC client ditetapkan"];
const PREFIX_TIPE: Record<string, string> = { "New Build": "NB", Repair: "RP", Retrofit: "RF" };

interface QLine {
  desc: string;
  qty: string;
  price: string;
}

function initialLines(q: StoreItem): QLine[] {
  if (Array.isArray(q.lines) && q.lines.length > 0) {
    return q.lines.map((l: StoreItem) => ({
      desc: String(l.desc ?? ""),
      qty: String(l.qty ?? 1),
      price: String(l.price ?? l.amount ?? 0),
    }));
  }
  return [{ desc: String(q.vessel ?? "Pekerjaan"), qty: "1", price: String(q.value ?? 0) }];
}

export default function QuotationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, add, update, log } = useStore();
  const { locale } = useT();
  const S = n_crm[locale];

  const quotation = (data.quotations ?? []).find((q) => q.id === id);
  const seedLines = useMemo(() => (quotation ? initialLines(quotation) : []), [quotation?.id]);
  const [lines, setLines] = useDraftState<QLine[] | null>(`isms.draft.quotation.${quotation?.id ?? "new"}.lines`, null);
  const [note, setNote] = useState("");
  const [sendOpen, setSendOpen] = useState(false);
  const [sendEmail, setSendEmail] = useState("");
  const [sendMsg, setSendMsg] = useState("");
  const [convertOpen, setConvertOpen] = useState(false);
  const [hoChecks, setHoChecks] = useState<boolean[]>([false, false, false, false]);
  const [hoBy, setHoBy] = useState("Tim Commercial");
  const [convManager, setConvManager] = useState("");
  const [convStart, setConvStart] = useState(todayISO());
  const [convEnd, setConvEnd] = useState("");
  const [commForm, setCommForm] = useState({ channel: "Email", date: todayISO(), summary: "", by: "" });

  const activeLines = lines ?? seedLines;
  const total = activeLines.reduce((s, l) => s + num(l.qty) * num(l.price), 0);
  const comms = (data.communications ?? []).filter((c) => c.quotationId === id);
  const contract = (data.contracts ?? []).find((k) => k.quotationId === id);

  if (!quotation) {
    return (
      <div>
        <PageHeader title={S.qdNotFoundTitle} subtitle={S.qdNotFoundSub} actions={<button className="btn-secondary" onClick={() => navigate("/crm")}><ArrowLeft className="h-4 w-4" /> {S.backBtn}</button>} />
        <EmptyState title={S.qdMissingTitle} subtitle={S.qdMissingSub} />
      </div>
    );
  }

  const version = num(quotation.version) || 1;
  const riwayat: StoreItem[] = Array.isArray(quotation.riwayat) ? quotation.riwayat : [];
  const locked = quotation.stage === "Terkonversi";
  const pmCandidates = (data.employees ?? [])
    .filter((e) => String(e.dept) === "Proyek" || String(e.role ?? "").includes("Manager"))
    .map((e) => String(e.name));
  const picName = String(quotation.pic ?? quotation.manager ?? "");
  const pmNames = picName && !pmCandidates.includes(picName) ? [picName, ...pmCandidates] : pmCandidates;

  const setLine = (idx: number, k: keyof QLine, v: string) => {
    const base = [...activeLines];
    base[idx] = { ...base[idx], [k]: v };
    setLines(base);
  };

  const saveRevisi = async () => {
    try {
    const valid = activeLines.filter((l) => l.desc.trim() && num(l.qty) * num(l.price) > 0);
    if (valid.length === 0) { toast(S.tMinOneRow, "info"); return; }
    const sum = valid.reduce((s, l) => s + num(l.qty) * num(l.price), 0);
    const nextVersion = version + 1;
    await update("quotations", quotation.id, {
      lines: valid.map((l) => ({ desc: l.desc.trim(), qty: num(l.qty), price: num(l.price), amount: num(l.qty) * num(l.price) })),
      value: sum,
      version: nextVersion,
      riwayat: [...riwayat, { v: nextVersion, date: todayISO(), note: note.trim() || "Revisi lines", total: sum }],
    });
    log(`merevisi penawaran ke v${nextVersion}`, quotation.id, "CRM");
    toast(S.tRevised.replace("{a}", quotation.id).replace("{b}", String(nextVersion)));
    setLines(null);
    setNote("");
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const move = async (dir: 1 | -1) => {
    try {
    const idx = FLOW.indexOf(String(quotation.stage));
    if (idx < 0) return;
    const next = FLOW[idx + dir];
    if (!next) return;
    await update("quotations", quotation.id, { stage: next });
    log(`memindahkan quotation ke ${next}`, quotation.id, "CRM");
    toast(S.movedTo.replace("{a}", quotation.id).replace("{b}", next));
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const markTerminal = async (stage: "Batal" | "Kalah") => {
    try {
    if (FLOW.indexOf(String(quotation.stage)) < 0 && quotation.stage !== "Menang") return;
    await update("quotations", quotation.id, { stage });
    log(`memindahkan quotation ke ${stage}`, quotation.id, "CRM");
    toast(S.markedAs.replace("{a}", quotation.id).replace("{b}", stage), "info");
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const nextProjectCode = (type: string, start: string): string => {
    const prefix = PREFIX_TIPE[type] ?? "PRJ";
    const year = start.match(/^(\d{4})/)?.[1] ?? String(new Date().getFullYear());
    let max = 0;
    for (const p of data.projects) {
      const m = String(p.id).match(new RegExp(`^${prefix}-(\\d{4})-(\\d+)$`));
      if (m && m[1] === year) max = Math.max(max, Number(m[2]));
    }
    return `${prefix}-${year}-${String(max + 1).padStart(3, "0")}`;
  };

  const openConvert = () => {
    setHoChecks([false, false, false, false]);
    setHoBy("Tim Commercial");
    setConvManager(String(quotation.pic ?? quotation.manager ?? ""));
    setConvStart(todayISO());
    setConvEnd("");
    setConvertOpen(true);
  };

  const confirmConvert = async () => {
    if (quotation.stage !== "Menang") {
      toast(S.tOnlyWonConvert, "info");
      setConvertOpen(false);
      return;
    }
    if (
      quotation.stage === "Terkonversi" ||
      data.projects.some((p) => String(p.quotationId ?? "") === quotation.id) ||
      data.projects.some((p) => String(p.vessel) === String(quotation.vessel) && sameName(p.client, quotation.client))
    ) {
      toast(S.tAlreadyConverted, "info");
      setConvertOpen(false);
      return;
    }
    if (hoChecks.some((c) => !c)) { toast(S.hoIncomplete, "info"); return; }
    if (!hoBy.trim()) { toast(S.handoverByRequired, "info"); return; }
    if (num(quotation.value) <= 0) { toast(S.tQuoteValueZero, "info"); return; }
    if (!convManager.trim() || convManager.trim() === "Belum ditentukan") { toast(S.tPickPm, "info"); return; }
    if (!convStart || !convEnd) { toast(S.tPlanDatesRequired, "info"); return; }
    if (convEnd < convStart) { toast(S.tEndBeforeStart, "info"); return; }
    const client = (data.clients ?? []).find((c) => sameName(c.name, quotation.client));
    const branch = String(client?.branch ?? quotation.branch ?? "Samarinda");
    const code = nextProjectCode(String(quotation.type ?? "New Build"), convStart);
    const qid = quotation.id;
    try {
      const created = await add("projects", {
        id: code,
        vessel: quotation.vessel, type: quotation.type, client: quotation.client, status: "Dalam Proses",
        tahap: "Kontrak",
        tahapLog: [{ from: "-", to: "Kontrak", date: todayISO(), by: hoBy.trim(), reason: `Konversi ${quotation.id}` }],
        branch, start: convStart, end: convEnd, progress: 0,
        budget: num(quotation.value), actual: 0, manager: convManager.trim(), scope: [quotation.type],
        quotationId: quotation.id,
        handover: { date: todayISO(), by: hoBy.trim(), items: [...HO_ITEMS] },
      }, { action: "mengkonversi quotation", target: `${quotation.id} → proyek`, module: "CRM" });
      await update("quotations", quotation.id, { stage: "Terkonversi" });
      log(`serah terima ke PM oleh ${hoBy.trim()} (${HO_ITEMS.length} item)`, `${quotation.id} → ${created.id}`, "CRM");
      toast(S.becameProject.replace("{a}", quotation.id).replace("{b}", created.id));
      setConvertOpen(false);
    } catch {
      toast(S.tConvertStuckQd.replace("{n}", qid), "info");
    }
  };

  const openSend = () => {
    setSendEmail("");
    setSendMsg(S.sendBodyQd.replace("{a}", String(quotation.client)).replace("{b}", quotation.id).replace("{c}", String(version)).replace("{d}", String(quotation.vessel)).replace("{e}", fmtRupiah(num(quotation.value))));
    setSendOpen(true);
  };

  const confirmSend = async () => {
    try {
    if (!sendEmail.includes("@")) { toast(S.emailInvalid, "info"); return; }
    await update("quotations", quotation.id, { statusKirim: "Terkirim", sentAt: todayISO(), sentTo: sendEmail.trim() });
    log(`mengirim penawaran ke ${sendEmail.trim()}`, quotation.id, "CRM");
    toast(S.tSentShort.replace("{n}", quotation.id));
    setSendOpen(false);
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const saveComm = async () => {
    try {
    if (!commForm.date) { toast(S.dateRequired, "info"); return; }
    if (!commForm.summary.trim()) { toast(S.summaryRequired, "info"); return; }
    const created = await add("communications", {
      quotationId: quotation.id,
      channel: commForm.channel,
      date: commForm.date,
      summary: commForm.summary.trim(),
      by: commForm.by.trim() || "Tim Commercial",
    }, { action: "mencatat komunikasi", target: quotation.id, module: "CRM" });
    toast(S.commLogged.replace("{n}", created.id));
    setCommForm({ channel: "Email", date: todayISO(), summary: "", by: "" });
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const cetakKop = () => {
    const client = (data.clients ?? []).find((c) => sameName(c.name, quotation.client));
    const cabang = String(client?.branch ?? quotation.branch ?? "Samarinda");
    const terms = String(client?.paymentTerms ?? quotation.paymentTerms ?? "NET 30");
    const rows: unknown[][] = [
      [SB_KOP.name],
      [SB_KOP.line1],
      [SB_KOP.hq],
      [`${SB_KOP.addr1} · HP ${SB_KOP.hp}`],
      [`Cabang ${cabang} · ${fmtTanggal(todayISO())}`],
      [`Penawaran ${quotation.id} v${version} · ${String(quotation.client)} · ${String(quotation.vessel)}`],
      [],
      ["No", "Deskripsi", "Qty", "Harga (Rp)", "Jumlah (Rp)"],
      ...activeLines.map((l, i) => [i + 1, l.desc || "-", num(l.qty), num(l.price), num(l.qty) * num(l.price)]),
      ["", "", "", "Total", total],
      [],
      [`Syarat pembayaran: ${terms}`],
    ];
    void exportExcel(rows, `Kop-${quotation.id}-v${version}`, "Kop Penawaran").catch(() => toast(S.saveFail, "info"));
    toast(S.tKopExported.replace("{n}", quotation.id));
  };

  return (
    <div>
      <PageHeader
        title={`${quotation.id} · ${String(quotation.vessel)}`}
        subtitle={`${String(quotation.client)} · ${String(quotation.type)} · ${fmtTanggal(String(quotation.date ?? ""))}`}
        actions={
          <>
            <button className="btn-secondary" onClick={() => navigate("/crm")}><ArrowLeft className="h-4 w-4" /> {S.backBtn}</button>
            <button className="btn-secondary" onClick={cetakKop}>{S.printKopBtn}</button>
            <button className="btn-primary" onClick={openSend}><Send className="h-4 w-4" /> {S.sendBtn}</button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <CardHeader title={S.headerQuoteTitle} />
          <div className="space-y-1.5 px-5 pb-5 text-sm">
            <div className="flex justify-between"><span className="text-steel-500">{S.clientLabel}</span><span className="font-semibold text-navy-900">{String(quotation.client)}</span></div>
            <div className="flex justify-between"><span className="text-steel-500">{S.vesselJobLabel}</span><span className="font-semibold text-navy-900">{String(quotation.vessel)}</span></div>
            <div className="flex justify-between"><span className="text-steel-500">{S.sortValue}</span><span className="font-bold text-navy-900">{fmtRupiah(num(quotation.value))}</span></div>
            <div className="flex justify-between"><span className="text-steel-500">{S.stageLabel}</span><StatusBadge status={String(quotation.stage)} /></div>
            <div className="flex justify-between"><span className="text-steel-500">{S.versionLabel}</span><Badge tone="navy">v{version}</Badge></div>
            {quotation.statusKirim === "Terkirim" && (
              <p className="text-xs text-teal-600">{S.sentInfo.replace("{a}", fmtTanggal(String(quotation.sentAt ?? ""))).replace("{b}", String(quotation.sentTo ?? ""))}</p>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5 px-5 pb-5">
            <button className="btn-secondary text-xs" disabled={locked || FLOW.indexOf(String(quotation.stage)) <= 0} onClick={() => move(-1)}>{S.backStepBtn}</button>
            <button className="btn-secondary text-xs" disabled={locked || FLOW.indexOf(String(quotation.stage)) < 0 || FLOW.indexOf(String(quotation.stage)) >= FLOW.length - 1} onClick={() => move(1)}>{S.advanceBtn}</button>
            <button className="btn-secondary text-xs" disabled={locked} onClick={() => markTerminal("Batal")}>{S.cancelBtn}</button>
            <button className="btn-secondary text-xs" disabled={locked} onClick={() => markTerminal("Kalah")}>{S.loseBtn}</button>
            <button className="btn-primary text-xs" disabled={locked || String(quotation.stage) !== "Menang"} onClick={openConvert}>{S.convertBtn}</button>
          </div>
        </Card>

        <Card className="p-5 lg:col-span-2">
          <CardHeader title={S.linesTitle.replace("{n}", fmtRupiah(total))} subtitle={S.linesSub} />
          <div className="space-y-2 px-5 pb-2">
            {activeLines.map((l, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 rounded-xl bg-surface p-2">
                <div className="col-span-12 sm:col-span-6"><Field label={S.descLabel}><input className="input" value={l.desc} onChange={(e) => setLine(idx, "desc", e.target.value)} /></Field></div>
                <div className="col-span-5 sm:col-span-2"><Field label={S.qtyLabel}><NumInput min={0} className="input" value={l.qty} onChange={(e) => setLine(idx, "qty", e.target.value)} /></Field></div>
                <div className="col-span-7 sm:col-span-4"><Field label={S.priceLabel}><NumInput min={0} className="input" value={l.price} onChange={(e) => setLine(idx, "price", e.target.value)} /></Field></div>
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <button className="btn-secondary text-xs" onClick={() => setLines([...activeLines, { desc: "", qty: "1", price: "" }])}>{S.addRowBtn}</button>
              {activeLines.length > 1 && (
                <button className="btn-secondary text-xs" onClick={() => setLines(activeLines.slice(0, -1))}>{S.delRowBtn}</button>
              )}
            </div>
            <FormGrid>
              <Field label={S.revNoteLabel}><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={S.revNotePh} /></Field>
              <Field label={S.actionLabel}>
                <button className="btn-primary w-full justify-center" onClick={saveRevisi}>{S.saveRevisionBtn.replace("{n}", String(version + 1))}</button>
              </Field>
            </FormGrid>
          </div>
          <div className="px-5 pb-5">
            <p className="label">{S.versionHistory}</p>
            {riwayat.length === 0 ? (
              <p className="text-xs text-steel-400">{S.versionInit.replace("{n}", String(version))}</p>
            ) : (
              <div className="space-y-1.5">
                {riwayat.map((r, i) => (
                  <div key={i} className="flex gap-2 text-xs text-steel-600">
                    <Badge tone="gray">v{String(r.v)}</Badge>
                    <span>{fmtTanggal(String(r.date ?? ""))}</span>
                    <span className="truncate">{String(r.note ?? "")}</span>
                    <span className="ml-auto font-semibold text-navy-900">{fmtRupiah(num(r.total))}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <CardHeader title={S.commRelatedTitle} subtitle={S.commRelatedSub} />
          <div className="space-y-2 px-5 pb-2">
            {comms.length === 0 && <EmptyState title={S.emptyCommTitle} subtitle={S.emptyCommSubQuote} />}
            {comms.map((m) => (
              <div key={m.id} className="rounded-xl bg-surface p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="navy">{String(m.channel)}</Badge>
                  <span className="text-xs text-steel-500">{fmtTanggal(String(m.date ?? ""))} · {String(m.by ?? "")}</span>
                </div>
                <p className="mt-1 text-steel-700">{String(m.summary)}</p>
              </div>
            ))}
          </div>
          <div className="space-y-3 px-5 pb-5">
            <FormGrid>
              <Field label={S.channelLabel}>
                <select className="input" value={commForm.channel} onChange={(e) => setCommForm({ ...commForm, channel: e.target.value })}>
                  {["Email", "Telepon", "Meeting", "WhatsApp", "Kunjungan"].map((c) => <option key={c}>{c}</option>)}
                </select>
              </Field>
              <Field label={S.dateLabel}><input type="date" className="input" value={commForm.date} onChange={(e) => setCommForm({ ...commForm, date: e.target.value })} /></Field>
            </FormGrid>
            <Field label={S.summaryLabel}><textarea className="input" rows={3} value={commForm.summary} onChange={(e) => setCommForm({ ...commForm, summary: e.target.value })} /></Field>
            <Field label={S.byLabel}><input className="input" value={commForm.by} onChange={(e) => setCommForm({ ...commForm, by: e.target.value })} placeholder={S.byPh} /></Field>
            <button className="btn-primary w-full justify-center" onClick={saveComm}>{S.addCommBtn}</button>
          </div>
        </Card>

        <Card className="p-5">
          <CardHeader title={S.contractTitle} subtitle={S.contractSub} />
          <div className="px-5 pb-5 text-sm">
            {!contract ? (
              <p className="text-steel-500">{S.emptyContractQd}</p>
            ) : (
              <div className="rounded-xl bg-surface p-3">
                <p className="font-mono text-xs font-bold text-navy-900">{contract.id}</p>
                <p className="mt-1 text-steel-600">{S.contractValueSign.replace("{a}", fmtRupiah(num(contract.value))).replace("{b}", fmtTanggal(String(contract.signedAt ?? "")))}</p>
                <p className="mt-1"><StatusBadge status={String(contract.status ?? "Aktif")} /></p>
                {contract.projectId && <Link to={`/proyek/${contract.projectId}`} className="mt-2 inline-block text-xs font-semibold text-ocean-600">{S.openProjectLink.replace("{n}", String(contract.projectId))}</Link>}
              </div>
            )}
          </div>
        </Card>
      </div>

      <Modal open={sendOpen} onClose={() => setSendOpen(false)} title={S.sendTitle.replace("{n}", quotation.id)} subtitle={S.sendPreviewSubQd} wide
        footer={<><button className="btn-secondary" onClick={() => setSendOpen(false)}>{S.cancelBtn}</button><button className="btn-primary" onClick={confirmSend}><Send className="h-4 w-4" /> {S.sendBtn}</button></>}>
        <div className="space-y-3">
          <div className="rounded-xl bg-surface p-4 text-sm">
            <p className="font-semibold text-navy-900">{String(quotation.vessel)} · v{version}</p>
            <p className="text-xs text-steel-500">{String(quotation.client)} · {fmtRupiah(num(quotation.value))} · {fmtTanggal(String(quotation.date ?? ""))}</p>
          </div>
          <Field label={S.emailToLabel}><input type="email" className="input" value={sendEmail} onChange={(e) => setSendEmail(e.target.value)} /></Field>
          <Field label={S.messageLabel}><textarea className="input" rows={5} value={sendMsg} onChange={(e) => setSendMsg(e.target.value)} /></Field>
        </div>
      </Modal>

      <Modal
        open={convertOpen}
        onClose={() => setConvertOpen(false)}
        title={S.convertTitle.replace("{n}", quotation.id)}
        subtitle={S.convertSubQd}
        footer={<><button className="btn-secondary" onClick={() => setConvertOpen(false)}>{S.cancelBtn}</button><AsyncButton className="btn-primary" onAction={confirmConvert}>{S.convertConfirmQd}</AsyncButton></>}
      >
        <div className="space-y-3">
          <p className="text-sm text-steel-600">{S.convertBodyQd}</p>
          <Field label={S.handoverByLabel}><input className="input" value={hoBy} onChange={(e) => setHoBy(e.target.value)} placeholder={S.handoverByPh} /></Field>
          <div className="space-y-2">
            {HO_ITEMS.map((item, i) => (
              <label key={item} className="flex items-start gap-2 rounded-xl bg-surface p-3 text-sm text-steel-700">
                <input type="checkbox" className="mt-1 h-4 w-4" checked={hoChecks[i] ?? false} onChange={(e) => setHoChecks((prev) => prev.map((c, idx) => (idx === i ? e.target.checked : c)))} />
                {item}
              </label>
            ))}
          </div>
          <FormGrid>
            <Field label={S.pmLabel}>
              <select className="input" value={convManager} onChange={(e) => setConvManager(e.target.value)}>
                <option value="">{S.pickPmOpt}</option>
                {pmNames.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </Field>
            <Field label={S.startPlanLabel}><input type="date" className="input" value={convStart} onChange={(e) => setConvStart(e.target.value)} /></Field>
          </FormGrid>
          <Field label={S.endPlanLabel}><input type="date" className="input" value={convEnd} onChange={(e) => setConvEnd(e.target.value)} /></Field>
        </div>
      </Modal>
    </div>
  );
}
