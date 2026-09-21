import { useState } from "react";
import { Plus, ShieldCheck, AlertTriangle, Siren, Award, Send } from "lucide-react";
import { ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Card, CardHeader, PageHeader, Badge, KpiCard, Tabs, StatusBadge, Donut, ChartTooltip, Modal, Field, FormGrid, toast } from "../../components/ui";
import { useStore, type StoreItem } from "../../data/store";
import { inspectionTrend, ncrTrend, incidentTrend, hseTrend } from "../../data";
import { fmtRupiah, fmtTanggal, todayISO } from "../../utils/format";
import { exportExcel } from "../../utils/export";

const CERT_WINDOW = 90;

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

interface JsaItem {
  id: string;
  project: string;
  job: string;
  hazard: string;
  control: string;
  pic: string;
  date: string;
}

interface WalkItem {
  id: string;
  date: string;
  area: string;
  findings: number;
  pic: string;
}

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
  const { data, add, update, log } = useStore();
  const ncrList = data.ncr;
  const incidents = data.incidents;
  const inspections = data.inspections;
  const vessels = data.vessels;
  const drawings = data.drawings;
  const toolboxTalks = data.toolbox;
  const qualityStaff = data.employees.filter((e) => e.dept === "Quality");
  const [tab, setTab] = useState("Inspeksi (ITP)");

  const [showInsp, setShowInsp] = useState(false);
  const [inspForm, setInspForm] = useState({ project: "", point: "", status: "Terjadwal", date: todayISO(), holdType: "Witness", nde: "Tidak", ndeMethod: "UT", inspector: "", sampleSize: "", defectsAllowed: "0", defectsFound: "0", calTool: "" });
  const [inspDetail, setInspDetail] = useState<StoreItem | null>(null);
  const [ncrDetail, setNcrDetail] = useState<StoreItem | null>(null);
  const [dueDraft, setDueDraft] = useState("");
  const [showNcr, setShowNcr] = useState(false);
  const [ncrForm, setNcrForm] = useState({ project: "", vessel: "", type: "Pengelasan", severity: "Minor", issue: "", due: "", causeCat: "Manusia", causeNote: "" });
  const [closingNcr, setClosingNcr] = useState<StoreItem | null>(null);
  const [verifier, setVerifier] = useState("");
  const [verifyNote, setVerifyNote] = useState("");
  const [reopenNcr, setReopenNcr] = useState<StoreItem | null>(null);
  const [reopenReason, setReopenReason] = useState("");
  const [showInc, setShowInc] = useState(false);
  const [incForm, setIncForm] = useState({ type: "Near Miss", location: "", desc: "", severity: "Rendah" });

  // Drawing
  const [showDrw, setShowDrw] = useState(false);
  const [drwForm, setDrwForm] = useState({ project: "", title: "", holder: "" });
  const [expandedDrw, setExpandedDrw] = useState<string | null>(null);
  const [showTransmit, setShowTransmit] = useState(false);
  const [transmitForm, setTransmitForm] = useState({ to: "", date: todayISO(), ids: [] as string[] });

  // HSE Operasional (JSA, PPE, safety walk lokal; toolbox memakai koleksi store)
  const [jsaList, setJsaList] = useState<JsaItem[]>([]);
  const [showJsa, setShowJsa] = useState(false);
  const [jsaForm, setJsaForm] = useState({ project: "", job: "", hazard: "", control: "", pic: "", date: todayISO() });
  const [showTbm, setShowTbm] = useState(false);
  const [tbmForm, setTbmForm] = useState({ project: "", topic: "", date: todayISO(), attendees: "", pic: "" });
  const [ppeForm, setPpeForm] = useState({ project: "", date: todayISO() });
  const [ppeChecked, setPpeChecked] = useState<Record<string, boolean>>({});
  const [walks, setWalks] = useState<WalkItem[]>([]);
  const [showWalk, setShowWalk] = useState(false);
  const [walkForm, setWalkForm] = useState({ date: todayISO(), area: "", findings: "0", pic: "" });
  const [auditChecked, setAuditChecked] = useState<boolean[]>(() => AUDIT_ITEMS.map(() => false));

  // Audit internal (terpisah dari checklist Audit HSE di atas)
  interface AuditPlan { id: string; date: string; area: string; auditor: string; findings: number; ncrId: string }
  const [auditPlans, setAuditPlans] = useState<AuditPlan[]>([]);
  const [showAuditPlan, setShowAuditPlan] = useState(false);
  const [auditForm, setAuditForm] = useState({ date: todayISO(), area: "", auditor: "", findings: "0", ncrId: "" });

  // Verifikasi lanjutan CAPA H+30
  const [followUpNcr, setFollowUpNcr] = useState<StoreItem | null>(null);
  const [followUpForm, setFollowUpForm] = useState({ date: todayISO(), note: "" });

  // Biaya rework per NCR (draft per detail)
  const [reworkDraft, setReworkDraft] = useState({ hours: "", rate: "", material: "" });

  const openNcr = ncrList.filter((n) => n.status !== "Tertutup").length;
  const criticalOpen = ncrList.filter((n) => n.severity === "Critical" && n.status !== "Tertutup").length;

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
    const emp = data.employees.find((e) => e.name === name);
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
    if (left < 0) return <Badge tone="red">Terlambat {String(Math.abs(left))} hari</Badge>;
    if (left === 0) return <Badge tone="amber">Jatuh tempo hari ini</Badge>;
    return <Badge tone="blue">Sisa {String(left)} hari</Badge>;
  };

  const saveInspection = () => {
    if (!inspForm.project || !inspForm.point.trim()) { toast("Proyek & titik inspeksi wajib diisi", "info"); return; }
    if (!inspForm.date) { toast("Tanggal inspeksi wajib diisi", "info"); return; }
    if (!inspForm.inspector) { toast("Pilih inspector berkualifikasi (dept Quality)", "info"); return; }
    const sample = Number(inspForm.sampleSize);
    const allowed = Number(inspForm.defectsAllowed);
    const found = Number(inspForm.defectsFound);
    if (!Number.isFinite(sample) || sample <= 0) { toast("Ukuran sampel (AQL) wajib lebih dari 0", "info"); return; }
    if (!Number.isFinite(allowed) || allowed < 0 || !Number.isFinite(found) || found < 0) { toast("Defects allowed & temuan harus 0 atau lebih", "info"); return; }
    if (inspForm.nde === "Ya") {
      if (!inspForm.calTool) { toast("NDE=Ya wajib memilih alat ukur terkalibrasi", "info"); return; }
      if (!validCals.some((c) => c.id === inspForm.calTool)) { toast("Alat ukur tidak valid (harus Selesai & due belum lewat)", "info"); return; }
    }
    if (inspForm.status === "Lulus" && found > allowed) { toast(`Hasil tidak bisa Lulus: temuan ${found} melebihi batas ${allowed}`, "info"); return; }
    const itp = nextItp(inspections);
    const created = add("inspections", {
      project: inspForm.project, point: inspForm.point.trim(), itp,
      status: inspForm.status, date: inspForm.date,
      holdType: inspForm.holdType, nde: inspForm.nde,
      ndeMethod: inspForm.nde === "Ya" ? inspForm.ndeMethod : "-",
      calTool: inspForm.nde === "Ya" ? inspForm.calTool : "",
      inspector: inspForm.inspector,
      sampleSize: sample, defectsAllowed: allowed, defectsFound: found,
    }, { action: "mencatat inspeksi", module: "QC" });
    if (inspForm.status === "NCR") {
      const proj = data.projects.find((p) => p.id === inspForm.project);
      add("ncr", {
        project: inspForm.project, vessel: proj?.vessel ?? "-", type: "Umum",
        status: "Terbuka", severity: "Major", raised: inspForm.date, due: addDaysISO(inspForm.date, 14),
        causeCat: "Metode", causeNote: `Temuan inspeksi ${created.id}`,
        issue: `Temuan dari ${created.id}: ${inspForm.point.trim()}`,
      }, { action: "menerbitkan NCR", module: "QC" });
      toast(`Inspeksi ${created.id} + NCR diterbitkan otomatis`);
    } else {
      toast(`Inspeksi ${created.id} dijadwalkan`);
    }
    setShowInsp(false);
    setInspForm({ project: "", point: "", status: "Terjadwal", date: todayISO(), holdType: "Witness", nde: "Tidak", ndeMethod: "UT", inspector: "", sampleSize: "", defectsAllowed: "0", defectsFound: "0", calTool: "" });
  };

  const saveNcr = () => {
    if (!ncrForm.project || !ncrForm.issue.trim()) { toast("Proyek & uraian wajib diisi", "info"); return; }
    if (!ncrForm.due) { toast("Tenggat CAPA wajib diisi", "info"); return; }
    const proj = data.projects.find((p) => p.id === ncrForm.project);
    const created = add("ncr", {
      project: ncrForm.project, vessel: ncrForm.vessel || proj?.vessel || "-", type: ncrForm.type,
      status: "Terbuka", severity: ncrForm.severity, raised: todayISO(), due: ncrForm.due,
      causeCat: ncrForm.causeCat, causeNote: ncrForm.causeNote.trim(),
      issue: ncrForm.issue.trim(),
    }, { action: "menerbitkan NCR", module: "QC" });
    toast(`NCR ${created.id} diterbitkan`);
    setShowNcr(false);
    setNcrForm({ project: "", vessel: "", type: "Pengelasan", severity: "Minor", issue: "", due: "", causeCat: "Manusia", causeNote: "" });
  };

  const advanceNcr = (n: StoreItem) => {
    const idx = NCR_FLOW.indexOf(n.status);
    if (idx < 0 || idx >= NCR_FLOW.length - 1) return;
    const next = NCR_FLOW[idx + 1];
    if (!n.due) { toast("Lengkapi tenggat CAPA sebelum memproses NCR", "info"); return; }
    if (next === "Tertutup") {
      setClosingNcr(n);
      setVerifier("");
      setVerifyNote("");
      return;
    }
    update("ncr", n.id, { status: next });
    log(`memproses NCR ke ${next}`, n.id, "QC");
    toast(`${n.id} → ${next}`);
  };

  const confirmClose = () => {
    if (!closingNcr) return;
    if (closingNcr.severity === "Critical" && !verifier.trim()) {
      toast("NCR Critical wajib diverifikasi pihak kedua: isi nama verifikator", "info");
      return;
    }
    update("ncr", closingNcr.id, {
      status: "Tertutup",
      verifiedBy: verifier.trim(),
      verifyNote: verifyNote.trim(),
      closedAt: todayISO(),
    });
    log("menutup NCR", closingNcr.id, "QC");
    toast(`${closingNcr.id} ditutup`);
    setClosingNcr(null);
    setNcrDetail((d) => (d && d.id === closingNcr.id ? { ...d, status: "Tertutup" } : d));
  };

  const confirmReopen = () => {
    if (!reopenNcr) return;
    if (!reopenReason.trim()) { toast("Alasan pembukaan kembali wajib diisi", "info"); return; }
    update("ncr", reopenNcr.id, { status: "Terbuka", reopenReason: reopenReason.trim() });
    log("membuka kembali NCR", reopenNcr.id, "QC");
    toast(`${reopenNcr.id} dibuka kembali`);
    setReopenNcr(null);
    setReopenReason("");
    setNcrDetail((d) => (d && d.id === reopenNcr.id ? { ...d, status: "Terbuka" } : d));
  };

  const openDetail = (n: StoreItem) => {
    setNcrDetail(n);
    setDueDraft(String(n.due ?? ""));
    setReworkDraft({ hours: String(n.reworkHours ?? ""), rate: String(n.reworkRate ?? ""), material: String(n.reworkMaterial ?? "") });
  };

  const saveRework = () => {
    if (!ncrDetail) return;
    const hours = Number(reworkDraft.hours || 0);
    const rate = Number(reworkDraft.rate || 0);
    const material = Number(reworkDraft.material || 0);
    if (hours < 0 || rate < 0 || material < 0 || [hours, rate, material].some((v) => !Number.isFinite(v))) {
      toast("Jam, rate & material harus angka 0 atau lebih", "info");
      return;
    }
    update("ncr", ncrDetail.id, { reworkHours: hours, reworkRate: rate, reworkMaterial: material });
    log("mencatat biaya rework", `${ncrDetail.id} · ${hours} jam × ${fmtRupiah(rate)} + material ${fmtRupiah(material)}`, "QC");
    setNcrDetail({ ...ncrDetail, reworkHours: hours, reworkRate: rate, reworkMaterial: material });
    toast(`Biaya rework ${ncrDetail.id} disimpan`);
  };

  const confirmFollowUp = () => {
    if (!followUpNcr) return;
    if (!followUpForm.date) { toast("Tanggal verifikasi lanjutan wajib diisi", "info"); return; }
    if (!followUpForm.note.trim()) { toast("Catatan verifikasi lanjutan wajib diisi", "info"); return; }
    update("ncr", followUpNcr.id, { followUpDate: followUpForm.date, followUpNote: followUpForm.note.trim() });
    log("melakukan verifikasi lanjutan", `${followUpNcr.id} · ${fmtTanggal(followUpForm.date)} — ${followUpForm.note.trim()}`, "QC");
    toast(`Verifikasi lanjutan ${followUpNcr.id} dicatat`);
    setNcrDetail((d) => (d && d.id === followUpNcr.id ? { ...d, followUpDate: followUpForm.date, followUpNote: followUpForm.note.trim() } : d));
    setFollowUpNcr(null);
    setFollowUpForm({ date: todayISO(), note: "" });
  };

  const exportNcr = () => {
    void exportExcel(
      [["NCR", "Proyek", "Severity", "Status", "Tenggat", "Ditutup", "Jam Rework", "Rate (Rp/jam)", "Material (Rp)", "Biaya Rework (Rp)", "Verifikasi Lanjutan"],
        ...ncrList.map((n) => [n.id, n.project, n.severity, n.status, fmtTanggal(String(n.due ?? "")), fmtTanggal(String(n.closedAt ?? "")), Number(n.reworkHours || 0), Number(n.reworkRate || 0), Number(n.reworkMaterial || 0), reworkCost(n), n.followUpDate ? `${fmtTanggal(String(n.followUpDate))} — ${n.followUpNote ?? ""}` : "—"])],
      `NCR-Rework-${today}`,
      "NCR",
    );
    toast("NCR & biaya rework diekspor");
  };

  const saveAuditPlan = () => {
    if (!auditForm.date || !auditForm.area.trim() || !auditForm.auditor.trim()) { toast("Tanggal, area & auditor wajib diisi", "info"); return; }
    const findings = Math.max(0, Math.floor(Number(auditForm.findings) || 0));
    const item: AuditPlan = {
      id: `AUD-${Date.now().toString(36).toUpperCase()}`,
      date: auditForm.date, area: auditForm.area.trim(), auditor: auditForm.auditor.trim(),
      findings, ncrId: auditForm.ncrId,
    };
    setAuditPlans((prev) => [item, ...prev]);
    log("menjadwalkan audit internal", `${item.area} · ${fmtTanggal(item.date)} · auditor ${item.auditor}`, "QC");
    toast(`Audit internal ${item.id} dijadwalkan`);
    setShowAuditPlan(false);
    setAuditForm({ date: todayISO(), area: "", auditor: "", findings: "0", ncrId: "" });
  };

  const saveDue = () => {
    if (!ncrDetail) return;
    if (!dueDraft) { toast("Tenggat CAPA wajib diisi", "info"); return; }
    update("ncr", ncrDetail.id, { due: dueDraft });
    log("memperbarui tenggat CAPA", ncrDetail.id, "QC");
    setNcrDetail({ ...ncrDetail, due: dueDraft });
    toast("Tenggat CAPA diperbarui");
  };

  const saveDrawing = () => {
    if (!drwForm.project || !drwForm.title.trim() || !drwForm.holder.trim()) { toast("Proyek, judul & holder wajib diisi", "info"); return; }
    const created = add("drawings", {
      project: drwForm.project, title: drwForm.title.trim(), revision: "A",
      status: "Diajukan", updated: todayISO(), holder: drwForm.holder.trim(),
      history: [{ revision: "A", date: todayISO(), holder: drwForm.holder.trim(), status: "Diajukan" }],
    }, { action: "meregistrasi drawing", module: "QC" });
    toast(`Drawing ${created.id} rev A didaftarkan`);
    setShowDrw(false);
    setDrwForm({ project: "", title: "", holder: "" });
  };

  const reviseDrawing = (d: StoreItem) => {
    const rev = nextRev(String(d.revision ?? "A"));
    const history = [...(Array.isArray(d.history) ? d.history : []), { revision: rev, date: todayISO(), holder: String(d.holder ?? ""), status: String(d.status ?? "Diajukan") }];
    update("drawings", d.id, { revision: rev, updated: todayISO(), history });
    log("merevisi drawing", `${d.id} → rev ${rev}`, "QC");
    toast(`${d.id} naik ke rev ${rev}`);
  };

  const stepDrawing = (d: StoreItem, next: string) => {
    const history = [...(Array.isArray(d.history) ? d.history : []), { revision: String(d.revision ?? ""), date: todayISO(), holder: String(d.holder ?? ""), status: next }];
    update("drawings", d.id, { status: next, updated: todayISO(), history });
    log("memproses drawing", `${d.id} → ${next}`, "QC");
    toast(`${d.id} → ${next}`);
  };

  const toggleTransmitId = (id: string) => {
    setTransmitForm((f) => ({ ...f, ids: f.ids.includes(id) ? f.ids.filter((x) => x !== id) : [...f.ids, id] }));
  };

  const saveTransmittal = () => {
    if (!transmitForm.to.trim()) { toast("Penerima transmittal wajib diisi", "info"); return; }
    if (!transmitForm.date) { toast("Tanggal transmittal wajib diisi", "info"); return; }
    if (transmitForm.ids.length === 0) { toast("Pilih minimal satu drawing", "info"); return; }
    const rows = transmitForm.ids.map((id) => drawings.find((d) => d.id === id)).filter((d): d is StoreItem => !!d);
    void exportExcel(
      [["ID", "Proyek", "Judul", "Revisi", "Status", "Holder", "Diperbarui"],
        ...rows.map((d) => [d.id, d.project, d.title, d.revision, d.status, d.holder, fmtTanggal(String(d.updated))])],
      `Transmittal-${transmitForm.date}`,
      "Transmittal",
    );
    log("mengirim transmittal drawing", `${rows.length} drawing → ${transmitForm.to.trim()} · ${fmtTanggal(transmitForm.date)}`, "QC");
    toast(`Transmittal ${rows.length} drawing dikirim & diekspor`);
    setShowTransmit(false);
    setTransmitForm({ to: "", date: todayISO(), ids: [] });
  };

  const saveJsa = () => {
    if (!jsaForm.project || !jsaForm.job.trim() || !jsaForm.hazard.trim() || !jsaForm.control.trim() || !jsaForm.pic.trim() || !jsaForm.date) {
      toast("Proyek, pekerjaan, bahaya, kontrol, PIC & tanggal wajib diisi", "info");
      return;
    }
    const item: JsaItem = {
      id: `JSA-${Date.now().toString(36).toUpperCase()}`,
      project: jsaForm.project, job: jsaForm.job.trim(), hazard: jsaForm.hazard.trim(),
      control: jsaForm.control.trim(), pic: jsaForm.pic.trim(), date: jsaForm.date,
    };
    setJsaList((prev) => [item, ...prev]);
    log("menyusun JSA", `${item.job} · ${item.project}`, "Safety");
    toast(`JSA ${item.id} disimpan`);
    setShowJsa(false);
    setJsaForm({ project: "", job: "", hazard: "", control: "", pic: "", date: todayISO() });
  };

  const saveToolbox = () => {
    if (!tbmForm.project || !tbmForm.topic.trim() || !tbmForm.date || !tbmForm.pic.trim()) { toast("Proyek, topik, tanggal & PIC wajib diisi", "info"); return; }
    const created = add("toolbox", {
      project: tbmForm.project, topic: tbmForm.topic.trim(), date: tbmForm.date,
      attendees: Number(tbmForm.attendees) || 0, pic: tbmForm.pic.trim(),
    }, { action: "mencatat toolbox talk", module: "Safety" });
    toast(`Toolbox ${created.id} dicatat`);
    setShowTbm(false);
    setTbmForm({ project: "", topic: "", date: todayISO(), attendees: "", pic: "" });
  };

  const savePpeCheck = () => {
    if (!ppeForm.project || !ppeForm.date) { toast("Proyek & tanggal PPE check wajib diisi", "info"); return; }
    const done = PPE_ITEMS.filter((item) => ppeChecked[item]);
    if (done.length < PPE_ITEMS.length) { toast(`Belum lengkap: ${done.length}/${PPE_ITEMS.length} item tercentang`, "info"); return; }
    const created = add("toolbox", {
      project: ppeForm.project, topic: `PPE Check — ${PPE_ITEMS.length} item lengkap`, date: ppeForm.date,
      attendees: 0, pic: "HSE",
    }, { action: "mencatat PPE check", module: "Safety" });
    toast(`PPE check tersimpan sebagai ${created.id}`);
    setPpeForm({ project: "", date: todayISO() });
    setPpeChecked({});
  };

  const saveWalk = () => {
    if (!walkForm.date || !walkForm.area.trim() || !walkForm.pic.trim()) { toast("Tanggal, area & PIC wajib diisi", "info"); return; }
    const findings = Math.max(0, Number(walkForm.findings) || 0);
    const item: WalkItem = {
      id: `SW-${Date.now().toString(36).toUpperCase()}`,
      date: walkForm.date, area: walkForm.area.trim(), findings, pic: walkForm.pic.trim(),
    };
    setWalks((prev) => [item, ...prev]);
    log("melakukan safety walk", `${item.area} · ${findings} temuan`, "Safety");
    toast(`Safety walk ${item.id} disimpan`);
    setShowWalk(false);
    setWalkForm({ date: todayISO(), area: "", findings: "0", pic: "" });
  };

  const walkToNcr = (w: WalkItem) => {
    const created = add("ncr", {
      project: data.projects[0]?.id ?? "-", vessel: data.projects[0]?.vessel ?? "-",
      type: "Umum", status: "Terbuka", severity: "Minor", raised: w.date,
      due: addDaysISO(w.date, 7), causeCat: "Lingkungan",
      causeNote: `Temuan safety walk ${w.id}`,
      issue: `Temuan safety walk ${w.id} di ${w.area}: ${w.findings} temuan`,
    }, { action: "menerbitkan NCR", module: "QC" });
    toast(`NCR ${created.id} dibuat dari safety walk`);
  };

  const saveAudit = () => {
    const answered = auditChecked.length;
    if (answered < AUDIT_ITEMS.length) return;
    log("melakukan audit HSE", `skor ${auditScore}% (${auditChecked.filter(Boolean).length}/${AUDIT_ITEMS.length} item)`, "Safety");
    toast(`Audit HSE disimpan — skor ${auditScore}%`);
    setAuditChecked(AUDIT_ITEMS.map(() => false));
  };

  return (
    <div>
      <PageHeader
        title="Quality Control & Safety"
        subtitle="Inspeksi, NCR, insiden, dan kepatuhan HSE"
        icon={<ShieldCheck className="h-5 w-5" />}
        actions={
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={() => setShowNcr(true)}><AlertTriangle className="h-4 w-4" /> NCR Baru</button>
            <button className="btn-primary-gradient" onClick={() => setShowInsp(true)}><Plus className="h-4 w-4" /> Inspeksi Baru</button>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="NCR Terbuka" value={String(openNcr)} delta={`${String(criticalOpen)} critical`} deltaDirection="down" icon={<AlertTriangle className="h-5 w-5" />} chip="rose" spark={ncrTrend} />
        <KpiCard label="Inspeksi Tercatat" value={String(inspections.length)} delta={`${String(ncrList.length)} NCR terkait`} deltaDirection="flat" icon={<ShieldCheck className="h-5 w-5" />} chip="navy" spark={inspectionTrend.map((d) => ({ name: d.month, v: d.inspeksi }))} />
        <KpiCard label="Insiden (YTD)" value={String(incidents.length)} delta="termasuk near miss" deltaDirection="down" icon={<Siren className="h-5 w-5" />} chip="amber" spark={incidentTrend} />
        <KpiCard label="HSE Score" value="A" delta="Kinerja baik" deltaDirection="up" icon={<Award className="h-5 w-5" />} chip="teal" spark={hseTrend} />
      </div>

      <div className="mt-4 card">
        <Tabs tabs={["Inspeksi (ITP)", "NCR", "Drawing", "HSE Operasional", "Insiden", "Sertifikat"]} active={tab} onChange={setTab} />
        <div className="p-4">
          {tab === "Inspeksi (ITP)" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <Card>
                  <CardHeader title="Distribusi NCR" subtitle="Per kategori kejadian" />
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
                  <CardHeader title="Inspeksi & Tingkat Kelulusan" subtitle="Total inspeksi vs yang lulus per bulan" />
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
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-surface sticky top-0 z-10">
                    <tr><th className="th">Inspeksi</th><th className="th">Proyek</th><th className="th">Titik Inspeksi</th><th className="th">ITP</th><th className="th">Hold / Witness</th><th className="th">NDE</th><th className="th">Sampel (AQL)</th><th className="th">Inspector</th><th className="th">Tanggal</th><th className="th">Hasil</th><th className="th">Aksi</th></tr>
                  </thead>
                  <tbody className="divide-y divide-steel-100">
                    {inspections.map((i) => (
                      <tr key={i.id} className="hover:bg-surface">
                        <td className="td font-mono font-medium text-navy-900">{i.id}</td>
                        <td className="td text-steel-600 font-mono text-xs">{i.project}</td>
                        <td className="td text-steel-600 max-w-[240px] truncate" title={String(i.point)}>{i.point}</td>
                        <td className="td text-steel-600 font-mono text-xs">{i.itp}</td>
                        <td className="td"><Badge tone={i.holdType === "Hold" ? "red" : i.holdType === "Witness" ? "amber" : "blue"}>{i.holdType ?? "—"}</Badge></td>
                        <td className="td text-steel-600 text-xs">{i.nde === "Ya" ? `Ya · ${i.ndeMethod ?? "-"}` : "Tidak"}</td>
                        <td className="td text-steel-600 text-xs">
                          {i.sampleSize ? `n=${i.sampleSize} · temuan ${i.defectsFound ?? 0}/${i.defectsAllowed ?? 0}` : "—"}
                        </td>
                        <td className="td text-steel-600 text-xs">{i.inspector ?? "—"}</td>
                        <td className="td text-steel-600">{fmtTanggal(i.date)}</td>
                        <td className="td"><StatusBadge status={i.status} /></td>
                        <td className="td"><button className="btn-secondary text-xs" onClick={() => setInspDetail(i)}>Detail</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === "NCR" && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface px-3 py-2 text-sm">
                <p className="text-steel-600">
                  Total biaya rework <span className="font-semibold text-navy-900">{fmtRupiah(totalRework)}</span>
                  {followUpCount > 0 && <span className="ml-2 font-medium text-amber-700">· {followUpCount} butuh verifikasi lanjutan (H+30)</span>}
                </p>
                <button className="btn-secondary text-xs" onClick={exportNcr}>Ekspor NCR + Rework</button>
              </div>
              {ncrList.map((n) => (
                <Card key={n.id} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-navy-900 font-mono">{n.id}</p>
                        <Badge tone={n.severity === "Critical" ? "red" : n.severity === "Major" ? "amber" : "blue"}>{n.severity}</Badge>
                        {dueBadge(n)}
                        {needsFollowUp(n) && <Badge tone="amber">Follow-up H+30</Badge>}
                        {Number(n.reworkHours || 0) > 0 || Number(n.reworkMaterial || 0) > 0 ? (
                          <span className="text-xs text-steel-500">Rework {fmtRupiah(reworkCost(n))}</span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm text-steel-700">{n.issue}</p>
                      <p className="text-xs text-steel-500 mt-0.5">{n.project} · {n.vessel} · {n.type} · dilaporkan {fmtTanggal(n.raised)}{n.due ? ` · tenggat ${fmtTanggal(n.due)}` : " · tanpa tenggat"}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={ncrTone[n.status] ?? "gray"}>{n.status}</Badge>
                      <button className="btn-secondary text-xs" onClick={() => openDetail(n)}>Detail</button>
                      {n.status !== "Tertutup" ? (
                        <button className="btn-primary text-xs" onClick={() => advanceNcr(n)}>Proses</button>
                      ) : (
                        <button className="btn-secondary text-xs" onClick={() => { setReopenNcr(n); setReopenReason(""); }}>Buka Kembali</button>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
              {ncrList.length === 0 && <p className="py-6 text-center text-sm text-steel-400">Tidak ada NCR. Bagus!</p>}
            </div>
          )}

          {tab === "Drawing" && (
            <div className="space-y-3">
              <div className="flex flex-wrap justify-end gap-2">
                <button className="btn-secondary text-xs" onClick={() => setShowTransmit(true)}><Send className="h-3.5 w-3.5" /> Transmittal</button>
                <button className="btn-secondary text-xs" onClick={() => setShowDrw(true)}><Plus className="h-3.5 w-3.5" /> Register Drawing</button>
              </div>
              {drawings.map((d) => (
                <Card key={d.id} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-navy-900 font-mono">{d.id}</p>
                        <Badge tone="navy">Rev {d.revision}</Badge>
                        <StatusBadge status={String(d.status)} />
                      </div>
                      <p className="mt-1 text-sm text-steel-700">{d.title}</p>
                      <p className="text-xs text-steel-500 mt-0.5">{d.project} · holder {d.holder} · diperbarui {fmtTanggal(String(d.updated))}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button className="btn-secondary text-xs" onClick={() => setExpandedDrw(expandedDrw === d.id ? null : d.id)}>
                        {expandedDrw === d.id ? "Tutup Riwayat" : "Riwayat"}
                      </button>
                      <button className="btn-secondary text-xs" onClick={() => reviseDrawing(d)}>Revisi → {nextRev(String(d.revision ?? "A"))}</button>
                      {DRAW_FLOW[DRAW_FLOW.indexOf(String(d.status)) + 1] && (
                        <button className="btn-primary text-xs" onClick={() => stepDrawing(d, DRAW_FLOW[DRAW_FLOW.indexOf(String(d.status)) + 1])}>
                          → {DRAW_FLOW[DRAW_FLOW.indexOf(String(d.status)) + 1]}
                        </button>
                      )}
                    </div>
                  </div>
                  {expandedDrw === d.id && (
                    <div className="mt-3 border-t border-steel-100 pt-2">
                      <p className="text-xs font-semibold text-steel-500">Riwayat revisi</p>
                      <div className="mt-1 space-y-1">
                        {(Array.isArray(d.history) ? d.history : []).map((h: { revision: string; date: string; holder: string; status: string }, idx: number) => (
                          <div key={idx} className="flex flex-wrap items-center justify-between gap-2 text-xs text-steel-600">
                            <span>Rev {h.revision} · {h.status} · holder {h.holder}</span>
                            <span>{fmtTanggal(h.date)}</span>
                          </div>
                        ))}
                        {(!Array.isArray(d.history) || d.history.length === 0) && <p className="text-xs text-steel-400">Belum ada riwayat.</p>}
                      </div>
                    </div>
                  )}
                </Card>
              ))}
              {drawings.length === 0 && <p className="py-6 text-center text-sm text-steel-400">Belum ada drawing terdaftar.</p>}
            </div>
          )}

          {tab === "HSE Operasional" && (
            <div className="space-y-6">
              <Card className="p-4">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-navy-900">Job Safety Analysis (JSA)</h3>
                  <button className="btn-secondary text-xs" onClick={() => setShowJsa(true)}><Plus className="h-3.5 w-3.5" /> Susun JSA</button>
                </div>
                <div className="space-y-2">
                  {jsaList.map((j) => (
                    <div key={j.id} className="rounded-lg border border-steel-100 p-3 text-sm">
                      <p className="font-medium text-navy-900">{j.job} <span className="font-mono text-xs text-steel-500">· {j.id} · {j.project}</span></p>
                      <p className="text-xs text-steel-600 mt-1">Bahaya: {j.hazard}</p>
                      <p className="text-xs text-steel-600">Kontrol: {j.control}</p>
                      <p className="text-xs text-steel-500 mt-1">PIC {j.pic} · {fmtTanggal(j.date)}</p>
                    </div>
                  ))}
                  {jsaList.length === 0 && <p className="text-xs text-steel-400">Belum ada JSA disusun.</p>}
                </div>
              </Card>

              <Card className="p-4">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-navy-900">Toolbox Talks</h3>
                  <button className="btn-secondary text-xs" onClick={() => setShowTbm(true)}><Plus className="h-3.5 w-3.5" /> Catat Toolbox</button>
                </div>
                <div className="space-y-2">
                  {toolboxTalks.map((t) => (
                    <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-steel-100 py-2 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-navy-900" title={String(t.topic)}>{t.topic}</p>
                        <p className="text-xs text-steel-500">{t.project} · {fmtTanggal(String(t.date))} · {t.attendees} peserta · PIC {t.pic}</p>
                      </div>
                      <span className="font-mono text-xs text-steel-400">{t.id}</span>
                    </div>
                  ))}
                  {toolboxTalks.length === 0 && <p className="text-xs text-steel-400">Belum ada toolbox talk.</p>}
                </div>
              </Card>

              <Card className="p-4">
                <h3 className="text-sm font-semibold text-navy-900">PPE Checklist (8 item wajib)</h3>
                <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Proyek">
                    <select className="input" value={ppeForm.project} onChange={(e) => setPpeForm({ ...ppeForm, project: e.target.value })}>
                      <option value="">Pilih proyek…</option>
                      {data.projects.map((p) => <option key={p.id} value={p.id}>{p.id} · {p.vessel}</option>)}
                    </select>
                  </Field>
                  <Field label="Tanggal"><input type="date" className="input" value={ppeForm.date} onChange={(e) => setPpeForm({ ...ppeForm, date: e.target.value })} /></Field>
                </div>
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {PPE_ITEMS.map((item) => (
                    <label key={item} className="flex items-center gap-2 rounded-lg border border-steel-100 px-3 py-2 text-sm text-steel-700">
                      <input type="checkbox" checked={!!ppeChecked[item]} onChange={(e) => setPpeChecked({ ...ppeChecked, [item]: e.target.checked })} />
                      {item}
                    </label>
                  ))}
                </div>
                <p className="mt-2 text-xs text-steel-500">Lengkap {PPE_ITEMS.filter((i) => ppeChecked[i]).length}/{PPE_ITEMS.length} — bila lengkap, checklist tersimpan sebagai record toolbox bertopik PPE Check.</p>
                <button className="btn-primary mt-2 text-xs" onClick={savePpeCheck}>Simpan PPE Check</button>
              </Card>

              <Card className="p-4">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-navy-900">Safety Walk</h3>
                  <button className="btn-secondary text-xs" onClick={() => setShowWalk(true)}><Plus className="h-3.5 w-3.5" /> Catat Walk</button>
                </div>
                <div className="space-y-2">
                  {walks.map((w) => (
                    <div key={w.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-steel-100 p-3 text-sm">
                      <div>
                        <p className="font-medium text-navy-900">{w.area} <span className="font-mono text-xs text-steel-500">· {w.id}</span></p>
                        <p className="text-xs text-steel-500">{fmtTanggal(w.date)} · {w.findings} temuan · PIC {w.pic}</p>
                      </div>
                      {w.findings > 0 && <button className="btn-secondary text-xs" onClick={() => walkToNcr(w)}>Buatkan NCR</button>}
                    </div>
                  ))}
                  {walks.length === 0 && <p className="text-xs text-steel-400">Belum ada safety walk.</p>}
                </div>
              </Card>

              <Card className="p-4">
                <h3 className="text-sm font-semibold text-navy-900">Audit HSE (10 item)</h3>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {AUDIT_ITEMS.map((item, idx) => (
                    <label key={item} className="flex items-center gap-2 rounded-lg border border-steel-100 px-3 py-2 text-sm text-steel-700">
                      <input type="checkbox" checked={auditChecked[idx]} onChange={(e) => setAuditChecked(auditChecked.map((v, i) => (i === idx ? e.target.checked : v)))} />
                      {item}
                    </label>
                  ))}
                </div>
                <p className="mt-2 text-sm text-steel-600">Skor: <span className="font-semibold text-navy-900">{auditScore}%</span> ({auditChecked.filter(Boolean).length}/{AUDIT_ITEMS.length} terpenuhi)</p>
                <button className="btn-primary mt-2 text-xs" onClick={saveAudit}>Simpan Audit</button>
                <div className="mt-3 border-t border-steel-100 pt-2">
                  <p className="text-xs font-semibold text-steel-500">Riwayat 5 audit terakhir</p>
                  <div className="mt-1 space-y-1">
                    {auditHistory.map((a) => (
                      <p key={a.id} className="text-xs text-steel-600">{a.action} — {a.target} <span className="text-steel-400">· {a.time}</span></p>
                    ))}
                    {auditHistory.length === 0 && <p className="text-xs text-steel-400">Belum ada audit tersimpan.</p>}
                  </div>
                </div>
              </Card>

              <Card className="p-4">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-navy-900">Audit Internal (terpisah dari Audit HSE)</h3>
                  <button className="btn-secondary text-xs" onClick={() => setShowAuditPlan(true)}><Plus className="h-3.5 w-3.5" /> Jadwalkan Audit</button>
                </div>
                <div className="space-y-2">
                  {auditPlans.map((a) => (
                    <div key={a.id} className="rounded-lg border border-steel-100 p-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium text-navy-900">{a.area} <span className="font-mono text-xs text-steel-500">· {a.id}</span></p>
                        <button className="btn-secondary text-xs" onClick={() => setAuditPlans((prev) => prev.filter((x) => x.id !== a.id))}>Hapus</button>
                      </div>
                      <p className="mt-1 text-xs text-steel-600">{fmtTanggal(a.date)} · auditor {a.auditor} · {a.findings} temuan{a.ncrId ? ` · terkait ${a.ncrId}` : ""}</p>
                    </div>
                  ))}
                  {auditPlans.length === 0 && <p className="text-xs text-steel-400">Belum ada jadwal audit internal.</p>}
                </div>
              </Card>
            </div>
          )}

          {tab === "Insiden" && (
            <div>
              <div className="mb-3 flex justify-end">
                <button className="btn-secondary text-xs" onClick={() => setShowInc(true)}><Plus className="h-3.5 w-3.5" /> Catat Insiden</button>
              </div>
              <div className="space-y-3">
                {incidents.map((i) => (
                  <Card key={i.id} className="p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-navy-900 font-mono">{i.id}</p>
                          <Badge tone={i.type === "Near Miss" ? "amber" : "blue"}>{i.type}</Badge>
                        </div>
                        <p className="mt-1 text-sm text-steel-700">{i.desc}</p>
                        <p className="text-xs text-steel-500 mt-0.5">{fmtTanggal(i.date)} · {i.location} · Severity {i.severity}</p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {tab === "Sertifikat" && (
            <div className="space-y-4">
              <Card className="p-4">
                <h3 className="text-sm font-semibold text-navy-900">Perlu perhatian — expire dalam {String(CERT_WINDOW)} hari</h3>
                <div className="mt-2 space-y-2 text-sm">
                  {certAttention.map((c) => (
                    <div key={`${c.vessel}-${c.name}`} className="flex items-center justify-between gap-2">
                      <span className="truncate text-steel-600" title={`${c.name} — ${c.vessel} · berlaku hingga ${fmtTanggal(c.expires)}`}>{c.name} — {c.vessel}</span>
                      <Badge tone={(c.days as number) < 0 ? "red" : "amber"}>
                        {(c.days as number) < 0 ? `Lewat ${String(Math.abs(c.days as number))} hari` : `Sisa ${String(c.days)} hari`}
                      </Badge>
                    </div>
                  ))}
                  {certAttention.length === 0 && <p className="text-xs text-steel-400">Tidak ada sertifikat yang expire dalam waktu dekat.</p>}
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
                          <p className="text-xs text-steel-500">Berlaku hingga {fmtTanggal(c.expires)}{left !== null && left >= 0 ? ` · sisa ${String(left)} hari` : ""}</p>
                          <Badge tone={tone as "green" | "amber" | "red" | "gray"} className="mt-1">{tone === "green" ? "Berlaku" : tone === "amber" ? "Hampir Expire" : tone === "red" ? "Kedaluwarsa" : "Tanpa tanggal"}</Badge>
                        </Card>
                      );
                    })}
                    {(v.certificates ?? []).length === 0 && <p className="text-xs text-steel-400">Belum ada sertifikat (dalam pembangunan)</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modal inspeksi */}
      <Modal open={showInsp} onClose={() => setShowInsp(false)} title="Inspeksi Baru (ITP)" subtitle="Hasil NCR otomatis menerbitkan NCR"
        wide footer={<><button className="btn-secondary" onClick={() => setShowInsp(false)}>Batal</button><button className="btn-primary" onClick={saveInspection}>Simpan Inspeksi</button></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label="Proyek">
              <select className="input" value={inspForm.project} onChange={(e) => setInspForm({ ...inspForm, project: e.target.value })}>
                <option value="">Pilih proyek…</option>
                {data.projects.map((p) => <option key={p.id} value={p.id}>{p.id} · {p.vessel}</option>)}
              </select>
            </Field>
            <Field label="Nomor ITP (otomatis & unik)" hint={`Nomor berikutnya: ${nextItp(inspections)}`}>
              <input className="input font-mono" value={nextItp(inspections)} disabled readOnly />
            </Field>
            <Field label="Tanggal"><input type="date" className="input" value={inspForm.date} onChange={(e) => setInspForm({ ...inspForm, date: e.target.value })} /></Field>
            <Field label="Hasil">
              <select className="input" value={inspForm.status} onChange={(e) => setInspForm({ ...inspForm, status: e.target.value })}>
                {["Terjadwal", "Dalam Proses", "Lulus", "NCR"].map((s) => <option key={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Hold / Witness Point">
              <select className="input" value={inspForm.holdType} onChange={(e) => setInspForm({ ...inspForm, holdType: e.target.value })}>
                {HOLD_TYPES.map((h) => <option key={h}>{h}</option>)}
              </select>
            </Field>
            <Field label="Inspector (dept Quality)">
              <select className="input" value={inspForm.inspector} onChange={(e) => setInspForm({ ...inspForm, inspector: e.target.value })}>
                <option value="">Pilih inspector…</option>
                {qualityStaff.map((e) => <option key={e.id} value={e.name}>{e.name} · {e.role}</option>)}
              </select>
            </Field>
            <Field label="Perlu NDE?">
              <select className="input" value={inspForm.nde} onChange={(e) => setInspForm({ ...inspForm, nde: e.target.value })}>
                {["Ya", "Tidak"].map((v) => <option key={v}>{v}</option>)}
              </select>
            </Field>
            {inspForm.nde === "Ya" && (
              <Field label="Metode NDE">
                <select className="input" value={inspForm.ndeMethod} onChange={(e) => setInspForm({ ...inspForm, ndeMethod: e.target.value })}>
                  {NDE_METHODS.map((m) => <option key={m}>{m}</option>)}
                </select>
              </Field>
            )}
            <Field label="Ukuran sampel (AQL)" hint="Wajib lebih dari 0">
              <input type="number" min={1} className="input" value={inspForm.sampleSize} onChange={(e) => setInspForm({ ...inspForm, sampleSize: e.target.value })} placeholder="cth: 50" />
            </Field>
            <Field label="Defects allowed" hint="Hasil Lulus bila temuan ≤ batas">
              <input type="number" min={0} className="input" value={inspForm.defectsAllowed} onChange={(e) => setInspForm({ ...inspForm, defectsAllowed: e.target.value })} placeholder="cth: 1" />
            </Field>
            <Field label="Temuan defects">
              <input type="number" min={0} className="input" value={inspForm.defectsFound} onChange={(e) => setInspForm({ ...inspForm, defectsFound: e.target.value })} placeholder="cth: 0" />
            </Field>
            {inspForm.nde === "Ya" && (
              <Field label="Alat ukur terkalibrasi" hint="Wajib bila NDE=Ya · hanya Selesai & due belum lewat">
                <select className="input" value={inspForm.calTool} onChange={(e) => setInspForm({ ...inspForm, calTool: e.target.value })}>
                  <option value="">Pilih alat ukur…</option>
                  {validCals.map((c) => <option key={c.id} value={c.id}>{calLabel(c.id)} · due {fmtTanggal(String(c.due))}</option>)}
                </select>
              </Field>
            )}
          </FormGrid>
          <Field label="Titik inspeksi"><input className="input" value={inspForm.point} onChange={(e) => setInspForm({ ...inspForm, point: e.target.value })} placeholder="cth: Welding seam section 5" /></Field>
        </div>
      </Modal>

      {/* Modal NCR */}
      <Modal open={showNcr} onClose={() => setShowNcr(false)} title="Terbitkan NCR" subtitle="Non-Conformance Report"
        wide footer={<><button className="btn-secondary" onClick={() => setShowNcr(false)}>Batal</button><button className="btn-primary" onClick={saveNcr}>Terbitkan</button></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label="Proyek">
              <select className="input" value={ncrForm.project} onChange={(e) => setNcrForm({ ...ncrForm, project: e.target.value })}>
                <option value="">Pilih proyek…</option>
                {data.projects.map((p) => <option key={p.id} value={p.id}>{p.id} · {p.vessel}</option>)}
              </select>
            </Field>
            <Field label="Kapal (opsional)"><input className="input" value={ncrForm.vessel} onChange={(e) => setNcrForm({ ...ncrForm, vessel: e.target.value })} placeholder="Otomatis dari proyek" /></Field>
            <Field label="Kategori">
              <select className="input" value={ncrForm.type} onChange={(e) => setNcrForm({ ...ncrForm, type: e.target.value })}>
                {["Pengelasan", "Pengecatan", "Kelistrikan", "Mesin", "Umum"].map((t) => <option key={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Severity">
              <select className="input" value={ncrForm.severity} onChange={(e) => setNcrForm({ ...ncrForm, severity: e.target.value })}>
                {["Minor", "Major", "Critical"].map((s) => <option key={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Tenggat CAPA"><input type="date" className="input" value={ncrForm.due} onChange={(e) => setNcrForm({ ...ncrForm, due: e.target.value })} /></Field>
            <Field label="Kategori root-cause">
              <select className="input" value={ncrForm.causeCat} onChange={(e) => setNcrForm({ ...ncrForm, causeCat: e.target.value })}>
                {ROOT_CAUSES.map((r) => <option key={r}>{r}</option>)}
              </select>
            </Field>
          </FormGrid>
          <Field label="Uraian temuan"><textarea className="input" rows={3} value={ncrForm.issue} onChange={(e) => setNcrForm({ ...ncrForm, issue: e.target.value })} /></Field>
          <Field label="Uraian root-cause"><textarea className="input" rows={2} value={ncrForm.causeNote} onChange={(e) => setNcrForm({ ...ncrForm, causeNote: e.target.value })} placeholder="cth: Prosedur pengelasan tidak diikuti pada shift malam" /></Field>
        </div>
      </Modal>

      {/* Modal detail NCR */}
      <Modal open={ncrDetail !== null} onClose={() => setNcrDetail(null)} title={ncrDetail ? String(ncrDetail.id) : ""} subtitle="Detail temuan & tindak lanjut"
        footer={ncrDetail && ncrDetail.status !== "Tertutup" ? <button className="btn-primary" onClick={() => {
          const n = ncrDetail;
          if (!n.due) { toast("Lengkapi tenggat CAPA sebelum memproses NCR", "info"); return; }
          const next = NCR_FLOW[NCR_FLOW.indexOf(n.status) + 1];
          if (next === "Tertutup") { setClosingNcr(n); setVerifier(""); setVerifyNote(""); return; }
          advanceNcr(n);
          setNcrDetail({ ...n, status: next });
        }}>Proses ke tahap berikut</button> : undefined}>
        {ncrDetail && (
          <div>
            <dl className="space-y-2.5 text-sm">
              {[["Proyek", ncrDetail.project], ["Kapal", ncrDetail.vessel], ["Kategori", ncrDetail.type], ["Severity", ncrDetail.severity], ["Dilaporkan", fmtTanggal(ncrDetail.raised)], ["Tenggat CAPA", fmtTanggal(ncrDetail.due)], ["Root-cause", ncrDetail.causeCat ? `${ncrDetail.causeCat}${ncrDetail.causeNote ? ` — ${ncrDetail.causeNote}` : ""}` : "—"], ["Uraian", ncrDetail.issue], ...(ncrDetail.verifiedBy ? [["Diverifikasi oleh", `${ncrDetail.verifiedBy}${ncrDetail.verifyNote ? ` — ${ncrDetail.verifyNote}` : ""}`]] : []), ...(ncrDetail.closedAt ? [["Ditutup", fmtTanggal(ncrDetail.closedAt)]] : []), ...(ncrDetail.reopenReason ? [["Alasan dibuka kembali", ncrDetail.reopenReason]] : [])].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4"><dt className="shrink-0 text-steel-500">{k}</dt><dd className="text-right font-medium text-navy-900">{v}</dd></div>
              ))}
              <div className="flex justify-between gap-4"><dt className="text-steel-500">Status</dt><dd><Badge tone={ncrTone[ncrDetail.status] ?? "gray"}>{ncrDetail.status}</Badge></dd></div>
            </dl>
            {ncrDetail.status !== "Tertutup" && (
              <div className="mt-3 flex gap-2">
                <input type="date" className="input flex-1" value={dueDraft} onChange={(e) => setDueDraft(e.target.value)} aria-label="Tenggat CAPA" />
                <button className="btn-secondary text-xs whitespace-nowrap" onClick={saveDue}>Simpan Tenggat</button>
              </div>
            )}
            <div className="mt-3 border-t border-steel-100 pt-3">
              <p className="text-xs font-semibold text-steel-500">BIAYA REWORK (jam × rate + material)</p>
              <div className="mt-2 grid grid-cols-3 gap-2">
                <Field label="Jam"><input type="number" min={0} step={0.5} className="input" value={reworkDraft.hours} onChange={(e) => setReworkDraft({ ...reworkDraft, hours: e.target.value })} placeholder="cth: 12" /></Field>
                <Field label="Rate (Rp/jam)"><input type="number" min={0} className="input" value={reworkDraft.rate} onChange={(e) => setReworkDraft({ ...reworkDraft, rate: e.target.value })} placeholder="cth: 75000" /></Field>
                <Field label="Material (Rp)"><input type="number" min={0} className="input" value={reworkDraft.material} onChange={(e) => setReworkDraft({ ...reworkDraft, material: e.target.value })} placeholder="cth: 500000" /></Field>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <p className="text-sm text-steel-600">Total <span className="font-semibold text-navy-900">{fmtRupiah((Number(reworkDraft.hours) || 0) * (Number(reworkDraft.rate) || 0) + (Number(reworkDraft.material) || 0))}</span></p>
                <button className="btn-secondary text-xs" onClick={saveRework}>Simpan Biaya Rework</button>
              </div>
            </div>
            <div className="mt-3 border-t border-steel-100 pt-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-steel-500">VERIFIKASI LANJUTAN (CAPA H+30)</p>
                {needsFollowUp(ncrDetail) && <Badge tone="amber">Follow-up H+30</Badge>}
              </div>
              {ncrDetail.followUpDate ? (
                <p className="mt-1 text-sm text-steel-600">Terverifikasi {fmtTanggal(String(ncrDetail.followUpDate))} — {String(ncrDetail.followUpNote ?? "")}</p>
              ) : (
                <p className="mt-1 text-xs text-steel-500">
                  {ncrDetail.status === "Tertutup"
                    ? `Ditutup ${fmtTanggal(String(ncrDetail.closedAt ?? ""))} · verifikasi lanjutan jatuh tempo H+30 bila belum ada tinjauan ulang.`
                    : "Tersedia setelah NCR Tertutup lebih dari 30 hari tanpa verifikasi lanjutan."}
                </p>
              )}
              {needsFollowUp(ncrDetail) && (
                <button className="btn-primary mt-2 text-xs" onClick={() => { setFollowUpNcr(ncrDetail); setFollowUpForm({ date: todayISO(), note: "" }); }}>
                  Verifikasi Lanjutan
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Modal detail inspeksi: sampling AQL + sertifikat inspector */}
      <Modal open={inspDetail !== null} onClose={() => setInspDetail(null)} title={inspDetail ? String(inspDetail.id) : ""} subtitle="Detail sampling AQL, alat NDE & sertifikat inspector">
        {inspDetail && (
          <div>
            <dl className="space-y-2.5 text-sm">
              {[["Proyek", inspDetail.project], ["Titik", inspDetail.point], ["ITP", inspDetail.itp], ["Tanggal", fmtTanggal(inspDetail.date)], ["Hold / Witness", inspDetail.holdType ?? "—"], ["NDE", inspDetail.nde === "Ya" ? `Ya · ${inspDetail.ndeMethod ?? "-"} · ${inspDetail.calTool ? calLabel(String(inspDetail.calTool)) : "tanpa alat"}` : "Tidak"], ["Sampling AQL", inspDetail.sampleSize ? `n=${inspDetail.sampleSize} · temuan ${inspDetail.defectsFound ?? 0} / batas ${inspDetail.defectsAllowed ?? 0} · ${(Number(inspDetail.defectsFound ?? 0) <= Number(inspDetail.defectsAllowed ?? 0)) ? "Lulus AQL" : "Gagal AQL"}` : "—"], ["Inspector", inspDetail.inspector ?? "—"]].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4"><dt className="shrink-0 text-steel-500">{k}</dt><dd className="text-right font-medium text-navy-900">{v}</dd></div>
              ))}
              <div className="flex justify-between gap-4"><dt className="text-steel-500">Hasil</dt><dd><StatusBadge status={inspDetail.status} /></dd></div>
            </dl>
            <div className="mt-3 border-t border-steel-100 pt-3">
              <p className="text-xs font-semibold text-steel-500">SERTIFIKAT INSPECTOR</p>
              {(() => {
                const certs = certsOfInspector(String(inspDetail.inspector ?? ""));
                if (certs.length === 0) return <p className="mt-1 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">Peringatan: inspector belum memiliki sertifikat tercatat di data karyawan.</p>;
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
      <Modal open={followUpNcr !== null} onClose={() => setFollowUpNcr(null)} title={`Verifikasi Lanjutan ${followUpNcr ? String(followUpNcr.id) : ""}`} subtitle="Tinjauan ulang CAPA setelah Tertutup lebih dari 30 hari"
        footer={<><button className="btn-secondary" onClick={() => setFollowUpNcr(null)}>Batal</button><button className="btn-primary" onClick={confirmFollowUp}>Simpan Verifikasi</button></>}>
        <div className="space-y-3">
          <Field label="Tanggal verifikasi"><input type="date" className="input" value={followUpForm.date} onChange={(e) => setFollowUpForm({ ...followUpForm, date: e.target.value })} /></Field>
          <Field label="Catatan verifikasi"><textarea className="input" rows={3} value={followUpForm.note} onChange={(e) => setFollowUpForm({ ...followUpForm, note: e.target.value })} placeholder="cth: Dicek ulang H+35, perbaikan bertahan, tidak ada temuan berulang" /></Field>
        </div>
      </Modal>

      {/* Modal tutup NCR */}
      <Modal open={closingNcr !== null} onClose={() => setClosingNcr(null)} title={`Tutup ${closingNcr ? String(closingNcr.id) : ""}`} subtitle={closingNcr?.severity === "Critical" ? "NCR Critical wajib diverifikasi pihak kedua" : "Konfirmasi penutupan NCR"}
        footer={<><button className="btn-secondary" onClick={() => setClosingNcr(null)}>Batal</button><button className="btn-primary" onClick={confirmClose}>Tutup NCR</button></>}>
        <div className="space-y-3">
          {closingNcr?.severity === "Critical" && (
            <Field label="Nama verifikator kedua"><input className="input" value={verifier} onChange={(e) => setVerifier(e.target.value)} placeholder="cth: Ir. Hendra Wijaya" /></Field>
          )}
          <Field label="Catatan verifikasi"><textarea className="input" rows={3} value={verifyNote} onChange={(e) => setVerifyNote(e.target.value)} placeholder="cth: Perbaikan sudah dicek ulang, toleransi sesuai" /></Field>
        </div>
      </Modal>

      {/* Modal buka kembali NCR */}
      <Modal open={reopenNcr !== null} onClose={() => setReopenNcr(null)} title={`Buka Kembali ${reopenNcr ? String(reopenNcr.id) : ""}`} subtitle="NCR kembali ke status Terbuka"
        footer={<><button className="btn-secondary" onClick={() => setReopenNcr(null)}>Batal</button><button className="btn-primary" onClick={confirmReopen}>Buka Kembali</button></>}>
        <Field label="Alasan pembukaan kembali"><textarea className="input" rows={3} value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} placeholder="cth: Temuan muncul kembali saat sea trial" /></Field>
      </Modal>

      {/* Modal insiden */}
      <Modal open={showInc} onClose={() => setShowInc(false)} title="Catat Insiden / Near Miss"
        footer={<><button className="btn-secondary" onClick={() => setShowInc(false)}>Batal</button><button className="btn-primary" onClick={() => {
          if (!incForm.desc.trim() || !incForm.location.trim()) { toast("Lokasi & uraian wajib diisi", "info"); return; }
          const created = add("incidents", { type: incForm.type, date: todayISO(), location: incForm.location.trim(), desc: incForm.desc.trim(), severity: incForm.severity },
            { action: "mencatat insiden", module: "Safety" });
          toast(`Insiden ${created.id} dicatat`); setShowInc(false); setIncForm({ type: "Near Miss", location: "", desc: "", severity: "Rendah" });
        }}>Simpan</button></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label="Jenis">
              <select className="input" value={incForm.type} onChange={(e) => setIncForm({ ...incForm, type: e.target.value })}>
                {["Near Miss", "First Aid", "Lost Time", "Kebakaran", "Lainnya"].map((t) => <option key={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Severity">
              <select className="input" value={incForm.severity} onChange={(e) => setIncForm({ ...incForm, severity: e.target.value })}>
                {["Rendah", "Sedang", "Tinggi", "Kritis"].map((s) => <option key={s}>{s}</option>)}
              </select>
            </Field>
          </FormGrid>
          <Field label="Lokasi"><input className="input" value={incForm.location} onChange={(e) => setIncForm({ ...incForm, location: e.target.value })} placeholder="cth: Area Fabrikasi" /></Field>
          <Field label="Uraian kejadian"><textarea className="input" rows={3} value={incForm.desc} onChange={(e) => setIncForm({ ...incForm, desc: e.target.value })} /></Field>
        </div>
      </Modal>

      {/* Modal register drawing */}
      <Modal open={showDrw} onClose={() => setShowDrw(false)} title="Register Drawing" subtitle="Revisi awal A · status Diajukan"
        footer={<><button className="btn-secondary" onClick={() => setShowDrw(false)}>Batal</button><button className="btn-primary" onClick={saveDrawing}>Daftarkan</button></>}>
        <div className="space-y-3">
          <Field label="Proyek">
            <select className="input" value={drwForm.project} onChange={(e) => setDrwForm({ ...drwForm, project: e.target.value })}>
              <option value="">Pilih proyek…</option>
              {data.projects.map((p) => <option key={p.id} value={p.id}>{p.id} · {p.vessel}</option>)}
            </select>
          </Field>
          <Field label="Judul drawing"><input className="input" value={drwForm.title} onChange={(e) => setDrwForm({ ...drwForm, title: e.target.value })} placeholder="cth: General Arrangement" /></Field>
          <Field label="Holder"><input className="input" value={drwForm.holder} onChange={(e) => setDrwForm({ ...drwForm, holder: e.target.value })} placeholder="cth: Hendra Wijaya" /></Field>
        </div>
      </Modal>

      {/* Modal transmittal */}
      <Modal open={showTransmit} onClose={() => setShowTransmit(false)} title="Transmittal Drawing" subtitle="Pilih drawing, kirim & ekspor Excel"
        wide footer={<><button className="btn-secondary" onClick={() => setShowTransmit(false)}>Batal</button><button className="btn-primary" onClick={saveTransmittal}><Send className="h-4 w-4" /> Kirim & Ekspor</button></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label="Kepada"><input className="input" value={transmitForm.to} onChange={(e) => setTransmitForm({ ...transmitForm, to: e.target.value })} placeholder="cth: PT Biro Klasifikasi" /></Field>
            <Field label="Tanggal"><input type="date" className="input" value={transmitForm.date} onChange={(e) => setTransmitForm({ ...transmitForm, date: e.target.value })} /></Field>
          </FormGrid>
          <div>
            <p className="label">Daftar drawing ({transmitForm.ids.length} dipilih)</p>
            <div className="mt-1 max-h-56 space-y-1 overflow-y-auto">
              {drawings.map((d) => (
                <label key={d.id} className="flex items-center gap-2 rounded-lg border border-steel-100 px-3 py-2 text-sm text-steel-700">
                  <input type="checkbox" checked={transmitForm.ids.includes(d.id)} onChange={() => toggleTransmitId(d.id)} />
                  <span className="font-mono text-xs text-navy-900">{d.id}</span>
                  <span className="truncate">{d.title} · Rev {d.revision}</span>
                </label>
              ))}
              {drawings.length === 0 && <p className="text-xs text-steel-400">Belum ada drawing.</p>}
            </div>
          </div>
        </div>
      </Modal>

      {/* Modal JSA */}
      <Modal open={showJsa} onClose={() => setShowJsa(false)} title="Susun JSA" subtitle="Job Safety Analysis"
        wide footer={<><button className="btn-secondary" onClick={() => setShowJsa(false)}>Batal</button><button className="btn-primary" onClick={saveJsa}>Simpan JSA</button></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label="Proyek">
              <select className="input" value={jsaForm.project} onChange={(e) => setJsaForm({ ...jsaForm, project: e.target.value })}>
                <option value="">Pilih proyek…</option>
                {data.projects.map((p) => <option key={p.id} value={p.id}>{p.id} · {p.vessel}</option>)}
              </select>
            </Field>
            <Field label="Tanggal"><input type="date" className="input" value={jsaForm.date} onChange={(e) => setJsaForm({ ...jsaForm, date: e.target.value })} /></Field>
            <Field label="PIC"><input className="input" value={jsaForm.pic} onChange={(e) => setJsaForm({ ...jsaForm, pic: e.target.value })} placeholder="cth: Agus Setiawan" /></Field>
            <Field label="Pekerjaan"><input className="input" value={jsaForm.job} onChange={(e) => setJsaForm({ ...jsaForm, job: e.target.value })} placeholder="cth: Pengelasan section 5" /></Field>
          </FormGrid>
          <Field label="Bahaya teridentifikasi"><textarea className="input" rows={2} value={jsaForm.hazard} onChange={(e) => setJsaForm({ ...jsaForm, hazard: e.target.value })} /></Field>
          <Field label="Pengendalian"><textarea className="input" rows={2} value={jsaForm.control} onChange={(e) => setJsaForm({ ...jsaForm, control: e.target.value })} /></Field>
        </div>
      </Modal>

      {/* Modal toolbox */}
      <Modal open={showTbm} onClose={() => setShowTbm(false)} title="Catat Toolbox Talk"
        footer={<><button className="btn-secondary" onClick={() => setShowTbm(false)}>Batal</button><button className="btn-primary" onClick={saveToolbox}>Simpan</button></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label="Proyek">
              <select className="input" value={tbmForm.project} onChange={(e) => setTbmForm({ ...tbmForm, project: e.target.value })}>
                <option value="">Pilih proyek…</option>
                {data.projects.map((p) => <option key={p.id} value={p.id}>{p.id} · {p.vessel}</option>)}
              </select>
            </Field>
            <Field label="Tanggal"><input type="date" className="input" value={tbmForm.date} onChange={(e) => setTbmForm({ ...tbmForm, date: e.target.value })} /></Field>
            <Field label="Jumlah peserta"><input type="number" min={0} className="input" value={tbmForm.attendees} onChange={(e) => setTbmForm({ ...tbmForm, attendees: e.target.value })} /></Field>
            <Field label="PIC"><input className="input" value={tbmForm.pic} onChange={(e) => setTbmForm({ ...tbmForm, pic: e.target.value })} /></Field>
          </FormGrid>
          <Field label="Topik"><input className="input" value={tbmForm.topic} onChange={(e) => setTbmForm({ ...tbmForm, topic: e.target.value })} placeholder="cth: Lifting & rigging aman" /></Field>
        </div>
      </Modal>

      {/* Modal safety walk */}
      <Modal open={showWalk} onClose={() => setShowWalk(false)} title="Catat Safety Walk"
        footer={<><button className="btn-secondary" onClick={() => setShowWalk(false)}>Batal</button><button className="btn-primary" onClick={saveWalk}>Simpan</button></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label="Tanggal"><input type="date" className="input" value={walkForm.date} onChange={(e) => setWalkForm({ ...walkForm, date: e.target.value })} /></Field>
            <Field label="PIC"><input className="input" value={walkForm.pic} onChange={(e) => setWalkForm({ ...walkForm, pic: e.target.value })} /></Field>
            <Field label="Area"><input className="input" value={walkForm.area} onChange={(e) => setWalkForm({ ...walkForm, area: e.target.value })} placeholder="cth: Drydock 1" /></Field>
            <Field label="Jumlah temuan"><input type="number" min={0} className="input" value={walkForm.findings} onChange={(e) => setWalkForm({ ...walkForm, findings: e.target.value })} /></Field>
          </FormGrid>
        </div>
      </Modal>

      {/* Modal jadwal audit internal */}
      <Modal open={showAuditPlan} onClose={() => setShowAuditPlan(false)} title="Jadwalkan Audit Internal" subtitle="Terpisah dari checklist Audit HSE"
        footer={<><button className="btn-secondary" onClick={() => setShowAuditPlan(false)}>Batal</button><button className="btn-primary" onClick={saveAuditPlan}>Simpan Jadwal</button></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label="Tanggal"><input type="date" className="input" value={auditForm.date} onChange={(e) => setAuditForm({ ...auditForm, date: e.target.value })} /></Field>
            <Field label="Area"><input className="input" value={auditForm.area} onChange={(e) => setAuditForm({ ...auditForm, area: e.target.value })} placeholder="cth: Workshop Fabrikasi" /></Field>
            <Field label="Auditor"><input className="input" value={auditForm.auditor} onChange={(e) => setAuditForm({ ...auditForm, auditor: e.target.value })} placeholder="cth: Sari Wulandari" /></Field>
            <Field label="Jumlah temuan"><input type="number" min={0} className="input" value={auditForm.findings} onChange={(e) => setAuditForm({ ...auditForm, findings: e.target.value })} /></Field>
          </FormGrid>
          <Field label="Link NCR (manual, opsional)">
            <select className="input" value={auditForm.ncrId} onChange={(e) => setAuditForm({ ...auditForm, ncrId: e.target.value })}>
              <option value="">Tanpa link NCR…</option>
              {ncrList.map((n) => <option key={n.id} value={n.id}>{n.id} · {n.status}</option>)}
            </select>
          </Field>
        </div>
      </Modal>
    </div>
  );
}
