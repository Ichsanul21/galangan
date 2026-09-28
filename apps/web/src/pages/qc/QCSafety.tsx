import { useEffect, useMemo, useState } from "react";
import { Plus, ShieldCheck, AlertTriangle, Siren, Award, Send, Search } from "lucide-react";
import { ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Card, CardHeader, PageHeader, Badge, KpiCard, Tabs, StatusBadge, Donut, ChartTooltip, Modal, Field, FormGrid, SortTh, toggleSort, sortRows, usePager, toast,
  NumInput,
} from "../../components/ui";
import type { SortState } from "../../components/ui";
import { useStore, type StoreItem } from "../../data/store";
import { inspectionTrend, ncrTrend, incidentTrend, hseTrend } from "../../data";
import { fmtRupiah, fmtTanggal, todayISO } from "../../utils/format";
import { sameName } from "../../utils/names";
import { getSetting } from "../../utils/settings";
import { AlertBannerView, notifRowId, useModuleAlert, useNotifFlash } from "../../components/AlertBanner";
import { exportExcel } from "../../utils/export";
import { useAuth, canSetTarget } from "../../auth/auth";
import { FilterPopover } from "../../components/FilterPopover";
import { useT } from "../../i18n/LanguageContext";
import { n_qc } from "../../i18n/n_qc";

const ncrTone: Record<string, "red" | "amber" | "blue" | "green"> = {
  Terbuka: "amber",
  "Dalam Perbaikan": "blue",
  Tertutup: "green",
};

const NCR_FLOW = ["Terbuka", "Dalam Perbaikan", "Tertutup"];
const ROOT_CAUSES = ["Manusia", "Metode", "Material", "Mesin", "Lingkungan"];
const NCR_COLORS = ["#f59e0b", "#2e9ad4", "#8b5cf6", "#0d9488", "#f43f5e", "#64748b"];
const HOLD_TYPES = ["Hold", "Witness", "Review"];
const NDE_METHODS = ["UT", "RT", "MT", "PT"];
const DRAW_FLOW = ["Diajukan", "Disetujui", "Distribusi"];

const PPE_ITEMS = [
  "Helm keselamatan",
  "Rompi reflektif",
  "Sepatu safety",
  "Sarung tangan kerja",
  "Kacamata safety",
  "Masker las / debu",
  "Full-body harness",
  "Earplug / earmuff",
];

const AUDIT_ITEMS = [
  "APAR tersedia dan masih berlaku",
  "Jalur evakuasi bebas hambatan",
  "Toolbox meeting dilaksanakan rutin",
  "APD dipakai lengkap di area kerja",
  "Izin kerja (hot work / confined space) tertib",
  "Perancah dan alat angkat bersertifikat",
  "Limbah B3 terkelola dengan benar",
  "Penerangan dan ventilasi area kerja memadai",
  "Kotak P3K terisi dan mudah dijangkau",
  "Rambu dan barikade area bahaya terpasang",
];

function daysUntil(iso: string | null | undefined): number | null {
  if (!iso || iso === "-") return null;
  const raw = String(iso).length === 7 ? `${iso}-01` : String(iso);
  const t = new Date(`${raw}T00:00:00`).getTime();
  if (Number.isNaN(t)) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((t - today) / 86400000);
}

function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function nextItp(inspections: StoreItem[]): string {
  let max = 0;
  inspections.forEach((i) => {
    const m = /ITP-(\d+)/.exec(String(i.itp ?? ""));
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  let n = max + 1;
  let code = `ITP-${String(n).padStart(3, "0")}`;
  while (inspections.some((i) => String(i.itp) === code)) {
    n += 1;
    code = `ITP-${String(n).padStart(3, "0")}`;
  }
  return code;
}

function nextRev(rev: string): string {
  const r = String(rev ?? "A").trim().toUpperCase();
  if (/^[A-Z]$/.test(r)) {
    if (r === "Z") return "A1";
    return String.fromCharCode(r.charCodeAt(0) + 1);
  }
  const m = /^([A-Z]+)(\d+)$/.exec(r);
  if (m) return `${m[1]}${Number(m[2]) + 1}`;
  return `${r}-R1`;
}

export default function QCSafety() {
  const { data, add, update, remove, log, branch, inBranch } = useStore();
  const modAlert = useModuleAlert("qc");
  const flash = useNotifFlash();
  const notified = useMemo(() => new Set(modAlert.items.map((a) => a.rowId)), [modAlert.items]);
  const { user } = useAuth();
  const { locale } = useT();
  const S = n_qc[locale];
  const ncrList = inBranch(data.ncr);
  const incidents = inBranch(data.incidents);
  const inspections = inBranch(data.inspections);
  const vessels = data.vessels;
  const drawings = inBranch(data.drawings);
  const toolboxTalks = inBranch(data.toolbox);
  // JSA tersimpan sebagai koleksi toolbox bertipe "JSA" (bukan state lokal).
  const jsaList = toolboxTalks.filter((t) => String(t.type ?? "") === "JSA");
  // Cabang global sebagai fallback; select cabang di form default "" = ikut global.
  const globalBranch = branch === "SEMUA" ? "" : branch;
  const branchCities = data.branches.map((b) => String(b.city ?? b.name ?? b.id));
  const branchOf = (v: string): string => v || globalBranch;
  const qualityStaff = data.employees.filter((e) => e.dept === "Quality");
  const [tab, setTab] = useState("Inspeksi (ITP)");
  const [inspQ, setInspQ] = useState("");
  const [inspStatus, setInspStatus] = useState("Semua");
  const [sort, setSort] = useState<SortState>({ key: null, dir: "asc" });
  const inspFiltered = inspections.filter((i) => {
    if (inspStatus !== "Semua" && String(i.status ?? "") !== inspStatus) return false;
    const needle = inspQ.trim().toLowerCase();
    if (!needle) return true;
    return `${i.id ?? ""} ${i.project ?? ""} ${i.point ?? ""} ${i.itp ?? ""} ${i.inspector ?? ""}`.toLowerCase().includes(needle);
  });
  const sortedInsp = useMemo(() => sortRows(inspFiltered, sort, (i, key) =>
    key === "inspeksi" ? String(i.id ?? "") : key === "proyek" ? String(i.project ?? "") : key === "titik" ? String(i.point ?? "") : key === "itp" ? String(i.itp ?? "") : key === "hold" ? String(i.holdType ?? "") : key === "nde" ? String(i.nde ?? "") : key === "sampel" ? Number(i.sampleSize ?? 0) : key === "inspector" ? String(i.inspector ?? "") : key === "tanggal" ? String(i.date ?? "")     : String(i.status ?? "")
  ), [inspFiltered, sort]);
  const inspPager = usePager(inspFiltered.length);
  useEffect(() => {
    inspPager.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inspQ, inspStatus, tab]);
  const pickNotif = (rowId: string) => {
    const idx = sortedInsp.findIndex((r) => String(r.id) === rowId);
    if (idx >= 0) {
      if (tab === "Inspeksi (ITP)") { flash.pick(rowId, idx, inspPager.go, inspPager.size); return; }
      setTab("Inspeksi (ITP)");
      window.setTimeout(() => { flash.pick(rowId, idx, inspPager.go, inspPager.size); }, 250);
      return;
    }
    const nIdx = ncrList.findIndex((n) => String(n.id) === rowId);
    if (nIdx >= 0) {
      if (tab === "NCR") { flash.pick(rowId, -1, () => {}, 100); return; }
      setTab("NCR");
      window.setTimeout(() => { flash.pick(rowId, -1, () => {}, 100); }, 250);
      return;
    }
    const iIdx = incidents.findIndex((i) => String(i.id) === rowId);
    if (iIdx >= 0) {
      if (tab === "Insiden") { flash.pick(rowId, -1, () => {}, 100); return; }
      setTab("Insiden");
      window.setTimeout(() => { flash.pick(rowId, -1, () => {}, 100); }, 250);
      return;
    }
    flash.pick(rowId, -1, () => {}, 100);
  };

  const [showInsp, setShowInsp] = useState(false);
  const [inspForm, setInspForm] = useState({ project: "", point: "", status: "Terjadwal", date: todayISO(), holdType: "Witness", nde: "Tidak", ndeMethod: "UT", inspector: "", sampleSize: "", defectsAllowed: "0", defectsFound: "0", calTool: "", branch: "" });
  const [inspDetail, setInspDetail] = useState<StoreItem | null>(null);
  const [ncrDetail, setNcrDetail] = useState<StoreItem | null>(null);
  const [dueDraft, setDueDraft] = useState("");
  const [showNcr, setShowNcr] = useState(false);
  const [ncrForm, setNcrForm] = useState({ project: "", vessel: "", type: "Pengelasan", severity: "Minor", issue: "", due: "", causeCat: "Manusia", causeNote: "", branch: "" });
  const [closingNcr, setClosingNcr] = useState<StoreItem | null>(null);
  const [verifier, setVerifier] = useState("");
  const [verifyNote, setVerifyNote] = useState("");
  const [reopenNcr, setReopenNcr] = useState<StoreItem | null>(null);
  const [reopenReason, setReopenReason] = useState("");
  const [showInc, setShowInc] = useState(false);
  const [incForm, setIncForm] = useState({ type: "Near Miss", location: "", desc: "", severity: "Rendah", project: "", branch: "" });

  // Drawing
  const [showDrw, setShowDrw] = useState(false);
  const [drwForm, setDrwForm] = useState({ project: "", title: "", holder: "", branch: "" });
  const [expandedDrw, setExpandedDrw] = useState<string | null>(null);
  const [showTransmit, setShowTransmit] = useState(false);
  const [transmitForm, setTransmitForm] = useState({ to: "", date: todayISO(), ids: [] as string[] });

  // HSE Operasional (JSA & PPE tersimpan di koleksi toolbox store; safety walk lokal)
  const [showJsa, setShowJsa] = useState(false);
  const [jsaForm, setJsaForm] = useState({ project: "", job: "", hazard: "", control: "", pic: "", date: todayISO(), branch: "" });
  const [showTbm, setShowTbm] = useState(false);
  const [tbmForm, setTbmForm] = useState({ project: "", topic: "", date: todayISO(), attendees: "", pic: "", branch: "" });
  const [ppeForm, setPpeForm] = useState({ project: "", date: todayISO(), employeeId: "", branch: "" });
  const [ppeChecked, setPpeChecked] = useState<Record<string, boolean>>({});
  // Safety walk & audit internal persist di store (koleksi walks/auditPlans).
  const walks = useMemo(() => inBranch(data.walks ?? []), [data.walks, inBranch]);
  const auditPlans = useMemo(() => inBranch(data.auditPlans ?? []), [data.auditPlans, inBranch]);
  const [showWalk, setShowWalk] = useState(false);
  const [walkForm, setWalkForm] = useState({ date: todayISO(), area: "", findings: "0", pic: "" });
  const [auditChecked, setAuditChecked] = useState<boolean[]>(() => AUDIT_ITEMS.map(() => false));

  // Audit internal (terpisah dari checklist Audit HSE di atas)
  const [showAuditPlan, setShowAuditPlan] = useState(false);
  const [auditForm, setAuditForm] = useState({ date: todayISO(), area: "", auditor: "", findings: "0", ncrId: "" });

  // Verifikasi lanjutan CAPA H+30
  const [followUpNcr, setFollowUpNcr] = useState<StoreItem | null>(null);
  const [followUpForm, setFollowUpForm] = useState({ date: todayISO(), note: "" });

  // Biaya rework per NCR (draft per detail)
  const [reworkDraft, setReworkDraft] = useState({ hours: "", rate: "", material: "" });

  const openNcr = ncrList.filter((n) => n.status !== "Tertutup").length;
  const criticalOpen = ncrList.filter((n) => n.severity === "Critical" && n.status !== "Tertutup").length;
  // Ambang sertifikat dari Pengaturan (ALERT_CERT_DAYS) - selaras alert engine.
  const CERT_WINDOW = getSetting(data, "ALERT_CERT_DAYS", 90);

  const ncrDist = Array.from(
    ncrList.reduce((m, n) => m.set(String(n.type ?? "Umum"), (m.get(String(n.type ?? "Umum")) ?? 0) + 1), new Map<string, number>()),
  ).map(([name, value], i) => ({ name, value, color: NCR_COLORS[i % NCR_COLORS.length] }));

  const vesselCerts = vessels.flatMap((v) =>
    (v.certificates ?? []).map((c: { name: string; expires: string }) => ({
      vessel: String(v.name),
      name: String(c.name),
      expires: String(c.expires),
      days: daysUntil(c.expires),
    })),
  );
  const certAttention = vesselCerts
    .filter((c) => c.days !== null && (c.days as number) <= CERT_WINDOW)
    .sort((a, b) => (a.days as number) - (b.days as number));

  const auditHistory = data.activities.filter((a) => String(a.action ?? "").toLowerCase().includes("audit hse")).slice(0, 5);
  const auditScore = Math.round((auditChecked.filter(Boolean).length / AUDIT_ITEMS.length) * 100);

  // Kalibrasi valid untuk NDE: status Selesai & due belum lewat
  const today = todayISO();
  const validCals = data.calibrations.filter((c) => c.status === "Selesai" && String(c.due ?? "") >= today);
  const calLabel = (id: string): string => {
    const c = data.calibrations.find((x) => x.id === id);
    if (!c) return id;
    const eq = data.equipment.find((e) => e.id === c.equipmentId);
    return `${c.id} · ${c.item}${eq ? ` (${eq.name})` : ""}`;
  };

  const certsOfInspector = (name: string): string[] => {
    const emp = data.employees.find((e) => sameName(e.name, name));
    return Array.isArray(emp?.certs) ? emp.certs as string[] : [];
  };

  const daysSince = (iso: string | null | undefined): number | null => {
    const d = daysUntil(iso);
    return d === null ? null : -d;
  };

  const needsFollowUp = (n: StoreItem): boolean => {
    if (n.status !== "Tertutup" || !n.closedAt || n.followUpDate) return false;
    const age = daysSince(String(n.closedAt));
    return age !== null && age > 30;
  };
  const followUpCount = ncrList.filter(needsFollowUp).length;

  const reworkCost = (n: StoreItem): number =>
    Math.max(0, Number(n.reworkHours || 0)) * Math.max(0, Number(n.reworkRate || 0)) + Math.max(0, Number(n.reworkMaterial || 0));
  const totalRework = ncrList.reduce((s, n) => s + reworkCost(n), 0);

  const dueBadge = (n: StoreItem) => {
    if (n.status === "Tertutup" || !n.due) return null;
    const left = daysUntil(n.due);
    if (left === null) return null;
    if (left < 0) return <Badge tone="red">{S.badgeTerlambat.replace("{n}", String(Math.abs(left)))}</Badge>;
    if (left === 0) return <Badge tone="amber">{S.badgeDueToday}</Badge>;
    return <Badge tone="blue">{S.badgeSisaN.replace("{n}", String(left))}</Badge>;
  };

  const saveInspection = async () => {
    if (!inspForm.project || !inspForm.point.trim()) { toast(S.tInspWajib, "info"); return; }
    if (!inspForm.date) { toast(S.tTglInspWajib, "info"); return; }
    if (!inspForm.inspector) { toast(S.tInspectorWajib, "info"); return; }
    const sample = Number(inspForm.sampleSize);
    const allowed = Number(inspForm.defectsAllowed);
    const found = Number(inspForm.defectsFound);
    if (!Number.isFinite(sample) || sample <= 0) { toast(S.tSampleWajib, "info"); return; }
    if (!Number.isFinite(allowed) || allowed < 0 || !Number.isFinite(found) || found < 0) { toast(S.tDefectValid, "info"); return; }
    if (inspForm.nde === "Ya") {
      if (!inspForm.calTool) { toast(S.tNdeAlat, "info"); return; }
      if (!validCals.some((c) => c.id === inspForm.calTool)) { toast(S.tAlatInvalid, "info"); return; }
    }
    let finalStatus = inspForm.status;
    let ncrDone = false;
    try {
      if (inspForm.status === "Lulus" && found > allowed) {
      // Gagal AQL tidak boleh lolos diam-diam - NCR otomatis + inspeksi tercatat NCR.
      const projAql = data.projects.find((p) => p.id === inspForm.project);
      const ncrAuto = await add("ncr", {
        project: inspForm.project, vessel: projAql?.vessel ?? "-", type: "Umum",
        status: "Terbuka", severity: "Major", raised: inspForm.date, due: addDaysISO(inspForm.date, 14),
        causeCat: "Metode", causeNote: "Temuan melebihi batas AQL",
        issue: `Gagal AQL di ${inspForm.point.trim()}: temuan ${found} > batas ${allowed}`,
        branch: branchOf(inspForm.branch),
      }, { action: "menerbitkan NCR (gagal AQL)", module: "QC" });
      toast(S.tAqlNcr.replace("{n}", ncrAuto.id));
      finalStatus = "NCR";
      ncrDone = true;
    }
    const itp = nextItp(inspections);
    const created = await add("inspections", {
      project: inspForm.project, point: inspForm.point.trim(), itp,
      status: finalStatus, date: inspForm.date,
      holdType: inspForm.holdType, nde: inspForm.nde,
      ndeMethod: inspForm.nde === "Ya" ? inspForm.ndeMethod : "-",
      calTool: inspForm.nde === "Ya" ? inspForm.calTool : "",
      inspector: inspForm.inspector,
      sampleSize: sample, defectsAllowed: allowed, defectsFound: found,
      branch: branchOf(inspForm.branch),
    }, { action: "mencatat inspeksi", module: "QC" });
    if (finalStatus === "NCR" && !ncrDone) {
      const proj = data.projects.find((p) => p.id === inspForm.project);
      await add("ncr", {
        project: inspForm.project, vessel: proj?.vessel ?? "-", type: "Umum",
        status: "Terbuka", severity: "Major", raised: inspForm.date, due: addDaysISO(inspForm.date, 14),
        causeCat: "Metode", causeNote: `Temuan inspeksi ${created.id}`,
        issue: `Temuan dari ${created.id}: ${inspForm.point.trim()}`,
        branch: branchOf(inspForm.branch),
      }, { action: "menerbitkan NCR", module: "QC" });
      toast(S.tInspNcr.replace("{n}", created.id));
    } else {
      toast(S.tInspJadwal.replace("{n}", created.id));
    }
    setShowInsp(false);
    setInspForm({ project: "", point: "", status: "Terjadwal", date: todayISO(), holdType: "Witness", nde: "Tidak", ndeMethod: "UT", inspector: "", sampleSize: "", defectsAllowed: "0", defectsFound: "0", calTool: "", branch: "" });
    } catch {
      toast(S.tInspGagal, "info");
    }
  };

  const saveNcr = async () => {
    try {
    if (!ncrForm.project || !ncrForm.issue.trim()) { toast(S.tNcrWajib, "info"); return; }
    if (!ncrForm.due) { toast(S.tCapaWajib, "info"); return; }
    const proj = data.projects.find((p) => p.id === ncrForm.project);
    const created = await add("ncr", {
      project: ncrForm.project, vessel: ncrForm.vessel || proj?.vessel || "-", type: ncrForm.type,
      status: "Terbuka", severity: ncrForm.severity, raised: todayISO(), due: ncrForm.due,
      causeCat: ncrForm.causeCat, causeNote: ncrForm.causeNote.trim(),
      issue: ncrForm.issue.trim(), branch: branchOf(ncrForm.branch),
    }, { action: "menerbitkan NCR", module: "QC" });
    toast(S.tNcrTerbit.replace("{n}", created.id));
    setShowNcr(false);
    setNcrForm({ project: "", vessel: "", type: "Pengelasan", severity: "Minor", issue: "", due: "", causeCat: "Manusia", causeNote: "", branch: "" });
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const advanceNcr = async (n: StoreItem) => {
    try {
    const idx = NCR_FLOW.indexOf(n.status);
    if (idx < 0 || idx >= NCR_FLOW.length - 1) return;
    const next = NCR_FLOW[idx + 1];
    if (!n.due) { toast(S.tCapaLengkapi, "info"); return; }
    if (next === "Tertutup") {
      setClosingNcr(n);
      setVerifier("");
      setVerifyNote("");
      return;
    }
    await update("ncr", n.id, { status: next });
    log(`memproses NCR ke ${next}`, n.id, "QC");
    toast(S.tArrow.replace("{a}", n.id).replace("{b}", next));
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const confirmClose = async () => {
    if (!closingNcr) return;
    if (closingNcr.severity === "Critical" && !canSetTarget(user?.role)) {
      toast(S.tHanyaDir, "info");
      return;
    }
    const ncrId = closingNcr.id;
    try {
    if (closingNcr.severity === "Critical" && !verifier.trim()) {
      toast(S.tCriticalVerif, "info");
      return;
    }
    const closedAt = todayISO();
    await update("ncr", closingNcr.id, {
      status: "Tertutup",
      verifiedBy: verifier.trim(),
      verifyNote: verifyNote.trim(),
      closedAt,
    });
    // Biaya rework > 0 → jurnal beban otomatis (ringkas ala Finance: 5200/1100).
    const cost = reworkCost(closingNcr);
    let journaled = false;
    if (cost > 0 && !(data.journals ?? []).some((j) => String(j.dokumen ?? "") === `NCR-${closingNcr.id}`)) {
      await add("journals", {
        date: closedAt,
        kodePembantu: "",
        dokumen: `NCR-${closingNcr.id}`,
        uraian: `Biaya rework ${closingNcr.id}`,
        db: "5200",
        kr: "1100",
        amount: Math.round(cost),
        sumber: "NCR",
        status: "Posted",
        branch: String(data.projects.find((p) => p.id === closingNcr.project)?.branch ?? globalBranch),
      }, { action: "mencatat biaya rework NCR", module: "QC" });
      journaled = true;
    }
    log("menutup NCR", journaled ? `${closingNcr.id} · rework ${fmtRupiah(Math.round(cost))} dijurnal` : closingNcr.id, "QC");
    toast(journaled ? S.tNcrTutupRework.replace("{n}", closingNcr.id).replace("{a}", fmtRupiah(Math.round(cost))) : S.tNcrTutup.replace("{n}", closingNcr.id));
    setClosingNcr(null);
    setNcrDetail((d) => (d && d.id === closingNcr.id ? { ...d, status: "Tertutup" } : d));
    } catch {
      toast(S.tNcrTutupGagal.replace("{n}", ncrId), "info");
    }
  };

  const confirmReopen = async () => {
    try {
    if (!reopenNcr) return;
    if (!reopenReason.trim()) { toast(S.tReopenWajib, "info"); return; }
    await update("ncr", reopenNcr.id, { status: "Terbuka", reopenReason: reopenReason.trim() });
    log("membuka kembali NCR", reopenNcr.id, "QC");
    toast(S.tNcrReopen.replace("{n}", reopenNcr.id));
    setReopenNcr(null);
    setReopenReason("");
    setNcrDetail((d) => (d && d.id === reopenNcr.id ? { ...d, status: "Terbuka" } : d));
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const openDetail = (n: StoreItem) => {
    setNcrDetail(n);
    setDueDraft(String(n.due ?? ""));
    setReworkDraft({ hours: String(n.reworkHours ?? ""), rate: String(n.reworkRate ?? ""), material: String(n.reworkMaterial ?? "") });
  };

  const saveRework = async () => {
    try {
    if (!ncrDetail) return;
    const hours = Number(reworkDraft.hours || 0);
    const rate = Number(reworkDraft.rate || 0);
    const material = Number(reworkDraft.material || 0);
    if (hours < 0 || rate < 0 || material < 0 || [hours, rate, material].some((v) => !Number.isFinite(v))) {
      toast(S.tReworkValid, "info");
      return;
    }
    await update("ncr", ncrDetail.id, { reworkHours: hours, reworkRate: rate, reworkMaterial: material });
    log("mencatat biaya rework", `${ncrDetail.id} · ${hours} jam × ${fmtRupiah(rate)} + material ${fmtRupiah(material)}`, "QC");
    setNcrDetail({ ...ncrDetail, reworkHours: hours, reworkRate: rate, reworkMaterial: material });
    toast(S.tReworkSimpan.replace("{n}", ncrDetail.id));
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const confirmFollowUp = async () => {
    try {
    if (!followUpNcr) return;
    if (!followUpForm.date) { toast(S.tFollowDate, "info"); return; }
    if (!followUpForm.note.trim()) { toast(S.tFollowNote, "info"); return; }
    await update("ncr", followUpNcr.id, { followUpDate: followUpForm.date, followUpNote: followUpForm.note.trim() });
    log("melakukan verifikasi lanjutan", `${followUpNcr.id} · ${fmtTanggal(followUpForm.date)} - ${followUpForm.note.trim()}`, "QC");
    toast(S.tFollowOk.replace("{n}", followUpNcr.id));
    setNcrDetail((d) => (d && d.id === followUpNcr.id ? { ...d, followUpDate: followUpForm.date, followUpNote: followUpForm.note.trim() } : d));
    setFollowUpNcr(null);
    setFollowUpForm({ date: todayISO(), note: "" });
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const exportNcr = () => {
    void exportExcel(
      [["NCR", "Proyek", "Severity", "Status", "Tenggat", "Ditutup", "Jam Rework", "Rate (Rp/jam)", "Material (Rp)", "Biaya Rework (Rp)", "Verifikasi Lanjutan"],
        ...ncrList.map((n) => [n.id, n.project, n.severity, n.status, fmtTanggal(String(n.due ?? "")), fmtTanggal(String(n.closedAt ?? "")), Number(n.reworkHours || 0), Number(n.reworkRate || 0), Number(n.reworkMaterial || 0), reworkCost(n), n.followUpDate ? `${fmtTanggal(String(n.followUpDate))} - ${n.followUpNote ?? ""}` : "-"])],
      `NCR-Rework-${today}`,
      "NCR",
    ).catch(() => toast(S.saveFail, "info"));
    toast(S.tNcrExport);
  };

  const saveAuditPlan = async () => {
    try {
    if (!auditForm.date || !auditForm.area.trim() || !auditForm.auditor.trim()) { toast(S.tAuditWajib, "info"); return; }
    const findings = Math.max(0, Math.floor(Number(auditForm.findings) || 0));
    const created = await add("auditPlans", {
      date: auditForm.date, area: auditForm.area.trim(), auditor: auditForm.auditor.trim(),
      findings, ncrId: auditForm.ncrId, branch: globalBranch,
    }, { action: "menjadwalkan audit internal", target: auditForm.area.trim(), module: "QC" });
    toast(S.tAuditJadwal.replace("{n}", created.id));
    setShowAuditPlan(false);
    setAuditForm({ date: todayISO(), area: "", auditor: "", findings: "0", ncrId: "" });
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const saveDue = async () => {
    try {
    if (!ncrDetail) return;
    if (!dueDraft) { toast(S.tCapaWajib, "info"); return; }
    await update("ncr", ncrDetail.id, { due: dueDraft });
    log("memperbarui tenggat CAPA", ncrDetail.id, "QC");
    setNcrDetail({ ...ncrDetail, due: dueDraft });
    toast(S.tCapaUpdate);
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const saveDrawing = async () => {
    try {
    if (!drwForm.project || !drwForm.title.trim() || !drwForm.holder.trim()) { toast(S.tDrwWajib, "info"); return; }
    const created = await add("drawings", {
      project: drwForm.project, title: drwForm.title.trim(), revision: "A",
      status: "Diajukan", updated: todayISO(), holder: drwForm.holder.trim(),
      branch: branchOf(drwForm.branch),
      history: [{ revision: "A", date: todayISO(), holder: drwForm.holder.trim(), status: "Diajukan" }],
    }, { action: "meregistrasi drawing", module: "QC" });
    toast(S.tDrwDaftar.replace("{n}", created.id));
    setShowDrw(false);
    setDrwForm({ project: "", title: "", holder: "", branch: "" });
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const reviseDrawing = async (d: StoreItem) => {
    try {
    const rev = nextRev(String(d.revision ?? "A"));
    const history = [...(Array.isArray(d.history) ? d.history : []), { revision: rev, date: todayISO(), holder: String(d.holder ?? ""), status: String(d.status ?? "Diajukan") }];
    await update("drawings", d.id, { revision: rev, updated: todayISO(), history });
    log("merevisi drawing", `${d.id} → rev ${rev}`, "QC");
    toast(S.tDrwNaik.replace("{n}", d.id).replace("{a}", rev));
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const stepDrawing = async (d: StoreItem, next: string) => {
    try {
    if (next === "Disetujui" && !canSetTarget(user?.role)) {
      toast(S.tHanyaDir, "info");
      return;
    }
    const history = [...(Array.isArray(d.history) ? d.history : []), { revision: String(d.revision ?? ""), date: todayISO(), holder: String(d.holder ?? ""), status: next }];
    await update("drawings", d.id, { status: next, updated: todayISO(), history });
    log("memproses drawing", `${d.id} → ${next}`, "QC");
    toast(S.tArrow.replace("{a}", d.id).replace("{b}", next));
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const toggleTransmitId = (id: string) => {
    setTransmitForm((f) => ({ ...f, ids: f.ids.includes(id) ? f.ids.filter((x) => x !== id) : [...f.ids, id] }));
  };

  const saveTransmittal = async () => {
    if (!transmitForm.to.trim()) { toast(S.tTransmitTo, "info"); return; }
    if (!transmitForm.date) { toast(S.tTransmitDate, "info"); return; }
    if (transmitForm.ids.length === 0) { toast(S.tTransmitPilih, "info"); return; }
    try {
      const rows = transmitForm.ids.map((id) => drawings.find((d) => d.id === id)).filter((d): d is StoreItem => !!d);
    void exportExcel(
      [["ID", "Proyek", "Judul", "Revisi", "Status", "Holder", "Diperbarui"],
        ...rows.map((d) => [d.id, d.project, d.title, d.revision, d.status, d.holder, fmtTanggal(String(d.updated))])],
      `Transmittal-${transmitForm.date}`,
      "Transmittal",
    );
    // Transmittal tercatat: drawing Disetujui → Distribusi.
    for (const d of rows) {
      if (String(d.status ?? "") === "Disetujui") {
        await update("drawings", String(d.id), { status: "Distribusi" });
      }
    }
    log("mengirim transmittal drawing", `${rows.length} drawing → ${transmitForm.to.trim()} · ${fmtTanggal(transmitForm.date)}`, "QC");
    toast(S.tTransmitOk.replace("{n}", String(rows.length)));
    setShowTransmit(false);
    setTransmitForm({ to: "", date: todayISO(), ids: [] });
    } catch {
      toast(S.tTransmitGagal, "info");
    }
  };

  const saveJsa = async () => {
    try {
    if (!jsaForm.project || !jsaForm.job.trim() || !jsaForm.hazard.trim() || !jsaForm.control.trim() || !jsaForm.pic.trim() || !jsaForm.date) {
      toast(S.tJsaWajib, "info");
      return;
    }
    // JSA menetap di koleksi toolbox bertipe "JSA" (pola add toolbox yang sama).
    const created = await add("toolbox", {
      type: "JSA",
      project: jsaForm.project, topic: jsaForm.job.trim(), job: jsaForm.job.trim(),
      hazard: jsaForm.hazard.trim(), control: jsaForm.control.trim(),
      pic: jsaForm.pic.trim(), date: jsaForm.date, attendees: 0,
      branch: branchOf(jsaForm.branch),
    }, { action: "menyusun JSA", module: "Safety" });
    toast(S.tJsaOk.replace("{n}", created.id));
    setShowJsa(false);
    setJsaForm({ project: "", job: "", hazard: "", control: "", pic: "", date: todayISO(), branch: "" });
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const saveToolbox = async () => {
    try {
    if (!tbmForm.project || !tbmForm.topic.trim() || !tbmForm.date || !tbmForm.pic.trim()) { toast(S.tTbmWajib, "info"); return; }
    const created = await add("toolbox", {
      project: tbmForm.project, topic: tbmForm.topic.trim(), date: tbmForm.date,
      attendees: Number(tbmForm.attendees) || 0, pic: tbmForm.pic.trim(),
      branch: branchOf(tbmForm.branch),
    }, { action: "mencatat toolbox talk", module: "Safety" });
    toast(S.tTbmOk.replace("{n}", created.id));
    setShowTbm(false);
    setTbmForm({ project: "", topic: "", date: todayISO(), attendees: "", pic: "", branch: "" });
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const savePpeCheck = async () => {
    try {
    if (!ppeForm.project || !ppeForm.date) { toast(S.tPpeWajib, "info"); return; }
    if (!ppeForm.employeeId) { toast(S.tPpeKaryawan, "info"); return; }
    const done = PPE_ITEMS.filter((item) => ppeChecked[item]);
    if (done.length < PPE_ITEMS.length) { toast(S.tPpeKurang.replace("{a}", String(done.length)).replace("{b}", String(PPE_ITEMS.length)), "info"); return; }
    const emp = data.employees.find((e) => e.id === ppeForm.employeeId);
    const created = await add("toolbox", {
      type: "PPE Check",
      project: ppeForm.project, topic: `PPE Check - ${PPE_ITEMS.length} item lengkap`, date: ppeForm.date,
      attendees: 0, pic: "HSE", employeeId: ppeForm.employeeId,
      branch: branchOf(ppeForm.branch) || String(emp?.branch ?? ""),
    }, { action: "mencatat PPE check", module: "Safety" });
    toast(S.tPpeOk.replace("{n}", created.id));
    setPpeForm({ project: "", date: todayISO(), employeeId: "", branch: "" });
    setPpeChecked({});
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const saveWalk = async () => {
    try {
    if (!walkForm.date || !walkForm.area.trim() || !walkForm.pic.trim()) { toast(S.tWalkWajib, "info"); return; }
    const findings = Math.max(0, Number(walkForm.findings) || 0);
    const created = await add("walks", {
      date: walkForm.date, area: walkForm.area.trim(), findings, pic: walkForm.pic.trim(),
      branch: globalBranch,
    }, { action: "melakukan safety walk", target: walkForm.area.trim(), module: "Safety" });
    toast(S.tWalkOk.replace("{n}", created.id));
    setShowWalk(false);
    setWalkForm({ date: todayISO(), area: "", findings: "0", pic: "" });
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const walkToNcr = async (w: StoreItem) => {    try {const created = await add("ncr", {
      project: data.projects[0]?.id ?? "-", vessel: data.projects[0]?.vessel ?? "-",
      type: "Umum", status: "Terbuka", severity: "Minor", raised: w.date,
      due: addDaysISO(w.date, 7), causeCat: "Lingkungan",
      causeNote: `Temuan safety walk ${w.id}`,
      issue: `Temuan safety walk ${w.id} di ${w.area}: ${w.findings} temuan`,
      branch: globalBranch,
    }, { action: "menerbitkan NCR", module: "QC" });
    toast(S.tNcrFromWalk.replace("{n}", created.id));
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const incidentToNcr = async (i: StoreItem) => {
    try {
    const sev = String(i.severity ?? "");
    const severity = /kritis/i.test(sev) ? "Critical" : /berat|tinggi|besar/i.test(sev) ? "Major" : "Minor";
    const proj = String(i.project ?? i.projectId ?? "-");
    const created = await add("ncr", {
      project: proj, vessel: "-", type: "Insiden", status: "Terbuka", severity,
      raised: String(i.date ?? todayISO()), due: addDaysISO(String(i.date ?? todayISO()), 14),
      causeCat: "Lingkungan", causeNote: `Tindak lanjut insiden ${String(i.id)}`,
      issue: `Tindak lanjut insiden ${String(i.id)} di ${String(i.location ?? "-")}: ${String(i.desc ?? "-")}`,
      incidentId: String(i.id), branch: globalBranch,
    }, { action: "menerbitkan NCR dari insiden", module: "QC" });
    toast(S.tNcrFromInc.replace("{n}", created.id).replace("{a}", String(i.id)));
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const saveAudit = () => {
    const answered = auditChecked.length;
    if (answered < AUDIT_ITEMS.length) return;
    log("melakukan audit HSE", `skor ${auditScore}% (${auditChecked.filter(Boolean).length}/${AUDIT_ITEMS.length} item)`, "Safety");
    toast(S.tAuditSimpan.replace("{n}", String(auditScore)));
    setAuditChecked(AUDIT_ITEMS.map(() => false));
  };

  return (
    <div>
      <PageHeader
        title={S.pageTitle}
        subtitle={S.pageSub}
        icon={<ShieldCheck className="h-5 w-5" />}
        actions={
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={() => setShowNcr(true)}><AlertTriangle className="h-4 w-4" /> {S.btnNcrBaru}</button>
            <button className="btn-primary-gradient" onClick={() => setShowInsp(true)}><Plus className="h-4 w-4" /> {S.btnInspBaru}</button>
          </div>
        }
      />

      {modAlert.active && <AlertBannerView items={modAlert.items} onPick={pickNotif} />}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label={S.kpiNcrTerbuka} value={String(openNcr)} delta={criticalOpen > 0 ? S.kpiCriticalN.replace("{n}", String(criticalOpen)) : S.kpiNihilCritical} deltaDirection={criticalOpen > 0 ? "down" : "up"} icon={<AlertTriangle className="h-5 w-5" />} chip="rose" spark={ncrTrend} />
        <KpiCard label={S.kpiInspTercatat} value={String(inspections.length)} delta={S.kpiNcrTerkait.replace("{n}", String(ncrList.length))} deltaDirection="flat" icon={<ShieldCheck className="h-5 w-5" />} chip="navy" spark={inspectionTrend.map((d) => ({ name: d.month, v: d.inspeksi }))} />
        <KpiCard label={S.kpiInsiden} value={String(incidents.length)} delta={S.kpiNearMiss} deltaDirection="down" icon={<Siren className="h-5 w-5" />} chip="amber" spark={incidentTrend} />
        <KpiCard label={S.kpiHse} value="A" delta={S.kpiKinerjaBaik} deltaDirection="up" icon={<Award className="h-5 w-5" />} chip="teal" spark={hseTrend} />
      </div>

      <div className="mt-4 card">
        <Tabs tabs={["Drawing", "Inspeksi (ITP)", "NCR", "HSE Operasional", "Insiden", "Sertifikat"]} active={tab} onChange={setTab} labels={{ Drawing: S.tabDrawing, "Inspeksi (ITP)": S.tabInsp, NCR: S.tabNcr, "HSE Operasional": S.tabHse, Insiden: S.tabInsiden, Sertifikat: S.tabSertifikat }} />
        <div className="p-4">
          {tab === "Inspeksi (ITP)" && (
            <div className="space-y-4">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <div className="relative min-w-52 flex-1 sm:max-w-xs">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-steel-400" />
                  <input className="input pl-9 w-full" placeholder={S.searchInspPh} aria-label={S.searchInspAria} value={inspQ} onChange={(e) => setInspQ(e.target.value)} />
                </div>
                <FilterPopover
                  activeCount={[inspStatus !== "Semua"].filter(Boolean).length}
                  initial={{ status: inspStatus }}
                  onReset={() => { setInspQ(""); setInspStatus("Semua"); }}
                  onApply={(d) => { setInspStatus(d.status); }}
                >
                  {(draft, setDraft) => (
                    <div className="space-y-3">
                      <Field label={S.fHasil}>
                        <select className="input w-full" value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
                          {["Semua", "Terjadwal", "Dalam Proses", "Lulus", "NCR"].map((s) => <option key={s} value={s}>{s === "Semua" ? "Semua hasil" : s}</option>)}
                        </select>
                      </Field>
                    </div>
                  )}
                </FilterPopover>
                {(inspQ.trim() !== "" || inspStatus !== "Semua") && (
                  <span className="text-xs text-steel-400">
                    {S.filterAktifInsp.replace("{n}", String(sortedInsp.length))}
                  </span>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-surface sticky top-0 z-10">
                    <tr><SortTh label={S.thInspeksi} sortKey="inspeksi" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.thProyek} sortKey="proyek" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.thTitik} sortKey="titik" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.thItp} sortKey="itp" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.thHold} sortKey="hold" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.thNde} sortKey="nde" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.thSampel} sortKey="sampel" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.thInspector} sortKey="inspector" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.thTanggal} sortKey="tanggal" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.thHasil} sortKey="hasil" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><th className="th">{S.thAksi}</th></tr>
                  </thead>
                  <tbody className="divide-y divide-steel-100">
                    {inspPager.slice(sortedInsp).map((i) => (
                      <tr key={i.id} className="hover:bg-surface">
                        <td className="td font-mono font-medium text-navy-900">{i.id}</td>
                        <td className="td text-steel-600 font-mono text-xs">{i.project}</td>
                        <td className="td text-steel-600 max-w-[240px] truncate" title={String(i.point)}>{i.point}</td>
                        <td className="td text-steel-600 font-mono text-xs">{i.itp}</td>
                        <td className="td"><Badge tone={i.holdType === "Hold" ? "red" : i.holdType === "Witness" ? "amber" : "blue"}>{i.holdType ?? "-"}</Badge></td>
                        <td className="td text-steel-600 text-xs">{i.nde === "Ya" ? `Ya · ${i.ndeMethod ?? "-"}` : "Tidak"}</td>
                        <td className="td text-steel-600 text-xs">
                          {i.sampleSize ? S.sampelRow.replace("{a}", String(i.sampleSize)).replace("{b}", String(i.defectsFound ?? 0)).replace("{c}", String(i.defectsAllowed ?? 0)) : "-"}
                        </td>
                        <td className="td text-steel-600 text-xs">{i.inspector ?? "-"}</td>
                        <td className="td text-steel-600">{fmtTanggal(i.date)}</td>
                        <td className="td"><StatusBadge status={i.status} /></td>
                        <td className="td"><button className="btn-secondary text-xs" onClick={() => setInspDetail(i)}>{S.btnDetail}</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {inspPager.bar}
              </div>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <Card>
                  <CardHeader title={S.cardNcrDist} subtitle={S.cardNcrDistS} />
                  <div className="flex items-center gap-4 p-4 pt-0">
                    <Donut data={ncrDist.map(({ name, value }) => ({ name, value }))} colors={ncrDist.map((d) => d.color)} size={130} thickness={18} centerValue={String(ncrList.length)} centerLabel="NCR" />
                    <div className="flex-1 space-y-1.5">
                      {ncrDist.map((d) => (
                        <div key={d.name} className="flex items-center gap-2 text-sm">
                          <span className="h-3 w-3 rounded-sm" style={{ background: d.color }} />
                          <span className="truncate text-steel-600" title={d.name}>{d.name}</span>
                          <span className="ml-auto font-semibold text-navy-900">{d.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </Card>
                <Card className="lg:col-span-2">
                  <CardHeader title={S.cardInspT} subtitle={S.cardInspS} />
                  <div className="h-44 p-4 pt-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={inspectionTrend} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e9eff4" vertical={false} />
                        <XAxis dataKey="month" stroke="#8aa2b6" axisLine={false} tickLine={false} />
                        <YAxis stroke="#8aa2b6" axisLine={false} tickLine={false} />
                        <Tooltip content={<ChartTooltip />} />
                        <Bar dataKey="inspeksi" name="Inspeksi" fill="#8cc9e8" radius={[4, 4, 0, 0]} barSize={18} />
                        <Line type="monotone" dataKey="lulus" name="Lulus" stroke="#1f9d55" strokeWidth={2.5} dot={{ r: 3 }} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              </div>
            </div>
          )}

          {tab === "NCR" && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface px-3 py-2 text-sm">
                <p className="text-steel-600">
                  {S.reworkTotal.split("{a}")[0]}<span className="font-semibold text-navy-900">{fmtRupiah(totalRework)}</span>{S.reworkTotal.split("{a}")[1]}
                  {followUpCount > 0 && <span className="ml-2 font-medium text-amber-700">{S.followupNeed.replace("{n}", String(followUpCount))}</span>}
                </p>
                <button className="btn-secondary text-xs" onClick={exportNcr}>{S.btnEksporNcr}</button>
              </div>
              {ncrList.map((n) => (
                <Card key={n.id} id={notifRowId(String(n.id))} className={`p-4 ${flash.flashId === String(n.id) ? "notif-hl notif-flash" : (notified.has(String(n.id)) ? "notif-hl" : "")}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-navy-900 font-mono">{n.id}</p>
                        <Badge tone={n.severity === "Critical" ? "red" : n.severity === "Major" ? "amber" : "blue"}>{n.severity}</Badge>
                        {dueBadge(n)}
                        {needsFollowUp(n) && <Badge tone="amber">{S.badgeFollowup}</Badge>}
                        {Number(n.reworkHours || 0) > 0 || Number(n.reworkMaterial || 0) > 0 ? (
                          <span className="text-xs text-steel-500">{S.reworkN.replace("{a}", fmtRupiah(reworkCost(n)))}</span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm text-steel-700">{n.issue}</p>
                      <p className="text-xs text-steel-500 mt-0.5">{n.project} · {n.vessel} · {n.type} · {S.ncrMetaDilaporkan.replace("{a}", fmtTanggal(n.raised))}{n.due ? S.ncrMetaTenggat.replace("{a}", fmtTanggal(n.due)) : S.ncrMetaTanpa}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={ncrTone[n.status] ?? "gray"}>{n.status}</Badge>
                      <button className="btn-secondary text-xs" onClick={() => openDetail(n)}>{S.btnDetail}</button>
                      {n.status !== "Tertutup" ? (
                        <button className="btn-primary text-xs" onClick={() => advanceNcr(n)}>{S.btnProses}</button>
                      ) : (
                        <button className="btn-secondary text-xs" onClick={() => { setReopenNcr(n); setReopenReason(""); }}>{S.btnBukaKembali}</button>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
              {ncrList.length === 0 && <p className="py-6 text-center text-sm text-steel-400">{S.emptyNcr}</p>}
            </div>
          )}

          {tab === "Drawing" && (
            <div className="space-y-3">
              <div className="flex flex-wrap justify-end gap-2">
                <button className="btn-secondary text-xs" onClick={() => setShowTransmit(true)}><Send className="h-3.5 w-3.5" /> {S.btnTransmittal}</button>
                <button className="btn-secondary text-xs" onClick={() => setShowDrw(true)}><Plus className="h-3.5 w-3.5" /> {S.btnRegister}</button>
              </div>
              {drawings.map((d) => (
                <Card key={d.id} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-navy-900 font-mono">{d.id}</p>
                        <Badge tone="navy">{S.revN.replace("{n}", String(d.revision))}</Badge>
                        <StatusBadge status={String(d.status)} />
                      </div>
                      <p className="mt-1 text-sm text-steel-700">{d.title}</p>
                      <p className="text-xs text-steel-500 mt-0.5">{S.drawingMeta.replace("{a}", String(d.project)).replace("{b}", String(d.holder)).replace("{c}", fmtTanggal(String(d.updated)))}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button className="btn-secondary text-xs" onClick={() => setExpandedDrw(expandedDrw === d.id ? null : d.id)}>
                        {expandedDrw === d.id ? S.btnTutupRiwayat : S.btnRiwayat}
                      </button>
                      <button className="btn-secondary text-xs" onClick={() => reviseDrawing(d)}>{S.revisiKe.replace("{n}", nextRev(String(d.revision ?? "A")))}</button>
                      {DRAW_FLOW[DRAW_FLOW.indexOf(String(d.status)) + 1] && (
                        <button className="btn-primary text-xs" onClick={() => stepDrawing(d, DRAW_FLOW[DRAW_FLOW.indexOf(String(d.status)) + 1])}>
                          {S.arrowN.replace("{n}", DRAW_FLOW[DRAW_FLOW.indexOf(String(d.status)) + 1])}
                        </button>
                      )}
                    </div>
                  </div>
                  {expandedDrw === d.id && (
                    <div className="mt-3 border-t border-steel-100 pt-2">
                      <p className="text-xs font-semibold text-steel-500">{S.riwayatRevisi}</p>
                      <div className="mt-1 space-y-1">
                        {(Array.isArray(d.history) ? d.history : []).map((h: { revision: string; date: string; holder: string; status: string }, idx: number) => (
                          <div key={idx} className="flex flex-wrap items-center justify-between gap-2 text-xs text-steel-600">
                            <span>{S.histRow.replace("{a}", h.revision).replace("{b}", h.status).replace("{c}", h.holder)}</span>
                            <span>{fmtTanggal(h.date)}</span>
                          </div>
                        ))}
                        {(!Array.isArray(d.history) || d.history.length === 0) && <p className="text-xs text-steel-400">{S.emptyHistory}</p>}
                      </div>
                    </div>
                  )}
                </Card>
              ))}
              {drawings.length === 0 && <p className="py-6 text-center text-sm text-steel-400">{S.emptyDrawing}</p>}
            </div>
          )}

          {tab === "HSE Operasional" && (
            <div className="space-y-6">
              <Card className="p-4">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-navy-900">{S.hseJsaT}</h3>
                  <button className="btn-secondary text-xs" onClick={() => setShowJsa(true)}><Plus className="h-3.5 w-3.5" /> {S.btnSusunJsa}</button>
                </div>
                <div className="space-y-2">
                  {jsaList.map((j) => (
                    <div key={j.id} className="rounded-lg border border-steel-100 p-3 text-sm">
                      <p className="font-medium text-navy-900">{j.job} <span className="font-mono text-xs text-steel-500">· {j.id} · {j.project}</span></p>
                      <p className="text-xs text-steel-600 mt-1">{S.bahayaN.replace("{n}", String(j.hazard))}</p>
                      <p className="text-xs text-steel-600">{S.kontrolN.replace("{n}", String(j.control))}</p>
                      <p className="text-xs text-steel-500 mt-1">{S.picN.replace("{n}", String(j.pic)).replace("{a}", fmtTanggal(j.date))}</p>
                    </div>
                  ))}
                  {jsaList.length === 0 && <p className="text-xs text-steel-400">{S.emptyJsa}</p>}
                </div>
              </Card>

              <Card className="p-4">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-navy-900">{S.toolboxT}</h3>
                  <button className="btn-secondary text-xs" onClick={() => setShowTbm(true)}><Plus className="h-3.5 w-3.5" /> {S.btnCatatToolbox}</button>
                </div>
                <div className="space-y-2">
                  {toolboxTalks.filter((t) => String(t.type ?? "") !== "JSA").map((t) => (
                    <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-steel-100 py-2 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-navy-900" title={String(t.topic)}>{t.topic}{t.employeeId ? <span className="ml-1 text-xs font-normal text-steel-500">· {t.employeeId}</span> : null}</p>
                        <p className="text-xs text-steel-500">{S.toolboxMeta.replace("{a}", String(t.project)).replace("{b}", fmtTanggal(String(t.date))).replace("{n}", String(t.attendees)).replace("{c}", String(t.pic))}</p>
                      </div>
                      <span className="font-mono text-xs text-steel-400">{t.id}</span>
                    </div>
                  ))}
                  {toolboxTalks.filter((t) => String(t.type ?? "") !== "JSA").length === 0 && <p className="text-xs text-steel-400">{S.emptyToolbox}</p>}
                </div>
              </Card>

              <Card className="p-4">
                <h3 className="text-sm font-semibold text-navy-900">{S.ppeTitle}</h3>
                <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label={S.thProyek}>
                    <select className="input" value={ppeForm.project} onChange={(e) => setPpeForm({ ...ppeForm, project: e.target.value })}>
                      <option value="">{S.optPilihProyek}</option>
                      {data.projects.map((p) => <option key={p.id} value={p.id}>{p.id} · {p.vessel}</option>)}
                    </select>
                  </Field>
                  <Field label={S.fPenerima} hint={S.hintPpePer}>
                    <select className="input" value={ppeForm.employeeId} onChange={(e) => setPpeForm({ ...ppeForm, employeeId: e.target.value })}>
                      <option value="">{S.optPilihKaryawan}</option>
                      {data.employees.filter((e) => e.status === "Aktif").map((e) => <option key={e.id} value={e.id}>{e.name} · {e.id}</option>)}
                    </select>
                  </Field>
                  <Field label={S.thTanggal}><input type="date" className="input" value={ppeForm.date} onChange={(e) => setPpeForm({ ...ppeForm, date: e.target.value })} /></Field>
                  <Field label={S.fCabang} hint={S.hintIkutGlobal.replace("{n}", branch)}>
                    <select className="input" value={ppeForm.branch} onChange={(e) => setPpeForm({ ...ppeForm, branch: e.target.value })}>
                      <option value="">{S.optIkutGlobal}</option>
                      {branchCities.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </Field>
                </div>
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {PPE_ITEMS.map((item) => (
                    <label key={item} className="flex items-center gap-2 rounded-lg border border-steel-100 px-3 py-2 text-sm text-steel-700">
                      <input type="checkbox" checked={!!ppeChecked[item]} onChange={(e) => setPpeChecked({ ...ppeChecked, [item]: e.target.checked })} />
                      {item}
                    </label>
                  ))}
                </div>
                <p className="mt-2 text-xs text-steel-500">{S.ppeLengkap.replace("{a}", String(PPE_ITEMS.filter((i) => ppeChecked[i]).length)).replace("{b}", String(PPE_ITEMS.length))}</p>
                <button className="btn-primary mt-2 text-xs" onClick={savePpeCheck}>{S.btnSimpanPpe}</button>
              </Card>

              <Card className="p-4">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-navy-900">{S.walkT}</h3>
                  <button className="btn-secondary text-xs" onClick={() => setShowWalk(true)}><Plus className="h-3.5 w-3.5" /> {S.btnCatatWalk}</button>
                </div>
                <div className="space-y-2">
                  {walks.map((w) => (
                    <div key={w.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-steel-100 p-3 text-sm">
                      <div>
                        <p className="font-medium text-navy-900">{w.area} <span className="font-mono text-xs text-steel-500">· {w.id}</span></p>
                        <p className="text-xs text-steel-500">{S.walkMeta.replace("{a}", fmtTanggal(w.date)).replace("{n}", String(w.findings)).replace("{b}", String(w.pic))}</p>
                      </div>
                      {w.findings > 0 && <button className="btn-secondary text-xs" onClick={() => walkToNcr(w)}>{S.btnBuatkanNcr}</button>}
                    </div>
                  ))}
                  {walks.length === 0 && <p className="text-xs text-steel-400">{S.emptyWalk}</p>}
                </div>
              </Card>

              <Card className="p-4">
                <h3 className="text-sm font-semibold text-navy-900">{S.auditHseT}</h3>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {AUDIT_ITEMS.map((item, idx) => (
                    <label key={item} className="flex items-center gap-2 rounded-lg border border-steel-100 px-3 py-2 text-sm text-steel-700">
                      <input type="checkbox" checked={auditChecked[idx]} onChange={(e) => setAuditChecked(auditChecked.map((v, i) => (i === idx ? e.target.checked : v)))} />
                      {item}
                    </label>
                  ))}
                </div>
                <p className="mt-2 text-sm text-steel-600">{S.auditSkor.split("{a}%")[0]}<span className="font-semibold text-navy-900">{auditScore}%</span>{S.auditSkor.split("{a}%")[1].replace("{b}", String(auditChecked.filter(Boolean).length)).replace("{c}", String(AUDIT_ITEMS.length))}</p>
                <button className="btn-primary mt-2 text-xs" onClick={saveAudit}>{S.btnSimpanAudit}</button>
                <div className="mt-3 border-t border-steel-100 pt-2">
                  <p className="text-xs font-semibold text-steel-500">{S.riwayatAudit}</p>
                  <div className="mt-1 space-y-1">
                    {auditHistory.map((a) => (
                      <p key={a.id} className="text-xs text-steel-600">{a.action} - {a.target} <span className="text-steel-400">· {a.time}</span></p>
                    ))}
                    {auditHistory.length === 0 && <p className="text-xs text-steel-400">{S.emptyAudit}</p>}
                  </div>
                </div>
              </Card>

              <Card className="p-4">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-navy-900">{S.auditInternalT}</h3>
                  <button className="btn-secondary text-xs" onClick={() => { setAuditForm({ date: todayISO(), area: "", auditor: "", findings: "0", ncrId: "" }); setShowAuditPlan(true); }}><Plus className="h-3.5 w-3.5" /> {S.btnJadwalkanAudit}</button>
                </div>
                <div className="space-y-2">
                  {auditPlans.map((a) => (
                    <div key={a.id} className="rounded-lg border border-steel-100 p-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium text-navy-900">{a.area} <span className="font-mono text-xs text-steel-500">· {a.id}</span></p>
                        <button className="btn-secondary text-xs" onClick={async () => { try { await remove("auditPlans", String(a.id)); } catch (e) { toast(e instanceof Error ? e.message : S.tJadwalHapus, "info"); } }}>{S.btnHapus}</button>
                      </div>
                      <p className="mt-1 text-xs text-steel-600">{S.planMeta.replace("{a}", fmtTanggal(a.date)).replace("{b}", String(a.auditor)).replace("{n}", String(a.findings))}{a.ncrId ? S.terkaitN.replace("{n}", String(a.ncrId)) : ""}</p>
                    </div>
                  ))}
                  {auditPlans.length === 0 && <p className="text-xs text-steel-400">{S.emptyPlan}</p>}
                </div>
              </Card>
            </div>
          )}

          {tab === "Insiden" && (
            <div>
              <div className="mb-3 flex justify-end">
                <button className="btn-secondary text-xs" onClick={() => { setShowInc(true); setIncForm((f) => ({ ...f, project: f.project || data.projects[0]?.id || "" })); }}><Plus className="h-3.5 w-3.5" /> {S.btnCatatInsiden}</button>
              </div>
              <div className="space-y-3">
                {incidents.map((i) => (
                  <Card key={i.id} id={notifRowId(String(i.id))} className={`p-4 ${flash.flashId === String(i.id) ? "notif-hl notif-flash" : (notified.has(String(i.id)) ? "notif-hl" : "")}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-navy-900 font-mono">{i.id}</p>
                          <Badge tone={i.type === "Near Miss" ? "amber" : "blue"}>{i.type}</Badge>
                        </div>
                        <p className="mt-1 text-sm text-steel-700">{i.desc}</p>
                        <p className="text-xs text-steel-500 mt-0.5">{S.incidentMeta.replace("{a}", fmtTanggal(i.date)).replace("{b}", String(i.project ?? i.projectId ?? "-")).replace("{c}", String(i.location)).replace("{d}", String(i.severity))}</p>
                      </div>
                      <button className="btn-secondary shrink-0 text-xs" onClick={() => void incidentToNcr(i)}>{S.btnBuatkanNcr}</button>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {tab === "Sertifikat" && (
            <div className="space-y-4">
              <Card className="p-4">
                <h3 className="text-sm font-semibold text-navy-900">{S.certAttentionT.replace("{n}", String(CERT_WINDOW))}</h3>
                <div className="mt-2 space-y-2 text-sm">
                  {certAttention.map((c) => (
                    <div key={`${c.vessel}-${c.name}`} className="flex items-center justify-between gap-2">
                      <span className="truncate text-steel-600" title={`${c.name} - ${c.vessel} · berlaku hingga ${fmtTanggal(c.expires)}`}>{c.name} - {c.vessel}</span>
                      <Badge tone={(c.days as number) < 0 ? "red" : "amber"}>
                        {(c.days as number) < 0 ? S.badgeLewat.replace("{n}", String(Math.abs(c.days as number))) : S.badgeSisaN.replace("{n}", String(c.days))}
                      </Badge>
                    </div>
                  ))}
                  {certAttention.length === 0 && <p className="text-xs text-steel-400">{S.emptyCert}</p>}
                </div>
              </Card>
              {vessels.map((v) => (
                <div key={v.id}>
                  <h3 className="mb-2 text-sm font-semibold text-navy-900">{v.name}</h3>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {(v.certificates ?? []).map((c: { name: string; expires: string }) => {
                      const left = daysUntil(c.expires);
                      const tone = left === null ? "gray" : left < 0 ? "red" : left <= CERT_WINDOW ? "amber" : "green";
                      return (
                        <Card key={c.name} className="p-3">
                          <p className="truncate text-sm font-medium text-navy-900" title={c.name}>{c.name}</p>
                          <p className="text-xs text-steel-500">{S.berlakuHingga.replace("{n}", fmtTanggal(c.expires))}{left !== null && left >= 0 ? S.sisaHariDot.replace("{n}", String(left)) : ""}</p>
                          <Badge tone={tone as "green" | "amber" | "red" | "gray"} className="mt-1">{tone === "green" ? "Berlaku" : tone === "amber" ? "Hampir Expire" : tone === "red" ? "Kedaluwarsa" : "Tanpa tanggal"}</Badge>
                        </Card>
                      );
                    })}
                    {(v.certificates ?? []).length === 0 && <p className="text-xs text-steel-400">{S.emptyCertBuild}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modal inspeksi */}
      <Modal open={showInsp} onClose={() => setShowInsp(false)} title={S.mInspT} subtitle={S.mInspS}
        wide footer={<><button className="btn-secondary" onClick={() => setShowInsp(false)}>{S.btnBatal}</button><button className="btn-primary" onClick={saveInspection}>{S.btnSimpanInsp}</button></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label={S.thProyek}>
              <select className="input" value={inspForm.project} onChange={(e) => setInspForm({ ...inspForm, project: e.target.value })}>
                <option value="">{S.optPilihProyek}</option>
                {data.projects.map((p) => <option key={p.id} value={p.id}>{p.id} - {p.vessel}</option>)}
              </select>
            </Field>
            <Field label={S.fCabang} hint={S.hintIkutGlobal.replace("{n}", branch)}>
              <select className="input" value={inspForm.branch} onChange={(e) => setInspForm({ ...inspForm, branch: e.target.value })}>
                <option value="">{S.optIkutGlobal}</option>
                {branchCities.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label={S.fNomorItp} hint={S.hintItpNext.replace("{n}", nextItp(inspections))}>
              <input className="input font-mono" value={nextItp(inspections)} disabled readOnly />
            </Field>
            <Field label={S.thTanggal}><input type="date" className="input" value={inspForm.date} onChange={(e) => setInspForm({ ...inspForm, date: e.target.value })} /></Field>
            <Field label={S.fHasil}>
              <select className="input" value={inspForm.status} onChange={(e) => setInspForm({ ...inspForm, status: e.target.value })}>
                {["Terjadwal", "Dalam Proses", "Lulus", "NCR"].map((s) => <option key={s}>{s}</option>)}
              </select>
            </Field>
            <Field label={S.fHold}>
              <select className="input" value={inspForm.holdType} onChange={(e) => setInspForm({ ...inspForm, holdType: e.target.value })}>
                {HOLD_TYPES.map((h) => <option key={h}>{h}</option>)}
              </select>
            </Field>
            <Field label={S.fInspectorQ}>
              <select className="input" value={inspForm.inspector} onChange={(e) => setInspForm({ ...inspForm, inspector: e.target.value })}>
                <option value="">{S.optPilihInspector}</option>
                {qualityStaff.map((e) => <option key={e.id} value={e.name}>{e.name} · {e.role}</option>)}
              </select>
            </Field>
            <Field label={S.fPerluNde}>
              <select className="input" value={inspForm.nde} onChange={(e) => setInspForm({ ...inspForm, nde: e.target.value })}>
                {["Ya", "Tidak"].map((v) => <option key={v}>{v}</option>)}
              </select>
            </Field>
            {inspForm.nde === "Ya" && (
              <Field label={S.fMetodeNde}>
                <select className="input" value={inspForm.ndeMethod} onChange={(e) => setInspForm({ ...inspForm, ndeMethod: e.target.value })}>
                  {NDE_METHODS.map((m) => <option key={m}>{m}</option>)}
                </select>
              </Field>
            )}
            <Field label={S.fSampel} hint={S.hintSampel}>
              <NumInput min={1} className="input" value={inspForm.sampleSize} onChange={(e) => setInspForm({ ...inspForm, sampleSize: e.target.value })} placeholder={S.phCth50} />
            </Field>
            <Field label={S.fDefectAllow} hint={S.hintDefect}>
              <NumInput min={0} className="input" value={inspForm.defectsAllowed} onChange={(e) => setInspForm({ ...inspForm, defectsAllowed: e.target.value })} placeholder={S.phCth1} />
            </Field>
            <Field label={S.fTemuan}>
              <NumInput min={0} className="input" value={inspForm.defectsFound} onChange={(e) => setInspForm({ ...inspForm, defectsFound: e.target.value })} placeholder={S.phCth0} />
            </Field>
            {inspForm.nde === "Ya" && (
              <Field label={S.fAlatKal} hint={S.hintAlat}>
                <select className="input" value={inspForm.calTool} onChange={(e) => setInspForm({ ...inspForm, calTool: e.target.value })}>
                  <option value="">{S.optPilihAlat}</option>
                  {validCals.map((c) => <option key={c.id} value={c.id}>{calLabel(c.id)} · due {fmtTanggal(String(c.due))}</option>)}
                </select>
              </Field>
            )}
          </FormGrid>
          <Field label={S.fTitik}><input className="input" value={inspForm.point} onChange={(e) => setInspForm({ ...inspForm, point: e.target.value })} placeholder={S.phWelding} /></Field>
        </div>
      </Modal>

      {/* Modal NCR */}
      <Modal open={showNcr} onClose={() => setShowNcr(false)} title={S.mNcrT} subtitle={S.mNcrS}
        wide footer={<><button className="btn-secondary" onClick={() => setShowNcr(false)}>{S.btnBatal}</button><button className="btn-primary" onClick={saveNcr}>{S.btnTerbitkan}</button></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label={S.thProyek}>
              <select className="input" value={ncrForm.project} onChange={(e) => setNcrForm({ ...ncrForm, project: e.target.value })}>
                <option value="">{S.optPilihProyek}</option>
                {data.projects.map((p) => <option key={p.id} value={p.id}>{p.id} - {p.vessel}</option>)}
              </select>
            </Field>
            <Field label={S.fCabang} hint={S.hintIkutGlobal.replace("{n}", branch)}>
              <select className="input" value={ncrForm.branch} onChange={(e) => setNcrForm({ ...ncrForm, branch: e.target.value })}>
                <option value="">{S.optIkutGlobal}</option>
                {branchCities.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label={S.fKapalOps}><input className="input" value={ncrForm.vessel} onChange={(e) => setNcrForm({ ...ncrForm, vessel: e.target.value })} placeholder={S.phOtomatis} /></Field>
            <Field label={S.fKategori}>
              <select className="input" value={ncrForm.type} onChange={(e) => setNcrForm({ ...ncrForm, type: e.target.value })}>
                {["Pengelasan", "Pengecatan", "Kelistrikan", "Mesin", "Umum"].map((t) => <option key={t}>{t}</option>)}
              </select>
            </Field>
            <Field label={S.fSeverity}>
              <select className="input" value={ncrForm.severity} onChange={(e) => setNcrForm({ ...ncrForm, severity: e.target.value })}>
                {["Minor", "Major", "Critical"].map((s) => <option key={s}>{s}</option>)}
              </select>
            </Field>
            <Field label={S.fTenggat}><input type="date" className="input" value={ncrForm.due} onChange={(e) => setNcrForm({ ...ncrForm, due: e.target.value })} /></Field>
            <Field label={S.fRootcat}>
              <select className="input" value={ncrForm.causeCat} onChange={(e) => setNcrForm({ ...ncrForm, causeCat: e.target.value })}>
                {ROOT_CAUSES.map((r) => <option key={r}>{r}</option>)}
              </select>
            </Field>
          </FormGrid>
          <Field label={S.fUraian}><textarea className="input" rows={3} value={ncrForm.issue} onChange={(e) => setNcrForm({ ...ncrForm, issue: e.target.value })} /></Field>
          <Field label={S.fUraianRoot}><textarea className="input" rows={2} value={ncrForm.causeNote} onChange={(e) => setNcrForm({ ...ncrForm, causeNote: e.target.value })} placeholder={S.phRootcause} /></Field>
        </div>
      </Modal>

      {/* Modal detail NCR */}
      <Modal open={ncrDetail !== null} onClose={() => setNcrDetail(null)} title={ncrDetail ? String(ncrDetail.id) : ""} subtitle={S.mNcrDetailS}
        footer={ncrDetail && ncrDetail.status !== "Tertutup" ? <button className="btn-primary" onClick={() => {
          const n = ncrDetail;
          if (!n.due) { toast(S.tCapaLengkapi, "info"); return; }
          const next = NCR_FLOW[NCR_FLOW.indexOf(n.status) + 1];
          if (next === "Tertutup") { setClosingNcr(n); setVerifier(""); setVerifyNote(""); return; }
          advanceNcr(n);
          setNcrDetail({ ...n, status: next });
        }}>{S.btnProsesNext}</button> : undefined}>
        {ncrDetail && (
          <div>
            <dl className="dl-div text-sm">
              {[[S.thProyek, ncrDetail.project], [S.dlKapal, ncrDetail.vessel], [S.fKategori, ncrDetail.type], [S.fSeverity, ncrDetail.severity], [S.dlDilaporkan, fmtTanggal(ncrDetail.raised)], [S.fTenggat, fmtTanggal(ncrDetail.due)], [S.dlRoot, ncrDetail.causeCat ? `${ncrDetail.causeCat}${ncrDetail.causeNote ? ` - ${ncrDetail.causeNote}` : ""}` : "-"], [S.dlUraian, ncrDetail.issue], ...(ncrDetail.verifiedBy ? [[S.dlVerif, `${ncrDetail.verifiedBy}${ncrDetail.verifyNote ? ` - ${ncrDetail.verifyNote}` : ""}`]] : []), ...(ncrDetail.closedAt ? [[S.dlDitutup, fmtTanggal(ncrDetail.closedAt)]] : []), ...(ncrDetail.reopenReason ? [[S.fAlasanReopen, ncrDetail.reopenReason]] : [])].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4"><dt className="shrink-0 text-steel-500">{k}</dt><dd className="text-right font-medium text-navy-900">{v}</dd></div>
              ))}
              <div className="flex justify-between gap-4"><dt className="text-steel-500">{S.dlStatus}</dt><dd><Badge tone={ncrTone[ncrDetail.status] ?? "gray"}>{ncrDetail.status}</Badge></dd></div>
            </dl>
            {ncrDetail.status !== "Tertutup" && (
              <div className="mt-3 flex gap-2">
                <input type="date" className="input flex-1" value={dueDraft} onChange={(e) => setDueDraft(e.target.value)} aria-label={S.ariaTenggat} />
                <button className="btn-secondary text-xs whitespace-nowrap" onClick={saveDue}>{S.btnSimpanTenggat}</button>
              </div>
            )}
            <div className="mt-3 border-t border-steel-100 pt-3">
              <p className="text-xs font-semibold text-steel-500">{S.reworkHead}</p>
              <div className="mt-2 grid grid-cols-3 gap-2">
                <Field label={S.fJam}><NumInput min={0} step={0.5} className="input" value={reworkDraft.hours} onChange={(e) => setReworkDraft({ ...reworkDraft, hours: e.target.value })} placeholder={S.phCth12} /></Field>
                <Field label={S.fRate}><NumInput min={0} className="input" value={reworkDraft.rate} onChange={(e) => setReworkDraft({ ...reworkDraft, rate: e.target.value })} placeholder={S.phCth75} /></Field>
                <Field label={S.fMaterial}><NumInput min={0} className="input" value={reworkDraft.material} onChange={(e) => setReworkDraft({ ...reworkDraft, material: e.target.value })} placeholder={S.phCth500} /></Field>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <p className="text-sm text-steel-600">{S.totalN.split("{n}")[0]}<span className="font-semibold text-navy-900">{fmtRupiah((Number(reworkDraft.hours) || 0) * (Number(reworkDraft.rate) || 0) + (Number(reworkDraft.material) || 0))}</span>{S.totalN.split("{n}")[1]}</p>
                <button className="btn-secondary text-xs" onClick={saveRework}>{S.btnSimpanRework}</button>
              </div>
            </div>
            <div className="mt-3 border-t border-steel-100 pt-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-steel-500">{S.followHead}</p>
                {needsFollowUp(ncrDetail) && <Badge tone="amber">{S.badgeFollowup}</Badge>}
              </div>
              {ncrDetail.followUpDate ? (
                <p className="mt-1 text-sm text-steel-600">{S.terverifikasiN.replace("{a}", fmtTanggal(String(ncrDetail.followUpDate))).replace("{b}", String(ncrDetail.followUpNote ?? ""))}</p>
              ) : (
                <p className="mt-1 text-xs text-steel-500">
                  {ncrDetail.status === "Tertutup"
                    ? S.tutupFollow.replace("{a}", fmtTanggal(String(ncrDetail.closedAt ?? "")))
                    : S.followInfo}
                </p>
              )}
              {needsFollowUp(ncrDetail) && (
                <button className="btn-primary mt-2 text-xs" onClick={() => { setFollowUpNcr(ncrDetail); setFollowUpForm({ date: todayISO(), note: "" }); }}>
                  {S.btnVerifLanjut}
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Modal detail inspeksi: sampling AQL + sertifikat inspector */}
      <Modal open={inspDetail !== null} onClose={() => setInspDetail(null)} title={inspDetail ? String(inspDetail.id) : ""} subtitle={S.mInspDetailS}>
        {inspDetail && (
          <div>
            <dl className="dl-div text-sm">
              {[[S.thProyek, inspDetail.project], [S.dlTitik, inspDetail.point], [S.thItp, inspDetail.itp], [S.thTanggal, fmtTanggal(inspDetail.date)], [S.thHold, inspDetail.holdType ?? "-"], [S.thNde, inspDetail.nde === "Ya" ? `Ya · ${inspDetail.ndeMethod ?? "-"} · ${inspDetail.calTool ? calLabel(String(inspDetail.calTool)) : "tanpa alat"}` : "Tidak"], [S.dlSampling, inspDetail.sampleSize ? `n=${inspDetail.sampleSize} · temuan ${inspDetail.defectsFound ?? 0} / batas ${inspDetail.defectsAllowed ?? 0} · ${(Number(inspDetail.defectsFound ?? 0) <= Number(inspDetail.defectsAllowed ?? 0)) ? "Lulus AQL" : "Gagal AQL"}` : "-"], [S.thInspector, inspDetail.inspector ?? "-"]].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4"><dt className="shrink-0 text-steel-500">{k}</dt><dd className="text-right font-medium text-navy-900">{v}</dd></div>
              ))}
              <div className="flex justify-between gap-4"><dt className="text-steel-500">{S.thHasil}</dt><dd><StatusBadge status={inspDetail.status} /></dd></div>
            </dl>
            <div className="mt-3 border-t border-steel-100 pt-3">
              <p className="text-xs font-semibold text-steel-500">{S.certInspHead}</p>
              {(() => {
                const certs = certsOfInspector(String(inspDetail.inspector ?? ""));
                if (certs.length === 0) return <p className="mt-1 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">{S.warnInspCert}</p>;
                return (
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {certs.map((c) => <Badge key={c} tone="teal">{c}</Badge>)}
                  </div>
                );
              })()}
            </div>
          </div>
        )}
      </Modal>

      {/* Modal verifikasi lanjutan CAPA H+30 */}
      <Modal open={followUpNcr !== null} onClose={() => setFollowUpNcr(null)} title={followUpNcr ? S.mFollowT.replace("{n}", String(followUpNcr.id)) : ""} subtitle={S.mFollowS}
        footer={<><button className="btn-secondary" onClick={() => setFollowUpNcr(null)}>{S.btnBatal}</button><button className="btn-primary" onClick={confirmFollowUp}>{S.btnSimpanVerif}</button></>}>
        <div className="space-y-3">
          <Field label={S.fTglVerif}><input type="date" className="input" value={followUpForm.date} onChange={(e) => setFollowUpForm({ ...followUpForm, date: e.target.value })} /></Field>
          <Field label={S.fCatVerif}><textarea className="input" rows={3} value={followUpForm.note} onChange={(e) => setFollowUpForm({ ...followUpForm, note: e.target.value })} placeholder={S.phFollow} /></Field>
        </div>
      </Modal>

      {/* Modal tutup NCR */}
      <Modal open={closingNcr !== null} onClose={() => setClosingNcr(null)} title={closingNcr ? S.mCloseT.replace("{n}", String(closingNcr.id)) : ""} subtitle={closingNcr?.severity === "Critical" ? S.mCloseCrit : S.mCloseS}
        footer={<><button className="btn-secondary" onClick={() => setClosingNcr(null)}>{S.btnBatal}</button><button className="btn-primary" onClick={confirmClose}>{S.btnTutupNcr}</button></>}>
        <div className="space-y-3">
          {closingNcr?.severity === "Critical" && (
            <Field label={S.fVerifikator}><input className="input" value={verifier} onChange={(e) => setVerifier(e.target.value)} placeholder={S.phVerifikator} /></Field>
          )}
          <Field label={S.fCatVerif}><textarea className="input" rows={3} value={verifyNote} onChange={(e) => setVerifyNote(e.target.value)} placeholder={S.phVerifyNote} /></Field>
        </div>
      </Modal>

      {/* Modal buka kembali NCR */}
      <Modal open={reopenNcr !== null} onClose={() => setReopenNcr(null)} title={reopenNcr ? S.mReopenT.replace("{n}", String(reopenNcr.id)) : ""} subtitle={S.mReopenS}
        footer={<><button className="btn-secondary" onClick={() => setReopenNcr(null)}>{S.btnBatal}</button><button className="btn-primary" onClick={confirmReopen}>{S.btnBukaKembali}</button></>}>
        <Field label={S.fAlasanReopen}><textarea className="input" rows={3} value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} placeholder={S.phReopen} /></Field>
      </Modal>

      {/* Modal insiden */}
      <Modal open={showInc} onClose={() => setShowInc(false)} title={S.mIncT}
        footer={<><button className="btn-secondary" onClick={() => setShowInc(false)}>{S.btnBatal}</button><button className="btn-primary" onClick={async () => {
          try {
          if (!incForm.desc.trim() || !incForm.location.trim()) { toast(S.tLokasiWajib, "info"); return; }
          if (!incForm.project) { toast(S.tProyekTerkait, "info"); return; }
          const created = await add("incidents", { type: incForm.type, date: todayISO(), location: incForm.location.trim(), desc: incForm.desc.trim(), severity: incForm.severity, project: incForm.project, projectId: incForm.project, branch: branchOf(incForm.branch) },
            { action: "mencatat insiden", module: "Safety" });
          toast(S.tIncOk.replace("{n}", created.id)); setShowInc(false); setIncForm({ type: "Near Miss", location: "", desc: "", severity: "Rendah", project: "", branch: "" });
          } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
        }}>{S.btnSimpan}</button></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label={S.fProyekTerkait} hint={S.hintIncProyek}>
              <select className="input" value={incForm.project} onChange={(e) => setIncForm({ ...incForm, project: e.target.value })}>
                <option value="">{S.optPilihProyek}</option>
                {data.projects.map((p) => <option key={p.id} value={p.id}>{p.id} - {p.vessel}</option>)}
              </select>
            </Field>
            <Field label={S.fCabang} hint={S.hintIkutGlobal.replace("{n}", branch)}>
              <select className="input" value={incForm.branch} onChange={(e) => setIncForm({ ...incForm, branch: e.target.value })}>
                <option value="">{S.optIkutGlobal}</option>
                {branchCities.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label={S.fJenis}>
              <select className="input" value={incForm.type} onChange={(e) => setIncForm({ ...incForm, type: e.target.value })}>
                {["Near Miss", "First Aid", "Lost Time", "Kebakaran", "Lainnya"].map((t) => <option key={t}>{t}</option>)}
              </select>
            </Field>
            <Field label={S.fSeverity}>
              <select className="input" value={incForm.severity} onChange={(e) => setIncForm({ ...incForm, severity: e.target.value })}>
                {["Rendah", "Sedang", "Tinggi", "Kritis"].map((s) => <option key={s}>{s}</option>)}
              </select>
            </Field>
          </FormGrid>
          <Field label={S.fLokasi}><input className="input" value={incForm.location} onChange={(e) => setIncForm({ ...incForm, location: e.target.value })} placeholder={S.phLokasi} /></Field>
          <Field label={S.fUraianKejadian}><textarea className="input" rows={3} value={incForm.desc} onChange={(e) => setIncForm({ ...incForm, desc: e.target.value })} /></Field>
        </div>
      </Modal>

      {/* Modal register drawing */}
      <Modal open={showDrw} onClose={() => setShowDrw(false)} title={S.mDrwT} subtitle={S.mDrwS}
        footer={<><button className="btn-secondary" onClick={() => setShowDrw(false)}>{S.btnBatal}</button><button className="btn-primary" onClick={saveDrawing}>{S.btnDaftarkan}</button></>}>
        <div className="space-y-3">
          <Field label={S.thProyek}>
            <select className="input" value={drwForm.project} onChange={(e) => setDrwForm({ ...drwForm, project: e.target.value })}>
              <option value="">{S.optPilihProyek}</option>
              {data.projects.map((p) => <option key={p.id} value={p.id}>{p.id} · {p.vessel}</option>)}
            </select>
          </Field>
          <Field label={S.fJudulDrw}><input className="input" value={drwForm.title} onChange={(e) => setDrwForm({ ...drwForm, title: e.target.value })} placeholder={S.phJudulDrw} /></Field>
          <Field label={S.fHolder}><input className="input" value={drwForm.holder} onChange={(e) => setDrwForm({ ...drwForm, holder: e.target.value })} placeholder={S.phHolder} /></Field>
          <Field label={S.fCabang} hint={S.hintIkutGlobal.replace("{n}", branch)}>
            <select className="input" value={drwForm.branch} onChange={(e) => setDrwForm({ ...drwForm, branch: e.target.value })}>
              <option value="">{S.optIkutGlobal}</option>
              {branchCities.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
        </div>
      </Modal>

      {/* Modal transmittal */}
      <Modal open={showTransmit} onClose={() => setShowTransmit(false)} title={S.mTrT} subtitle={S.mTrS}
        wide footer={<><button className="btn-secondary" onClick={() => setShowTransmit(false)}>{S.btnBatal}</button><button className="btn-primary" onClick={saveTransmittal}><Send className="h-4 w-4" /> {S.btnKirimEkspor}</button></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label={S.fKepada}><input className="input" value={transmitForm.to} onChange={(e) => setTransmitForm({ ...transmitForm, to: e.target.value })} placeholder={S.phKepada} /></Field>
            <Field label={S.thTanggal}><input type="date" className="input" value={transmitForm.date} onChange={(e) => setTransmitForm({ ...transmitForm, date: e.target.value })} /></Field>
          </FormGrid>
          <div>
            <p className="label">{S.lblDaftar.replace("{n}", String(transmitForm.ids.length))}</p>
            <div className="mt-1 max-h-56 space-y-1 overflow-y-auto">
              {drawings.map((d) => (
                <label key={d.id} className="flex items-center gap-2 rounded-lg border border-steel-100 px-3 py-2 text-sm text-steel-700">
                  <input type="checkbox" checked={transmitForm.ids.includes(d.id)} onChange={() => toggleTransmitId(d.id)} />
                  <span className="font-mono text-xs text-navy-900">{d.id}</span>
                  <span className="truncate">{d.title} · Rev {d.revision}</span>
                </label>
              ))}
              {drawings.length === 0 && <p className="text-xs text-steel-400">{S.emptyTransmit}</p>}
            </div>
          </div>
        </div>
      </Modal>

      {/* Modal JSA */}
      <Modal open={showJsa} onClose={() => setShowJsa(false)} title={S.mJsaT} subtitle={S.mJsaS}
        wide footer={<><button className="btn-secondary" onClick={() => setShowJsa(false)}>{S.btnBatal}</button><button className="btn-primary" onClick={saveJsa}>{S.btnSimpanJsa}</button></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label={S.thProyek}>
              <select className="input" value={jsaForm.project} onChange={(e) => setJsaForm({ ...jsaForm, project: e.target.value })}>
                <option value="">{S.optPilihProyek}</option>
                {data.projects.map((p) => <option key={p.id} value={p.id}>{p.id} - {p.vessel}</option>)}
              </select>
            </Field>
            <Field label={S.fCabang} hint={S.hintIkutGlobal.replace("{n}", branch)}>
              <select className="input" value={jsaForm.branch} onChange={(e) => setJsaForm({ ...jsaForm, branch: e.target.value })}>
                <option value="">{S.optIkutGlobal}</option>
                {branchCities.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label={S.thTanggal}><input type="date" className="input" value={jsaForm.date} onChange={(e) => setJsaForm({ ...jsaForm, date: e.target.value })} /></Field>
            <Field label={S.fPic}><input className="input" value={jsaForm.pic} onChange={(e) => setJsaForm({ ...jsaForm, pic: e.target.value })} placeholder={S.phPic} /></Field>
            <Field label={S.fPekerjaan}><input className="input" value={jsaForm.job} onChange={(e) => setJsaForm({ ...jsaForm, job: e.target.value })} placeholder={S.phPekerjaan} /></Field>
          </FormGrid>
          <Field label={S.fBahaya}><textarea className="input" rows={2} value={jsaForm.hazard} onChange={(e) => setJsaForm({ ...jsaForm, hazard: e.target.value })} /></Field>
          <Field label={S.fKendali}><textarea className="input" rows={2} value={jsaForm.control} onChange={(e) => setJsaForm({ ...jsaForm, control: e.target.value })} /></Field>
        </div>
      </Modal>

      {/* Modal toolbox */}
      <Modal open={showTbm} onClose={() => setShowTbm(false)} title={S.mTbmT}
        footer={<><button className="btn-secondary" onClick={() => setShowTbm(false)}>{S.btnBatal}</button><button className="btn-primary" onClick={saveToolbox}>{S.btnSimpan}</button></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label={S.thProyek}>
              <select className="input" value={tbmForm.project} onChange={(e) => setTbmForm({ ...tbmForm, project: e.target.value })}>
                <option value="">{S.optPilihProyek}</option>
                {data.projects.map((p) => <option key={p.id} value={p.id}>{p.id} - {p.vessel}</option>)}
              </select>
            </Field>
            <Field label={S.fCabang} hint={S.hintIkutGlobal.replace("{n}", branch)}>
              <select className="input" value={tbmForm.branch} onChange={(e) => setTbmForm({ ...tbmForm, branch: e.target.value })}>
                <option value="">{S.optIkutGlobal}</option>
                {branchCities.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label={S.thTanggal}><input type="date" className="input" value={tbmForm.date} onChange={(e) => setTbmForm({ ...tbmForm, date: e.target.value })} /></Field>
            <Field label={S.fJmlPeserta}><NumInput min={0} className="input" value={tbmForm.attendees} onChange={(e) => setTbmForm({ ...tbmForm, attendees: e.target.value })} /></Field>
            <Field label={S.fPic}><input className="input" value={tbmForm.pic} onChange={(e) => setTbmForm({ ...tbmForm, pic: e.target.value })} /></Field>
          </FormGrid>
          <Field label={S.fTopik}><input className="input" value={tbmForm.topic} onChange={(e) => setTbmForm({ ...tbmForm, topic: e.target.value })} placeholder={S.phTopik} /></Field>
        </div>
      </Modal>

      {/* Modal safety walk */}
      <Modal open={showWalk} onClose={() => setShowWalk(false)} title={S.mWalkT}
        footer={<><button className="btn-secondary" onClick={() => setShowWalk(false)}>{S.btnBatal}</button><button className="btn-primary" onClick={saveWalk}>{S.btnSimpan}</button></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label={S.thTanggal}><input type="date" className="input" value={walkForm.date} onChange={(e) => setWalkForm({ ...walkForm, date: e.target.value })} /></Field>
            <Field label={S.fPic}><input className="input" value={walkForm.pic} onChange={(e) => setWalkForm({ ...walkForm, pic: e.target.value })} /></Field>
            <Field label={S.fArea}><input className="input" value={walkForm.area} onChange={(e) => setWalkForm({ ...walkForm, area: e.target.value })} placeholder={S.phArea} /></Field>
            <Field label={S.fJmlTemuan}><NumInput min={0} className="input" value={walkForm.findings} onChange={(e) => setWalkForm({ ...walkForm, findings: e.target.value })} /></Field>
          </FormGrid>
        </div>
      </Modal>

      {/* Modal jadwal audit internal */}
      <Modal open={showAuditPlan} onClose={() => setShowAuditPlan(false)} title={S.mPlanT} subtitle={S.mPlanS}
        footer={<><button className="btn-secondary" onClick={() => setShowAuditPlan(false)}>{S.btnBatal}</button><button className="btn-primary" onClick={saveAuditPlan}>{S.btnSimpanJadwal}</button></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label={S.thTanggal}><input type="date" className="input" value={auditForm.date} onChange={(e) => setAuditForm({ ...auditForm, date: e.target.value })} /></Field>
            <Field label={S.fArea}><input className="input" value={auditForm.area} onChange={(e) => setAuditForm({ ...auditForm, area: e.target.value })} placeholder={S.phArea2} /></Field>
            <Field label={S.fAuditor}><input className="input" value={auditForm.auditor} onChange={(e) => setAuditForm({ ...auditForm, auditor: e.target.value })} placeholder={S.phAuditor} /></Field>
            <Field label={S.fJmlTemuan}><NumInput min={0} className="input" value={auditForm.findings} onChange={(e) => setAuditForm({ ...auditForm, findings: e.target.value })} /></Field>
          </FormGrid>
          <Field label={S.fLinkNcr}>
            <select className="input" value={auditForm.ncrId} onChange={(e) => setAuditForm({ ...auditForm, ncrId: e.target.value })}>
              <option value="">{S.optTanpaNcr}</option>
              {ncrList.map((n) => <option key={n.id} value={n.id}>{n.id} · {n.status}</option>)}
            </select>
          </Field>
        </div>
      </Modal>
    </div>
  );
}
