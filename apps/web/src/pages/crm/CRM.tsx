import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Send, Users2, Star, Handshake, ArrowRight, Search } from "lucide-react";
import { Card, CardHeader, PageHeader, Badge, KpiCard, Tabs, Donut, Modal, Field, FormGrid, StatusBadge, ConfirmModal, EmptyState, SortTh, toggleSort, sortRows, toast, usePager,
  NumInput,
} from "../../components/ui";
import ClientModal from "../../components/ClientModal";
import type { SortState } from "../../components/ui";
import { AsyncButton } from "../../components/ui";
import { useStore } from "../../data/store";
import { useModuleSync } from "../../data/useModuleSync";
import { findUsages } from "../../utils/usages";
import type { StoreItem, CollectionKey } from "../../data/store";
import { fmtMiliar, fmtRupiah, fmtTanggal, todayISO } from "../../utils/format";
import { sameName } from "../../utils/names";
import { AlertBannerView, notifRowId, useModuleAlert, useNotifFlash } from "../../components/AlertBanner";
import { rowHighlightClass } from "../../components/rowHighlight";
import { useDeepLinkParams, useDeepLinkTarget } from "../../components/useDeepLink";
import { exportExcel } from "../../utils/export";
import { useDraftState } from "../../utils/draft";
import { clientTrend, pipelineTrend, winRateTrend, wonTrend } from "../../data";
import { FilterPopover } from "../../components/FilterPopover";
import { useT } from "../../i18n/LanguageContext";
import { n_crm } from "../../i18n/n_crm";

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
const PREFIX_TIPE: Record<string, string> = { "New Build": "NB", Repair: "RP", Retrofit: "RF" };

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

/* Batch koleksi modul CRM untuk useModuleSync (pengganti resync penuh). */
const CRM_COLS: CollectionKey[] = ["activities", "clientPos", "clients", "communications", "contracts", "employees", "projects", "quotations", "requests"];

export default function CRM() {
  const { data, add, update, remove, log, branch, inBranch } = useStore();
  const { locale } = useT();
  const S = n_crm[locale];
  /* Label tampilan: "Lead" → "Prospek" (ID saja); value backend tetap "Lead". */
  const dispStage = (s: string): string => (s === "Lead" ? (locale === "en" ? "Lead" : "Prospek") : s);
  /* Label tampilan tipe proyek & jenis request (ID); value backend tetap EN. */
  const TYPE_ID: Record<string, string> = { "New Build": "Bangun Baru", Repair: "Reparasi", Retrofit: "Retrofit / Modifikasi" };
  const dispType = (t: string): string => (locale === "en" ? t : TYPE_ID[t] ?? t);
  const REQ_KIND_ID: Record<string, string> = { "Repair Request": "Permintaan Reparasi", "Technical Assessment": "Kaji Teknis" };
  const dispReqKind = (k: string): string => (locale === "en" ? k : REQ_KIND_ID[k] ?? k);
  const modAlert = useModuleAlert("crm");
  const flash = useNotifFlash();
  const deepParams = useDeepLinkParams();
  const notified = useMemo(() => new Set(modAlert.items.map((a) => a.rowId)), [modAlert.items]);
  const [tab, setTab] = useState("Pipeline");
  const [sort, setSort] = useState<SortState>({ key: null, dir: "asc" });
  const [klasFilter, setKlasFilter] = useState("Semua");
  const [crmQ, setCrmQ] = useState("");
  const [stageFilter, setStageFilter] = useState("Semua");
  const [oldOnly, setOldOnly] = useState(false);
  const [hoChecks, setHoChecks] = useDraftState<boolean[]>("isms.draft.crm.hoChecks", [false, false, false, false]);
  const [hoBy, setHoBy] = useDraftState("isms.draft.crm.hoBy", "Tim Commercial");

  const [showQ, setShowQ] = useState(false);
  const [qForm, setQForm] = useState({ client: "", vessel: "", type: "New Build", value: "", stage: "Lead", date: todayISO() });
  const [showClient, setShowClient] = useState(false);
  const [convertTarget, setConvertTarget] = useState<StoreItem | null>(null);
  const [convManager, setConvManager] = useState("");
  const [convStart, setConvStart] = useState(todayISO());
  const [convEnd, setConvEnd] = useState("");
  const [sendTarget, setSendTarget] = useState<StoreItem | null>(null);
  const [sendEmail, setSendEmail] = useState("");
  const [sendMsg, setSendMsg] = useState("");
  const [commForm, setCommForm] = useState({ quotationId: "", channel: "Email", date: todayISO(), summary: "", by: "" });
  const [contractForm, setContractForm] = useState({ quotationId: "", value: "", signedAt: todayISO(), projectId: "" });
  /* id kontrak yang sedang dikoreksi (null = membuat baru). */
  const [contractEditId, setContractEditId] = useState<string | null>(null);
  const [surveyForm, setSurveyForm] = useState({ clientId: "", rating: "5", desc: "" });
  const [showReq, setShowReq] = useState(false);
  const [reqForm, setReqForm] = useState({ vessel: "", client: "", kind: "Repair Request", scope: "", value: "", date: todayISO() });
  const [poForm, setPoForm] = useState({ contractId: "", projectId: "", no: "", amount: "", date: todayISO() });
  /* PO klien: tambah + ubah + hapus (kunci kalau kontrak sudah Terkonversi). */
  const [clientPoEditId, setClientPoEditId] = useState<string | null>(null);
  const [delClientPo, setDelClientPo] = useState<StoreItem | null>(null);
  // Hapus quotation (Lead saja) / request (Baru saja) / kontrak (belum link proyek)
  // via ConfirmModal + findUsages + cek relasi lokal.
  const [delQuote, setDelQuote] = useState<StoreItem | null>(null);
  const [delReq, setDelReq] = useState<StoreItem | null>(null);
  const [delContract, setDelContract] = useState<StoreItem | null>(null);
  /* Expand/Collapse deskripsi survei per klien: hemat ruang, teks panjang disembunyikan. */
  const [expandedSurvey, setExpandedSurvey] = useState<Record<string, boolean>>({});
  const toggleSurvey = (clientId: string) =>
    setExpandedSurvey((p) => ({ ...p, [clientId]: !p[clientId] }));
  const SURVEY_PREVIEW = 90;

  // Relasi lokal di luar findUsages: quotation←projects/contracts, request←quotations, contract←projects/clientPos.
  const quoteBlockers = (q: StoreItem): string[] => {
    const out = [...findUsages(data, "quotations", String(q.id))];
    if (String(q.stage) !== "Lead") out.push(`Stage ${String(q.stage)}`);
    if (data.projects.some((p) => String(p.quotationId ?? "") === String(q.id))) out.push("1 Proyek");
    if ((data.contracts ?? []).some((c) => String(c.quotationId ?? "") === String(q.id))) out.push("1 Kontrak");
    return out;
  };
  const reqBlockers = (r: StoreItem): string[] => {
    const out = [...findUsages(data, "requests", String(r.id))];
    if (String(r.status) !== "Baru") out.push(`Status ${String(r.status)}`);
    const nq = (data.quotations ?? []).filter((q) => String(q.requestId ?? "") === String(r.id)).length;
    if (nq > 0) out.push(`${nq} Penawaran`);
    return out;
  };
  const contractBlockers = (k: StoreItem): string[] => {
    const out = [...findUsages(data, "contracts", String(k.id))];
    if (String(k.status) !== "Draft" && String(k.projectId ?? "")) out.push("1 Proyek");
    const npo = (clientPos ?? []).filter((p) => String(p.contractId ?? "") === String(k.id)).length;
    if (npo > 0) out.push(`${npo} PO Klien`);
    return out;
  };

  const clientByName = useMemo(() => {
    const m: Record<string, StoreItem> = {};
    for (const c of data.clients ?? []) m[String(c.name)] = c;
    return m;
  }, [data.clients]);

  const visibleClients = useMemo(() => {
    const base = inBranch(data.clients ?? []);
    const needle = crmQ.trim().toLowerCase();
    const searched = needle
      ? base.filter((c) => `${c.name ?? ""} ${c.id ?? ""}`.toLowerCase().includes(needle))
      : base;
    if (klasFilter === "Semua") return searched;
    return searched.filter((c) => String(c.klasifikasi ?? "Regular") === klasFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.clients, klasFilter, crmQ, branch]);

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

  const pmCandidates = useMemo(() => (
    (data.employees ?? [])
      .filter((e) => String(e.dept) === "Proyek" || String(e.role ?? "").includes("Manager"))
      .map((e) => String(e.name))
  ), [data.employees]);

  const projectById = useMemo(() => {
    const m: Record<string, StoreItem> = {};
    for (const p of data.projects ?? []) m[String(p.id)] = p;
    return m;
  }, [data.projects]);

  const nextProjectCode = (type: string, start: string): string => {
    const prefix = PREFIX_TIPE[type] ?? "PRJ";
    const year = start.match(/^(\d{4})/)?.[1] ?? String(new Date().getFullYear());
    let max = 0;
    for (const p of data.projects ?? []) {
      const m = String(p.id).match(new RegExp(`^${prefix}-(\\d{4})-(\\d+)$`));
      if (m && m[1] === year) max = Math.max(max, Number(m[2]));
    }
    return `${prefix}-${year}-${String(max + 1).padStart(3, "0")}`;
  };

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

  /* Funnel penjualan: jumlah & nilai quotation per tahap, dari quotation nyata.
     Distribusi di atas cuma menghitung JUMLAH per tahap, jadi user tidak
     bisa melihat berapa nilai yang tersangkut di tiap tahap - 15 quotation
     "Penawaran" bisa 3 M atau 30 M dan tampilannya sama saja. */
  const crmFunnelReal = STAGES.map((s) => {
    const rows = quotations.filter((q) => q.stage === s);
    return {
      stage: dispStage(s),
      rawStage: s,
      count: rows.length,
      value: rows.reduce((a, q) => a + num(q.value), 0),
      color: STAGE_COLORS[s] ?? "#94a3b8",
    };
  });
  const funnelMax = crmFunnelReal.reduce((m, f) => Math.max(m, f.count), 0);

  const surveyAvg = (c: StoreItem): number => {
    const arr = Array.isArray(c.survei) ? c.survei.map(num) : [];
    if (arr.length === 0) return 0;
    return arr.reduce((s, v) => s + v, 0) / arr.length;
  };
  const allSurveys = clients.flatMap((c) => (Array.isArray(c.survei) ? c.survei.map(num) : []));
  const globalSatisfaction = allSurveys.length > 0 ? allSurveys.reduce((s, v) => s + v, 0) / allSurveys.length : 0;

  const advance = async (q: StoreItem) => {
    try {
    const idx = FLOW.indexOf(String(q.stage));
    if (idx < 0 || idx >= FLOW.length - 1) return;
    const next = FLOW[idx + 1];
    await update("quotations", q.id, { stage: next });
    log(`memajukan quotation ke ${next}`, q.id, "CRM");
    toast(S.tAdvanced.replace("{a}", q.id).replace("{b}", next));
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const markTerminal = async (q: StoreItem, stage: "Batal" | "Kalah") => {
    try {
    if (isTerminal(String(q.stage))) return;
    await update("quotations", q.id, { stage });
    log(`memindahkan quotation ke ${stage}`, q.id, "CRM");
    toast(S.markedAs.replace("{a}", q.id).replace("{b}", stage), "info");
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const confirmConvert = async () => {
    const q = convertTarget;
    if (!q) return;
    if (q.stage !== "Menang") {
      toast(S.tOnlyWonConvert ?? "Hanya quotation Menang yang bisa dikonversi", "info");
      setConvertTarget(null);
      return;
    }
    // Guard duplikat: longgar ke vessel+client (bukan vessel saja) + quotationId yang sama.
    if (
      q.stage === "Terkonversi" ||
      data.projects.some((p) => String(p.quotationId ?? "") === String(q.id)) ||
      data.projects.some((p) => String(p.vessel) === String(q.vessel) && sameName(p.client, q.client))
    ) {
      toast(S.tConvertRejected, "info");
      setConvertTarget(null);
      return;
    }
    if (hoChecks.some((c) => !c)) { toast(S.hoIncomplete, "info"); return; }
    if (!hoBy.trim()) { toast(S.handoverByRequired, "info"); return; }
    if (num(q.value) <= 0) { toast(S.tQuoteValuePositive, "info"); return; }
    if (!convManager.trim() || convManager.trim() === "Belum ditentukan") { toast(S.tPickPm ?? "Pilih PM dulu", "info"); return; }
    if (!convStart || !convEnd) { toast(S.tPlanDatesRequired ?? "Tanggal rencana mulai & selesai wajib diisi", "info"); return; }
    if (convEnd < convStart) { toast(S.tEndBeforeStart ?? "Tanggal selesai sebelum mulai", "info"); return; }
    // SATU jalur konversi (sama dengan QuotationDetail): PM + tanggal + kode +
    // tahap Kontrak + branch dari client (tanpa hardcode cabang tertentu).
    const client = (data.clients ?? []).find((c) => sameName(c.name, q.client));
    const branchOf = String(client?.branch ?? q.branch ?? (branch !== "SEMUA" ? branch : ""));
    if (!branchOf) { toast("Cabang klien belum terisi - lengkapi data klien dulu", "info"); return; }
    const code = nextProjectCode(String(q.type ?? "New Build"), convStart);
    try {
      const created = await add("projects", {
        id: code,
        vessel: q.vessel, type: q.type, client: q.client, status: "Dalam Proses",
        tahap: "Kontrak",
        tahapLog: [{ from: "-", to: "Kontrak", date: todayISO(), by: hoBy.trim(), reason: `Konversi ${q.id}` }],
        branch: branchOf, start: convStart, end: convEnd, progress: 0,
        budget: num(q.value), actual: 0, manager: convManager.trim(), scope: [q.type],
        quotationId: q.id,
        handover: { date: todayISO(), by: hoBy.trim(), items: [...HO_ITEMS] },
      }, { action: "mengkonversi quotation", target: `${q.id} → proyek`, module: "CRM" });
      await update("quotations", q.id, { stage: "Terkonversi" });
      log(`serah terima ke PM oleh ${hoBy.trim()} (${HO_ITEMS.length} item)`, `${q.id} → ${created.id}`, "CRM");
      toast(S.becameProject.replace("{a}", q.id).replace("{b}", created.id));
      setConvertTarget(null);
    } catch (e) {
      toast(S.tConvertStuck.replace("{n}", q.id), "info");
    }
  };

  const openSend = (q: StoreItem) => {
    setSendTarget(q);
    setSendEmail("");
    setSendMsg(S.sendBodyCrm.replace("{a}", String(q.client)).replace("{b}", q.id).replace("{c}", String(q.vessel)).replace("{d}", fmtMiliar(num(q.value))));
  };

  const confirmSend = async () => {
    try {
    if (!sendTarget) return;
    if (!sendEmail.includes("@")) { toast(S.emailInvalid, "info"); return; }
    await update("quotations", sendTarget.id, { statusKirim: "Terkirim", sentAt: todayISO(), sentTo: sendEmail.trim() });
    log(`mengirim penawaran ke ${sendEmail.trim()}`, sendTarget.id, "CRM");
    toast(S.tSentTo.replace("{a}", sendTarget.id).replace("{b}", sendEmail.trim()));
    setSendTarget(null);
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const saveQuotation = async () => {
    try {
    if (!qForm.client || !qForm.vessel.trim()) { toast(S.tClientVesselRequired, "info"); return; }
    if (!qForm.date) { toast(S.quoteDateToast, "info"); return; }
    if (num(qForm.value) <= 0) { toast(S.tQuoteValuePositive, "info"); return; }
    const created = await add("quotations", {
      client: qForm.client, vessel: qForm.vessel.trim(), type: qForm.type,
      value: num(qForm.value), stage: qForm.stage, date: qForm.date, version: 1, riwayat: [],
    }, { action: "membuat penawaran", module: "CRM" });
    toast(S.tQuoteCreated.replace("{n}", created.id));
    setShowQ(false);
    setTab("Penawaran");
    setQForm({ client: "", vessel: "", type: "New Build", value: "", stage: "Lead", date: todayISO() });
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const saveComm = async () => {
    try {
    if (!commForm.quotationId) { toast(S.tPickQuoteFirst, "info"); return; }
    if (!commForm.date) { toast(S.dateRequired, "info"); return; }
    if (!commForm.summary.trim()) { toast(S.summaryRequired, "info"); return; }
    const created = await add("communications", {
      quotationId: commForm.quotationId,
      channel: commForm.channel,
      date: commForm.date,
      summary: commForm.summary.trim(),
      by: commForm.by.trim() || "Tim Commercial",
    }, { action: "mencatat komunikasi", target: commForm.quotationId, module: "CRM" });
    toast(S.commLogged.replace("{n}", created.id));
    setCommForm({ quotationId: "", channel: "Email", date: todayISO(), summary: "", by: "" });
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  /* ==== UBAH KONTRAK ====
   Tidak ada `update("contracts")` sama sekali di modul ini - nilai
   kontrak, tanggal tanda tangan, dan proyek tertaut tidak bisa dikoreksi
   padahal kontraklah sumber budget proyek (saveContract menyalin
   contract.value ke projects.budget). Salah input di sini berarti budget
   proyek salah sampai ada peninjauan manual. */
  const openContractEdit = (k: StoreItem) => {
    setContractEditId(String(k.id));
    setContractForm({
      quotationId: String(k.quotationId ?? ""),
      value: String(num(k.value)),
      signedAt: String(k.signedAt ?? todayISO()),
      projectId: String(k.projectId ?? ""),
    });
  };

  const closeContractModal = () => {
    setContractEditId(null);
    setContractForm({ quotationId: "", value: "", signedAt: todayISO(), projectId: "" });
  };

  const saveContractEdit = async () => {
    if (!contractEditId) return;
    const cur = contracts.find((c) => String(c.id) === contractEditId);
    if (!cur) return;
    const value = num(contractForm.value);
    if (value <= 0) { toast(S.tQuoteValuePositive, "info"); return; }
    if (!contractForm.signedAt) { toast(S.tSignDateRequired, "info"); return; }
    const nextProjectId = contractForm.projectId;
    if (nextProjectId && !projectById[nextProjectId]) {
      toast(locale === "en" ? "Unknown project" : "Proyek tidak dikenal", "info");
      return;
    }
    const prevProjectId = String(cur.projectId ?? "");
    try {
      await update("contracts", contractEditId, {
        value,
        signedAt: contractForm.signedAt,
        status: String(cur.status ?? "Aktif"),
        ...(nextProjectId ? { projectId: nextProjectId } : { projectId: "" }),
      });
      /* Budget proyek mengikuti nilai kontrak - sama seperti saat kontrak
         dibuat. Kalau proyek ditukar / dilepas, budget proyek lama TIDAK
         di-rollback: budget adalah angka negosiasi dengan klien, bukan
         turunan kontrak, jadi menyentuh nilai lama bisa merusak.history
         serapan. Yang disinkronkan hanya proyek yang masih tertaut. */
      if (nextProjectId) {
        await update("projects", nextProjectId, { budget: value });
        log(
          "sinkron budget proyek dari kontrak (koreksi)",
          `${nextProjectId} - ${value.toLocaleString("id-ID")}`,
          "CRM",
        );
      }
      if (prevProjectId && prevProjectId !== nextProjectId) {
        log(
          "kontrak dilepas dari proyek",
          `${contractEditId}: ${prevProjectId} - ${nextProjectId || "-"}`,
          "CRM",
        );
      }
      toast(locale === "en" ? `Contract ${contractEditId} updated` : `Kontrak ${contractEditId} diperbarui`);
      closeContractModal();
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const saveContract = async () => {
    try {
    const q = quotations.find((x) => x.id === contractForm.quotationId);
    if (!q) { toast(S.tPickWonQuote, "info"); return; }
    if (q.stage !== "Menang" && q.stage !== "Terkonversi") { toast(S.tOnlyWonQuote, "info"); return; }
    if (contracts.some((c) => c.quotationId === q.id)) { toast(S.tQuoteHasContract, "info"); return; }
    if (!contractForm.signedAt) { toast(S.tSignDateRequired, "info"); return; }
    const value = num(contractForm.value) || num(q.value);
    if (value <= 0) { toast(S.tQuoteValuePositive, "info"); return; }
    const linked = contractForm.projectId ? projectById[contractForm.projectId] : undefined;
    if (contractForm.projectId && !linked) { toast("Proyek tidak dikenal", "info"); return; }
    // contract.value dikunci ke project.budget saat kontrak dibuat; peringatkan bila beda.
    if (linked && num(linked.budget) !== value) {
      toast(`Nilai kontrak (${value.toLocaleString("id-ID")}) beda dengan budget proyek ${linked.id} - budget disinkronkan`, "info");
    }
    const created = await add("contracts", {
      quotationId: q.id,
      client: q.client,
      value,
      signedAt: contractForm.signedAt,
      status: "Aktif",
      ...(contractForm.projectId ? { projectId: contractForm.projectId } : {}),
    }, { action: "membuat kontrak", target: q.id, module: "CRM" });
    if (linked) {
      await update("projects", linked.id, { budget: value });
      log("sinkron budget proyek dari kontrak", `${linked.id} → ${value.toLocaleString("id-ID")}`, "CRM");
    }
    toast(S.tContractCreated.replace("{n}", created.id));
    setContractForm({ quotationId: "", value: "", signedAt: todayISO(), projectId: "" });
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const saveSurvey = async () => {
    try {
    if (!surveyForm.clientId) { toast(S.tPickClientFirst, "info"); return; }
    const r = num(surveyForm.rating);
    if (r < 1 || r > 5) { toast(S.tRatingRange, "info"); return; }
    const c = clients.find((x) => x.id === surveyForm.clientId);
    if (!c) return;
    const next = [...(Array.isArray(c.survei) ? c.survei : []), r];
    const nextDesc = [...(Array.isArray(c.surveiCatatan) ? c.surveiCatatan : []), surveyForm.desc.trim()];
    await update("clients", c.id, { survei: next, surveiCatatan: nextDesc });
    log("mencatat survei kepuasan", `${c.name} rating ${r}${surveyForm.desc.trim() ? ` - ${surveyForm.desc.trim()}` : ""}`, "CRM");
    toast(S.tSurveySaved.replace("{n}", String(c.name)));
    setSurveyForm({ clientId: "", rating: "5", desc: "" });
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
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
    try {
    if (!reqForm.client) { toast(S.tClientRequired, "info"); return; }
    if (!reqForm.vessel.trim()) { toast(S.tVesselRequired, "info"); return; }
    if (!reqForm.scope.trim()) { toast(S.tScopeRequired, "info"); return; }
    if (!reqForm.date) { toast(S.dateRequired, "info"); return; }
    const created = await add("requests", {
      id: nextReqId(reqForm.date), vessel: reqForm.vessel.trim(), client: reqForm.client,
      kind: reqForm.kind, scope: reqForm.scope.trim(), value: num(reqForm.value) || 0,
      status: "Baru", date: reqForm.date,
    }, { action: "mencatat request", module: "CRM" });
    toast(S.tRequestLogged.replace("{n}", created.id));
    setShowReq(false);
    setReqForm({ vessel: "", client: "", kind: "Repair Request", scope: "", value: "", date: todayISO() });
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const advanceRequest = async (r: StoreItem, next: string) => {
    try {
    await update("requests", r.id, { status: next });
    log(`mengubah request ke ${next}`, r.id, "CRM");
    toast(S.movedTo.replace("{a}", r.id).replace("{b}", next));
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const convertRequest = async (r: StoreItem) => {
    if (String(r.status) !== "Disetujui") { toast(S.tOnlyApprovedReq, "info"); return; }
    if ((data.quotations ?? []).some((q) => String(q.requestId ?? "") === String(r.id))) { toast(S.tReqHasQuote, "info"); return; }
    try {
      const created = await add("quotations", {
        client: String(r.client ?? ""), vessel: String(r.vessel ?? ""), type: "Repair",
        value: num(r.value) || 0, stage: "Lead", date: todayISO(), requestId: String(r.id),
      }, { action: "mengkonversi request ke quotation", target: `${String(r.id)} → quotation`, module: "CRM" });
      toast(S.tDraftFromReq.replace("{a}", created.id).replace("{b}", String(r.id)));
    } catch {
      toast(S.tReqConvertFail.replace("{n}", String(r.id)), "info");
    }
  };

  /* PO klien dulu hanya bisa dicatat, tidak ada ubah/hapus. PO-nya relate ke
     kontrak, jadi hanya PO dari kontrak yang belum Deal yang boleh diubah -
     setelah kontrak Deal, PO-nya jadi bagian dari record penagihan. */
  const clientPoLocked = (p: StoreItem): string | null => {
    const c = contracts.find((x) => String(x.id) === String(p.contractId ?? ""));
    const stage = String(c?.stage ?? "");
    return stage === "Terkonversi" || TERMINAL.includes(stage)
      ? (locale === "en"
        ? `Contract ${String(c?.id)} is ${stage} - this PO belongs to the project billing record.`
        : `Kontrak ${String(c?.id)} sudah ${stage} - PO ini bagian dari record penagihan proyek.`)
      : null;
  };

  const openClientPoEdit = (p: StoreItem) => {
    const locked = clientPoLocked(p);
    if (locked) { toast(locked, "info"); return; }
    setClientPoEditId(String(p.id));
    setPoForm({
      contractId: String(p.contractId ?? ""),
      projectId: String(p.projectId ?? ""),
      no: String(p.no ?? ""),
      amount: String(num(p.amount)),
      date: String(p.date ?? todayISO()),
    });
  };

  const saveClientPo = async () => {
    try {
    if (!poForm.contractId) { toast(S.tPickContractFirst, "info"); return; }
    if (!poForm.projectId) { toast("PO klien wajib memilih proyek", "info"); return; }
    if (!poForm.no.trim()) { toast(S.tPoNoRequired, "info"); return; }
    if (clientPos.some((p) => String(p.no ?? "") === poForm.no.trim() && String(p.id) !== clientPoEditId)) { toast(S.tPoNoUsed, "info"); return; }
    if (num(poForm.amount) <= 0) { toast(S.tPoPositive, "info"); return; }
    if (!poForm.date) { toast(S.tPoDateRequired, "info"); return; }
    // PO klien wajib memilih kontrak + proyek yang cocok satu sama lain.
    const contract = contracts.find((c) => String(c.id) === poForm.contractId);
    const project = projectById[poForm.projectId];
    if (!contract || !project) { toast("Kontrak / proyek PO tidak dikenal", "info"); return; }
    if (contract.projectId && String(contract.projectId) !== String(project.id)) {
      toast(`Kontrak ${contract.id} milik proyek ${contract.projectId} - tidak cocok dengan ${project.id}`, "info");
      return;
    }
    if (contract.quotationId && project.quotationId && String(contract.quotationId) !== String(project.quotationId)) {
      toast(`Kontrak ${contract.id} (quotation ${contract.quotationId}) tidak cocok dengan proyek ${project.id}`, "info");
      return;
    }
    if (!sameName(contract.client, project.client)) {
      toast(`Klien kontrak (${contract.client}) beda dengan klien proyek (${project.client})`, "info");
      return;
    }
    const payload = {
      contractId: poForm.contractId, projectId: poForm.projectId,
      no: poForm.no.trim(), amount: num(poForm.amount), date: poForm.date,
    };
    if (clientPoEditId) {
      await update("clientPos", clientPoEditId, payload);
      log("mengubah PO klien", `${clientPoEditId} - ${payload.no}`, "CRM");
      toast(locale === "en" ? `Client PO ${clientPoEditId} updated` : `PO klien ${clientPoEditId} diperbarui`);
      setClientPoEditId(null);
    } else {
      const created = await add("clientPos", payload, { action: "mencatat PO klien", target: payload.no, module: "CRM" });
      toast(S.tPoLogged.replace("{a}", created.id).replace("{b}", payload.no));
    }
    setPoForm({ contractId: "", projectId: "", no: "", amount: "", date: todayISO() });
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const confirmDelClientPo = async () => {
    if (!delClientPo) return;
    const locked = clientPoLocked(delClientPo);
    if (locked) { toast(locked, "info"); setDelClientPo(null); return; }
    try {
      await remove("clientPos", String(delClientPo.id));
      log("menghapus PO klien", `${String(delClientPo.id)} - ${String(delClientPo.no ?? "")}`, "CRM");
      toast(locale === "en" ? `Client PO ${String(delClientPo.no ?? "")} deleted` : `PO klien ${String(delClientPo.no ?? "")} dihapus`);
      setDelClientPo(null);
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
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
  const sortedContracts = useMemo(() => sortRows(contracts, sort, (k, key) =>
    key === "kontrak" ? String(k.id ?? "") : key === "quotation" ? String(k.quotationId ?? "") : key === "nilai" ? Number(k.value ?? 0) : key === "sign" ? String(k.signedAt ?? "") : String(k.status ?? "")
  ), [contracts, sort]);
  const quotPager = usePager(penawaranList.length);
  const reqPager = usePager(requests.length);
  const contractPager = usePager(contracts.length);
  /* Terjemahkan sekumpulan id deep-link menjadi tab + sorotan. Satu id (klik
     banner modul) dan banyak id (klik kartu Dashboard "Kontrak Menang",
     yang mengirim seluruh won / terkonversi) memakai jalur yang sama. */
  const pickNotifIds = (ids: string[]): void => {
    if (ids.length === 0) return;
    const mark = (index: number, pager: { go: (p: number) => void; size: number }): void => {
      if (ids.length > 1) flash.pickMany(ids, index, pager.go, pager.size);
      else flash.pick(ids[0] as string, index, pager.go, pager.size);
    };
    const toTab = (name: string, after: () => void): void => {
      if (tab === name) { after(); return; }
      setTab(name);
      window.setTimeout(after, 250);
    };

    const reqIdx = requests.findIndex((r) => ids.includes(String(r.id)));
    const quotIdx = penawaranList.findIndex((q) => ids.includes(String(q.id)));
    const conIdx = sortedContracts.findIndex((k) => ids.includes(String(k.id)));

    /* Tab yang DIMINTA diperiksa lebih dulu. Tanpa ini, id kontrak (tab
       Kontrak) tidak akan pernah ditemukan karena `quotIdx` searched lebih
       dulu dan langsung membuka tab Penawaran - menimpa tab yang justru
       diminta pengguna. Finance sudah memakai urutan ini (lihat pickNotifIds
       di Finance.tsx); di CRM urutannya terbalik. */
    if (tab === "Kontrak" && conIdx >= 0) { mark(conIdx, contractPager); return; }
    if (tab === "Penawaran" && quotIdx >= 0) { mark(quotIdx, quotPager); return; }
    if (tab === "Request" && reqIdx >= 0) { mark(reqIdx, reqPager); return; }

    if (reqIdx >= 0) { toTab("Request", () => mark(reqIdx, reqPager)); return; }
    if (conIdx >= 0) { toTab("Kontrak", () => mark(conIdx, contractPager)); return; }
    if (quotIdx >= 0) { toTab("Penawaran", () => mark(quotIdx, quotPager)); return; }
    mark(-1, { go: () => {}, size: 100 });
  };

  /* Satu id dari banner modul. */
  const pickNotif = (rowId: string): void => pickNotifIds([rowId]);

  /* Deep-link Dashboard (?tab=Kontrak&highlight=QT-..): pindah tab + flash baris. */
  useDeepLinkTarget(deepParams.tab, deepParams.highlight, setTab, pickNotifIds);
  /* Fetch per-batch modul (pengganti resync penuh). */
  useModuleSync(CRM_COLS);

  useEffect(() => {
    quotPager.reset();
    reqPager.reset();
    contractPager.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oldOnly, tab]);

  const openConvert = (q: StoreItem) => {
    setHoChecks([false, false, false, false]);
    setHoBy("Tim Commercial");
    setConvManager(String(q.pic ?? q.manager ?? ""));
    setConvStart(todayISO());
    setConvEnd("");
    setConvertTarget(q);
  };

  const exportForecast = () => {
    const rows: unknown[][] = [
      ["Tahap", "Probabilitas", "Jumlah", "Nilai (Rp)", "Weighted (Rp)"],
      ...forecastRows.map((r) => [r.stage, `${Math.round(r.prob * 100)}%`, r.count, r.nilai, r.weighted]),
      ["Total forecast weighted", "", "", "", forecastTotal],
    ];
    void exportExcel(rows, `forecast-weighted-${todayISO()}`, "Forecast").catch(() => toast(S.saveFail, "info"));
    toast(S.tForecastExported.replace("{n}", fmtMiliar(forecastTotal)));
  };

  return (
    <div>
      <PageHeader
        title={S.crmTitle}
        subtitle={S.crmSubtitle}
        icon={<Handshake className="h-5 w-5" />}
        actions={<button className="btn-primary-gradient" onClick={() => setShowQ(true)}><Plus className="h-4 w-4" /> {S.newQuotation}</button>}
      />

      {modAlert.active && <AlertBannerView items={modAlert.items} onPick={pickNotif} />}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label={S.kpiActiveClients} value={String(clients.length)} icon={<Users2 className="h-5 w-5" />} chip="navy" spark={clientTrend} hint={S.kpiFleetHint.replace("{n}", String(totalFleet))} />
        <KpiCard label={S.kpiPipeline} value={fmtMiliar(pipelineTotal)} delta={S.kpiActiveQuotes.replace("{n}", String(activeQuotes.length))} deltaDirection="up" chip="teal" hint={S.kpiPipelineHint} spark={pipelineTrend} />
        <KpiCard label={S.kpiWinRate} value={`${String(winRate)}%`} delta={S.kpiWinDetail.replace("{a}", String(wonQuotes.length)).replace("{b}", String(totalQuotes))} deltaDirection={wonQuotes.length > 0 ? "up" : "flat"} icon={<Star className="h-5 w-5" />} chip="violet" spark={winRateTrend} />
        <KpiCard label={S.kpiWonValue} value={fmtMiliar(wonValue)} delta={S.kpiWonDelta} deltaDirection="up" chip="amber" hint={S.kpiWonHint} spark={wonTrend} />
      </div>

      <div className="mt-4 card">
        <Tabs tabs={["Klien", "Request", "Pipeline", "Penawaran", "Komunikasi", "Kontrak", "Kepuasan"]} active={tab} onChange={setTab} labels={{ Klien: S.tabKlien, Request: S.tabRequest, Pipeline: S.tabPipeline, Penawaran: S.tabPenawaran, Komunikasi: S.tabKomunikasi, Kontrak: S.tabKontrak, Kepuasan: S.tabKepuasan }} />
        <div className="p-4">
          {tab === "Pipeline" && (
            <div className="space-y-4">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <div className="relative min-w-52 flex-1 sm:max-w-xs">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-steel-400" />
                  <input className="input pl-9 w-full" placeholder={S.pipeSearchPh} aria-label={S.pipeSearchAria} value={crmQ} onChange={(e) => setCrmQ(e.target.value)} />
                </div>
                <FilterPopover
                  activeCount={[stageFilter !== "Semua"].filter(Boolean).length}
                  initial={{ stage: stageFilter }}
                  onReset={() => { setCrmQ(""); setKlasFilter("Semua"); setStageFilter("Semua"); }}
                  onApply={(d) => { setStageFilter(d.stage); }}
                >
                  {(draft, setDraft) => (
                    <div className="space-y-3">
                      <Field label={S.stageLabel}>
                        <select className="input w-full" value={draft.stage} onChange={(e) => setDraft({ ...draft, stage: e.target.value })}>
                          {["Semua", ...STAGES].map((s) => <option key={s} value={s}>{s === "Semua" ? S.allStages : dispStage(s)}</option>)}
                        </select>
                      </Field>
                    </div>
                  )}
                </FilterPopover>
                {(crmQ.trim() !== "" || stageFilter !== "Semua") && (
                  <span className="text-xs text-steel-400">
                    {S.pipeFilterActive.replace("{n}", String(quotations.filter((q) => {
                      if (stageFilter !== "Semua" && String(q.stage) !== stageFilter) return false;
                      const needle = crmQ.trim().toLowerCase();
                      if (!needle) return true;
                      return `${q.vessel ?? ""} ${q.client ?? ""} ${q.id ?? ""}`.toLowerCase().includes(needle);
                    }).length))}
                  </span>
                )}
              </div>
              {/* Distribusi + Funnel berdampingan (kanan-kiri) di layar lebar. */}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card className="h-full">
                <CardHeader title={S.distTitle} subtitle={S.distSub} />
                <div className="flex flex-wrap items-center gap-6 p-4 pt-0">
                  <Donut data={stageDist} colors={stageDist.map((d) => d.color)} size={150} thickness={20} centerValue={String(quotations.length)} centerLabel="QT" />
                  <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
                    {stageDist.map((d) => (
                      <div key={d.name} className="flex items-center gap-2 text-sm">
                        <span className="h-3 w-3 rounded-sm" style={{ background: d.color }} />
                        <span className="truncate text-steel-600" title={dispStage(d.name)}>{dispStage(d.name)}</span>
                        <span className="ml-auto font-semibold text-navy-900">{d.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
              <Card className="h-full">
                <CardHeader
                  title={locale === "en" ? "Funnel per stage" : "Funnel per Tahap"}
                  subtitle={locale === "en"
                    ? "Count and value of real quotations per stage"
                    : "Jumlah dan nilai quotation nyata per tahap"}
                />
                <div className="max-h-80 space-y-2 overflow-y-auto p-4 pt-0">
                  {funnelMax === 0 && (
                    <p className="text-sm text-steel-400">
                      {locale === "en" ? "No quotation yet." : "Belum ada quotation."}
                    </p>
                  )}
                  {crmFunnelReal.map((f, i) => {
                    const prev = i > 0 ? crmFunnelReal[i - 1] : null;
                    const conv = prev && prev.count > 0 ? Math.round((f.count / prev.count) * 100) : null;
                    return (
                      <div key={f.rawStage} className="rounded-lg border border-steel-100 p-2.5">
                        <div className="flex items-baseline gap-2 text-sm">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: f.color }} />
                          <span className="truncate font-medium text-navy-900">{f.stage}</span>
                          {conv !== null && (
                            <span className="text-[11px] text-steel-400">
                              {locale === "en" ? "from prev" : "dari tahap sebelum"} {conv}%
                            </span>
                          )}
                          <span className="ml-auto font-semibold text-navy-900">{f.count}</span>
                          <span className="w-24 text-right text-xs text-steel-500">{fmtMiliar(f.value)}</span>
                        </div>
                        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-steel-100">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${funnelMax > 0 ? (f.count / funnelMax) * 100 : 0}%`,
                              background: f.color,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                {STAGES.map((stage) => {
                  const items = quotations.filter((q) => {
                    if (q.stage !== stage) return false;
                    if (stageFilter !== "Semua" && String(q.stage) !== stageFilter) return false;
                    const needle = crmQ.trim().toLowerCase();
                    if (!needle) return true;
                    return `${q.vessel ?? ""} ${q.client ?? ""} ${q.id ?? ""}`.toLowerCase().includes(needle);
                  });
                  return (
                    <div key={stage} className="rounded-xl bg-surface p-3">
                      <div className="mb-3 flex items-center justify-between">
                        <h3 className="truncate text-sm font-semibold text-navy-900" title={dispStage(stage)}>{dispStage(stage)}</h3>
                        <Badge tone="gray">{items.length}</Badge>
                      </div>
                      <div className="space-y-2.5">
                        {items.map((q) => (
                          <Card key={q.id} className="card-hover p-3">
                            <p className="truncate text-sm font-semibold text-navy-900" title={String(q.vessel)}>{String(q.vessel)}</p>
                            <p className="truncate text-xs text-steel-500" title={String(q.client)}>{String(q.client)}</p>
                            <p className="mt-0.5 text-xs text-steel-500">{String(q.type)} · {fmtTanggal(String(q.date ?? ""))} · {S.ageDays.replace("{n}", String(umurHari(String(q.date ?? "")) ?? "-"))}{(umurHari(String(q.date ?? "")) ?? 0) > 30 && !isTerminal(String(q.stage)) ? S.ageOld : ""}</p>
                            <div className="mt-2 flex items-center justify-between">
                              <span className="font-semibold text-navy-800">{fmtMiliar(num(q.value))}</span>
                              <Badge tone={STAGE_TONE[String(q.stage)] ?? "gray"}>{q.id}</Badge>
                            </div>
                            <Link to={`/crm/quotation/${q.id}`} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-ocean-600 hover:text-ocean-500">
                              {S.detailBtn} <ArrowRight className="h-3 w-3" />
                            </Link>
                            {!isTerminal(stage) && (
                              <div className="mt-2 space-y-1.5">
                                {stage !== "Menang" ? (
                                  <button className="btn-secondary flex-1 justify-center py-1 text-xs w-full" onClick={() => advance(q)}>
                                    {S.advanceBtn} <ArrowRight className="h-3 w-3" />
                                  </button>
                                ) : (
                                  <button className="btn-primary flex-1 justify-center py-1 text-xs w-full" onClick={() => openConvert(q)}>
                                    {S.toProjectBtn}
                                  </button>
                                )}
                                <div className="flex gap-1.5">
                                  <button className="btn-secondary flex-1 justify-center py-1 text-xs" onClick={() => markTerminal(q, "Batal")}>{S.cancelBtn}</button>
                                  <button className="btn-secondary flex-1 justify-center py-1 text-xs" onClick={() => markTerminal(q, "Kalah")}>{S.loseBtn}</button>
                                </div>
                              </div>
                            )}
                          </Card>
                        ))}
                        {items.length === 0 && <p className="py-4 text-center text-xs text-steel-400">{S.emptyPipe}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {tab === "Klien" && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-52 flex-1 sm:max-w-xs">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-steel-400" />
                  <input className="input pl-9 w-full" placeholder={S.clientSearchPh} aria-label={S.clientSearchAria} value={crmQ} onChange={(e) => setCrmQ(e.target.value)} />
                </div>
                <FilterPopover
                  activeCount={[klasFilter !== "Semua"].filter(Boolean).length}
                  initial={{ klasifikasi: klasFilter }}
                  onReset={() => { setCrmQ(""); setKlasFilter("Semua"); setStageFilter("Semua"); }}
                  onApply={(d) => { setKlasFilter(d.klasifikasi); }}
                >
                  {(draft, setDraft) => (
                    <div className="space-y-3">
                      <Field label={S.klasLabel}>
                        <select className="input w-full" value={draft.klasifikasi} onChange={(e) => setDraft({ ...draft, klasifikasi: e.target.value })}>
                          {["Semua", ...KLASIFIKASI].map((k) => <option key={k} value={k}>{k === "Semua" ? S.allKlas : k}</option>)}
                        </select>
                      </Field>
                    </div>
                  )}
                </FilterPopover>
                {(crmQ.trim() !== "" || klasFilter !== "Semua") && (
                  <span className="text-xs text-steel-400">
                    {S.clientFilterActive.replace("{n}", String(visibleClients.length))}
                  </span>
                )}
                <button className="btn-secondary ml-auto text-xs" onClick={() => setShowClient(true)}><Plus className="h-3.5 w-3.5" /> {S.addClientBtn}</button>
              </div>
              {visibleClients.length === 0 ? (
                <EmptyState title={S.emptyClientTitle} subtitle={S.emptyClientSub} />
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
                              <p className="text-xs text-steel-500">{S.clientSince.replace("{a}", String(c.id)).replace("{b}", String(c.since ?? "-"))}</p>
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
                          <div className="flex justify-between"><span className="text-steel-500">{S.fleetLabel}</span><span className="font-semibold">{S.unitSuffix.replace("{n}", String(num(c.fleet)))}</span></div>
                          <div className="mt-1 flex justify-between"><span className="text-steel-500">{S.quoteValueLabel}</span><span className="font-semibold">{fmtMiliar(cqVal)}</span></div>
                          <div className="mt-1 flex justify-between"><span className="text-steel-500">{S.creditLimitLabel}</span><span className="font-semibold">{fmtRupiah(num(c.creditLimit))}</span></div>
                          <div className="mt-1 flex justify-between"><span className="text-steel-500">{S.paymentTermsLabel}</span><span className="font-semibold">{String(c.paymentTerms ?? "NET 30")}</span></div>
                          <div className="mt-1 flex justify-between"><span className="text-steel-500">{S.runningProjects}</span><span className="font-semibold">{S.projectCount.replace("{n}", String(data.projects.filter((p) => sameName(p.client, c.name) && p.status !== "Selesai").length))}</span></div>
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
                {(locale === "en" ? S.oldLeadFilter : S.oldLeadFilter.replace(/lead/gi, "prospek")).replace("{n}", String(oldLeads.length))}
              </label>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {quotPager.slice(penawaranList).map((q) => (
                <Card key={q.id} id={notifRowId(String(q.id))} className={`p-4 ${rowHighlightClass({ id: String(q.id), flash, notified: notified.has(String(q.id)) })}`}>
                  <div className="flex justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-navy-900" title={String(q.vessel)}>{String(q.vessel)}</p>
                      <p className="text-xs text-steel-500">{String(q.client)} · {String(q.type)} · {fmtTanggal(String(q.date ?? ""))} · {S.ageDays.replace("{n}", String(umurHari(String(q.date ?? "")) ?? "-"))}</p>
                      {q.statusKirim === "Terkirim" && (
                        <p className="mt-0.5 text-xs text-teal-600">{S.sentInfo.replace("{a}", fmtTanggal(String(q.sentAt ?? ""))).replace("{b}", String(q.sentTo ?? ""))}</p>
                      )}
                    </div>
                    <Badge tone={STAGE_TONE[String(q.stage)] ?? "gray"}>{dispStage(String(q.stage))}</Badge>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-lg font-bold text-navy-900">{fmtMiliar(num(q.value))}</span>
                    <div className="flex gap-1.5">
                      <Link to={`/crm/quotation/${q.id}`} className="btn-secondary text-xs">{S.detailBtn}</Link>
                      <button className="btn-secondary text-xs" onClick={() => openSend(q)}><Send className="h-3.5 w-3.5" /> {S.sendBtn}</button>
                      {!isTerminal(String(q.stage)) && q.stage !== "Menang" && <button className="btn-secondary text-xs" onClick={() => advance(q)}>{S.advanceBtn}</button>}
                      {!isTerminal(String(q.stage)) && q.stage === "Menang" && <button className="btn-primary text-xs" onClick={() => openConvert(q)}>{S.toProjectBtn}</button>}
                      {String(q.stage) === "Lead" && <button className="btn-secondary text-xs text-rose-600" onClick={() => setDelQuote(q)}>{S.deleteBtn}</button>}
                    </div>
                  </div>
                  {!isTerminal(String(q.stage)) && (
                    <div className="mt-2 flex gap-1.5">
                      <button className="btn-secondary flex-1 justify-center py-1 text-xs" onClick={() => markTerminal(q, "Batal")}>{S.markCancelBtn}</button>
                      <button className="btn-secondary flex-1 justify-center py-1 text-xs" onClick={() => markTerminal(q, "Kalah")}>{S.markLoseBtn}</button>
                    </div>
                  )}
                </Card>
              ))}
              {penawaranList.length === 0 && <EmptyState title={S.emptyQuoteTitle} subtitle={oldOnly ? S.emptyQuoteOld : S.emptyQuoteNew} />}
            </div>
            {quotPager.bar}
            </div>
          )}

          {tab === "Request" && (
            <div className="space-y-3">
              <div className="flex items-center justify-end">
                <button className="btn-secondary text-xs" onClick={() => setShowReq(true)}><Plus className="h-3.5 w-3.5" /> {S.newRequestBtn}</button>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {reqPager.slice(requests).map((r) => (
                  <Card key={r.id} id={notifRowId(String(r.id))} className={`p-4 ${rowHighlightClass({ id: String(r.id), flash, notified: notified.has(String(r.id)) })}`}>
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
                      {String(r.status) === "Baru" && <button className="btn-secondary text-xs text-rose-600" onClick={() => setDelReq(r)}>{S.deleteBtn}</button>}
                      {String(r.status) === "Disurvei" && <button className="btn-secondary text-xs" onClick={() => advanceRequest(r, "Diajukan")}>Diajukan</button>}
                      {String(r.status) === "Diajukan" && (<>
                        <button className="btn-secondary text-xs" onClick={() => advanceRequest(r, "Disetujui")}>Disetujui</button>
                        <button className="btn-secondary text-xs" onClick={() => advanceRequest(r, "Ditolak")}>Ditolak</button>
                      </>)}
                      {String(r.status) === "Disetujui" && <button className="btn-primary text-xs" onClick={() => convertRequest(r)}>{S.toQuotationBtn}</button>}
                    </div>
                  </Card>
                ))}
                {requests.length === 0 && <EmptyState title={S.emptyReqTitle} subtitle={S.emptyReqSub} />}
              </div>
              {reqPager.bar}
            </div>
          )}

          {tab === "Komunikasi" && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <Card className="p-4 lg:col-span-2">
                <CardHeader title={S.commLogTitle} subtitle={S.commLogSub} />
                {communications.length === 0 ? (
                  <EmptyState title={S.emptyCommTitle} subtitle={S.emptyCommSubClient} />
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
                <CardHeader title={S.addCommTitle} />
                <div className="space-y-3 px-1 pb-1">
                  <Field label={S.quotationLabel}>
                    <select className="input" value={commForm.quotationId} onChange={(e) => setCommForm({ ...commForm, quotationId: e.target.value })}>
                      <option value="">{S.pickOpt}</option>
                      {quotations.map((q) => <option key={q.id} value={q.id}>{q.id} · {String(q.vessel)}</option>)}
                    </select>
                  </Field>
                  <FormGrid>
                    <Field label={S.channelLabel}>
                      <select className="input" value={commForm.channel} onChange={(e) => setCommForm({ ...commForm, channel: e.target.value })}>
                        {["Email", "Telepon", "Meeting", "WhatsApp", "Kunjungan"].map((c) => <option key={c}>{c}</option>)}
                      </select>
                    </Field>
                    <Field label={S.dateLabel}><input type="date" className="input" value={commForm.date} onChange={(e) => setCommForm({ ...commForm, date: e.target.value })} /></Field>
                  </FormGrid>
                  <Field label={S.summaryLabel}><textarea className="input" rows={3} value={commForm.summary} onChange={(e) => setCommForm({ ...commForm, summary: e.target.value })} placeholder={S.commSummaryPh} /></Field>
                  <Field label={S.byLabel}><input className="input" value={commForm.by} onChange={(e) => setCommForm({ ...commForm, by: e.target.value })} placeholder={S.byPh} /></Field>
                  <button className="btn-primary w-full justify-center" onClick={saveComm}>{S.saveLogBtn}</button>
                </div>
              </Card>
            </div>
          )}

          {tab === "Kontrak" && (
            <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <Card className="p-4 lg:col-span-2">
                <CardHeader title={S.contractListTitle} subtitle={S.contractListSub} />
                {contracts.length === 0 ? (
                  <EmptyState title={S.emptyContractTitle} subtitle={S.emptyContractSub} />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-surface sticky top-0 z-10">
                        <tr><SortTh label={S.sortContract} sortKey="kontrak" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.sortQuotation} sortKey="quotation" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.sortValue} sortKey="nilai" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.sortSign} sortKey="sign" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.sortStatus} sortKey="status" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><th className="th">{locale === "en" ? "Actions" : "Aksi"}</th></tr>
                      </thead>
                      <tbody className="divide-y divide-steel-100">
                        {contractPager.slice(sortedContracts).map((k) => (
                          <tr key={k.id} id={notifRowId(String(k.id))} className={rowHighlightClass({ id: String(k.id), flash, notified: notified.has(String(k.id)), base: "hover:bg-surface" })}>
                            <td className="td font-mono text-xs font-semibold text-navy-900">{k.id}<span className="block font-sans text-[11px] font-normal text-steel-500">{String(k.client ?? "")}</span></td>
                            <td className="td font-mono text-xs"><Link to={`/crm/quotation/${k.quotationId}`} className="text-ocean-600">{String(k.quotationId)}</Link>{k.projectId ? <Link to={`/proyek/${k.projectId}`} className="block text-[11px] text-teal-600">{String(k.projectId)}</Link> : null}</td>
                            <td className="td text-xs font-semibold">{fmtRupiah(num(k.value))}
                              {k.projectId && projectById[String(k.projectId)] && num(projectById[String(k.projectId)].budget) !== num(k.value) ? (
                                <span className="mt-1 block"><Badge tone="red">Beda budget proyek</Badge></span>
                              ) : null}
                            </td>
                            <td className="td text-xs text-steel-600">{fmtTanggal(String(k.signedAt ?? ""))}</td>
                            <td className="td"><StatusBadge status={String(k.status ?? "Aktif")} /></td>
                            <td className="td">
                              <div className="flex gap-1.5">
                                {/* Ubah: nilai kontrak, tanggal tanda tangan, dan
                                    proyek tertaut TIDAK bisa dikoreksi tanpa
                                    jalur ini - dan nilai kontrak disinkronkan
                                    ke projects.budget saat dibuat, jadi
                                    perubahan nilai harus menyinkronkan budget
                                    juga (lihat saveContractEdit). */}
                                <button className="btn-secondary text-xs" onClick={() => openContractEdit(k)}>
                                  {locale === "en" ? "Edit" : "Ubah"}
                                </button>
                                {/* Hapus dulu hanya untuk kontrak yang BELUM
                                    di-link ke proyek. Sekarang tersedia juga
                                    untuk kontrak terpaut - konfirmasi akan
                                    memblokir bila masih ada clientPos / 
                                    invoice yang merujuk (contractBlockers). */}
                                <button className="btn-secondary text-xs text-rose-600" onClick={() => setDelContract(k)}>{S.deleteBtn}</button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {contractPager.bar}
                  </div>
                )}
              </Card>
              <Card className="p-4">
                <CardHeader
                  title={contractEditId
                    ? (locale === "en" ? `Edit contract - ${contractEditId}` : `Ubah Kontrak - ${contractEditId}`)
                    : S.createContractTitle}
                  subtitle={contractEditId
                    ? (locale === "en"
                      ? "Saving also syncs the linked project's budget to this value."
                      : "Menyimpan juga menyinkronkan budget proyek tertaut ke nilai ini.")
                    : S.createContractSub}
                />
                <div className="space-y-3 px-1 pb-1">
                  <Field label={S.contractQuoteLabel}>
                    {/* Saat koreksi, penawaran TIDAK bisa diganti: kontrak
                        sudah terbit dari penawaran tertentu, menukarnya
                        mencabut jejak SPA dan RFQ-nya. */}
                    <select
                      className="input"
                      disabled={contractEditId !== null}
                      value={contractForm.quotationId}
                      onChange={(e) => {
                        const q = quotations.find((x) => x.id === e.target.value);
                        setContractForm({ ...contractForm, quotationId: e.target.value, value: q ? String(q.value) : "" });
                      }}
                    >
                      <option value="">{S.pickOpt}</option>
                      {eligibleQuotations.map((q) => <option key={q.id} value={q.id}>{q.id} · {String(q.vessel)} · {fmtMiliar(num(q.value))}</option>)}
                    </select>
                  </Field>
                  <Field label={S.contractValueLabel}><NumInput min={0} className="input" value={contractForm.value} onChange={(e) => setContractForm({ ...contractForm, value: e.target.value })} /></Field>
                  <Field label={S.signDateLabel}><input type="date" className="input" value={contractForm.signedAt} onChange={(e) => setContractForm({ ...contractForm, signedAt: e.target.value })} /></Field>
                  <Field label={S.linkProjectLabel}>
                    <select className="input" value={contractForm.projectId} onChange={(e) => setContractForm({ ...contractForm, projectId: e.target.value })}>
                      <option value="">{S.noLinkOpt}</option>
                      {data.projects.map((p) => <option key={p.id} value={p.id}>{p.id} · {String(p.vessel)}</option>)}
                    </select>
                  </Field>
                  <div className="flex gap-2">
                    <button className="btn-primary flex-1 justify-center" onClick={contractEditId ? saveContractEdit : saveContract}>
                      {contractEditId ? (locale === "en" ? "Save changes" : "Simpan Perubahan") : S.saveContractBtn}
                    </button>
                    {contractEditId && (
                      <button className="btn-secondary" onClick={closeContractModal}>
                        {locale === "en" ? "Cancel" : "Batal"}
                      </button>
                    )}
                  </div>
                </div>
              </Card>
            </div>
            <Card className="mt-4 p-4">
              <CardHeader title={S.clientPoTitle.replace("{n}", String(clientPos.length))} subtitle={S.clientPoSub} />
              {clientPos.length === 0 ? (
                <EmptyState title={S.emptyPoTitle} subtitle={S.emptyPoSub} />
              ) : (
                <div className="space-y-2">
                  {clientPos.map((p) => (
                    <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface p-3 text-sm">
                      <span className="font-mono font-semibold text-navy-900">{String(p.no)}</span>
                      <span className="text-xs text-steel-500">{S.poMeta.replace("{a}", String(p.contractId ?? "-")).replace("{b}", p.projectId ? S.poMetaProj.replace("{n}", String(p.projectId)) : "").replace("{c}", fmtTanggal(String(p.date ?? "")))}</span>
                      <span className="font-semibold text-navy-900">{fmtRupiah(num(p.amount))}</span>
                      <div className="flex gap-1.5">
                        <button className="btn-secondary text-xs" onClick={() => openClientPoEdit(p)}>{locale === "en" ? "Edit" : "Ubah"}</button>
                        <button className="btn-secondary text-xs text-rose-600" onClick={() => setDelClientPo(p)}>{locale === "en" ? "Delete" : "Hapus"}</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-3 grid grid-cols-1 gap-2 border-t border-steel-100 pt-3 sm:grid-cols-5">
                <Field label={S.contractLabel}>
                  <select className="input" value={poForm.contractId} onChange={(e) => setPoForm({ ...poForm, contractId: e.target.value })}>
                    <option value="">{S.pickOpt}</option>
                    {contracts.map((c) => <option key={c.id} value={c.id}>{c.id} · {String(c.client ?? "")}</option>)}
                  </select>
                </Field>
                <Field label={S.projectOptLabel}>
                  <select className="input" value={poForm.projectId} onChange={(e) => setPoForm({ ...poForm, projectId: e.target.value })}>
                    <option value="">{S.noLinkOpt}</option>
                    {data.projects.map((p) => <option key={p.id} value={p.id}>{p.id}</option>)}
                  </select>
                </Field>
                <Field label={S.poNoLabel}><input className="input font-mono" value={poForm.no} onChange={(e) => setPoForm({ ...poForm, no: e.target.value })} placeholder={S.poNoPh} /></Field>
                <Field label={S.amountLabel}><NumInput min={0} className="input" value={poForm.amount} onChange={(e) => setPoForm({ ...poForm, amount: e.target.value })} /></Field>
                <Field label={S.dateLabel}><input type="date" className="input" value={poForm.date} onChange={(e) => setPoForm({ ...poForm, date: e.target.value })} /></Field>
              </div>
              <button className="btn-secondary mt-2 text-xs" onClick={() => { setClientPoEditId(null); setPoForm({ contractId: "", projectId: "", no: "", amount: "", date: todayISO() }); void saveClientPo(); }}><Plus className="h-3.5 w-3.5" /> {clientPoEditId ? (locale === "en" ? "Update PO" : "Perbarui PO") : S.logPoBtn}</button>
              {clientPoEditId && (
                <button className="btn-secondary ml-2 mt-2 text-xs" onClick={() => { setClientPoEditId(null); setPoForm({ contractId: "", projectId: "", no: "", amount: "", date: todayISO() }); }}>
                  {locale === "en" ? "Cancel" : "Batal"}
                </button>
              )}
            </Card>
            </div>
          )}

          {tab === "Kepuasan" && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <Card className="p-4 lg:col-span-2">
                <CardHeader title={S.satTitle} subtitle={S.satSub.replace("{a}", globalSatisfaction ? globalSatisfaction.toFixed(1) : "-").replace("{b}", String(allSurveys.length))} />
                <div className="space-y-2">
                  {clients.map((c) => {
                    /* Tidak ada lagi .slice(-3): tiga catatan terakhir tampil,
                       sisanya tidak bisa dibaca di mana pun di aplikasi ini
                       dan tidak ada tombol "lihat semua". Kolder membosankan
                       bukan alasan menyembunyikan umpan balik pelanggan. */
                    const notes = Array.isArray(c.surveiCatatan) ? (c.surveiCatatan as unknown[]).map(String).filter((x) => x.trim() !== "") : [];
                    const open = !!expandedSurvey[String(c.id)];
                    return (
                    <div key={c.id} className="flex items-start gap-3 rounded-xl bg-surface p-3 text-sm">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-navy-900" title={String(c.name)}>{String(c.name)}</p>
                        <p className="text-xs text-steel-500">{S.satDetail.replace("{a}", String(Array.isArray(c.survei) ? c.survei.length : 0)).replace("{b}", surveyAvg(c) ? surveyAvg(c).toFixed(1) : "-")}</p>
                        {notes.length === 0 && <p className="mt-0.5 text-xs italic text-steel-400">{S.satNoNotes}</p>}
                        {notes.map((note, i) => {
                          const shown = open || note.length <= SURVEY_PREVIEW ? note : `${note.slice(0, SURVEY_PREVIEW)}…`;
                          return (
                            <p key={i} className="mt-0.5 text-xs italic leading-relaxed text-steel-500" title={open ? undefined : note}>
                              “{shown}”
                            </p>
                          );
                        })}
                        {/* Tombol expand/collapse SELALU ada untuk catatan
                            yang ada - bukan hanya yang panjang. Versi lama
                            memakai `long &&`, jadi catatan pendek tampil utuh
                            tanpa tombol sama sekali, persis kebalikan dari
                            permintaan "deskripsi jangan langsung ditampilkan".
                            Saat tertutup deskripsi dipangkas; saat terbuka
                            penuh. */}
                        {notes.length > 0 && (
                          <button type="button" onClick={() => toggleSurvey(String(c.id))} aria-expanded={open} className="mt-1 text-[11px] font-semibold text-ocean-600 hover:underline">
                            {open
                              ? S.satCollapse
                              : notes.length > 1
                                ? S.satExpandMore.replace("{n}", String(notes.length))
                                : S.satExpand}
                          </button>
                        )}
                      </div>
                      <Badge tone={surveyAvg(c) >= 4 ? "green" : surveyAvg(c) >= 3 ? "amber" : "gray"}>
                        <Star className="h-3 w-3 mr-0.5" /> {surveyAvg(c) ? surveyAvg(c).toFixed(1) : "-"}
                      </Badge>
                    </div>
                    );
                  })}
                </div>
              </Card>
              <Card className="p-4">
                <CardHeader title={S.addSurveyTitle} subtitle={S.addSurveySub} />
                <div className="space-y-3 px-1 pb-1">
                  <Field label={S.clientLabel}>
                    <select className="input" value={surveyForm.clientId} onChange={(e) => setSurveyForm({ ...surveyForm, clientId: e.target.value })}>
                      <option value="">{S.pickOpt}</option>
                      {clients.map((c) => <option key={c.id} value={c.id}>{String(c.name)}</option>)}
                    </select>
                  </Field>
                  <Field label={S.ratingLabel}>
                    <select className="input" value={surveyForm.rating} onChange={(e) => setSurveyForm({ ...surveyForm, rating: e.target.value })}>
                      {["1", "2", "3", "4", "5"].map((r) => <option key={r}>{r}</option>)}
                    </select>
                  </Field>
                  <Field label={S.descLabel}>
                    <textarea className="input" rows={2} value={surveyForm.desc} onChange={(e) => setSurveyForm({ ...surveyForm, desc: e.target.value })} placeholder="Ceritakan kecepatan respon, kualitas repair, komunikasi..." />
                  </Field>
                  <button className="btn-primary w-full justify-center" onClick={saveSurvey}>{S.saveSurveyBtn}</button>
                </div>
              </Card>
            </div>
          )}
        </div>
      </div>

      <Card className="mt-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-navy-900">{S.forecastTitle.replace("{n}", fmtMiliar(forecastTotal))}</h3>
            <p className="text-xs text-steel-500">{S.forecastSub.replace("{n}", String(oldLeads.length))}</p>
          </div>
          <button className="btn-secondary text-xs" onClick={exportForecast}>{S.exportForecastBtn}</button>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {forecastRows.map((r) => (
            <Badge key={r.stage} tone="gray">{dispStage(r.stage)} {Math.round(r.prob * 100)}% · {r.count} · {fmtMiliar(r.weighted)}</Badge>
          ))}
        </div>
      </Card>

      <Modal open={showQ} onClose={() => setShowQ(false)} title={S.newQuotation} subtitle={S.newQuoteSub}
        wide footer={<><button className="btn-secondary" onClick={() => setShowQ(false)}>{S.cancelBtn}</button><AsyncButton className="btn-primary" onAction={saveQuotation}>{S.saveQuoteBtn}</AsyncButton></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label={S.clientLabel}>
              <select className="input" value={qForm.client} onChange={(e) => setQForm({ ...qForm, client: e.target.value })}>
                <option value="">{S.pickClientOpt}</option>
                {clients.map((c) => <option key={c.id} value={c.name}>{String(c.name)}</option>)}
              </select>
            </Field>
            <Field label={S.vesselJobLabel}><input className="input" value={qForm.vessel} onChange={(e) => setQForm({ ...qForm, vessel: e.target.value })} placeholder={S.vesselJobPh} /></Field>
            <Field label={S.typeLabel}>
              <select className="input" value={qForm.type} onChange={(e) => setQForm({ ...qForm, type: e.target.value })}>
                <option value="New Build">{dispType("New Build")}</option><option value="Repair">{dispType("Repair")}</option><option value="Retrofit">{dispType("Retrofit")}</option>
              </select>
            </Field>
            <Field label={S.initStageLabel}>
              <select className="input" value={qForm.stage} onChange={(e) => setQForm({ ...qForm, stage: e.target.value })}>
                {FLOW.map((s) => <option key={s} value={s}>{dispStage(s)}</option>)}
              </select>
            </Field>
          </FormGrid>
          <FormGrid>
            <Field label={S.quoteValueField} hint={S.positiveHint}><NumInput min={1} className="input" value={qForm.value} onChange={(e) => setQForm({ ...qForm, value: e.target.value })} /></Field>
            <Field label={S.quoteDateLabel}><input type="date" className="input" value={qForm.date} onChange={(e) => setQForm({ ...qForm, date: e.target.value })} /></Field>
          </FormGrid>
        </div>
      </Modal>

      <ClientModal open={showClient} onClose={() => setShowClient(false)} onSaved={() => undefined} />

      <Modal open={showReq} onClose={() => setShowReq(false)} title={S.newReqTitle} subtitle={S.newReqSub.replace("{n}", nextReqId(reqForm.date || todayISO()))}
        footer={<><button className="btn-secondary" onClick={() => setShowReq(false)}>{S.cancelBtn}</button><button className="btn-primary" onClick={saveRequest}>{S.saveReqBtn}</button></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label={S.clientLabel}>
              <select className="input" value={reqForm.client} onChange={(e) => setReqForm({ ...reqForm, client: e.target.value })}>
                <option value="">{S.pickClientOpt}</option>
                {clients.map((c) => <option key={c.id} value={c.name}>{String(c.name)}</option>)}
              </select>
            </Field>
            <Field label={S.reqVesselLabel}><input className="input" value={reqForm.vessel} onChange={(e) => setReqForm({ ...reqForm, vessel: e.target.value })} placeholder={S.reqVesselPh} /></Field>
            <Field label={S.typeLabel}>
              <select className="input" value={reqForm.kind} onChange={(e) => setReqForm({ ...reqForm, kind: e.target.value })}>
                {REQ_KIND.map((k) => <option key={k} value={k}>{dispReqKind(k)}</option>)}
              </select>
            </Field>
            <Field label={S.dateLabel}><input type="date" className="input" value={reqForm.date} onChange={(e) => setReqForm({ ...reqForm, date: e.target.value })} /></Field>
          </FormGrid>
          <Field label={S.scopeLabel}><textarea className="input" rows={3} value={reqForm.scope} onChange={(e) => setReqForm({ ...reqForm, scope: e.target.value })} placeholder={S.scopePh} /></Field>
          <Field label={S.estValueLabel}><NumInput min={0} className="input" value={reqForm.value} onChange={(e) => setReqForm({ ...reqForm, value: e.target.value })} placeholder={S.estValuePh} /></Field>
        </div>
      </Modal>

      <Modal open={sendTarget !== null} onClose={() => setSendTarget(null)} title={S.sendTitle.replace("{n}", sendTarget?.id ?? "")} subtitle={S.sendPreviewSub}
        wide footer={<><button className="btn-secondary" onClick={() => setSendTarget(null)}>{S.cancelBtn}</button><button className="btn-primary" onClick={confirmSend}><Send className="h-4 w-4" /> {S.sendQuoteBtn}</button></>}>
        {sendTarget && (
          <div className="space-y-3">
            <div className="rounded-xl bg-surface p-4 text-sm">
              <p className="font-semibold text-navy-900">{String(sendTarget.vessel)}</p>
              <p className="text-xs text-steel-500">{String(sendTarget.client)} · {String(sendTarget.type)}</p>
              <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1">
                <span className="text-steel-600">{S.previewValue} <strong className="text-navy-900">{fmtMiliar(num(sendTarget.value))}</strong></span>
                <span className="text-steel-600">{S.previewDate} <strong className="text-navy-900">{fmtTanggal(String(sendTarget.date ?? ""))}</strong></span>
                <span className="text-steel-600">{S.previewStage} <strong className="text-navy-900">{dispStage(String(sendTarget.stage))}</strong></span>
              </div>
            </div>
            <Field label={S.emailToLabel}><input type="email" className="input" value={sendEmail} onChange={(e) => setSendEmail(e.target.value)} placeholder={S.emailToPh} /></Field>
            <Field label={S.coverMsgLabel}><textarea className="input" rows={5} value={sendMsg} onChange={(e) => setSendMsg(e.target.value)} /></Field>
          </div>
        )}
      </Modal>

      <Modal
        open={convertTarget !== null}
        onClose={() => setConvertTarget(null)}
        title={S.convertTitle.replace("{n}", convertTarget?.id ?? "")}
        subtitle={S.convertSubCrm}
        footer={<><button className="btn-secondary" onClick={() => setConvertTarget(null)}>{S.cancelBtn}</button><AsyncButton className="btn-primary" onAction={confirmConvert}>{S.convertConfirmCrm}</AsyncButton></>}
      >
        <div className="space-y-3">
          <p className="text-sm text-steel-600">{S.convertBodyCrm}</p>
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
            <Field label="PM Proyek">
              <select className="input" value={convManager} onChange={(e) => setConvManager(e.target.value)}>
                <option value="">Pilih PM</option>
                {pmCandidates.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </Field>
            <Field label="Rencana mulai"><input type="date" className="input" value={convStart} onChange={(e) => setConvStart(e.target.value)} /></Field>
          </FormGrid>
          <Field label="Rencana selesai"><input type="date" className="input" value={convEnd} onChange={(e) => setConvEnd(e.target.value)} /></Field>
        </div>
      </Modal>

      <ConfirmModal
        open={delClientPo !== null}
        title={delClientPo ? (locale === "en" ? `Delete client PO ${String(delClientPo.no ?? "")}?` : `Hapus PO klien ${String(delClientPo.no ?? "")}?`) : ""}
        desc={delClientPo ? (clientPoLocked(delClientPo) ?? (locale === "en"
          ? `${fmtRupiah(num(delClientPo.amount))} dated ${fmtTanggal(String(delClientPo.date ?? ""))} will be removed.`
          : `${fmtRupiah(num(delClientPo.amount))} bertanggal ${fmtTanggal(String(delClientPo.date ?? ""))} akan dihapus.`)) : ""}
        confirmLabel={locale === "en" ? "Delete" : "Hapus"}
        danger
        confirmDisabled={delClientPo ? clientPoLocked(delClientPo) !== null : false}
        onCancel={() => setDelClientPo(null)}
        onConfirm={confirmDelClientPo}
      />

      <ConfirmModal
        open={delQuote !== null}
        title={delQuote ? (locale === "en" ? `Delete quotation ${delQuote.id}?` : `Hapus penawaran ${delQuote.id}?`) : ""}
        desc={(() => {
          if (!delQuote) return "";
          const used = quoteBlockers(delQuote);
          const base = locale === "en"
            ? `Quotation ${delQuote.id} (${String(delQuote.vessel)}) in Lead stage will be permanently deleted.`
            : `Penawaran ${delQuote.id} (${String(delQuote.vessel)}) tahap Lead akan dihapus permanen.`;
          return used.length > 0
            ? (locale === "en" ? `${base} Blocked by: ${used.join(", ")}.` : `${base} Terhalang: ${used.join(", ")}. Penghapusan diblokir.`)
            : base;
        })()}
        confirmLabel={delQuote && quoteBlockers(delQuote).length > 0
          ? (locale === "en" ? "Blocked - still in use" : "Diblokir - masih dipakai")
          : S.deleteBtn}
        danger
        confirmDisabled={delQuote ? quoteBlockers(delQuote).length > 0 : false}
        onCancel={() => setDelQuote(null)}
        onConfirm={async () => {
          if (!delQuote) return;
          const usedBy = quoteBlockers(delQuote);
          if (usedBy.length > 0) { toast(locale === "en" ? `Delete blocked: ${usedBy.join(", ")}` : `Hapus diblokir: ${usedBy.join(", ")}`, "info"); return; }
          try {
            await remove("quotations", String(delQuote.id));
            log("menghapus penawaran", String(delQuote.id), "CRM");
            toast(locale === "en" ? `Quotation ${delQuote.id} deleted` : `Penawaran ${delQuote.id} dihapus`);
          } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
          setDelQuote(null);
        }}
      />
      <ConfirmModal
        open={delReq !== null}
        title={delReq ? (locale === "en" ? `Delete request ${delReq.id}?` : `Hapus request ${delReq.id}?`) : ""}
        desc={(() => {
          if (!delReq) return "";
          const used = reqBlockers(delReq);
          const base = locale === "en"
            ? `Request ${delReq.id} (${String(delReq.vessel)}) with status Baru will be permanently deleted.`
            : `Request ${delReq.id} (${String(delReq.vessel)}) status Baru akan dihapus permanen.`;
          return used.length > 0
            ? (locale === "en" ? `${base} Blocked by: ${used.join(", ")}.` : `${base} Terhalang: ${used.join(", ")}. Penghapusan diblokir.`)
            : base;
        })()}
        confirmLabel={delReq && reqBlockers(delReq).length > 0
          ? (locale === "en" ? "Blocked - still in use" : "Diblokir - masih dipakai")
          : S.deleteBtn}
        danger
        confirmDisabled={delReq ? reqBlockers(delReq).length > 0 : false}
        onCancel={() => setDelReq(null)}
        onConfirm={async () => {
          if (!delReq) return;
          const usedBy = reqBlockers(delReq);
          if (usedBy.length > 0) { toast(locale === "en" ? `Delete blocked: ${usedBy.join(", ")}` : `Hapus diblokir: ${usedBy.join(", ")}`, "info"); return; }
          try {
            await remove("requests", String(delReq.id));
            log("menghapus request", String(delReq.id), "CRM");
            toast(locale === "en" ? `Request ${delReq.id} deleted` : `Request ${delReq.id} dihapus`);
          } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
          setDelReq(null);
        }}
      />
      <ConfirmModal
        open={delContract !== null}
        title={delContract ? (locale === "en" ? `Delete contract ${delContract.id}?` : `Hapus kontrak ${delContract.id}?`) : ""}
        desc={(() => {
          if (!delContract) return "";
          const used = contractBlockers(delContract);
          const base = locale === "en"
            ? `Contract ${delContract.id} will be permanently deleted.`
            : `Kontrak ${delContract.id} akan dihapus permanen.`;
          const linked = locale === "en"
            ? ` It is linked to project ${String(delContract.projectId)} - that link will be broken (the project itself is kept).`
            : ` Kontrak ini tertaut ke proyek ${String(delContract.projectId)} - tautan tersebut akan dilepas (proyeknya sendiri tetap ada).`;
          return used.length > 0
            ? (locale === "en" ? `${base} Blocked by: ${used.join(", ")}.` : `${base} Terhalang: ${used.join(", ")}. Penghapusan diblokir.`)
            : `${base}${String(delContract.projectId ?? "") !== "" ? linked : ""}`;
        })()}
        confirmLabel={delContract && contractBlockers(delContract).length > 0
          ? (locale === "en" ? "Blocked - still in use" : "Diblokir - masih dipakai")
          : S.deleteBtn}
        danger
        confirmDisabled={delContract ? contractBlockers(delContract).length > 0 : false}
        onCancel={() => setDelContract(null)}
        onConfirm={async () => {
          if (!delContract) return;
          const usedBy = contractBlockers(delContract);
          if (usedBy.length > 0) { toast(locale === "en" ? `Delete blocked: ${usedBy.join(", ")}` : `Hapus diblokir: ${usedBy.join(", ")}`, "info"); return; }
          try {
            await remove("contracts", String(delContract.id));
            log("menghapus kontrak", String(delContract.id), "CRM");
            toast(locale === "en" ? `Contract ${delContract.id} deleted` : `Kontrak ${delContract.id} dihapus`);
          } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
          setDelContract(null);
        }}
      />
    </div>
  );
}
