import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Ship, FileCheck2, History, Plus, Pencil, ShieldCheck, ClipboardCheck, Anchor, Trash2 } from "lucide-react";
import {
  Card,
  PageHeader,
  Badge,
  KpiCard,
  Modal,
  Field,
  FormGrid,
  Tabs,
  toast,
  SortTh,
  toggleSort,
  sortRows,
  NumInput,
  useBusy,
  AsyncButton,
  ConfirmModal,
  RowAction,
  SearchBox,
  rowMatches,
} from "../../components/ui";
import type { SortState } from "../../components/ui";
import SparepartServiceSection from "../proyek/SparepartServiceSection";
import { useStore } from "../../data/store";
import { fmtBulan, fmtJumlah, fmtRupiah, fmtTanggal, monthISO, todayISO } from "../../utils/format";
import { sameName, vesselMatch } from "../../utils/names";
import { COMPLIANCE_ITEMS, complianceSummary } from "./Vessels";
import { getSetting } from "../../utils/settings";
import { useT } from "../../i18n/LanguageContext";
import { n_eqp } from "../../i18n/n_eqp";

function monthDiff(expires: string, base: string): number | null {
  /* Terima YYYY-MM maupun YYYY-MM-DD (sertifikat kini diisi type="date"). */
  const m1 = /^(\d{4})-(\d{2})/.exec(expires ?? "");
  const m2 = /^(\d{4})-(\d{2})/.exec(base ?? "");
  if (!m1 || !m2) return null;
  return (Number(m1[1]) - Number(m2[1])) * 12 + (Number(m1[2]) - Number(m2[2]));
}

function certTone(expires: string, nowMonth: string): "green" | "amber" | "red" {
  const d = monthDiff(expires, nowMonth);
  if (d === null) return "green";
  if (d < 0) return "red";
  if (d <= 3) return "amber";
  return "green";
}

interface PscRow {
  date: string;
  port: string;
  deficiencies: number;
  status: string;
}

interface DockHistoryRow {
  date: string;
  dock: string;
  scope: string;
  result: string;
  nextDue: string;
}

interface PlanRow {
  year: number;
  type: string;
  note: string;
}

interface BunkerRow {
  date: string;
  jenis: string;
  qty: number;
  satuan: string;
}

interface CrewRow {
  name: string;
  role: string;
}

const PSC_STATUS = ["Bersih", "Defisiensi Minor", "Defisiensi Major", "Ditahan"];
const BUNKER_JENIS = ["Solar", "Minyak", "Lumas", "Air"];
const PLAN_TYPES = ["Annual Survey", "Intermediate Survey", "Special Survey", "Docking", "Rencana Galangan"];

export default function VesselDetail() {
  const { id } = useParams();
  const busy = useBusy();
 const { data, update, add, log } = useStore();
  const { locale } = useT();
  const S = n_eqp[locale];
  /* JANGAN fallback ke vessels[0]: kalau id tidak match (kapal dihapus, URL
     basi, id salah ketik) halaman akan menampilkan kapal LAIN dan setiap
     update("vessels", v.id, ...) menulis ke kapal yang salah. */
  const v = data.vessels.find((x) => x.id === id);

  const [showCert, setShowCert] = useState(false);
  const [delCert, setDelCert] = useState<string | null>(null);
  const [certForm, setCertForm] = useState({ name: "", issued: monthISO(), expires: "" });
  const [showSurvey, setShowSurvey] = useState(false);
  const [surveyForm, setSurveyForm] = useState({ type: "Annual Survey", date: "", status: "Terjadwal", linkedTrial: "" });
  const [tab, setTab] = useState("Sertifikat & Timeline");
  const [showSpec, setShowSpec] = useState(false);
  const [specForm, setSpecForm] = useState({ mmsi: "", gt: "", nt: "", bhp: "", engineType: "" });
  const [showPsc, setShowPsc] = useState(false);
  const [pscForm, setPscForm] = useState({ date: todayISO(), port: "", deficiencies: "0", status: "Bersih" });
  const [showDock, setShowDock] = useState(false);
  const [dockForm, setDockForm] = useState({ date: todayISO(), dock: "", scope: "", result: "", nextDue: "" });
  const [editingDock, setEditingDock] = useState<number | null>(null);
  const [planForm, setPlanForm] = useState({ year: String(new Date().getFullYear() + 1), type: "Docking", note: "" });
  const [planQ, setPlanQ] = useState("");
  const [bunkerForm, setBunkerForm] = useState({ date: todayISO(), jenis: "Solar", qty: "", satuan: "liter" });
  const [crewForm, setCrewForm] = useState({ name: "", role: "" });
  const [insForm, setInsForm] = useState({ polis: "", premi: "", expiry: "" });
  const [showIns, setShowIns] = useState(false);
  const [sort, setSort] = useState<SortState>({ key: null, dir: "asc" });

  if (!v) {
    return (
      <div className="card p-6 text-center">
        <p className="text-sm font-semibold text-navy-900">{S.vdNotFound}</p>
        <p className="mt-1 text-xs text-steel-500">
          {locale === "en" ? `No vessel with id "${id}". It may have been deleted.` : `Tidak ada kapal dengan id "${id}". Mungkin sudah dihapus.`}
        </p>
        <Link to="/kapal" className="btn-secondary mt-3 text-xs">{locale === "en" ? "Back to vessels" : "Kembali ke daftar kapal"}</Link>
      </div>
    );
  }

  const nowMonth = todayISO().slice(0, 7);
  const projects = data.projects.filter((p) => sameName(p.vessel, v.name));
  const vesselWarranties = (data.warranties ?? []).filter((w) => String(w.vessel ?? "") === v.name);

  // Klaim garansi/DLP: Aktif → Klaim (lanjut Selesai setelah perbaikan).
  const claimWarranty = async (w: { id: string }) => {
    try {
    await update("warranties", w.id, { status: "Klaim", claimedAt: todayISO() });
    log("mengklaim garansi", `${w.id} · ${v.name}`, "Kapal");
    toast(S.vdWarrantyClaimed.replace("{a}", w.id));
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };
  const closeWarranty = async (w: { id: string }) => {
    try {
    await update("warranties", w.id, { status: "Selesai" });
    log("menyelesaikan garansi", `${w.id} · ${v.name}`, "Kapal");
    toast(S.vdWarrantyClosed.replace("{a}", w.id));
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };
  const surveys = data.surveys.filter((s) => sameName(s.vessel, v.name));
  const vesselTrials = (data.trials ?? []).filter((t) => projects.some((p) => p.id === t.projectId));
  const certs = (v.certificates ?? []) as { name: string; issued?: string; expires: string }[];
  const slots = data.dockSlots.filter((s) => vesselMatch(s.vessel, v.name));
  const pscRows = (v.psc ?? []) as PscRow[];
  const dockHistory = (v.dockHistory ?? []) as DockHistoryRow[];
  const plan5 = (v.plan5 ?? []) as PlanRow[];
  const bunkerRows = (v.bunker ?? []) as BunkerRow[];
  const crewRows = (v.crew ?? []) as CrewRow[];
  const insurance = (v.insurance ?? null) as { polis?: string; premi?: number; expiry?: string } | null;
  const baseYear = new Date().getFullYear();
  const planYears = [1, 2, 3, 4, 5].map((i) => baseYear + i);
  const bunkerTotals = BUNKER_JENIS.map((j) => ({
    jenis: j,
    qty: bunkerRows.filter((b) => b.jenis === j).reduce((s, b) => s + Number(b.qty || 0), 0),
    satuan: bunkerRows.find((b) => b.jenis === j)?.satuan ?? (j === "Air" ? "m³" : "liter"),
  }));
  const comp = complianceSummary(v);
  const complianceRows = COMPLIANCE_ITEMS.map((name) => {
    const found = ((v.compliance ?? []) as { name: string; status: string; date: string }[]).find((r) => r.name === name);
    return found ?? { name, status: "", date: "" };
  });

  const saveCert = async () => {
    try {
    if (!certForm.name.trim() || !certForm.issued || !certForm.expires) { toast(S.vdCertReq, "info"); return; }
    if (certs.some((c) => c.name === certForm.name.trim())) { toast(locale === "en" ? "Certificate name already exists" : "Nama sertifikat sudah ada", "info"); return; }
    await update("vessels", v.id, { certificates: [...certs, { name: certForm.name.trim(), issued: certForm.issued, expires: certForm.expires }] });
    log("menambah sertifikat kapal", `${v.name} · ${certForm.name.trim()} · berlaku s.d. ${certForm.expires}`, "Kapal");
    toast(S.vdCertAdded.replace("{a}", v.name));
    setShowCert(false);
    setCertForm({ name: "", issued: monthISO(), expires: "" });
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  /* Hapus sertifikat: dulu hanya bisa tambah (append-only) sehingga salah
     ketik nama permanen dan key={c.name} bentrok saat nama dobel. */
  const confirmDelCert = async () => {
    const name = delCert;
    if (!name) return;
    setDelCert(null);
    try {
      const next = (data.vessels.find((x) => x.id === id)?.certificates ?? certs) as { name: string; issued: string; expires: string }[];
      await update("vessels", v.id, { certificates: next.filter((c) => c.name !== name) });
      log("menghapus sertifikat kapal", `${v.name} · ${name}`, "Kapal");
      toast(locale === "en" ? "Certificate deleted" : "Sertifikat dihapus");
    } catch (e) {
      toast(e instanceof Error ? e.message : S.saveFail, "info");
    }
  };

  const saveSurvey = async () => {
    try {
    if (!surveyForm.date) { toast(S.vdDateReq, "info"); return; }
    await add("surveys", { vessel: v.name, type: surveyForm.type, status: surveyForm.status, date: surveyForm.date, classSurveyor: "BKI", ...(surveyForm.linkedTrial ? { linkedTrial: surveyForm.linkedTrial } : {}) },
      { action: "menjadwalkan survey", target: `${v.name} · ${surveyForm.type}`, module: "Kapal" });
    await update("vessels", v.id, { history: [...(v.history ?? []), { date: surveyForm.date, event: `${surveyForm.type} (${surveyForm.status.toLowerCase()})`, type: "Survey" }] });
    toast(S.vdSurveyScheduled);
    setShowSurvey(false);
    setSurveyForm({ type: "Annual Survey", date: "", status: "Terjadwal", linkedTrial: "" });
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const openSpec = () => {
    setSpecForm({
      mmsi: String(v.mmsi ?? ""),
      gt: v.gt === undefined || v.gt === null ? "" : String(v.gt),
      nt: v.nt === undefined || v.nt === null ? "" : String(v.nt),
      bhp: v.bhp === undefined || v.bhp === null ? "" : String(v.bhp),
      engineType: String(v.engineType ?? ""),
    });
    setShowSpec(true);
  };

  const saveSpec = async () => {
    try {
    const gt = Number(specForm.gt);
    const bhp = Number(specForm.bhp);
    const nt = specForm.nt.trim() === "" ? 0 : Number(specForm.nt);
    if (!Number.isFinite(gt) || !Number.isFinite(bhp)) { toast(S.vdGtBhpNum, "info"); return; }
    if (String(v.status) !== "Dalam Pembangunan" && (gt <= 0 || bhp <= 0)) { toast(S.vdGtBhpPos, "info"); return; }
    if (!Number.isFinite(nt) || nt < 0) { toast(S.vsNtMin, "info"); return; }
    if (!specForm.engineType.trim()) { toast(S.vsEngineReq, "info"); return; }
    if (specForm.mmsi.trim() !== "" && !/^\d{9}$/.test(specForm.mmsi.trim())) { toast(S.vsMmsiFormat, "info"); return; }
    await update("vessels", v.id, {
      mmsi: specForm.mmsi.trim(),
      gt, nt, bhp,
      engineType: specForm.engineType.trim(),
    });
    toast(S.vdSpecUpdated);
    setShowSpec(false);
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  /* Sinkronkan perubahan kepatuhan SEBELUM patch lain.
     Versi lama membaca v.compliance dari closure, jadi perubahan kedua pada
     baris lain menimpa perubahan pertama (lost update). */
  const setCompliance = async (name: string, patch: { status?: string; date?: string }) => {
    try {
      const fresh = (data.vessels.find((x) => x.id === id)?.compliance ?? v.compliance ?? []) as { name: string; status: string; date: string }[];
      const current = fresh.map((r) => ({ ...r }));
      const idx = current.findIndex((r) => r.name === name);
      if (idx >= 0) {
        current[idx] = { ...current[idx], ...patch };
      } else {
        current.push({ name, status: patch.status ?? "", date: patch.date ?? "" });
      }
      await update("vessels", v.id, { compliance: current });
      log("mengubah kepatuhan kapal", `${v.name} · ${name} → ${patch.status ?? current[idx]?.status ?? ""}`, "Kapal");
      } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const savePsc = async () => {
    try {
    if (!pscForm.date || !pscForm.port.trim()) { toast(S.vdPscReq, "info"); return; }
    const def = Number(pscForm.deficiencies);
    if (!Number.isFinite(def) || def < 0) { toast(S.vdDefNum, "info"); return; }
    await update("vessels", v.id, {
      psc: [...pscRows, { date: pscForm.date, port: pscForm.port.trim(), deficiencies: def, status: pscForm.status }],
    });
    toast(S.vdPscAdded);
    setShowPsc(false);
    setPscForm({ date: todayISO(), port: "", deficiencies: "0", status: "Bersih" });
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const openDockAdd = () => {
    setEditingDock(null);
    setDockForm({ date: todayISO(), dock: "", scope: "", result: "", nextDue: "" });
    setShowDock(true);
  };

  const openDockEdit = (i: number) => {
    const r = dockHistory[i];
    setEditingDock(i);
    setDockForm({ date: r.date, dock: r.dock, scope: r.scope, result: r.result, nextDue: r.nextDue });
    setShowDock(true);
  };

  const saveDock = async () => {
    try {
    if (!dockForm.date || !dockForm.dock.trim()) { toast(S.vdDockReq, "info"); return; }
    if (!dockForm.nextDue) { toast(S.vdNextDueReq, "info"); return; }
    const row: DockHistoryRow = {
      date: dockForm.date,
      dock: dockForm.dock.trim(),
      scope: dockForm.scope.trim(),
      result: dockForm.result.trim(),
      nextDue: dockForm.nextDue,
    };
    const next = dockHistory.slice();
    if (editingDock === null) next.push(row);
    else next[editingDock] = row;
    await update("vessels", v.id, { dockHistory: next });
    toast(editingDock === null ? S.vdDockAdded : S.vdDockUpdated);
    setShowDock(false);
    setEditingDock(null);
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const savePlan = async () => {
    try {
    const year = Number(planForm.year);
    if (!Number.isFinite(year) || year <= baseYear || year > baseYear + 5) { toast(S.vdPlanYearRange.replace("{a}", String(baseYear + 1)).replace("{b}", String(baseYear + 5)), "info"); return; }
    await update("vessels", v.id, { plan5: [...plan5, { year, type: planForm.type, note: planForm.note.trim() }] });
    toast(S.vdPlanAdded.replace("{a}", String(year)));
    setPlanForm({ year: String(baseYear + 1), type: "Docking", note: "" });
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const removePlan = async (idx: number) => {
    try {
    await update("vessels", v.id, { plan5: plan5.filter((_, i) => i !== idx) });
    toast(S.vdPlanRemoved, "info");
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const saveBunker = async () => {
    try {
    if (!bunkerForm.date) { toast(S.vdDateReq, "info"); return; }
    const qty = Number(bunkerForm.qty);
    if (!Number.isFinite(qty) || qty <= 0) { toast(S.vdQtyPos, "info"); return; }
    if (!bunkerForm.satuan.trim()) { toast(S.vdUnitReq, "info"); return; }
    await update("vessels", v.id, { bunker: [...bunkerRows, { date: bunkerForm.date, jenis: bunkerForm.jenis, qty, satuan: bunkerForm.satuan.trim() }] });
    toast(S.vdBunkerAdded);
    setBunkerForm({ date: todayISO(), jenis: "Solar", qty: "", satuan: "liter" });
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const saveCrew = async () => {
    try {
    if (!crewForm.name.trim() || !crewForm.role.trim()) { toast(S.vdCrewReq, "info"); return; }
    await update("vessels", v.id, { crew: [...crewRows, { name: crewForm.name.trim(), role: crewForm.role.trim() }] });
    toast(S.vdCrewAdded);
    setCrewForm({ name: "", role: "" });
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const removeCrew = async (idx: number) => {
    try {
    await update("vessels", v.id, { crew: crewRows.filter((_, i) => i !== idx) });
    toast(S.vdCrewRemoved, "info");
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const openIns = () => {
    setInsForm({ polis: String(insurance?.polis ?? ""), premi: insurance?.premi ? String(insurance.premi) : "", expiry: String(insurance?.expiry ?? "") });
    setShowIns(true);
  };

  const saveIns = async () => {
    try {
    if (!insForm.polis.trim()) { toast(S.vdPolisReq, "info"); return; }
    const premi = Number(insForm.premi || 0);
    if (!Number.isFinite(premi) || premi < 0) { toast(S.vdPremiMin, "info"); return; }
    if (!insForm.expiry) { toast(S.vdInsExpiryReq, "info"); return; }
    await update("vessels", v.id, { insurance: { polis: insForm.polis.trim(), premi, expiry: insForm.expiry } });
    toast(S.vdInsSaved);
    setShowIns(false);
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  return (
    <div>
      <Link to="/kapal" className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-ocean-600 hover:underline">
        <ArrowLeft className="h-4 w-4" /> {S.vdBack}
      </Link>
      <PageHeader
        title={v.name}
        subtitle={`${v.imo}${v.mmsi ? ` · MMSI ${v.mmsi}` : ""} · ${v.class} · ${v.flag} · ${S.vdBuiltWord} ${v.built}`}
        actions={
          <div className="flex items-center gap-2">
            <Badge tone={comp.state === "ok" ? "green" : comp.state === "issue" ? "red" : "gray"}>
              {comp.state === "ok" ? S.vdComplyOk : comp.state === "issue" ? S.vdComplyIssue.replace("{a}", String(comp.valid)).replace("{b}", String(comp.total)) : S.vdComplyEmpty}
            </Badge>
            <select className="input w-auto py-1.5 text-sm" value={v.status}
              onChange={async (e) => { try { await update("vessels", v.id, { status: e.target.value }); toast(S.vdStatusSet.replace("{a}", e.target.value)); } catch (err) { toast(err instanceof Error ? err.message : S.saveFail, "info"); } }}>
              {["Dalam Operasi", "Dalam Docking", "Dalam Pembangunan", "Menganggur"].map((s) => <option key={s}>{s}</option>)}
            </select>
            <Badge tone="blue">{v.status}</Badge>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label={S.vdKpiLoa} value={`${v.loa} m`} icon={<Ship className="h-5 w-5" />} />
        <KpiCard label={S.vdKpiBeam} value={`${v.beam} m`} icon={<Ship className="h-5 w-5" />} />
        <KpiCard label={S.vdKpiDraft} value={`${v.draft} m`} icon={<Ship className="h-5 w-5" />} />
        <KpiCard label={S.vdKpiBollard} value={`${v.bollard} T`} icon={<Ship className="h-5 w-5" />} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label={S.vdKpiMmsi} value={v.mmsi ? String(v.mmsi) : "-"} icon={<Ship className="h-5 w-5" />} />
        <KpiCard label={S.vdKpiTonase} value={v.gt !== undefined ? `${v.gt} / ${v.nt ?? "-"}` : "-"} icon={<Ship className="h-5 w-5" />} />
        <KpiCard label={S.vdKpiBhp} value={v.bhp !== undefined && v.bhp !== "" ? `${v.bhp} HP` : "-"} icon={<Ship className="h-5 w-5" />} />
        <KpiCard label={S.vdKpiEngine} value={v.engineType ? String(v.engineType) : "-"} icon={<Ship className="h-5 w-5" />} />
      </div>

      {/* T6-VSL1: detail teknis kapal - identitas, dimensi, kelas/bendera,
          pemilik, tahun bangun, mesin, dan ringkasan sertifikat. */}
      <Card className="mt-4 p-4">
        <h3 className="mb-3 text-sm font-semibold text-navy-900">
          {locale === "en" ? "Vessel technical detail" : "Detail teknis kapal"}
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-steel-500">
              {locale === "en" ? "Identity" : "Identitas"}
            </h4>
            <dl className="dl-div text-sm">
              <div className="flex justify-between gap-2"><dt className="text-steel-500">Nama</dt><dd className="font-medium text-navy-900">{String(v.name)}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-steel-500">IMO</dt><dd className="font-mono">{String(v.imo ?? "-")}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-steel-500">MMSI</dt><dd className="font-mono">{String(v.mmsi ?? "-")}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-steel-500">Tipe</dt><dd className="font-medium">{String(v.type ?? "-")}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-steel-500">Pemilik</dt><dd className="font-medium">{String(v.owner ?? "-")}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-steel-500">Status</dt><dd><Badge tone="blue">{String(v.status ?? "-")}</Badge></dd></div>
            </dl>
          </div>
          <div>
            <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-steel-500">
              {locale === "en" ? "Dimensions & tonnage" : "Dimensi & tonase"}
            </h4>
            <dl className="dl-div text-sm">
              <div className="flex justify-between gap-2"><dt className="text-steel-500">LOA</dt><dd className="font-semibold">{v.loa} m</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-steel-500">Beam (lebar)</dt><dd className="font-semibold">{v.beam} m</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-steel-500">Draft</dt><dd className="font-semibold">{v.draft} m</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-steel-500">Bollard pull</dt><dd className="font-semibold">{v.bollard} T</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-steel-500">GT / NT</dt><dd className="font-semibold">{v.gt ?? "-"} / {v.nt ?? "-"}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-steel-500">BHP</dt><dd className="font-semibold">{v.bhp ? `${v.bhp} HP` : "-"}</dd></div>
            </dl>
          </div>
          <div>
            <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-steel-500">
              {locale === "en" ? "Class & build" : "Kelas & pembangunan"}
            </h4>
            <dl className="dl-div text-sm">
              <div className="flex justify-between gap-2"><dt className="text-steel-500">Kelas (class society)</dt><dd className="font-medium">{String(v.class ?? "-")}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-steel-500">Bendera</dt><dd className="font-medium">{String(v.flag ?? "-")}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-steel-500">Tahun bangun</dt><dd className="font-semibold">{String(v.built ?? "-")}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-steel-500">Mesin</dt><dd className="font-medium">{String(v.engineType ?? "-")}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-steel-500">Sertifikat</dt><dd className="font-semibold">{(v.certificates ?? []).length}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-steel-500">Riwayat</dt><dd className="font-semibold">{(v.history ?? []).length}</dd></div>
            </dl>
          </div>
        </div>
        {(v.certificates ?? []).length > 0 && (
          <div className="mt-4 border-t border-steel-100 pt-3">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-steel-500">
              {locale === "en" ? "Certificates" : "Sertifikat"}
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {(v.certificates as { name: string; expires?: string; tone?: string }[]).map((c) => (
                <Badge key={String(c.name)} tone={(c.tone as "green" | "amber" | "red") ?? "gray"}>
                  {String(c.name)}{c.expires ? ` · ${String(c.expires)}` : ""}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </Card>

      {projects.length > 0 && (
        <Card className="mt-5 p-4">
          <h3 className="mb-2 text-sm font-semibold text-navy-900">{S.vdProjects.replace("{n}", String(projects.length))}</h3>
          <div className="flex flex-wrap gap-2">
            {projects.map((p) => (
              <Link key={p.id} to={`/proyek/${p.id}`} className="rounded-lg border border-steel-200 px-3 py-1.5 text-sm font-medium text-navy-800 hover:border-ocean-400 hover:text-ocean-600">
                {p.id} - {p.progress}%
              </Link>
            ))}
          </div>
        </Card>
      )}

      <Card className="mt-5 p-4">
        <h3 className="mb-2 text-sm font-semibold text-navy-900">{S.vdWarranty.replace("{n}", String(vesselWarranties.length))}</h3>
        <div className="space-y-2">
          {vesselWarranties.map((w) => (
            <div key={w.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-steel-100 p-3 text-sm">
              <div className="min-w-0">
                <p className="font-medium text-navy-900 font-mono">{w.id} <span className="font-sans text-xs font-normal text-steel-500">· {w.projectId}</span></p>
                <p className="text-xs text-steel-500">{S.vdWarrantyMeta.replace("{a}", fmtTanggal(String(w.start ?? ""))).replace("{b}", String(w.months))}{w.claimedAt ? ` · ${S.vdClaimedOn.replace("{a}", fmtTanggal(String(w.claimedAt)))}` : ""}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={String(w.status) === "Aktif" ? "green" : String(w.status) === "Klaim" ? "amber" : "gray"}>{w.status}</Badge>
                {String(w.status) === "Aktif" && (
                  <button className="btn-secondary text-xs" onClick={() => void busy.run(`warranty-claim-${w.id}`, () => claimWarranty(w))} disabled={busy.isBusy(`warranty-claim-${w.id}`)}>{S.vdClaim}</button>
                )}
                {String(w.status) === "Klaim" && (
                  <button className="btn-secondary text-xs" onClick={() => void busy.run(`warranty-close-${w.id}`, () => closeWarranty(w))} disabled={busy.isBusy(`warranty-close-${w.id}`)}>{S.finishBtn}</button>
                )}
              </div>
            </div>
          ))}
          {vesselWarranties.length === 0 && <p className="text-xs text-steel-400">{S.vdNoWarranty}</p>}
        </div>
      </Card>

      <div className="mt-5 card">
        <Tabs tabs={["Sertifikat & Timeline", "Spesifikasi", "Kepatuhan & PSC", "Rencana & Operasional", ...(getSetting(data, "SHOW_3D_VESSEL", 0) === 1 ? ["3D Viewer"] : []), "Service", "Sparepart"]} active={tab} onChange={setTab} labels={{ "Sertifikat & Timeline": S.vdTabCert, Spesifikasi: S.vdTabSpec, "Kepatuhan & PSC": S.vdTabComply, "Rencana & Operasional": S.vdTabPlan }} />
        <div className="p-5">
          {tab === "Sertifikat & Timeline" && (
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
              <Card className="p-5 lg:col-span-1">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-navy-900"><FileCheck2 className="h-4 w-4" /> {S.vdCertTitle}</h3>
                  <button className="btn-secondary text-xs" aria-label={S.vdAddCertAria} onClick={() => setShowCert(true)}><Plus className="h-3.5 w-3.5" /></button>
                </div>
                <div className="space-y-2.5">
                  {certs.map((c, ci) => {
                    const tone = certTone(c.expires, nowMonth);
                    return (
                      <div key={`${c.name}-${ci}`} className="rounded-lg border border-steel-100 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-navy-900" title={c.name}>{c.name}</p>
                            <p className="text-xs text-steel-500">{S.vdCertMeta.replace("{a}", fmtBulan(c.issued)).replace("{b}", fmtBulan(c.expires))}</p>
                          </div>
                          <button
                            className="btn-secondary shrink-0 px-2 py-1 text-xs text-rose-600"
                            aria-label={`${locale === "en" ? "Delete" : "Hapus"} ${c.name}`}
                            onClick={() => setDelCert(c.name)}
                          >
                            {S.delBtn}
                          </button>
                        </div>
                        <Badge tone={tone} className="mt-1">
                          {tone === "green" ? S.vdCertValid : tone === "amber" ? S.vdCertSoon : S.vdCertExpired}
                        </Badge>
                      </div>
                    );
                  })}
                  {certs.length === 0 && (
                    <p className="text-sm text-steel-400">{S.vdNoCert}</p>
                  )}
                </div>
              </Card>

              <Card className="p-5 lg:col-span-2">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-navy-900"><History className="h-4 w-4" /> {S.vdTimeline}</h3>
                  <button className="btn-secondary text-xs" aria-label={S.vdSchedSurveyAria} onClick={() => setShowSurvey(true)}><Plus className="h-3.5 w-3.5" /> {S.vdSchedSurvey}</button>
                </div>
                <div className="space-y-0">
                  {(v.history ?? []).map((h: { event: string; date: string; type: string }, i: number, arr: unknown[]) => (
                    <div key={i} className="relative flex gap-4 pb-6 last:pb-0">
                      <div className="flex flex-col items-center">
                        <span className={`h-3 w-3 rounded-full ${i === 0 ? "bg-ocean-500" : "bg-steel-300"}`} />
                        {i < arr.length - 1 && <span className="w-px flex-1 bg-steel-200" />}
                      </div>
                      <div className="pb-1">
                        <p className="text-sm font-semibold text-navy-900">{h.event}</p>
                        <p className="text-xs text-steel-500">{fmtTanggal(h.date)} · {h.type}</p>
                      </div>
                    </div>
                  ))}
                </div>
                {surveys.length > 0 && (
                  <div className="mt-4 border-t border-steel-100 pt-3">
                    <p className="mb-2 text-xs font-semibold text-steel-500">{S.vdSurveyList}</p>
                    {surveys.map((s) => (
                      <div key={s.id} className="flex items-center justify-between py-1 text-sm">
                        <span className="text-steel-700">{s.type} · {fmtTanggal(String(s.date))}{s.linkedTrial ? ` · trial ${String(s.linkedTrial)}` : ""}</span>
                        <Badge tone={s.status === "Selesai" ? "green" : s.status === "Dalam Proses" ? "blue" : "gray"}>{s.status}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          )}

          {tab === "Spesifikasi" && (
            <Card className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-navy-900">{S.vdSpecTitle}</h3>
                <button className="btn-secondary text-xs" onClick={openSpec}><Pencil className="h-3.5 w-3.5" /> {S.vdEditSpec}</button>
              </div>
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <div className="rounded-lg bg-surface p-3"><dt className="text-xs text-steel-500">{S.typeLabel}</dt><dd className="text-sm font-medium text-navy-900">{v.type}</dd></div>
                <div className="rounded-lg bg-surface p-3"><dt className="text-xs text-steel-500">{S.vsOwnerField}</dt><dd className="text-sm font-medium text-navy-900">{v.owner}</dd></div>
                <div className="rounded-lg bg-surface p-3"><dt className="text-xs text-steel-500">{S.vsClassField}</dt><dd className="text-sm font-medium text-navy-900">{v.class}</dd></div>
                <div className="rounded-lg bg-surface p-3"><dt className="text-xs text-steel-500">{S.vsFlagField}</dt><dd className="text-sm font-medium text-navy-900">{v.flag}</dd></div>
                <div className="rounded-lg bg-surface p-3"><dt className="text-xs text-steel-500">{S.vdSpecLoa}</dt><dd className="text-sm font-medium text-navy-900">{v.loa} / {v.beam} / {v.draft} m</dd></div>
                <div className="rounded-lg bg-surface p-3"><dt className="text-xs text-steel-500">{S.vdKpiBollard}</dt><dd className="text-sm font-medium text-navy-900">{v.bollard} T</dd></div>
                <div className="rounded-lg bg-surface p-3"><dt className="text-xs text-steel-500">{S.vdKpiMmsi}</dt><dd className="text-sm font-medium text-navy-900">{v.mmsi ?? "-"}</dd></div>
                <div className="rounded-lg bg-surface p-3"><dt className="text-xs text-steel-500">{S.vdSpecGtNt}</dt><dd className="text-sm font-medium text-navy-900">{v.gt ?? "-"} / {v.nt ?? "-"}</dd></div>
                <div className="rounded-lg bg-surface p-3"><dt className="text-xs text-steel-500">{S.vdSpecEngine}</dt><dd className="text-sm font-medium text-navy-900">{v.engineType ?? "-"} · {v.bhp ?? "-"} HP</dd></div>
              </dl>
            </Card>
          )}

          {tab === "Kepatuhan & PSC" && (
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <Card className="p-5">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-navy-900"><ShieldCheck className="h-4 w-4" /> {S.vdComplyTitle}</h3>
                  <Badge tone={comp.state === "ok" ? "green" : comp.state === "issue" ? "red" : "gray"}>
                    {comp.state === "ok" ? S.vdComplyAll : comp.state === "issue" ? S.vdComplyPart.replace("{a}", String(comp.valid)).replace("{b}", String(comp.total)) : S.vdComplyEmpty}
                  </Badge>
                </div>
                <div className="space-y-2.5">
                  {complianceRows.map((r) => (
                    <div key={r.name} className="rounded-lg border border-steel-100 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-navy-900">{r.name}</p>
                        <select
                          className="input w-auto py-1 text-xs"
                          value={r.status || ""}
                          onChange={(e) => { setCompliance(r.name, { status: e.target.value }); toast(S.vdComplySet.replace("{a}", r.name).replace("{b}", e.target.value || S.vdComplyUnset)); }}
                        >
                          <option value="">{S.vdComplyEmpty}</option>
                          <option value="Berlaku">Berlaku</option>
                          <option value="Kedaluwarsa">Kedaluwarsa</option>
                        </select>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <input
                          type="date"
                          className="input py-1 text-xs"
                          value={r.date || ""}
                          onChange={(e) => setCompliance(r.name, { date: e.target.value })}
                          aria-label={S.vdDateAria.replace("{a}", r.name)}
                        />
                        {r.status && (
                          <Badge tone={r.status === "Berlaku" ? "green" : "red"}>{r.status}{r.date ? ` · ${fmtTanggal(r.date)}` : ""}</Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              <div className="space-y-5">
                <Card className="p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-navy-900"><ClipboardCheck className="h-4 w-4" /> {S.vdPscTitle.replace("{n}", String(pscRows.length))}</h3>
                    <button className="btn-secondary text-xs" onClick={() => setShowPsc(true)}><Plus className="h-3.5 w-3.5" /> {S.vdAddPsc}</button>
                  </div>
                  {pscRows.length === 0 && <p className="text-sm text-steel-400">{S.vdNoPsc}</p>}
                  <div className="space-y-2">
                    {pscRows.map((p, i) => (
                      <div key={i} className="flex items-center justify-between rounded-lg border border-steel-100 p-3 text-sm">
                        <div>
                          <p className="font-medium text-navy-900">{p.port} · {fmtTanggal(p.date)}</p>
                          <p className="text-xs text-steel-500">{S.vdDefCount.replace("{a}", String(p.deficiencies))}</p>
                        </div>
                        <Badge tone={p.status === "Bersih" ? "green" : p.status === "Ditahan" ? "red" : "amber"}>{p.status}</Badge>
                      </div>
                    ))}
                  </div>
                </Card>

                <Card className="p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-navy-900"><Anchor className="h-4 w-4" /> {S.vdDockTitle}</h3>
                    <button className="btn-secondary text-xs" onClick={openDockAdd}><Plus className="h-3.5 w-3.5" /> {S.vdAddDock}</button>
                  </div>
                  {slots.length > 0 && (
                    <div className="mb-3">
                      <p className="mb-1.5 text-xs font-semibold text-steel-500">{S.vdActiveSlots}</p>
                      {slots.map((s) => {
                        const st: string = s.project === "MAINT" ? "Maintenance" : s.undockDone === true ? "Selesai" : Number(s.to) <= 0 ? "Selesai" : Number(s.from) <= 0 ? "Berjalan" : "Terjadwal";
                        const tone = st === "Berjalan" ? "blue" : st === "Selesai" ? "green" : st === "Maintenance" ? "gray" : "amber";
                        const und = Array.isArray(s.undock) ? (s.undock as unknown[]).filter((x) => x === true).length : 0;
                        return (
                          <div key={s.id} className="flex items-center justify-between gap-2 py-1 text-sm">
                            <span className="text-steel-700">{s.dockId} · {s.project}{s.dsRef ? <span className="font-mono text-xs text-steel-400"> · DS {String(s.dsRef)}</span> : null}{st === "Berjalan" || st === "Terjadwal" ? <span className="text-xs text-steel-400"> · undock {und}/5</span> : null}</span>
                            <Badge tone={tone as "green" | "blue" | "amber" | "gray"}>{st}</Badge>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {dockHistory.length === 0 && <p className="text-sm text-steel-400">{S.vdNoDock}</p>}
                  <div className="space-y-2">
                    {dockHistory.map((d, i) => (
                      <div key={i} className="rounded-lg border border-steel-100 p-3">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-navy-900">{d.dock} · {fmtTanggal(d.date)}</p>
                          <button className="btn-secondary text-xs" onClick={() => openDockEdit(i)}><Pencil className="h-3 w-3" /> Edit</button>
                        </div>
                        {d.scope && <p className="mt-1 text-xs text-steel-600">{S.vdScope}{d.scope}</p>}
                        {d.result && <p className="text-xs text-steel-600">{S.vdResult}{d.result}</p>}
                        <p className="mt-1 text-xs text-steel-500">{S.vdDueOn.replace("{a}", fmtTanggal(d.nextDue))}</p>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            </div>
          )}

          {tab === "Rencana & Operasional" && (
            <div className="space-y-5">
              <Card className="p-5">
                <h3 className="text-sm font-semibold text-navy-900">{S.vdPlanTitle.replace("{a}", String(baseYear + 1)).replace("{b}", String(baseYear + 5))}</h3>
                <p className="mt-0.5 text-xs text-steel-500">{S.vdPlanSub}</p>
                <div className="mt-2 flex justify-end">
                  <SearchBox value={planQ} onChange={setPlanQ} className="max-w-xs" placeholder={locale === "en" ? "Search plans..." : "Cari rencana..."} ariaLabel={locale === "en" ? "Search vessel plans" : "Cari rencana kapal"} />
                </div>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full">
                    <thead className="sticky top-0 z-10 bg-surface">
                      <tr><SortTh label={S.thYear} sortKey="year" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.thAuto} sortKey="auto" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.thManual} sortKey="manual" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /></tr>
                    </thead>
                    <tbody className="divide-y divide-steel-100">
                      {sortRows(planYears.filter((y) => rowMatches({
                        year: String(y),
                        auto: [
                          ...surveys.filter((s) => String(s.date ?? "").slice(0, 4) === String(y)).map((s) => `${String(s.type ?? "")} ${String(s.date ?? "")}`),
                          ...dockHistory.filter((d) => String(d.nextDue ?? "").slice(0, 4) === String(y)).map((d) => `${d.dock} ${d.scope} ${d.result}`),
                        ].join(" "),
                        manual: plan5.filter((p) => Number(p.year) === Number(y)).map((p) => `${String(p.type ?? "")} ${String(p.note ?? "")}`).join(" "),
                      } as unknown as Record<string, unknown>, planQ, ["year", "auto", "manual"])), sort, (y: number, k) => { if (k === "year") return Number(y); if (k === "auto") return surveys.filter((s) => String(s.date ?? "").slice(0, 4) === String(y)).length + dockHistory.filter((d) => String(d.nextDue ?? "").slice(0, 4) === String(y)).length; if (k === "manual") return plan5.filter((p) => Number(p.year) === Number(y)).length; return Number(y); }).map((y) => {
                        const auto: string[] = [
                          ...surveys.filter((s) => String(s.date ?? "").slice(0, 4) === String(y)).map((s) => `${s.type} · ${fmtTanggal(String(s.date))}`),
                          ...dockHistory.filter((d) => String(d.nextDue ?? "").slice(0, 4) === String(y)).map((d) => S.vdNextDueAuto.replace("{a}", fmtTanggal(d.nextDue)).replace("{b}", d.dock)),
                        ];
                        const manual = plan5.map((p, i) => ({ ...p, idx: i })).filter((p) => Number(p.year) === y);
                        return (
                          <tr key={y} className="hover:bg-surface">
                            <td className="td font-semibold text-navy-900">{y}</td>
                            <td className="td text-xs text-steel-600">
                              {auto.length === 0 && <span className="text-steel-400">-</span>}
                              {auto.map((a, i) => <p key={i}>{a}</p>)}
                            </td>
                            <td className="td text-xs text-steel-600">
                              {manual.length === 0 && <span className="text-steel-400">-</span>}
                              {manual.map((m) => (
                                <p key={m.idx} className="flex flex-wrap items-center justify-between gap-2">
                                  <span>{m.type}{m.note ? ` - ${m.note}` : ""}</span>
                                  <RowAction
                                    icon={Trash2}
                                    tone="danger"
                                    label={`${S.delBtn} ${m.type}`}
                                    disabled={busy.isBusy(`plan-del-${m.idx}`)}
                                    onClick={() => void busy.run(`plan-del-${m.idx}`, () => removePlan(m.idx))}
                                  />
                                </p>
                              ))}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 grid grid-cols-1 gap-2 border-t border-steel-100 pt-3 sm:grid-cols-4">
                  <Field label={S.thYear}>
                    <select className="input" value={planForm.year} onChange={(e) => setPlanForm({ ...planForm, year: e.target.value })}>
                      {planYears.map((y) => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </Field>
                  <Field label={S.typeLabel}>
                    <select className="input" value={planForm.type} onChange={(e) => setPlanForm({ ...planForm, type: e.target.value })}>
                      {PLAN_TYPES.map((t) => <option key={t}>{t}</option>)}
                    </select>
                  </Field>
                  <Field label={S.vdNoteField}><input className="input" value={planForm.note} onChange={(e) => setPlanForm({ ...planForm, note: e.target.value })} placeholder={S.vdNotePh} /></Field>
                  <div className="flex items-end"><AsyncButton className="btn-secondary text-xs" onAction={savePlan}><Plus className="h-3.5 w-3.5" /> {S.vdAddPlan}</AsyncButton></div>
                </div>
              </Card>

              <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                <Card className="p-5">
                  <h3 className="text-sm font-semibold text-navy-900">{S.vdBunkerTitle}</h3>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {bunkerTotals.map((t) => (
                      <Badge key={t.jenis} tone="navy">{t.jenis}: {fmtJumlah(t.qty)} {t.satuan}</Badge>
                    ))}
                  </div>
                  <div className="mt-3 space-y-1.5">
                    {bunkerRows.map((b, i) => (
                      <div key={i} className="flex items-center justify-between gap-2 border-b border-steel-100 py-1.5 text-sm">
                        <span className="text-steel-600">{fmtTanggal(b.date)} · {b.jenis}</span>
                        <span className="font-medium text-navy-900">{fmtJumlah(Number(b.qty))} {b.satuan}</span>
                      </div>
                    ))}
                    {bunkerRows.length === 0 && <p className="text-xs text-steel-400">{S.vdNoBunker}</p>}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 border-t border-steel-100 pt-3">
                    <Field label={S.dateLabel}><input type="date" className="input" value={bunkerForm.date} onChange={(e) => setBunkerForm({ ...bunkerForm, date: e.target.value })} /></Field>
                    <Field label={S.vdJenisField}>
                      <select className="input" value={bunkerForm.jenis} onChange={(e) => setBunkerForm({ ...bunkerForm, jenis: e.target.value })}>
                        {BUNKER_JENIS.map((j) => <option key={j}>{j}</option>)}
                      </select>
                    </Field>
                    <Field label={S.vdQtyField}><NumInput min={0} className="input" value={bunkerForm.qty} onChange={(e) => setBunkerForm({ ...bunkerForm, qty: e.target.value })} placeholder={S.vdQtyPh} /></Field>
                    <Field label={S.vdUnitField}><input className="input" value={bunkerForm.satuan} onChange={(e) => setBunkerForm({ ...bunkerForm, satuan: e.target.value })} placeholder={S.vdUnitPh} /></Field>
                  </div>
                  <AsyncButton className="btn-secondary mt-2 text-xs" onAction={saveBunker}><Plus className="h-3.5 w-3.5" /> {S.vdAddBunker}</AsyncButton>
                </Card>

                <div className="space-y-5">
                  <Card className="p-5">
                    <h3 className="text-sm font-semibold text-navy-900">{S.vdCrewTitle.replace("{n}", String(crewRows.length))}</h3>
                    <div className="mt-2 space-y-1.5">
                      {crewRows.map((c, i) => (
                        <div key={i} className="flex items-center justify-between gap-2 border-b border-steel-100 py-1.5 text-sm">
                          <div>
                            <p className="font-medium text-navy-900">{c.name}</p>
                            <p className="text-xs text-steel-500">{c.role}</p>
                          </div>
                          <button className="btn-secondary text-xs" onClick={() => void busy.run(`crew-del-${i}`, () => removeCrew(i))} disabled={busy.isBusy(`crew-del-${i}`)}>{S.delBtn}</button>
                        </div>
                      ))}
                      {crewRows.length === 0 && <p className="text-xs text-steel-400">{S.vdNoCrew}</p>}
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 border-t border-steel-100 pt-3">
                      <Field label={S.vdCrewName}><input className="input" value={crewForm.name} onChange={(e) => setCrewForm({ ...crewForm, name: e.target.value })} placeholder={S.vdCrewNamePh} /></Field>
                      <Field label={S.vdCrewRole}><input className="input" value={crewForm.role} onChange={(e) => setCrewForm({ ...crewForm, role: e.target.value })} placeholder={S.vdCrewRolePh} /></Field>
                    </div>
                    <AsyncButton className="btn-secondary mt-2 text-xs" onAction={saveCrew}><Plus className="h-3.5 w-3.5" /> {S.vdAddCrew}</AsyncButton>
                  </Card>

                  <Card className="p-5">
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-navy-900">{S.vdInsTitle}</h3>
                      <button className="btn-secondary text-xs" onClick={openIns}><Pencil className="h-3 w-3" /> {insurance ? S.vdEdit : S.vdFill}</button>
                    </div>
                    {insurance ? (
                      <dl className="dl-div text-sm">
                        <div className="flex justify-between"><dt className="text-steel-500">{S.vdPolisField}</dt><dd className="font-medium font-mono">{insurance.polis}</dd></div>
                        <div className="flex justify-between"><dt className="text-steel-500">{S.vdPremiField}</dt><dd className="font-medium">{fmtRupiah(Number(insurance.premi || 0))}</dd></div>
                        <div className="flex justify-between"><dt className="text-steel-500">{S.vdExpiryField}</dt><dd className="font-medium">{fmtTanggal(insurance.expiry)}</dd></div>
                      </dl>
                    ) : (
                      <p className="text-xs text-steel-400">{S.vdNoIns}</p>
                    )}
                  </Card>
                </div>
              </div>
            </div>
          )}

          {tab === "3D Viewer" && getSetting(data, "SHOW_3D_VESSEL", 0) === 1 && <SparepartServiceSection vesselId={v.id} view="3d" />}
          {tab === "Service" && <SparepartServiceSection vesselId={v.id} view="service" />}
          {tab === "Sparepart" && <SparepartServiceSection vesselId={v.id} view="sparepart" />}
        </div>
      </div>

      <Modal open={showCert} onClose={() => setShowCert(false)} title={S.vdAddCertTitle.replace("{a}", v.name)}
        footer={<><button className="btn-secondary" onClick={() => setShowCert(false)}>{S.cancelBtn}</button><AsyncButton className="btn-primary" onAction={saveCert}>{S.saveBtn}</AsyncButton></>}>
        <div className="space-y-3">
          <Field label={S.vdCertName}><input className="input" value={certForm.name} onChange={(e) => setCertForm({ ...certForm, name: e.target.value })} placeholder={S.vdCertNamePh} /></Field>
          <FormGrid>
            <Field label={S.vdIssued}><input type="date" className="input" value={certForm.issued} onChange={(e) => setCertForm({ ...certForm, issued: e.target.value })} /></Field>
            <Field label={S.vdValidUntil}><input type="date" className="input" value={certForm.expires} onChange={(e) => setCertForm({ ...certForm, expires: e.target.value })} /></Field>
          </FormGrid>
        </div>
      </Modal>

      <Modal open={showSurvey} onClose={() => setShowSurvey(false)} title={S.vdSurveyModalTitle.replace("{a}", v.name)} subtitle={S.vdSurveySub}
        footer={<><button className="btn-secondary" onClick={() => setShowSurvey(false)}>{S.cancelBtn}</button><AsyncButton className="btn-primary" onAction={saveSurvey}>{S.vdScheduleBtn}</AsyncButton></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label={S.vdSurveyTypeField}>
              <select className="input" value={surveyForm.type} onChange={(e) => setSurveyForm({ ...surveyForm, type: e.target.value })}>
                {["Annual Survey", "Special Survey", "Docking Survey", "Intermediate Survey"].map((t) => <option key={t}>{t}</option>)}
              </select>
            </Field>
            <Field label={S.thStatus}>
              <select className="input" value={surveyForm.status} onChange={(e) => setSurveyForm({ ...surveyForm, status: e.target.value })}>
                {["Terjadwal", "Dalam Proses", "Selesai"].map((s) => <option key={s}>{s}</option>)}
              </select>
            </Field>
          </FormGrid>
          <Field label={S.dateLabel}><input type="date" className="input" value={surveyForm.date} onChange={(e) => setSurveyForm({ ...surveyForm, date: e.target.value })} /></Field>
          <Field label={S.vdTrialLink} hint={S.vdTrialHint}>
            <select className="input" value={surveyForm.linkedTrial} onChange={(e) => setSurveyForm({ ...surveyForm, linkedTrial: e.target.value })}>
              <option value="">{S.vdNoTrial}</option>
              {vesselTrials.map((t) => <option key={String(t.id)} value={String(t.id)}>{String(t.id)} · {fmtTanggal(String(t.tanggal))}</option>)}
            </select>
          </Field>
        </div>
      </Modal>

      <Modal open={showSpec} onClose={() => setShowSpec(false)} title={S.vdSpecModalTitle.replace("{a}", v.name)}
        footer={<><button className="btn-secondary" onClick={() => setShowSpec(false)}>{S.cancelBtn}</button><AsyncButton className="btn-primary" onAction={saveSpec}>{S.saveBtn}</AsyncButton></>}>
        <FormGrid>
          <Field label={S.vsMmsiField}><input className="input font-mono" value={specForm.mmsi} onChange={(e) => setSpecForm({ ...specForm, mmsi: e.target.value })} placeholder={S.vsMmsiPh} /></Field>
          <Field label={S.vsEngineField}><input className="input" value={specForm.engineType} onChange={(e) => setSpecForm({ ...specForm, engineType: e.target.value })} placeholder={S.vsEnginePh} /></Field>
          <Field label={S.vsGtField}><NumInput min={0} className="input" value={specForm.gt} onChange={(e) => setSpecForm({ ...specForm, gt: e.target.value })} /></Field>
          <Field label={S.vsNtField}><NumInput min={0} className="input" value={specForm.nt} onChange={(e) => setSpecForm({ ...specForm, nt: e.target.value })} /></Field>
          <Field label={S.vsBhpField}><NumInput min={0} className="input" value={specForm.bhp} onChange={(e) => setSpecForm({ ...specForm, bhp: e.target.value })} /></Field>
        </FormGrid>
      </Modal>

      <Modal open={showPsc} onClose={() => setShowPsc(false)} title={S.vdPscModalTitle.replace("{a}", v.name)}
        footer={<><button className="btn-secondary" onClick={() => setShowPsc(false)}>{S.cancelBtn}</button><AsyncButton className="btn-primary" onAction={savePsc}>{S.saveBtn}</AsyncButton></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label={S.dateLabel}><input type="date" className="input" value={pscForm.date} onChange={(e) => setPscForm({ ...pscForm, date: e.target.value })} /></Field>
            <Field label={S.vdPortField}><input className="input" value={pscForm.port} onChange={(e) => setPscForm({ ...pscForm, port: e.target.value })} placeholder={S.vdPortPh} /></Field>
            <Field label={S.vdDefField}><NumInput min={0} className="input" value={pscForm.deficiencies} onChange={(e) => setPscForm({ ...pscForm, deficiencies: e.target.value })} /></Field>
            <Field label={S.thStatus}>
              <select className="input" value={pscForm.status} onChange={(e) => setPscForm({ ...pscForm, status: e.target.value })}>
                {PSC_STATUS.map((s) => <option key={s}>{s}</option>)}
              </select>
            </Field>
          </FormGrid>
        </div>
      </Modal>

      <Modal open={showDock} onClose={() => setShowDock(false)} title={editingDock === null ? S.vdDockAddTitle.replace("{a}", v.name) : S.vdDockEditTitle.replace("{a}", v.name)} subtitle={S.vdDockSub}
        footer={<><button className="btn-secondary" onClick={() => setShowDock(false)}>{S.cancelBtn}</button><AsyncButton className="btn-primary" onAction={saveDock}>{S.saveBtn}</AsyncButton></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label={S.dateLabel}><input type="date" className="input" value={dockForm.date} onChange={(e) => setDockForm({ ...dockForm, date: e.target.value })} /></Field>
            <Field label={S.vdNextDueField}><input type="date" className="input" value={dockForm.nextDue} onChange={(e) => setDockForm({ ...dockForm, nextDue: e.target.value })} /></Field>
          </FormGrid>
          <Field label={S.vdDockField}><input className="input" value={dockForm.dock} onChange={(e) => setDockForm({ ...dockForm, dock: e.target.value })} placeholder={S.vdDockPh} /></Field>
          <Field label={S.vdScopeField}><input className="input" value={dockForm.scope} onChange={(e) => setDockForm({ ...dockForm, scope: e.target.value })} placeholder={S.vdScopePh} /></Field>
          <Field label={S.vdResultField}><input className="input" value={dockForm.result} onChange={(e) => setDockForm({ ...dockForm, result: e.target.value })} placeholder={S.vdResultPh} /></Field>
        </div>
      </Modal>

      <Modal open={showIns} onClose={() => setShowIns(false)} title={S.vdInsModalTitle.replace("{a}", v.name)} subtitle={S.vdInsSub}
        footer={<><button className="btn-secondary" onClick={() => setShowIns(false)}>{S.cancelBtn}</button><AsyncButton className="btn-primary" onAction={saveIns}>{S.saveBtn}</AsyncButton></>}>
        <div className="space-y-3">
          <Field label={S.vdPolisNo}><input className="input font-mono" value={insForm.polis} onChange={(e) => setInsForm({ ...insForm, polis: e.target.value })} placeholder={S.vdPolisPh} /></Field>
          <FormGrid>
            <Field label={S.vdPremiRp}><NumInput min={0} className="input" value={insForm.premi} onChange={(e) => setInsForm({ ...insForm, premi: e.target.value })} placeholder={S.vdPremiPh} /></Field>
            <Field label={S.vdExpiryField}><input type="date" className="input" value={insForm.expiry} onChange={(e) => setInsForm({ ...insForm, expiry: e.target.value })} /></Field>
          </FormGrid>
        </div>
      </Modal>

      <ConfirmModal
        open={delCert !== null}
        title={locale === "en" ? "Delete certificate?" : "Hapus sertifikat?"}
        desc={delCert ?? ""}
        confirmLabel={locale === "en" ? "Delete" : "Hapus"}
        danger
        onCancel={() => setDelCert(null)}
        onConfirm={confirmDelCert}
      />
    </div>
  );
}
