import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Send, Users2, Star, Handshake, ArrowRight } from "lucide-react";
import { Card, CardHeader, PageHeader, Badge, KpiCard, Tabs, Donut, Modal, Field, FormGrid, StatusBadge, EmptyState, SortTh, toggleSort, sortRows, toast } from "../../components/ui";
import ClientModal from "../../components/ClientModal";
import type { SortState } from "../../components/ui";
import { useStore } from "../../data/store";
import type { StoreItem } from "../../data/store";
import { fmtMiliar, fmtRupiah, fmtTanggal, todayISO } from "../../utils/format";
import { sameName } from "../../utils/names";
import { AlertBannerView, notifRowId, useModuleAlert } from "../../components/AlertBanner";
import { exportExcel } from "../../utils/export";
import { useDraftState } from "../../utils/draft";
import { clientTrend, pipelineTrend, winRateTrend, wonTrend } from "../../data";

const FLOW = ["Lead", "Penawaran", "Negosiasi", "Menang"];
const TERMINAL = ["Terkonversi", "Batal", "Kalah"];
const STAGES = [...FLOW, ...TERMINAL];
const KLASIFIKASI = ["VIP", "Regular", "New", "Inactive"] as const;
const REQ_KIND = ["Repair Request", "Technical Assessment"] as const;

const STAGE_COLORS: Record<string, string> = {
  Lead: "#2e9ad4",
  Penawaran: "#f59e0b",
  Negosiasi: "#8b5cf6",
  Menang: "#22c55e",
  Terkonversi: "#0d9488",
  Batal: "#94a3b8",
  Kalah: "#f43f5e",
};

const STAGE_TONE: Record<string, "gray" | "amber" | "violet" | "green" | "teal" | "red"> = {
  Lead: "gray",
  Penawaran: "amber",
  Negosiasi: "violet",
  Menang: "green",
  Terkonversi: "teal",
  Batal: "gray",
  Kalah: "red",
};

const isTerminal = (stage: string) => TERMINAL.includes(stage);
const num = (v: unknown): number => Number(v) || 0;

const PROB: Record<string, number> = { Lead: 0.1, Penawaran: 0.3, Negosiasi: 0.6, Menang: 1 };
const HO_ITEMS = ["Dokumen kontrak tersedia", "Scope pekerjaan jelas", "Jadwal disepakati", "PIC client ditetapkan"];

function umurHari(dateStr: string | null | undefined): number | null {
  if (!dateStr || dateStr === "-") return null;
  const t = new Date(`${String(dateStr)}T00:00:00`).getTime();
  if (Number.isNaN(t)) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.max(0, Math.round((today - t) / 86400000));
}

export default function CRM() {
  const { data, add, update, log, branch, inBranch } = useStore();
  const modAlert = useModuleAlert("crm");
  const [tab, setTab] = useState("Pipeline");
  const [sort, setSort] = useState<SortState>({ key: null, dir: "asc" });
  const [klasFilter, setKlasFilter] = useState("Semua");
  const [oldOnly, setOldOnly] = useState(false);
  const [hoChecks, setHoChecks] = useDraftState<boolean[]>("isms.draft.crm.hoChecks", [false, false, false, false]);
  const [hoBy, setHoBy] = useDraftState("isms.draft.crm.hoBy", "Tim Commercial");

  const [showQ, setShowQ] = useState(false);
  const [qForm, setQForm] = useState({ client: "", vessel: "", type: "New Build", value: "", stage: "Lead", date: todayISO() });
  const [showClient, setShowClient] = useState(false);
  const [convertTarget, setConvertTarget] = useState<StoreItem | null>(null);
  const [sendTarget, setSendTarget] = useState<StoreItem | null>(null);
  const [sendEmail, setSendEmail] = useState("");
  const [sendMsg, setSendMsg] = useState("");
  const [commForm, setCommForm] = useState({ quotationId: "", channel: "Email", date: todayISO(), summary: "", by: "" });
  const [contractForm, setContractForm] = useState({ quotationId: "", value: "", signedAt: todayISO(), projectId: "" });
  const [surveyForm, setSurveyForm] = useState({ clientId: "", rating: "5" });
  const [showReq, setShowReq] = useState(false);
  const [reqForm, setReqForm] = useState({ vessel: "", client: "", kind: "Repair Request", scope: "", value: "", date: todayISO() });
  const [poForm, setPoForm] = useState({ contractId: "", projectId: "", no: "", amount: "", date: todayISO() });

  const clientByName = useMemo(() => {
    const m: Record<string, StoreItem> = {};
    for (const c of data.clients ?? []) m[String(c.name)] = c;
    return m;
  }, [data.clients]);

  const visibleClients = useMemo(() => {
    const base = inBranch(data.clients ?? []);
    if (klasFilter === "Semua") return base;
    return base.filter((c) => String(c.klasifikasi ?? "Regular") === klasFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.clients, klasFilter, branch]);

  const quotations = useMemo(() => {
    const all = data.quotations ?? [];
    if (branch === "SEMUA") return all;
    return all.filter((q) => {
      const c = clientByName[String(q.client ?? "")];
      if (!c || !c.branch) return true;
      return String(c.branch) === branch;
    });
  }, [data.quotations, branch, clientByName]);

  const clients = data.clients ?? [];
  const communications = data.communications ?? [];
  const contracts = data.contracts ?? [];

  const activeQuotes = quotations.filter((q) => !isTerminal(String(q.stage)));
  const pipelineTotal = activeQuotes.reduce((s, q) => s + num(q.value), 0);
  const wonQuotes = quotations.filter((q) => q.stage === "Menang" || q.stage === "Terkonversi");
  const wonValue = wonQuotes.reduce((s, q) => s + num(q.value), 0);
  const totalQuotes = quotations.length;
  const winRate = totalQuotes > 0 ? Math.round((wonQuotes.length / totalQuotes) * 100) : 0;
  const totalFleet = clients.reduce((s, c) => s + num(c.fleet), 0);
  const stageDist = STAGES.map((s) => ({
    name: s,
    value: quotations.filter((q) => q.stage === s).length,
    color: STAGE_COLORS[s] ?? "#94a3b8",
  }));

  const surveyAvg = (c: StoreItem): number => {
    const arr = Array.isArray(c.survei) ? c.survei.map(num) : [];
    if (arr.length === 0) return 0;
    return arr.reduce((s, v) => s + v, 0) / arr.length;
  };
  const allSurveys = clients.flatMap((c) => (Array.isArray(c.survei) ? c.survei.map(num) : []));
  const globalSatisfaction = allSurveys.length > 0 ? allSurveys.reduce((s, v) => s + v, 0) / allSurveys.length : 0;

  const advance = async (q: StoreItem) => {
    const idx = FLOW.indexOf(String(q.stage));
    if (idx < 0 || idx >= FLOW.length - 1) return;
    const next = FLOW[idx + 1];
    await update("quotations", q.id, { stage: next });
    log(`memajukan quotation ke ${next}`, q.id, "CRM");
    toast(`${q.id} naik ke tahap ${next}`);
  };

  const markTerminal = async (q: StoreItem, stage: "Batal" | "Kalah") => {
    if (isTerminal(String(q.stage))) return;
    await update("quotations", q.id, { stage });
    log(`memindahkan quotation ke ${stage}`, q.id, "CRM");
    toast(`${q.id} ditandai ${stage}`, "info");
  };

  const confirmConvert = async () => {
    const q = convertTarget;
    if (!q) return;
    if (q.stage === "Terkonversi" || data.projects.some((p) => p.vessel === q.vessel)) {
      toast("Konversi ditolak: quotation sudah terkonversi atau proyek kapalnya sudah ada", "info");
      setConvertTarget(null);
      return;
    }
    if (hoChecks.some((c) => !c)) { toast("Lengkapi semua checklist serah terima ke PM", "info"); return; }
    if (!hoBy.trim()) { toast("Nama penyerah wajib diisi", "info"); return; }
    try {
      const created = await add("projects", {
        vessel: q.vessel, type: q.type, client: q.client, status: "Dalam Proses",
        branch: "Samarinda", start: todayISO(), end: "-", progress: 0,
        budget: num(q.value), actual: 0, manager: "Belum ditentukan", scope: [q.type],
        quotationId: q.id,
        handover: { date: todayISO(), by: hoBy.trim(), items: [...HO_ITEMS] },
      }, { action: "mengkonversi quotation", target: `${q.id} → proyek`, module: "CRM" });
      await update("quotations", q.id, { stage: "Terkonversi" });
      log(`serah terima ke PM oleh ${hoBy.trim()} (${HO_ITEMS.length} item)`, `${q.id} → ${created.id}`, "CRM");
      toast(`${q.id} menjadi proyek ${created.id}`);
      setConvertTarget(null);
    } catch (e) {
      toast(`Konversi gagal di tengah jalan — periksa daftar proyek & quotation ${q.id}`, "info");
    }
  };

  const openSend = (q: StoreItem) => {
    setSendTarget(q);
    setSendEmail("");
    setSendMsg(`Yth. ${q.client},\n\nTerlampir penawaran ${q.id} untuk ${q.vessel} senilai ${fmtMiliar(num(q.value))}. Mohon konfirmasi ketersediaan jadwal docking.\n\nHormat kami,\nTim Commercial`);
  };

  const confirmSend = async () => {
    if (!sendTarget) return;
    if (!sendEmail.includes("@")) { toast("Email tujuan tidak valid", "info"); return; }
    await update("quotations", sendTarget.id, { statusKirim: "Terkirim", sentAt: todayISO(), sentTo: sendEmail.trim() });
    log(`mengirim penawaran ke ${sendEmail.trim()}`, sendTarget.id, "CRM");
    toast(`${sendTarget.id} terkirim ke ${sendEmail.trim()}`);
    setSendTarget(null);
  };

  const saveQuotation = async () => {
    if (!qForm.client || !qForm.vessel.trim()) { toast("Klien & kapal wajib diisi", "info"); return; }
    if (!qForm.date) { toast("Tanggal penawaran wajib diisi", "info"); return; }
    if (num(qForm.value) <= 0) { toast("Nilai penawaran harus lebih dari 0", "info"); return; }
    const created = await add("quotations", {
      client: qForm.client, vessel: qForm.vessel.trim(), type: qForm.type,
      value: num(qForm.value), stage: qForm.stage, date: qForm.date, version: 1, riwayat: [],
    }, { action: "membuat penawaran", module: "CRM" });
    toast(`Penawaran ${created.id} dibuat`);
    setShowQ(false);
    setQForm({ client: "", vessel: "", type: "New Build", value: "", stage: "Lead", date: todayISO() });
  };

  const saveComm = async () => {
    if (!commForm.quotationId) { toast("Pilih quotation dulu", "info"); return; }
    if (!commForm.date) { toast("Tanggal wajib diisi", "info"); return; }
    if (!commForm.summary.trim()) { toast("Ringkasan wajib diisi", "info"); return; }
    const created = await add("communications", {
      quotationId: commForm.quotationId,
      channel: commForm.channel,
      date: commForm.date,
      summary: commForm.summary.trim(),
      by: commForm.by.trim() || "Tim Commercial",
    }, { action: "mencatat komunikasi", target: commForm.quotationId, module: "CRM" });
    toast(`Komunikasi ${created.id} dicatat`);
    setCommForm({ quotationId: "", channel: "Email", date: todayISO(), summary: "", by: "" });
  };

  const saveContract = async () => {
    const q = quotations.find((x) => x.id === contractForm.quotationId);
    if (!q) { toast("Pilih quotation Menang / Terkonversi", "info"); return; }
    if (q.stage !== "Menang" && q.stage !== "Terkonversi") { toast("Hanya quotation Menang / Terkonversi", "info"); return; }
    if (contracts.some((c) => c.quotationId === q.id)) { toast("Quotation ini sudah punya kontrak", "info"); return; }
    if (!contractForm.signedAt) { toast("Tanggal sign wajib diisi", "info"); return; }
    const created = await add("contracts", {
      quotationId: q.id,
      client: q.client,
      value: num(contractForm.value) || num(q.value),
      signedAt: contractForm.signedAt,
      status: "Aktif",
      ...(contractForm.projectId ? { projectId: contractForm.projectId } : {}),
    }, { action: "membuat kontrak", target: q.id, module: "CRM" });
    toast(`Kontrak ${created.id} dibuat`);
    setContractForm({ quotationId: "", value: "", signedAt: todayISO(), projectId: "" });
  };

  const saveSurvey = async () => {
    if (!surveyForm.clientId) { toast("Pilih klien dulu", "info"); return; }
    const r = num(surveyForm.rating);
    if (r < 1 || r > 5) { toast("Rating 1–5", "info"); return; }
    const c = clients.find((x) => x.id === surveyForm.clientId);
    if (!c) return;
    const next = [...(Array.isArray(c.survei) ? c.survei : []), r];
    await update("clients", c.id, { survei: next });
    log("mencatat survei kepuasan", `${c.name} rating ${r}`, "CRM");
    toast(`Survei ${c.name} tersimpan`);
    setSurveyForm({ clientId: "", rating: "5" });
  };

  const eligibleQuotations = quotations.filter((q) => q.stage === "Menang" || q.stage === "Terkonversi");

  // E6 intake: requests + client POs.
  const requests = data.requests ?? [];
  const clientPos = data.clientPos ?? [];

  const nextReqId = (dateISO: string): string => {
    const year = (dateISO || todayISO()).slice(0, 4);
    const prefix = `REQ-${year}-`;
    let max = 0;
    for (const r of requests) {
      const m = String(r.id ?? "").match(new RegExp(`^REQ-${year}-(\\d+)$`));
      if (m) max = Math.max(max, Number(m[1]) || 0);
    }
    return `${prefix}${String(max + 1).padStart(3, "0")}`;
  };

  const saveRequest = async () => {
    if (!reqForm.client) { toast("Klien wajib dipilih", "info"); return; }
    if (!reqForm.vessel.trim()) { toast("Nama kapal wajib diisi", "info"); return; }
    if (!reqForm.scope.trim()) { toast("Scope pekerjaan wajib diisi", "info"); return; }
    if (!reqForm.date) { toast("Tanggal wajib diisi", "info"); return; }
    const created = await add("requests", {
      id: nextReqId(reqForm.date), vessel: reqForm.vessel.trim(), client: reqForm.client,
      kind: reqForm.kind, scope: reqForm.scope.trim(), value: num(reqForm.value) || 0,
      status: "Baru", date: reqForm.date,
    }, { action: "mencatat request", module: "CRM" });
    toast(`Request ${created.id} dicatat`);
    setShowReq(false);
    setReqForm({ vessel: "", client: "", kind: "Repair Request", scope: "", value: "", date: todayISO() });
  };

  const advanceRequest = async (r: StoreItem, next: string) => {
    await update("requests", r.id, { status: next });
    log(`mengubah request ke ${next}`, r.id, "CRM");
    toast(`${r.id} → ${next}`);
  };

  const convertRequest = async (r: StoreItem) => {
    if (String(r.status) !== "Disetujui") { toast("Hanya request Disetujui yang bisa jadi quotation", "info"); return; }
    if ((data.quotations ?? []).some((q) => String(q.requestId ?? "") === String(r.id))) { toast("Request ini sudah punya quotation", "info"); return; }
    try {
      const created = await add("quotations", {
        client: String(r.client ?? ""), vessel: String(r.vessel ?? ""), type: "Repair",
        value: num(r.value) || 0, stage: "Lead", date: todayISO(), requestId: String(r.id),
      }, { action: "mengkonversi request ke quotation", target: `${String(r.id)} → quotation`, module: "CRM" });
      toast(`Quotation draft ${created.id} dibuat dari ${String(r.id)}`);
    } catch {
      toast(`Konversi ${String(r.id)} gagal — periksa daftar quotation`, "info");
    }
  };

  const saveClientPo = async () => {
    if (!poForm.contractId) { toast("Pilih kontrak dulu", "info"); return; }
    if (!poForm.no.trim()) { toast("No. PO klien wajib diisi", "info"); return; }
    if (clientPos.some((p) => String(p.no ?? "") === poForm.no.trim())) { toast("No. PO klien sudah dipakai", "info"); return; }
    if (num(poForm.amount) <= 0) { toast("Nilai PO harus lebih dari 0", "info"); return; }
    if (!poForm.date) { toast("Tanggal PO wajib diisi", "info"); return; }
    const created = await add("clientPos", {
      contractId: poForm.contractId, ...(poForm.projectId ? { projectId: poForm.projectId } : {}),
      no: poForm.no.trim(), amount: num(poForm.amount), date: poForm.date,
    }, { action: "mencatat PO klien", target: poForm.no.trim(), module: "CRM" });
    toast(`PO klien ${created.id} (${poForm.no.trim()}) dicatat`);
    setPoForm({ contractId: "", projectId: "", no: "", amount: "", date: todayISO() });
  };

  const forecastRows = FLOW.map((s) => {
    const rows = quotations.filter((q) => String(q.stage) === s);
    const nilai = rows.reduce((sum, q) => sum + num(q.value), 0);
    return { stage: s, prob: PROB[s] ?? 0, count: rows.length, nilai, weighted: Math.round(nilai * (PROB[s] ?? 0)) };
  });
  const forecastTotal = forecastRows.reduce((s, r) => s + r.weighted, 0);
  const oldLeads = quotations.filter((q) => !isTerminal(String(q.stage)) && (umurHari(String(q.date ?? "")) ?? 0) > 30);

  const penawaranList = quotations.filter((q) => {
    if (!oldOnly) return true;
    return (umurHari(String(q.date ?? "")) ?? 0) > 30;
  });

  const openConvert = (q: StoreItem) => {
    setHoChecks([false, false, false, false]);
    setHoBy("Tim Commercial");
    setConvertTarget(q);
  };

  const exportForecast = () => {
    const rows: unknown[][] = [
      ["Tahap", "Probabilitas", "Jumlah", "Nilai (Rp)", "Weighted (Rp)"],
      ...forecastRows.map((r) => [r.stage, `${Math.round(r.prob * 100)}%`, r.count, r.nilai, r.weighted]),
      ["Total forecast weighted", "", "", "", forecastTotal],
    ];
    void exportExcel(rows, `forecast-weighted-${todayISO()}`, "Forecast");
    toast(`Forecast ${fmtMiliar(forecastTotal)} diekspor ke Excel`);
  };

  return (
    <div>
      <PageHeader
        title="CRM & Manajemen Klien"
        subtitle="Penawaran, pipeline penjualan, komunikasi, kontrak, dan kepuasan"
        icon={<Handshake className="h-5 w-5" />}
        actions={<button className="btn-primary-gradient" onClick={() => setShowQ(true)}><Plus className="h-4 w-4" /> Penawaran Baru</button>}
      />

      {modAlert.active && <AlertBannerView items={modAlert.items} onPick={modAlert.scrollTo} />}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total Klien Aktif" value={String(clients.length)} icon={<Users2 className="h-5 w-5" />} chip="navy" spark={clientTrend} hint={`${String(totalFleet)} unit armada tercatat`} />
        <KpiCard label="Nilai Pipeline" value={fmtMiliar(pipelineTotal)} delta={`${String(activeQuotes.length)} penawaran aktif`} deltaDirection="up" chip="teal" hint="Di luar Batal, Kalah, Terkonversi" spark={pipelineTrend} />
        <KpiCard label="Win Rate" value={`${String(winRate)}%`} delta={`${String(wonQuotes.length)} menang dari ${String(totalQuotes)} penawaran`} deltaDirection={wonQuotes.length > 0 ? "up" : "flat"} icon={<Star className="h-5 w-5" />} chip="violet" spark={winRateTrend} />
        <KpiCard label="Nilai Kontrak Menang" value={fmtMiliar(wonValue)} delta="Menang + Terkonversi" deltaDirection="up" chip="amber" hint="Bulan berjalan" spark={wonTrend} />
      </div>

      <Card className="mt-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-navy-900">Forecast Weighted · {fmtMiliar(forecastTotal)}</h3>
            <p className="text-xs text-steel-500">Lead 10% · Penawaran 30% · Negosiasi 60% · Menang 100% · {oldLeads.length} lead tua &gt;30 hari</p>
          </div>
          <button className="btn-secondary text-xs" onClick={exportForecast}>Export Forecast</button>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {forecastRows.map((r) => (
            <Badge key={r.stage} tone="gray">{r.stage} {Math.round(r.prob * 100)}% · {r.count} · {fmtMiliar(r.weighted)}</Badge>
          ))}
        </div>
      </Card>

      <div className="mt-4 card">
        <Tabs tabs={["Pipeline", "Klien", "Penawaran", "Request", "Komunikasi", "Kontrak", "Kepuasan"]} active={tab} onChange={setTab} />
        <div className="p-4">
          {tab === "Pipeline" && (
            <div className="space-y-4">
              <Card>
                <CardHeader title="Distribusi Penawaran" subtitle="Jumlah penawaran per tahap" />
                <div className="flex flex-wrap items-center gap-6 p-4 pt-0">
                  <Donut data={stageDist} colors={stageDist.map((d) => d.color)} size={150} thickness={20} centerValue={String(quotations.length)} centerLabel="QT" />
                  <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
                    {stageDist.map((d) => (
                      <div key={d.name} className="flex items-center gap-2 text-sm">
                        <span className="h-3 w-3 rounded-sm" style={{ background: d.color }} />
                        <span className="truncate text-steel-600" title={d.name}>{d.name}</span>
                        <span className="ml-auto font-semibold text-navy-900">{d.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                {STAGES.map((stage) => {
                  const items = quotations.filter((q) => q.stage === stage);
                  return (
                    <div key={stage} className="rounded-xl bg-surface p-3">
                      <div className="mb-3 flex items-center justify-between">
                        <h3 className="truncate text-sm font-semibold text-navy-900" title={stage}>{stage}</h3>
                        <Badge tone="gray">{items.length}</Badge>
                      </div>
                      <div className="space-y-2.5">
                        {items.map((q) => (
                          <Card key={q.id} className="card-hover p-3">
                            <p className="truncate text-sm font-semibold text-navy-900" title={String(q.vessel)}>{String(q.vessel)}</p>
                            <p className="truncate text-xs text-steel-500" title={String(q.client)}>{String(q.client)}</p>
                            <p className="mt-0.5 text-xs text-steel-500">{String(q.type)} · {fmtTanggal(String(q.date ?? ""))} · umur {umurHari(String(q.date ?? "")) ?? "—"} hari{(umurHari(String(q.date ?? "")) ?? 0) > 30 && !isTerminal(String(q.stage)) ? " · tua" : ""}</p>
                            <div className="mt-2 flex items-center justify-between">
                              <span className="font-semibold text-navy-800">{fmtMiliar(num(q.value))}</span>
                              <Badge tone={STAGE_TONE[String(q.stage)] ?? "gray"}>{q.id}</Badge>
                            </div>
                            <Link to={`/crm/quotation/${q.id}`} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-ocean-600 hover:text-ocean-500">
                              Detail <ArrowRight className="h-3 w-3" />
                            </Link>
                            {!isTerminal(stage) && (
                              <div className="mt-2 space-y-1.5">
                                {stage !== "Menang" ? (
                                  <button className="btn-secondary flex-1 justify-center py-1 text-xs w-full" onClick={() => advance(q)}>
                                    Maju <ArrowRight className="h-3 w-3" />
                                  </button>
                                ) : (
                                  <button className="btn-primary flex-1 justify-center py-1 text-xs w-full" onClick={() => openConvert(q)}>
                                    Jadikan Proyek
                                  </button>
                                )}
                                <div className="flex gap-1.5">
                                  <button className="btn-secondary flex-1 justify-center py-1 text-xs" onClick={() => markTerminal(q, "Batal")}>Batal</button>
                                  <button className="btn-secondary flex-1 justify-center py-1 text-xs" onClick={() => markTerminal(q, "Kalah")}>Kalah</button>
                                </div>
                              </div>
                            )}
                          </Card>
                        ))}
                        {items.length === 0 && <p className="py-4 text-center text-xs text-steel-400">Kosong</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {tab === "Klien" && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <Field label="Filter klasifikasi">
                  <select className="input" value={klasFilter} onChange={(e) => setKlasFilter(e.target.value)}>
                    <option>Semua</option>
                    {KLASIFIKASI.map((k) => <option key={k}>{k}</option>)}
                  </select>
                </Field>
                <button className="btn-secondary text-xs" onClick={() => setShowClient(true)}><Plus className="h-3.5 w-3.5" /> Tambah Klien</button>
              </div>
              {visibleClients.length === 0 ? (
                <EmptyState title="Tidak ada klien" subtitle="Ubah filter atau tambah klien baru." />
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {visibleClients.map((c) => {
                    const cq = quotations.filter((x) => sameName(x.client, c.name));
                    const cqVal = cq.reduce((s, x) => s + num(x.value), 0);
                    return (
                      <Card key={c.id} className="p-5">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2.5">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-navy-700 text-sm font-bold text-white">
                              {String(c.name).replace("PT ", "").split(" ").map((n: string) => n[0]).slice(0, 2).join("")}
                            </div>
                            <div>
                              <p className="truncate text-sm font-semibold text-navy-900" title={String(c.name)}>{String(c.name)}</p>
                              <p className="text-xs text-steel-500">{String(c.id)} · sejak {String(c.since ?? "—")}</p>
                            </div>
                          </div>
                          <Badge tone="green"><Star className="h-3 w-3 mr-0.5" /> {String(c.rating ?? 0)}%</Badge>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          <Badge tone={String(c.klasifikasi ?? "Regular") === "VIP" ? "violet" : "gray"}>{String(c.klasifikasi ?? "Regular")}</Badge>
                          <Badge tone="navy">{String(c.currency ?? "IDR")}</Badge>
                          {c.branch ? <Badge tone="teal">{String(c.branch)}</Badge> : null}
                        </div>
                        <div className="mt-3 border-t border-steel-100 pt-3 text-sm">
                          <div className="flex justify-between"><span className="text-steel-500">Armada kapal</span><span className="font-semibold">{num(c.fleet)} unit</span></div>
                          <div className="mt-1 flex justify-between"><span className="text-steel-500">Nilai penawaran</span><span className="font-semibold">{fmtMiliar(cqVal)}</span></div>
                          <div className="mt-1 flex justify-between"><span className="text-steel-500">Credit limit</span><span className="font-semibold">{fmtRupiah(num(c.creditLimit))}</span></div>
                          <div className="mt-1 flex justify-between"><span className="text-steel-500">Payment terms</span><span className="font-semibold">{String(c.paymentTerms ?? "NET 30")}</span></div>
                          <div className="mt-1 flex justify-between"><span className="text-steel-500">Proyek berjalan</span><span className="font-semibold">{data.projects.filter((p) => sameName(p.client, c.name) && p.status !== "Selesai").length} proyek</span></div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {tab === "Penawaran" && (
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm text-steel-600">
                <input type="checkbox" className="h-4 w-4" checked={oldOnly} onChange={(e) => setOldOnly(e.target.checked)} />
                Hanya lead tua &gt;30 hari ({oldLeads.length})
              </label>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {penawaranList.map((q) => (
                <Card key={q.id} className="p-4">
                  <div className="flex justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-navy-900" title={String(q.vessel)}>{String(q.vessel)}</p>
                      <p className="text-xs text-steel-500">{String(q.client)} · {String(q.type)} · {fmtTanggal(String(q.date ?? ""))} · umur {umurHari(String(q.date ?? "")) ?? "—"} hari</p>
                      {q.statusKirim === "Terkirim" && (
                        <p className="mt-0.5 text-xs text-teal-600">Terkirim {fmtTanggal(String(q.sentAt ?? ""))} ke {String(q.sentTo ?? "")}</p>
                      )}
                    </div>
                    <Badge tone={STAGE_TONE[String(q.stage)] ?? "gray"}>{String(q.stage)}</Badge>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-lg font-bold text-navy-900">{fmtMiliar(num(q.value))}</span>
                    <div className="flex gap-1.5">
                      <Link to={`/crm/quotation/${q.id}`} className="btn-secondary text-xs">Detail</Link>
                      <button className="btn-secondary text-xs" onClick={() => openSend(q)}><Send className="h-3.5 w-3.5" /> Kirim</button>
                      {!isTerminal(String(q.stage)) && q.stage !== "Menang" && <button className="btn-secondary text-xs" onClick={() => advance(q)}>Maju</button>}
                      {!isTerminal(String(q.stage)) && q.stage === "Menang" && <button className="btn-primary text-xs" onClick={() => openConvert(q)}>Jadikan Proyek</button>}
                    </div>
                  </div>
                  {!isTerminal(String(q.stage)) && (
                    <div className="mt-2 flex gap-1.5">
                      <button className="btn-secondary flex-1 justify-center py-1 text-xs" onClick={() => markTerminal(q, "Batal")}>Tandai Batal</button>
                      <button className="btn-secondary flex-1 justify-center py-1 text-xs" onClick={() => markTerminal(q, "Kalah")}>Tandai Kalah</button>
                    </div>
                  )}
                </Card>
              ))}
              {penawaranList.length === 0 && <EmptyState title="Belum ada penawaran" subtitle={oldOnly ? "Tidak ada lead tua >30 hari." : "Buat penawaran baru untuk memulai pipeline."} />}
            </div>
            </div>
          )}

          {tab === "Request" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-steel-500">Alur: Baru → Disurvei → Diajukan → Disetujui/Ditolak · Disetujui bisa dikonversi jadi quotation draft</p>
                <button className="btn-secondary text-xs" onClick={() => setShowReq(true)}><Plus className="h-3.5 w-3.5" /> Request Baru</button>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {requests.map((r) => (
                  <Card key={r.id} id={notifRowId(String(r.id))} className={`p-4 ${modAlert.highlight.has(String(r.id)) ? "notif-hl" : ""}`}>
                    <div className="flex justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-navy-900" title={String(r.vessel)}>{String(r.vessel)}</p>
                        <p className="text-xs text-steel-500">{String(r.client)} · {String(r.kind)} · {fmtTanggal(String(r.date ?? ""))}</p>
                        <p className="mt-1 text-xs text-steel-600">{String(r.scope ?? "")}</p>
                      </div>
                      <Badge tone={String(r.status) === "Disetujui" ? "green" : String(r.status) === "Ditolak" ? "red" : "gray"}>{String(r.status)}</Badge>
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-lg font-bold text-navy-900">{fmtMiliar(num(r.value))}</span>
                      <span className="font-mono text-xs text-steel-500">{r.id}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {String(r.status) === "Baru" && <button className="btn-secondary text-xs" onClick={() => advanceRequest(r, "Disurvei")}>Disurvei</button>}
                      {String(r.status) === "Disurvei" && <button className="btn-secondary text-xs" onClick={() => advanceRequest(r, "Diajukan")}>Diajukan</button>}
                      {String(r.status) === "Diajukan" && (<>
                        <button className="btn-secondary text-xs" onClick={() => advanceRequest(r, "Disetujui")}>Disetujui</button>
                        <button className="btn-secondary text-xs" onClick={() => advanceRequest(r, "Ditolak")}>Ditolak</button>
                      </>)}
                      {String(r.status) === "Disetujui" && <button className="btn-primary text-xs" onClick={() => convertRequest(r)}>Jadi Quotation</button>}
                    </div>
                  </Card>
                ))}
                {requests.length === 0 && <EmptyState title="Belum ada request" subtitle="Catat repair request / technical assessment pertama." />}
              </div>
            </div>
          )}

          {tab === "Komunikasi" && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <Card className="p-4 lg:col-span-2">
                <CardHeader title="Log Komunikasi" subtitle="Channel, tanggal, dan ringkasan per quotation" />
                {communications.length === 0 ? (
                  <EmptyState title="Belum ada komunikasi" subtitle="Catat interaksi pertama dengan klien." />
                ) : (
                  <div className="space-y-2">
                    {communications.map((m) => (
                      <div key={m.id} className="rounded-xl bg-surface p-3 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link to={`/crm/quotation/${m.quotationId}`} className="font-mono text-xs font-bold text-ocean-600">{String(m.quotationId)}</Link>
                          <Badge tone="navy">{String(m.channel)}</Badge>
                          <span className="text-xs text-steel-500">{fmtTanggal(String(m.date ?? ""))} · {String(m.by ?? "")}</span>
                        </div>
                        <p className="mt-1 text-steel-700">{String(m.summary)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
              <Card className="p-4">
                <CardHeader title="Tambah Komunikasi" />
                <div className="space-y-3 px-1 pb-1">
                  <Field label="Quotation">
                    <select className="input" value={commForm.quotationId} onChange={(e) => setCommForm({ ...commForm, quotationId: e.target.value })}>
                      <option value="">Pilih…</option>
                      {quotations.map((q) => <option key={q.id} value={q.id}>{q.id} · {String(q.vessel)}</option>)}
                    </select>
                  </Field>
                  <FormGrid>
                    <Field label="Channel">
                      <select className="input" value={commForm.channel} onChange={(e) => setCommForm({ ...commForm, channel: e.target.value })}>
                        {["Email", "Telepon", "Meeting", "WhatsApp", "Kunjungan"].map((c) => <option key={c}>{c}</option>)}
                      </select>
                    </Field>
                    <Field label="Tanggal"><input type="date" className="input" value={commForm.date} onChange={(e) => setCommForm({ ...commForm, date: e.target.value })} /></Field>
                  </FormGrid>
                  <Field label="Ringkasan"><textarea className="input" rows={3} value={commForm.summary} onChange={(e) => setCommForm({ ...commForm, summary: e.target.value })} placeholder="Hasil diskusi, tindak lanjut…" /></Field>
                  <Field label="Oleh"><input className="input" value={commForm.by} onChange={(e) => setCommForm({ ...commForm, by: e.target.value })} placeholder="Nama PIC" /></Field>
                  <button className="btn-primary w-full justify-center" onClick={saveComm}>Simpan Log</button>
                </div>
              </Card>
            </div>
          )}

          {tab === "Kontrak" && (
            <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <Card className="p-4 lg:col-span-2">
                <CardHeader title="Daftar Kontrak" subtitle="Dibuat dari quotation Menang / Terkonversi" />
                {contracts.length === 0 ? (
                  <EmptyState title="Belum ada kontrak" subtitle="Buat kontrak dari quotation yang menang." />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-surface sticky top-0 z-10">
                        <tr><SortTh label="Kontrak" sortKey="kontrak" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label="Quotation" sortKey="quotation" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label="Nilai" sortKey="nilai" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label="Sign" sortKey="sign" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label="Status" sortKey="status" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /></tr>
                      </thead>
                      <tbody className="divide-y divide-steel-100">
                        {sortRows(contracts, sort, (k, key) =>
                          key === "kontrak" ? String(k.id ?? "") : key === "quotation" ? String(k.quotationId ?? "") : key === "nilai" ? Number(k.value ?? 0) : key === "sign" ? String(k.signedAt ?? "") : String(k.status ?? "")
                        ).map((k) => (
                          <tr key={k.id} className="hover:bg-surface">
                            <td className="td font-mono text-xs font-semibold text-navy-900">{k.id}<span className="block font-sans text-[11px] font-normal text-steel-500">{String(k.client ?? "")}</span></td>
                            <td className="td font-mono text-xs"><Link to={`/crm/quotation/${k.quotationId}`} className="text-ocean-600">{String(k.quotationId)}</Link>{k.projectId ? <Link to={`/proyek/${k.projectId}`} className="block text-[11px] text-teal-600">{String(k.projectId)}</Link> : null}</td>
                            <td className="td text-xs font-semibold">{fmtRupiah(num(k.value))}</td>
                            <td className="td text-xs text-steel-600">{fmtTanggal(String(k.signedAt ?? ""))}</td>
                            <td className="td"><StatusBadge status={String(k.status ?? "Aktif")} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
              <Card className="p-4">
                <CardHeader title="Buat Kontrak" subtitle="Nilai default mengikuti quotation" />
                <div className="space-y-3 px-1 pb-1">
                  <Field label="Quotation (Menang / Terkonversi)">
                    <select
                      className="input"
                      value={contractForm.quotationId}
                      onChange={(e) => {
                        const q = quotations.find((x) => x.id === e.target.value);
                        setContractForm({ ...contractForm, quotationId: e.target.value, value: q ? String(q.value) : "" });
                      }}
                    >
                      <option value="">Pilih…</option>
                      {eligibleQuotations.map((q) => <option key={q.id} value={q.id}>{q.id} · {String(q.vessel)} · {fmtMiliar(num(q.value))}</option>)}
                    </select>
                  </Field>
                  <Field label="Nilai kontrak (Rp)"><input type="number" min={0} className="input" value={contractForm.value} onChange={(e) => setContractForm({ ...contractForm, value: e.target.value })} /></Field>
                  <Field label="Tanggal sign"><input type="date" className="input" value={contractForm.signedAt} onChange={(e) => setContractForm({ ...contractForm, signedAt: e.target.value })} /></Field>
                  <Field label="Link project (opsional)">
                    <select className="input" value={contractForm.projectId} onChange={(e) => setContractForm({ ...contractForm, projectId: e.target.value })}>
                      <option value="">Tanpa link</option>
                      {data.projects.map((p) => <option key={p.id} value={p.id}>{p.id} · {String(p.vessel)}</option>)}
                    </select>
                  </Field>
                  <button className="btn-primary w-full justify-center" onClick={saveContract}>Simpan Kontrak</button>
                </div>
              </Card>
            </div>
            <Card className="mt-4 p-4">
              <CardHeader title={`PO Klien (${clientPos.length})`} subtitle="Link PO klien ke kontrak — dipakai validasi invoice Keuangan" />
              {clientPos.length === 0 ? (
                <EmptyState title="Belum ada PO klien" subtitle="Catat PO klien pertama dari form di bawah." />
              ) : (
                <div className="space-y-2">
                  {clientPos.map((p) => (
                    <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface p-3 text-sm">
                      <span className="font-mono font-semibold text-navy-900">{String(p.no)}</span>
                      <span className="text-xs text-steel-500">kontrak {String(p.contractId ?? "—")}{p.projectId ? ` · proyek ${String(p.projectId)}` : ""} · {fmtTanggal(String(p.date ?? ""))}</span>
                      <span className="font-semibold text-navy-900">{fmtRupiah(num(p.amount))}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-3 grid grid-cols-1 gap-2 border-t border-steel-100 pt-3 sm:grid-cols-5">
                <Field label="Kontrak">
                  <select className="input" value={poForm.contractId} onChange={(e) => setPoForm({ ...poForm, contractId: e.target.value })}>
                    <option value="">Pilih…</option>
                    {contracts.map((c) => <option key={c.id} value={c.id}>{c.id} · {String(c.client ?? "")}</option>)}
                  </select>
                </Field>
                <Field label="Proyek (opsional)">
                  <select className="input" value={poForm.projectId} onChange={(e) => setPoForm({ ...poForm, projectId: e.target.value })}>
                    <option value="">Tanpa link</option>
                    {data.projects.map((p) => <option key={p.id} value={p.id}>{p.id}</option>)}
                  </select>
                </Field>
                <Field label="No. PO"><input className="input font-mono" value={poForm.no} onChange={(e) => setPoForm({ ...poForm, no: e.target.value })} placeholder="cth: PO-C-2026-011" /></Field>
                <Field label="Nilai (Rp)"><input type="number" min={0} className="input" value={poForm.amount} onChange={(e) => setPoForm({ ...poForm, amount: e.target.value })} /></Field>
                <Field label="Tanggal"><input type="date" className="input" value={poForm.date} onChange={(e) => setPoForm({ ...poForm, date: e.target.value })} /></Field>
              </div>
              <button className="btn-secondary mt-2 text-xs" onClick={saveClientPo}><Plus className="h-3.5 w-3.5" /> Catat PO Klien</button>
            </Card>
            </div>
          )}

          {tab === "Kepuasan" && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <Card className="p-4 lg:col-span-2">
                <CardHeader title="Kepuasan Klien" subtitle={`Rata-rata global ${globalSatisfaction ? globalSatisfaction.toFixed(1) : "—"} / 5 dari ${allSurveys.length} survei`} />
                <div className="space-y-2">
                  {clients.map((c) => (
                    <div key={c.id} className="flex items-center gap-3 rounded-xl bg-surface p-3 text-sm">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-navy-900" title={String(c.name)}>{String(c.name)}</p>
                        <p className="text-xs text-steel-500">{Array.isArray(c.survei) ? c.survei.length : 0} survei · rata-rata {surveyAvg(c) ? surveyAvg(c).toFixed(1) : "—"} / 5</p>
                      </div>
                      <Badge tone={surveyAvg(c) >= 4 ? "green" : surveyAvg(c) >= 3 ? "amber" : "gray"}>
                        <Star className="h-3 w-3 mr-0.5" /> {surveyAvg(c) ? surveyAvg(c).toFixed(1) : "—"}
                      </Badge>
                    </div>
                  ))}
                </div>
              </Card>
              <Card className="p-4">
                <CardHeader title="Tambah Survei" subtitle="Rating 1–5 per klien" />
                <div className="space-y-3 px-1 pb-1">
                  <Field label="Klien">
                    <select className="input" value={surveyForm.clientId} onChange={(e) => setSurveyForm({ ...surveyForm, clientId: e.target.value })}>
                      <option value="">Pilih…</option>
                      {clients.map((c) => <option key={c.id} value={c.id}>{String(c.name)}</option>)}
                    </select>
                  </Field>
                  <Field label="Rating (1–5)">
                    <select className="input" value={surveyForm.rating} onChange={(e) => setSurveyForm({ ...surveyForm, rating: e.target.value })}>
                      {["1", "2", "3", "4", "5"].map((r) => <option key={r}>{r}</option>)}
                    </select>
                  </Field>
                  <button className="btn-primary w-full justify-center" onClick={saveSurvey}>Simpan Survei</button>
                </div>
              </Card>
            </div>
          )}
        </div>
      </div>

      <Modal open={showQ} onClose={() => setShowQ(false)} title="Penawaran Baru" subtitle="Masuk ke tahap pipeline terpilih"
        wide footer={<><button className="btn-secondary" onClick={() => setShowQ(false)}>Batal</button><button className="btn-primary" onClick={saveQuotation}>Simpan Penawaran</button></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label="Klien">
              <select className="input" value={qForm.client} onChange={(e) => setQForm({ ...qForm, client: e.target.value })}>
                <option value="">Pilih klien…</option>
                {clients.map((c) => <option key={c.id} value={c.name}>{String(c.name)}</option>)}
              </select>
            </Field>
            <Field label="Kapal / pekerjaan"><input className="input" value={qForm.vessel} onChange={(e) => setQForm({ ...qForm, vessel: e.target.value })} placeholder="cth: TB Baru RJ-04" /></Field>
            <Field label="Jenis">
              <select className="input" value={qForm.type} onChange={(e) => setQForm({ ...qForm, type: e.target.value })}>
                <option>New Build</option><option>Repair</option><option>Retrofit</option>
              </select>
            </Field>
            <Field label="Tahap awal">
              <select className="input" value={qForm.stage} onChange={(e) => setQForm({ ...qForm, stage: e.target.value })}>
                {FLOW.map((s) => <option key={s}>{s}</option>)}
              </select>
            </Field>
          </FormGrid>
          <FormGrid>
            <Field label="Nilai penawaran (Rp)" hint="Harus lebih dari 0"><input type="number" min={1} className="input" value={qForm.value} onChange={(e) => setQForm({ ...qForm, value: e.target.value })} /></Field>
            <Field label="Tanggal penawaran"><input type="date" className="input" value={qForm.date} onChange={(e) => setQForm({ ...qForm, date: e.target.value })} /></Field>
          </FormGrid>
        </div>
      </Modal>

      <ClientModal open={showClient} onClose={() => setShowClient(false)} onSaved={() => undefined} />

      <Modal open={showReq} onClose={() => setShowReq(false)} title="Request / Assessment Baru" subtitle={`Alur Baru → Disurvei → Diajukan → Disetujui · ${nextReqId(reqForm.date || todayISO())}`}
        footer={<><button className="btn-secondary" onClick={() => setShowReq(false)}>Batal</button><button className="btn-primary" onClick={saveRequest}>Simpan Request</button></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label="Klien">
              <select className="input" value={reqForm.client} onChange={(e) => setReqForm({ ...reqForm, client: e.target.value })}>
                <option value="">Pilih klien…</option>
                {clients.map((c) => <option key={c.id} value={c.name}>{String(c.name)}</option>)}
              </select>
            </Field>
            <Field label="Kapal"><input className="input" value={reqForm.vessel} onChange={(e) => setReqForm({ ...reqForm, vessel: e.target.value })} placeholder="cth: TB Karya Bahari 12" /></Field>
            <Field label="Jenis">
              <select className="input" value={reqForm.kind} onChange={(e) => setReqForm({ ...reqForm, kind: e.target.value })}>
                {REQ_KIND.map((k) => <option key={k}>{k}</option>)}
              </select>
            </Field>
            <Field label="Tanggal"><input type="date" className="input" value={reqForm.date} onChange={(e) => setReqForm({ ...reqForm, date: e.target.value })} /></Field>
          </FormGrid>
          <Field label="Scope pekerjaan"><textarea className="input" rows={3} value={reqForm.scope} onChange={(e) => setReqForm({ ...reqForm, scope: e.target.value })} placeholder="cth: Overhaul main engine + coating lambung" /></Field>
          <Field label="Estimasi nilai (Rp)"><input type="number" min={0} className="input" value={reqForm.value} onChange={(e) => setReqForm({ ...reqForm, value: e.target.value })} placeholder="cth: 4200000000" /></Field>
        </div>
      </Modal>

      <Modal open={sendTarget !== null} onClose={() => setSendTarget(null)} title={`Kirim ${sendTarget?.id ?? ""}`} subtitle="Pratinjau penawaran sebelum dikirim"
        wide footer={<><button className="btn-secondary" onClick={() => setSendTarget(null)}>Batal</button><button className="btn-primary" onClick={confirmSend}><Send className="h-4 w-4" /> Kirim Penawaran</button></>}>
        {sendTarget && (
          <div className="space-y-3">
            <div className="rounded-xl bg-surface p-4 text-sm">
              <p className="font-semibold text-navy-900">{String(sendTarget.vessel)}</p>
              <p className="text-xs text-steel-500">{String(sendTarget.client)} · {String(sendTarget.type)}</p>
              <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1">
                <span className="text-steel-600">Nilai: <strong className="text-navy-900">{fmtMiliar(num(sendTarget.value))}</strong></span>
                <span className="text-steel-600">Tanggal: <strong className="text-navy-900">{fmtTanggal(String(sendTarget.date ?? ""))}</strong></span>
                <span className="text-steel-600">Tahap: <strong className="text-navy-900">{String(sendTarget.stage)}</strong></span>
              </div>
            </div>
            <Field label="Email tujuan"><input type="email" className="input" value={sendEmail} onChange={(e) => setSendEmail(e.target.value)} placeholder="cth: purchasing@klien.co.id" /></Field>
            <Field label="Pesan pengantar"><textarea className="input" rows={5} value={sendMsg} onChange={(e) => setSendMsg(e.target.value)} /></Field>
          </div>
        )}
      </Modal>

      <Modal
        open={convertTarget !== null}
        onClose={() => setConvertTarget(null)}
        title={`Konversi ${convertTarget?.id ?? ""} jadi proyek?`}
        subtitle="Serah terima ke PM — semua checklist wajib dicentang"
        footer={<><button className="btn-secondary" onClick={() => setConvertTarget(null)}>Batal</button><button className="btn-primary" onClick={confirmConvert}>Ya, konversi + serah terima</button></>}
      >
        <div className="space-y-3">
          <p className="text-sm text-steel-600">Quotation dikunci ke Terkonversi dan dibuat satu proyek baru beserta catatan handover.</p>
          <Field label="Diserahkan oleh"><input className="input" value={hoBy} onChange={(e) => setHoBy(e.target.value)} placeholder="Nama penyerah" /></Field>
          <div className="space-y-2">
            {HO_ITEMS.map((item, i) => (
              <label key={item} className="flex items-start gap-2 rounded-xl bg-surface p-3 text-sm text-steel-700">
                <input type="checkbox" className="mt-1 h-4 w-4" checked={hoChecks[i] ?? false} onChange={(e) => setHoChecks((prev) => prev.map((c, idx) => (idx === i ? e.target.checked : c)))} />
                {item}
              </label>
            ))}
          </div>
        </div>
      </Modal>
    </div>
  );
}
