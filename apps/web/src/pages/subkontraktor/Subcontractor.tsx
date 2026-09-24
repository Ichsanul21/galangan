import { useState } from "react";
import { Plus, HardHat, FileSignature, Star } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Card, CardHeader, PageHeader, Badge, KpiCard, Tabs, ProgressBar, ChartTooltip, Modal, Field, FormGrid, ConfirmModal, SortTh, toggleSort, sortRows, toast } from "../../components/ui";
import type { SortState } from "../../components/ui";
import { useStore, type StoreItem } from "../../data/store";
import { fmtRupiah, fmtMiliar, fmtTanggal, todayISO } from "../../utils/format";
import { subcontractorScore, subActiveTrend, subContractTrend, woTrend, ratingTrend } from "../../data";

const toneMap: Record<string, "green" | "blue" | "amber" | "red" | "gray" | "navy"> = {
  Aktif: "green",
  Kualifikasi: "amber",
  Blacklist: "red",
  "Dalam Proses": "blue",
  Selesai: "green",
  Lunas: "green",
  Disetujui: "blue",
  Diajukan: "amber",
  "Belum Dibayar": "amber",
  Draf: "gray",
  Ditolak: "red",
  "Retensi Released": "green",
};

const TERM_NEXT: Record<string, string[]> = {
  Draf: ["Diajukan"],
  Diajukan: ["Disetujui", "Ditolak"],
  Disetujui: ["Lunas"],
  Lunas: [],
  Ditolak: [],
  "Retensi Released": [],
};

function normTerm(s: string): string {
  return s === "Belum Dibayar" ? "Diajukan" : s;
}

const termNext = (s: string): string[] => TERM_NEXT[normTerm(s)] ?? [];

const SUB_NEXT: Record<string, string[]> = {
  Aktif: ["Kualifikasi", "Blacklist"],
  Kualifikasi: ["Aktif", "Blacklist"],
  Blacklist: ["Kualifikasi"],
};

function normSub(s: string): string {
  return SUB_NEXT[s] ? s : "Kualifikasi";
}

const CONTRACT_TYPES = ["Borongan", "Lump-sum", "Spesialis", "Support"];
const PAY_SCHEMES = ["harian", "unit", "meter", "jam"];

const pphOf = (p: StoreItem): number => Number(p.pphPct ?? 2);
const retOf = (p: StoreItem): number => Number(p.retPct ?? 5);
const potonganOf = (p: StoreItem): number => Number(p.amount || 0) * (pphOf(p) + retOf(p)) / 100;
const netoOf = (p: StoreItem): number => Number(p.amount || 0) - potonganOf(p);

function complianceOf(k3: unknown): { label: string; tone: "green" | "amber" | "red" } {
  const v = String(k3 ?? "");
  if (v === "A+" || v === "A") return { label: "Patuh", tone: "green" };
  if (v === "B+" || v === "B") return { label: "Cukup", tone: "amber" };
  return { label: "Perlu Bina", tone: "red" };
}

function daysUntil(iso: string | null | undefined): number | null {
  if (!iso || iso === "-") return null;
  const t = new Date(`${iso}T00:00:00`).getTime();
  if (Number.isNaN(t)) return null;
  const now = new Date();
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((t - base) / 86400000);
}

function daysLate(iso: string | null | undefined): number {
  const d = daysUntil(iso);
  return d !== null && d < 0 ? Math.abs(d) : 0;
}

interface Milestone { title: string; pct: number; due: string }

function milestonesOf(s: StoreItem): Milestone[] {
  return Array.isArray(s.milestones) ? s.milestones as Milestone[] : [];
}

export default function Subcontractor() {
  const { data, add, update, log } = useStore();
  const subcontractors = data.subcontractors;
  const workOrders = data.workOrders;
  const payments = data.termins;
  const timesheets = data.timesheets;
  const projectOptions = data.projects;
  const employeeOptions = data.employees;
  const [tab, setTab] = useState("Subkontraktor");
  const [sort, setSort] = useState<SortState>({ key: null, dir: "asc" });
  const [sort2, setSort2] = useState<SortState>({ key: null, dir: "asc" });
  const [typeFilter, setTypeFilter] = useState("Semua");

  const [showSub, setShowSub] = useState(false);
  const [subForm, setSubForm] = useState({ name: "", services: "", contract: "", k3: "A", contractType: "Borongan", payScheme: "unit", noBG: "", bgExpiry: "", bgValue: "" });
  const [subConfirm, setSubConfirm] = useState<{ id: string; name: string; next: string } | null>(null);
  const [msSub, setMsSub] = useState<StoreItem | null>(null);
  const [msForm, setMsForm] = useState({ title: "", pct: "", due: "" });
  const [showWo, setShowWo] = useState(false);
  const [woForm, setWoForm] = useState({ sub: "", project: "", scope: "", targetDate: "", penaltyPct: "0.1" });
  const [woProg, setWoProg] = useState<StoreItem | null>(null);
  const [progVal, setProgVal] = useState("");
  const [progNote, setProgNote] = useState("");
  const [confirmFinish, setConfirmFinish] = useState<{ id: string; v: number; note: string } | null>(null);
  const [showTerm, setShowTerm] = useState(false);
  const [termForm, setTermForm] = useState({ sub: "", wo: "", milestone: "", amount: "", pphPct: "0.5", retPct: "5" });
  const [termPay, setTermPay] = useState<StoreItem | null>(null);
  const [proof, setProof] = useState({ date: todayISO(), method: "Transfer", ref: "" });
  const [withholdingRef, setWithholdingRef] = useState("");
  const [rejectTerm, setRejectTerm] = useState<StoreItem | null>(null);
  const [releaseTerm, setReleaseTerm] = useState<StoreItem | null>(null);
  const [releaseForm, setReleaseForm] = useState({ date: todayISO(), ba: "" });
  const [showTs, setShowTs] = useState(false);
  const [tsForm, setTsForm] = useState({ wo: "", employee: "", date: todayISO(), hours: "", note: "" });
  const [rateForm, setRateForm] = useState({ wo: "", rate: "" });

  const runningWo = workOrders.filter((w) => w.status !== "Selesai").length;
  const avgRating = subcontractors.length ? Math.round(subcontractors.reduce((s, x) => s + Number(x.rating || 0), 0) / subcontractors.length) : 0;
  const filteredSubs = typeFilter === "Semua" ? subcontractors : subcontractors.filter((s) => String(s.contractType ?? "Borongan") === typeFilter);

  const termWoOptions = workOrders.filter((w) => termForm.sub && w.sub === termForm.sub);
  const termWo = workOrders.find((w) => w.id === termForm.wo) ?? null;
  const termSub = subcontractors.find((s) => s.name === termForm.sub) ?? null;
  const termCap = termSub && termWo ? Number(termSub.contract || 0) * Number(termWo.progress || 0) / 100 : 0;
  const termUsed = termForm.wo
    ? payments.filter((t) => t.woId === termForm.wo && t.status !== "Ditolak").reduce((s, t) => s + Number(t.amount || 0), 0)
    : 0;
  const termTsHours = termForm.wo
    ? timesheets.filter((t) => t.woId === termForm.wo).reduce((s, t) => s + Number(t.hours || 0), 0)
    : 0;
  const termTsRef = termWo && Number(termWo.rate || 0) > 0 && termTsHours > 0
    ? termTsHours * Number(termWo.rate || 0)
    : 0;
  const termMsList = termSub ? milestonesOf(termSub) : [];
  const termMs = termMsList.find((m) => m.title === termForm.milestone) ?? null;
  const termMsCap = termMs && termSub ? Number(termSub.contract || 0) * Number(termMs.pct || 0) / 100 : 0;
  const termMsUsed = termMs
    ? payments.filter((t) => t.sub === termForm.sub && t.milestone === termMs.title && t.status !== "Ditolak").reduce((s, t) => s + Number(t.amount || 0), 0)
    : 0;

  const hoursByWo = (woId: string): number =>
    timesheets.filter((t) => t.woId === woId).reduce((s, t) => s + Number(t.hours || 0), 0);

  const woOfSub = (subName: string): StoreItem[] => workOrders.filter((w) => w.sub === subName);
  const incidentsOfSub = (subName: string): StoreItem[] => {
    const projs = woOfSub(subName).map((w) => w.project);
    return data.incidents.filter((i) => i.project && projs.includes(i.project));
  };

  const saveSub = () => {
    if (!subForm.name.trim()) { toast("Nama subkontraktor wajib diisi", "info"); return; }
    const bgValue = Number(subForm.bgValue || 0);
    if (subForm.bgValue && (!Number.isFinite(bgValue) || bgValue < 0)) { toast("Nilai bank garansi harus 0 atau lebih", "info"); return; }
    const created = add("subcontractors", {
      name: subForm.name.trim(), services: subForm.services.trim() || "Umum",
      rating: 80, active: 0, contract: Number(subForm.contract) || 0, status: "Kualifikasi", k3: subForm.k3,
      contractType: subForm.contractType, payScheme: subForm.payScheme,
      noBG: subForm.noBG.trim(), bgExpiry: subForm.bgExpiry, bgValue,
      milestones: [],
    }, { action: "meregistrasi subkontraktor", module: "Subkontraktor" });
    toast(`${created.id} teregistrasi (Kualifikasi)`);
    setShowSub(false);
    setSubForm({ name: "", services: "", contract: "", k3: "A", contractType: "Borongan", payScheme: "unit", noBG: "", bgExpiry: "", bgValue: "" });
  };

  const saveMilestone = () => {
    if (!msSub) return;
    if (!msForm.title.trim()) { toast("Judul milestone wajib diisi", "info"); return; }
    const pct = Number(msForm.pct);
    if (!Number.isFinite(pct) || pct <= 0 || pct > 100) { toast("Bobot milestone harus 0–100%", "info"); return; }
    if (!msForm.due) { toast("Due date milestone wajib diisi", "info"); return; }
    const next = [...milestonesOf(msSub), { title: msForm.title.trim(), pct, due: msForm.due }];
    if (next.reduce((s, m) => s + Number(m.pct || 0), 0) > 100) { toast("Kumulatif bobot milestone melebihi 100%", "info"); return; }
    update("subcontractors", msSub.id, { milestones: next });
    log("menambah milestone SOW", `${msSub.name} · ${msForm.title.trim()} (${pct}%)`, "Subkontraktor");
    toast(`Milestone ditambahkan ke ${msSub.name}`);
    setMsSub({ ...msSub, milestones: next });
    setMsForm({ title: "", pct: "", due: "" });
  };

  const removeMilestone = (idx: number) => {
    if (!msSub) return;
    const next = milestonesOf(msSub).filter((_, i) => i !== idx);
    update("subcontractors", msSub.id, { milestones: next });
    log("menghapus milestone SOW", `${msSub.name} · index ${idx + 1}`, "Subkontraktor");
    setMsSub({ ...msSub, milestones: next });
  };

  const saveWo = () => {
    if (!woForm.sub || !woForm.project || !woForm.scope.trim()) { toast("Sub, proyek & lingkup wajib diisi", "info"); return; }
    if (!woForm.targetDate) { toast("Target selesai WO wajib diisi", "info"); return; }
    const penaltyPct = Number(woForm.penaltyPct);
    if (!Number.isFinite(penaltyPct) || penaltyPct < 0 || penaltyPct > 5) { toast("Denda per hari harus 0–5%", "info"); return; }
    const created = add("workOrders", { sub: woForm.sub, project: woForm.project, scope: woForm.scope.trim(), progress: 0, status: "Dalam Proses", date: todayISO(), targetDate: woForm.targetDate, penaltyPct },
      { action: "menerbitkan WO", module: "Subkontraktor" });
    toast(`WO ${created.id} diterbitkan`);
    setShowWo(false);
    setWoForm({ sub: "", project: "", scope: "", targetDate: "", penaltyPct: "0.1" });
  };

  const recordPenalty = (w: StoreItem) => {
    const sub = subcontractors.find((s) => s.name === w.sub);
    const late = daysLate(String(w.targetDate ?? ""));
    const perDay = Number(w.penaltyPct || 0);
    const base = Number(sub?.contract || 0);
    const raw = base * perDay / 100 * late;
    const amount = Math.min(raw, base * 5 / 100);
    update("workOrders", w.id, { penaltyDays: late, penaltyAmount: Math.round(amount), penaltyAt: todayISO() });
    log("mencatat denda keterlambatan", `${w.id} · telat ${late} hari · ${fmtRupiah(Math.round(amount))}`, "Subkontraktor");
    toast(`Denda ${w.id} dicatat: ${fmtRupiah(Math.round(amount))}`);
  };

  const applyWoProgress = (id: string, v: number, note: string) => {
    update("workOrders", id, { progress: v, status: v >= 100 ? "Selesai" : "Dalam Proses" });
    log("mengupdate progres", `${id} → ${v}%${note ? ` — ${note}` : ""}`, "Subkontraktor");
    toast(`${id} → ${v}%`);
  };

  const saveWoProgress = () => {
    if (!woProg) return;
    const v = Math.min(100, Math.max(0, Number(progVal) || 0));
    if (v < Number(woProg.progress) && !progNote.trim()) {
      toast("Progres mundur wajib disertai catatan", "info");
      return;
    }
    if (v >= 100) {
      setConfirmFinish({ id: woProg.id, v, note: progNote.trim() });
      return;
    }
    applyWoProgress(woProg.id, v, progNote.trim());
    setWoProg(null);
    setProgNote("");
  };

  const saveTerm = () => {
    if (!termForm.sub) { toast("Subkontraktor wajib dipilih", "info"); return; }
    const wo = workOrders.find((w) => w.id === termForm.wo && w.sub === termForm.sub);
    if (!wo) { toast("Pilih WO milik subkontraktor tersebut", "info"); return; }
    const amount = Number(termForm.amount);
    if (!amount || amount <= 0) { toast("Nilai termin harus lebih dari 0", "info"); return; }
    const pphPct = Number(termForm.pphPct);
    const retPct = Number(termForm.retPct);
    if (Number.isNaN(pphPct) || pphPct < 0 || pphPct > 100 || Number.isNaN(retPct) || retPct < 0 || retPct > 100) {
      toast("PPh/retensi harus 0–100%", "info");
      return;
    }
    const sub = subcontractors.find((s) => s.name === termForm.sub);
    const cap = sub ? Number(sub.contract || 0) * Number(wo.progress || 0) / 100 : 0;
    const used = payments.filter((t) => t.woId === wo.id && t.status !== "Ditolak").reduce((s, t) => s + Number(t.amount || 0), 0);
    if (used + amount > cap) {
      toast(`Termin melebihi batas WO: maks ${fmtRupiah(cap)} (kontrak ${fmtRupiah(Number(sub?.contract || 0))} × progres ${wo.progress}%), sudah diajukan ${fmtRupiah(used)}`, "info");
      return;
    }
    const msList = sub ? milestonesOf(sub) : [];
    const ms = msList.find((m) => m.title === termForm.milestone);
    if (!ms) { toast("Termin wajib merujuk milestone SOW kontrak sub tersebut", "info"); return; }
    const msCap = Number(sub?.contract || 0) * Number(ms.pct || 0) / 100;
    const msUsed = payments.filter((t) => t.sub === termForm.sub && t.milestone === ms.title && t.status !== "Ditolak").reduce((s, t) => s + Number(t.amount || 0), 0);
    if (msUsed + amount > msCap) {
      toast(`Termin melebihi pagu milestone ${ms.title}: maks ${fmtRupiah(msCap)} (${ms.pct}% kontrak), sudah dipakai ${fmtRupiah(msUsed)}`, "info");
      return;
    }
    const created = add("termins", {
      sub: termForm.sub, woId: wo.id, milestone: ms.title, progress: `${wo.id} (${wo.progress}%)`, amount,
      pphPct, retPct, status: "Draf", date: todayISO(),
    }, { action: "mengajukan termin", module: "Subkontraktor" });
    toast(`Termin ${created.id} diajukan (Draf)`);
    setShowTerm(false);
    setTermForm({ sub: "", wo: "", milestone: "", amount: "", pphPct: "0.5", retPct: "5" });
  };

  const stepTerm = (p: StoreItem, next: string) => {
    if (next === "Lunas") {
      setTermPay(p);
      setProof({ date: todayISO(), method: "Transfer", ref: "" });
      setWithholdingRef("");
      return;
    }
    if (next === "Ditolak") {
      setRejectTerm(p);
      return;
    }
    update("termins", p.id, { status: next });
    toast(`${p.id} → ${next}`);
  };

  const confirmBuktiTerm = () => {
    if (!termPay) return;
    if (!proof.date) { toast("Tanggal bayar wajib diisi", "info"); return; }
    if (!proof.ref.trim()) { toast("No. referensi wajib diisi", "info"); return; }
    // PPh variatif RawData (cth PAK YUSUF 0.5%): potong saat bayar + simpan bukti potong.
    const pphAmt = Math.round(Number(termPay.amount || 0) * pphOf(termPay) / 100);
    const retAmt = Math.round(Number(termPay.amount || 0) * retOf(termPay) / 100);
    const wo = workOrders.find((w) => w.id === termPay.woId);
    const penalty = Math.max(0, Math.round(Number(wo?.penaltyAmount || 0)));
    const netoPayable = Math.max(0, Math.round(netoOf(termPay)) - penalty);
    update("termins", termPay.id, {
      status: "Lunas", paidAt: proof.date, paidMethod: proof.method, paidRef: proof.ref.trim(),
      pphAmt, retAmt, penaltyApplied: penalty, withholdingRef: withholdingRef.trim(),
    });
    // Termin Lunas → hutang usaha: 1 baris neto (Belum Dibayar, denda mengurangi neto)
    // + 1 baris retensi (Ditahan, dirilis setelah WO Selesai). Cek duplikat via kunci po.
    const poNeto = `TERM-${termPay.id}`;
    const poRet = `TERM-${termPay.id}-R`;
    const existingPo = new Set((data.payables ?? []).map((a) => String(a.po ?? "")));
    const vesselProj = String(wo?.project ?? "");
    if (!existingPo.has(poNeto)) {
      add("payables", {
        v: String(termPay.sub ?? ""), kodePembantu: String(termPay.sub ?? ""),
        po: poNeto, openAwal: 0, amt: netoPayable,
        due: proof.date, pph: `${pphOf(termPay)}%`, st: "Belum Dibayar",
        vessel: vesselProj, project: vesselProj,
        item: String(termPay.milestone ?? termPay.progress ?? ""),
        pay1: 0, pay2: 0,
        note: `Termin ${termPay.id} neto; PPh ${fmtRupiah(pphAmt)}; retensi ${fmtRupiah(retAmt)} ditahan; denda ${fmtRupiah(penalty)}`,
        terminId: termPay.id,
      }, { action: "mencatat hutang termin", module: "Subkontraktor" });
    }
    if (retAmt > 0 && !existingPo.has(poRet)) {
      add("payables", {
        v: String(termPay.sub ?? ""), kodePembantu: String(termPay.sub ?? ""),
        po: poRet, openAwal: 0, amt: retAmt,
        due: proof.date, pph: `${pphOf(termPay)}%`, st: "Ditahan",
        vessel: vesselProj, project: vesselProj,
        item: `Retensi ${termPay.milestone ?? termPay.id}`,
        pay1: 0, pay2: 0,
        note: `Retensi termin ${termPay.id} — rilis setelah WO Selesai`,
        terminId: termPay.id,
      }, { action: "menahan retensi termin", module: "Subkontraktor" });
    }
    log("melunasi termin", `${termPay.id} via ${proof.method} ${proof.ref.trim()} · PPh ${pphOf(termPay)}% = ${fmtRupiah(pphAmt)} · hutang ${poNeto} ${fmtRupiah(netoPayable)}${retAmt > 0 ? ` + retensi ${fmtRupiah(retAmt)} ditahan` : ""}`, "Subkontraktor");
    toast(`${termPay.id} lunas — PPh ${fmtRupiah(pphAmt)} dipotong · hutang ${fmtRupiah(netoPayable)} tercatat`);
    setTermPay(null);
    setWithholdingRef("");
  };

  const confirmRelease = () => {
    if (!releaseTerm) return;
    const wo = workOrders.find((w) => w.id === releaseTerm.woId);
    if (!wo || wo.status !== "Selesai") { toast("Retensi hanya bisa dirilis setelah WO Selesai", "info"); return; }
    if (!releaseForm.date) { toast("Tanggal rilis wajib diisi", "info"); return; }
    if (!releaseForm.ba.trim()) { toast("No. berita acara wajib diisi", "info"); return; }
    update("termins", releaseTerm.id, {
      status: "Retensi Released", releasedAt: releaseForm.date, releaseBA: releaseForm.ba.trim(),
    });
    // Baris retensi Ditahan → Belum Dibayar agar bisa dibayar via hutang usaha.
    const poRet = `TERM-${releaseTerm.id}-R`;
    const held = (data.payables ?? []).find((a) => String(a.po ?? "") === poRet && String(a.st ?? "") === "Ditahan");
    if (held) {
      update("payables", held.id, { st: "Belum Dibayar" });
      log("merilis retensi hutang", `${held.id} (${poRet}) → Belum Dibayar`, "Subkontraktor");
    }
    log("merilis retensi", `${releaseTerm.id} · BA ${releaseForm.ba.trim()} · ${fmtTanggal(releaseForm.date)}`, "Subkontraktor");
    toast(`${releaseTerm.id} — retensi dirilis${held ? " · hutang retensi siap dibayar" : ""}`);
    setReleaseTerm(null);
    setReleaseForm({ date: todayISO(), ba: "" });
  };

  const saveTimesheet = () => {
    if (!tsForm.wo || !tsForm.employee || !tsForm.date) { toast("WO, karyawan & tanggal wajib diisi", "info"); return; }
    const hours = Number(tsForm.hours);
    if (!Number.isFinite(hours) || hours <= 0) { toast("Jam kerja harus lebih dari 0", "info"); return; }
    const created = add("timesheets", {
      woId: tsForm.wo, employeeId: tsForm.employee, date: tsForm.date, hours, note: tsForm.note.trim(),
    }, { action: "mencatat timesheet", module: "Subkontraktor" });
    toast(`Timesheet ${created.id} dicatat (${hours} jam)`);
    setShowTs(false);
    setTsForm({ wo: "", employee: "", date: todayISO(), hours: "", note: "" });
  };

  const saveRate = () => {
    if (!rateForm.wo) { toast("Pilih WO dulu", "info"); return; }
    const rate = Number(rateForm.rate);
    if (!Number.isFinite(rate) || rate < 0) { toast("Rate tidak valid", "info"); return; }
    update("workOrders", rateForm.wo, { rate });
    log("menetapkan rate WO", `${rateForm.wo} · ${fmtRupiah(rate)}/jam`, "Subkontraktor");
    toast(`Rate ${rateForm.wo} disimpan`);
    setRateForm({ wo: "", rate: "" });
  };

  return (
    <div>
      <PageHeader
        title="Subkontraktor & Pihak Ketiga"
        subtitle="Kontrak, work order, termin, dan evaluasi kinerja"
        icon={<HardHat className="h-5 w-5" />}
        actions={<button className="btn-primary-gradient" onClick={() => setShowSub(true)}><Plus className="h-4 w-4" /> Registrasi Sub</button>}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Subkontraktor Aktif" value={String(subcontractors.filter((s) => s.status === "Aktif").length)} icon={<HardHat className="h-5 w-5" />} chip="navy" spark={subActiveTrend} hint="Terdaftar & tersertifikasi" />
        <KpiCard label="Nilai Kontrak Aktif" value={fmtMiliar(subcontractors.reduce((s, x) => s + Number(x.contract || 0), 0))} icon={<FileSignature className="h-5 w-5" />} chip="teal" spark={subContractTrend} />
        <KpiCard label="Work Order Berjalan" value={String(runningWo)} hint="Sedang eksekusi" icon={<HardHat className="h-5 w-5" />} chip="amber" spark={woTrend} />
        <KpiCard label="Rating Rata-rata" value={`${avgRating}%`} delta="Kinerja baik" deltaDirection="up" icon={<Star className="h-5 w-5" />} chip="violet" spark={ratingTrend} />
      </div>

      <div className="mt-4 card">
        <Tabs tabs={["Subkontraktor", "Work Order", "Termin & Pembayaran", "Timesheet", "Kepatuhan K3"]} active={tab} onChange={setTab} />
        <div className="p-4">
          {tab === "Subkontraktor" && (
            <div className="space-y-4">
              <Card>
                <CardHeader title="Evaluasi Kinerja Subkontraktor" subtitle="Skor biaya, kualitas, ketepatan kirim & keselamatan" />
                <div className="h-52 p-4 pt-0 sm:h-60">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={subcontractorScore} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e9eff4" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="#8aa2b6" axisLine={false} tickLine={false} interval={0} />
                      <YAxis domain={[70, 100]} stroke="#8aa2b6" axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTooltip formatter={(v) => `${v}`} />} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="cost" name="Biaya" fill="#2e9ad4" radius={[3, 3, 0, 0]} barSize={14} />
                      <Bar dataKey="quality" name="Kualitas" fill="#0b3a63" radius={[3, 3, 0, 0]} barSize={14} />
                      <Bar dataKey="delivery" name="Ketepatan" fill="#0d9488" radius={[3, 3, 0, 0]} barSize={14} />
                      <Bar dataKey="safety" name="K3" fill="#f59e0b" radius={[3, 3, 0, 0]} barSize={14} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
              <div className="flex justify-end">
                <select className="input max-w-56 text-xs" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} aria-label="Filter tipe kontrak">
                  <option>Semua</option>
                  {CONTRACT_TYPES.map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredSubs.map((s) => (
                <Card key={s.id} className="p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-navy-900 truncate" title={String(s.name)}>{s.name}</p>
                      <p className="text-xs text-steel-500 truncate" title={String(s.services)}>{s.services}</p>
                    </div>
                    <Badge tone={toneMap[normSub(s.status)] ?? "gray"}>{normSub(s.status)}</Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Badge tone="navy">{s.contractType ?? "Borongan"}</Badge>
                    <Badge tone="gray">Skema: {s.payScheme ?? "unit"}</Badge>
                    {(() => {
                      const left = daysUntil(String(s.bgExpiry ?? ""));
                      if (!s.bgExpiry) return <Badge tone="gray">Tanpa BG</Badge>;
                      if (left === null) return null;
                      if (left < 0) return <Badge tone="red">BG Expired</Badge>;
                      if (left <= 30) return <Badge tone="amber">BG H-{left}</Badge>;
                      return <Badge tone="green">BG Aman</Badge>;
                    })()}
                    <Badge tone="teal">{milestonesOf(s).length} milestone</Badge>
                  </div>
                  {s.noBG ? (
                    <p className="mt-1.5 text-xs text-steel-500">BG {s.noBG} · {fmtRupiah(Number(s.bgValue || 0))}{s.bgExpiry ? ` · exp ${fmtTanggal(String(s.bgExpiry))}` : ""}</p>
                  ) : null}
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-lg bg-surface p-2.5">
                      <p className="text-xs text-steel-500">Rating</p>
                      <p className="font-semibold text-navy-900">{s.rating}%</p>
                    </div>
                    <div className="rounded-lg bg-surface p-2.5">
                      <p className="text-xs text-steel-500">K3</p>
                      <p className="font-semibold text-navy-900">{s.k3}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex justify-between text-xs text-steel-500">
                    <span>Kontrak {fmtMiliar(s.contract)}</span>
                    <span>{workOrders.filter((w) => w.sub === s.name && w.status !== "Selesai").length} WO aktif</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5 border-t border-steel-100 pt-3">
                    <button
                      className="btn-secondary text-xs"
                      aria-label={`Kelola milestone ${s.name}`}
                      onClick={() => { setMsSub(s); setMsForm({ title: "", pct: "", due: "" }); }}
                    >
                      Milestone SOW
                    </button>
                    {SUB_NEXT[normSub(s.status)].map((next) => (
                      <button
                        key={next}
                        className="btn-secondary text-xs"
                        aria-label={`Ubah ${s.name} menjadi ${next}`}
                        onClick={() => setSubConfirm({ id: s.id, name: s.name, next })}
                      >
                        → {next}
                      </button>
                    ))}
                  </div>
                </Card>
              ))}
              </div>
            </div>
          )}

          {tab === "Work Order" && (
            <div>
              <div className="mb-3 flex justify-end">
                <button className="btn-secondary text-xs" onClick={() => setShowWo(true)}><Plus className="h-3.5 w-3.5" /> Terbitkan WO</button>
              </div>
              <div className="space-y-3">
                {workOrders.map((w) => (
                  <Card key={w.id} className="p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="font-mono text-sm font-semibold text-navy-900 shrink-0">{w.id}</div>
                        <div className="min-w-0 text-sm text-steel-600">
                          <p className="truncate" title={`${w.sub} · ${w.project}`}>{w.sub} · {w.project}</p>
                          <p className="text-xs text-steel-500 truncate" title={String(w.scope)}>{w.scope}</p>
                          {w.date && <p className="text-xs text-steel-400">{fmtTanggal(w.date)}</p>}
                          {w.targetDate && <p className="text-xs text-steel-500">Target {fmtTanggal(String(w.targetDate))} · denda {Number(w.penaltyPct || 0)}%/hari</p>}
                          {Number(w.rate || 0) > 0 && <p className="text-xs text-steel-500">Rate {fmtRupiah(Number(w.rate))}/jam</p>}
                          {(() => {
                            if (Number(w.progress || 0) >= 100 || !w.targetDate) return null;
                            const late = daysLate(String(w.targetDate));
                            if (late <= 0) return null;
                            const sub = subcontractors.find((s) => s.name === w.sub);
                            const base = Number(sub?.contract || 0);
                            const perDay = Number(w.penaltyPct || 0);
                            const usulan = Math.min(base * perDay / 100 * late, base * 5 / 100);
                            return (
                              <p className="text-xs font-medium text-rose-600">
                                Telat {late} hari · usulan denda {fmtRupiah(Math.round(usulan))} (maks 5% kontrak)
                                {w.penaltyAt ? ` · tercatat ${fmtTanggal(String(w.penaltyAt))}` : ""}
                              </p>
                            );
                          })()}
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <ProgressBar value={w.progress} className="w-24" tone={w.status === "Selesai" ? "green" : "navy"} />
                          <span className="text-xs font-medium">{w.progress}%</span>
                        </div>
                        <Badge tone={toneMap[w.status] ?? "gray"}>{w.status}</Badge>
                        {w.status !== "Selesai" && (
                          <button className="btn-secondary text-xs" aria-label={`Update progres ${w.id}`} onClick={() => { setWoProg(w); setProgVal(String(w.progress)); setProgNote(""); }}>Update</button>
                        )}
                        {Number(w.progress || 0) < 100 && w.targetDate && daysLate(String(w.targetDate)) > 0 && !w.penaltyAt && (
                          <button className="btn-secondary text-xs" aria-label={`Catat denda ${w.id}`} onClick={() => recordPenalty(w)}>Catat Denda</button>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
                {workOrders.length === 0 && <p className="py-6 text-center text-sm text-steel-400">Belum ada WO.</p>}
              </div>
            </div>
          )}

          {tab === "Termin & Pembayaran" && (
            <div>
              <div className="mb-3 flex justify-end">
                <button className="btn-secondary text-xs" onClick={() => setShowTerm(true)}><Plus className="h-3.5 w-3.5" /> Ajukan Termin</button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-surface sticky top-0 z-10">
                    <tr><SortTh label="Termin" sortKey="termin" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label="Subkontraktor" sortKey="sub" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label="WO / Progres" sortKey="wo" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label="Nilai" sortKey="nilai" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label="PPh" sortKey="pph" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label="Retensi" sortKey="retensi" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label="Neto" sortKey="neto" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label="Tanggal" sortKey="tanggal" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label="Status" sortKey="status" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><th className="th">Aksi</th></tr>
                  </thead>
                  <tbody className="divide-y divide-steel-100">
                    {sortRows(payments, sort, (p, key) =>
                      key === "termin" ? String(p.id ?? "") : key === "sub" ? String(p.sub ?? "") : key === "wo" ? String(p.woId ?? p.progress ?? "") : key === "nilai" ? Number(p.amount ?? 0) : key === "pph" ? Number(p.amount ?? 0) * pphOf(p) / 100 : key === "retensi" ? Number(p.amount ?? 0) * retOf(p) / 100 : key === "neto" ? netoOf(p) : key === "tanggal" ? String(p.date ?? "") : String(p.status ?? "")
                    ).map((p) => {
                      const wo = workOrders.find((w) => w.id === p.woId);
                      const canRelease = normTerm(p.status) === "Lunas" && retOf(p) > 0 && wo?.status === "Selesai";
                      return (
                      <tr key={p.id} className="hover:bg-surface">
                        <td className="td font-mono font-medium text-navy-900">{p.id}</td>
                        <td className="td text-steel-600 truncate" title={String(p.sub)}>{p.sub}</td>
                        <td className="td font-mono text-xs text-steel-500">{p.progress}{p.milestone ? <span className="block text-steel-400">MS: {p.milestone}</span> : null}</td>
                        <td className="td font-semibold">{fmtMiliar(p.amount)}</td>
                        <td className="td text-steel-600">{fmtRupiah(Number(p.amount || 0) * pphOf(p) / 100)} <span className="text-xs text-steel-400">({pphOf(p)}%)</span></td>
                        <td className="td text-steel-600">{fmtRupiah(Number(p.amount || 0) * retOf(p) / 100)} <span className="text-xs text-steel-400">({retOf(p)}%)</span></td>
                        <td className="td font-semibold text-emerald-600">{fmtRupiah(netoOf(p))}</td>
                        <td className="td text-steel-600">{fmtTanggal(p.date)}</td>
                        <td className="td">
                          <Badge tone={toneMap[normTerm(p.status)] ?? "gray"}>{normTerm(p.status)}</Badge>
                          {p.status === "Retensi Released" && p.releasedAt && <p className="mt-1 text-xs text-steel-500">BA {p.releaseBA} · {fmtTanggal(p.releasedAt)}</p>}
                        </td>
                        <td className="td">
                          <div className="flex flex-wrap gap-1.5">
                            {termNext(p.status).map((next) => (
                              <button
                                key={next}
                                className={next === "Lunas" ? "btn-primary text-xs" : "btn-secondary text-xs"}
                                aria-label={`${next} ${p.id}`}
                                onClick={() => stepTerm(p, next)}
                              >
                                {next === "Lunas" ? "Bayar" : next === "Diajukan" ? "Ajukan" : next}
                              </button>
                            ))}
                            {canRelease && (
                              <button className="btn-primary text-xs" aria-label={`Release retensi ${p.id}`} onClick={() => { setReleaseTerm(p); setReleaseForm({ date: todayISO(), ba: "" }); }}>
                                Release Retensi
                              </button>
                            )}
                            {termNext(p.status).length === 0 && !canRelease && <span className="text-xs text-steel-400">—</span>}
                          </div>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === "Timesheet" && (
            <div className="space-y-4">
              <div className="flex flex-wrap justify-end gap-2">
                <button className="btn-secondary text-xs" onClick={() => setShowTs(true)}><Plus className="h-3.5 w-3.5" /> Catat Timesheet</button>
              </div>
              <Card className="p-4">
                <h3 className="text-sm font-semibold text-navy-900">Rekap Jam per WO</h3>
                <div className="mt-2 space-y-2">
                  {workOrders.map((w) => {
                    const hours = hoursByWo(w.id);
                    const sub = subcontractors.find((s) => s.name === w.sub);
                    const scheme = String(sub?.payScheme ?? "unit");
                    const rate = Number(w.rate || 0);
                    const usulan = (scheme === "harian" || scheme === "jam") && rate > 0 ? hours * rate : 0;
                    return (
                      <div key={w.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-steel-100 py-2 text-sm">
                        <div>
                          <p className="font-mono font-medium text-navy-900">{w.id} <span className="font-sans text-xs text-steel-500">· {w.sub}</span></p>
                          <p className="text-xs text-steel-500">Total {hours} jam · skema {scheme}{rate > 0 ? ` · rate ${fmtRupiah(rate)}/jam` : ""}</p>
                        </div>
                        {usulan > 0 && <Badge tone="teal">Usulan termin {fmtRupiah(usulan)}</Badge>}
                      </div>
                    );
                  })}
                  {workOrders.length === 0 && <p className="text-xs text-steel-400">Belum ada WO.</p>}
                </div>
                <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-steel-100 pt-3">
                  <Field label="WO (rate per jam)">
                    <select className="input" value={rateForm.wo} onChange={(e) => setRateForm({ ...rateForm, wo: e.target.value })}>
                      <option value="">Pilih WO…</option>
                      {workOrders.map((w) => <option key={w.id} value={w.id}>{w.id} ({w.sub})</option>)}
                    </select>
                  </Field>
                  <Field label="Rate (Rp/jam)">
                    <input type="number" min={0} className="input" value={rateForm.rate} onChange={(e) => setRateForm({ ...rateForm, rate: e.target.value })} placeholder="cth: 75000" />
                  </Field>
                  <button className="btn-secondary text-xs" onClick={saveRate}>Simpan Rate</button>
                </div>
              </Card>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-surface sticky top-0 z-10">
                    <tr><SortTh label="ID" sortKey="id" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} /><SortTh label="WO" sortKey="wo" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} /><SortTh label="Karyawan" sortKey="karyawan" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} /><SortTh label="Tanggal" sortKey="tanggal" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} /><SortTh label="Jam" sortKey="jam" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} /><SortTh label="Catatan" sortKey="catatan" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} /></tr>
                  </thead>
                  <tbody className="divide-y divide-steel-100">
                    {sortRows(timesheets, sort2, (t, key) =>
                      key === "id" ? String(t.id ?? "") : key === "wo" ? String(t.woId ?? "") : key === "karyawan" ? String(t.employeeId ?? "") : key === "tanggal" ? String(t.date ?? "") : key === "jam" ? Number(t.hours ?? 0) : String(t.note ?? "")
                    ).map((t) => (
                      <tr key={t.id} className="hover:bg-surface">
                        <td className="td font-mono font-medium text-navy-900">{t.id}</td>
                        <td className="td font-mono text-xs text-steel-600">{t.woId}</td>
                        <td className="td text-steel-600 text-xs">{t.employeeId}</td>
                        <td className="td text-steel-600">{fmtTanggal(t.date)}</td>
                        <td className="td font-semibold">{t.hours} jam</td>
                        <td className="td text-steel-600 text-xs">{t.note ?? "—"}</td>
                      </tr>
                    ))}
                    {timesheets.length === 0 && <tr><td colSpan={6} className="td text-center text-steel-400">Belum ada timesheet.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === "Kepatuhan K3" && (
            <div className="space-y-3">
              {subcontractors.map((s) => {
                const list = incidentsOfSub(s.name);
                const comp = complianceOf(s.k3);
                return (
                  <Card key={s.id} className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-navy-900">{s.name}</p>
                        <p className="text-xs text-steel-500 mt-0.5">{woOfSub(s.name).length} WO · rating K3 {s.k3}</p>
                      </div>
                      <Badge tone={comp.tone}>{comp.label} · {list.length} insiden</Badge>
                    </div>
                    <div className="mt-2 space-y-1">
                      {list.map((i) => (
                        <p key={i.id} className="text-xs text-steel-600">{i.id} · {i.type} · {fmtTanggal(i.date)} · {i.location} — {i.desc}</p>
                      ))}
                      {list.length === 0 && <p className="text-xs text-steel-400">Tidak ada insiden pada proyek yang dikerjakan sub ini.</p>}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Modal registrasi */}
      <Modal open={showSub} onClose={() => setShowSub(false)} title="Registrasi Subkontraktor" subtitle="Masuk tahap Kualifikasi terlebih dahulu"
        footer={<><button className="btn-secondary" onClick={() => setShowSub(false)}>Batal</button><button className="btn-primary" onClick={saveSub}>Registrasi</button></>}>
        <div className="space-y-3">
          <Field label="Nama perusahaan"><input className="input" value={subForm.name} onChange={(e) => setSubForm({ ...subForm, name: e.target.value })} placeholder="cth: PT Lasindo Jaya" /></Field>
          <Field label="Layanan"><input className="input" value={subForm.services} onChange={(e) => setSubForm({ ...subForm, services: e.target.value })} placeholder="cth: Fabrikasi & Blasting" /></Field>
          <FormGrid>
            <Field label="Nilai kontrak (Rp)"><input type="number" min={0} className="input" value={subForm.contract} onChange={(e) => setSubForm({ ...subForm, contract: e.target.value })} /></Field>
            <Field label="Rating K3">
              <select className="input" value={subForm.k3} onChange={(e) => setSubForm({ ...subForm, k3: e.target.value })}>
                {["A+", "A", "B+", "B", "C"].map((k) => <option key={k}>{k}</option>)}
              </select>
            </Field>
            <Field label="Tipe kontrak">
              <select className="input" value={subForm.contractType} onChange={(e) => setSubForm({ ...subForm, contractType: e.target.value })}>
                {CONTRACT_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Skema bayar">
              <select className="input" value={subForm.payScheme} onChange={(e) => setSubForm({ ...subForm, payScheme: e.target.value })}>
                {PAY_SCHEMES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="No. bank garansi"><input className="input font-mono" value={subForm.noBG} onChange={(e) => setSubForm({ ...subForm, noBG: e.target.value })} placeholder="cth: BG-2026-081" /></Field>
            <Field label="Expiry BG"><input type="date" className="input" value={subForm.bgExpiry} onChange={(e) => setSubForm({ ...subForm, bgExpiry: e.target.value })} /></Field>
            <Field label="Nilai BG (Rp)"><input type="number" min={0} className="input" value={subForm.bgValue} onChange={(e) => setSubForm({ ...subForm, bgValue: e.target.value })} placeholder="cth: 500000000" /></Field>
          </FormGrid>
        </div>
      </Modal>

      {/* Modal kelola milestone SOW */}
      <Modal open={msSub !== null} onClose={() => setMsSub(null)} title={`Milestone SOW — ${msSub?.name ?? ""}`} subtitle="Termin hanya bisa merujuk milestone di sini"
        footer={<button className="btn-secondary" onClick={() => setMsSub(null)}>Tutup</button>}>
        <div className="space-y-3">
          <div className="space-y-2">
            {msSub && milestonesOf(msSub).map((m, idx) => (
              <div key={idx} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-steel-100 px-3 py-2 text-sm">
                <div>
                  <p className="font-medium text-navy-900">{m.title}</p>
                  <p className="text-xs text-steel-500">{m.pct}% · due {fmtTanggal(m.due)} · pagu {fmtRupiah(Number(msSub.contract || 0) * Number(m.pct || 0) / 100)}</p>
                </div>
                <button className="btn-secondary text-xs" onClick={() => removeMilestone(idx)}>Hapus</button>
              </div>
            ))}
            {(!msSub || milestonesOf(msSub).length === 0) && <p className="text-xs text-steel-400">Belum ada milestone.</p>}
          </div>
          <FormGrid>
            <Field label="Judul milestone"><input className="input" value={msForm.title} onChange={(e) => setMsForm({ ...msForm, title: e.target.value })} placeholder="cth: Fabrikasi 50%" /></Field>
            <Field label="Bobot (%)"><input type="number" min={0} max={100} className="input" value={msForm.pct} onChange={(e) => setMsForm({ ...msForm, pct: e.target.value })} placeholder="cth: 30" /></Field>
            <Field label="Due date"><input type="date" className="input" value={msForm.due} onChange={(e) => setMsForm({ ...msForm, due: e.target.value })} /></Field>
          </FormGrid>
          <button className="btn-primary text-xs" onClick={saveMilestone}><Plus className="h-3.5 w-3.5" /> Tambah Milestone</button>
        </div>
      </Modal>

      {/* Konfirmasi status subkontraktor */}
      <ConfirmModal
        open={subConfirm !== null}
        title={`Ubah ${subConfirm?.name ?? ""} → ${subConfirm?.next ?? ""}?`}
        desc="Perubahan status subkontraktor memengaruhi kelayakan penugasan WO baru."
        confirmLabel="Ya, ubah"
        onCancel={() => setSubConfirm(null)}
        onConfirm={() => { if (subConfirm) { update("subcontractors", subConfirm.id, { status: subConfirm.next }); toast(`${subConfirm.name} → ${subConfirm.next}`); } setSubConfirm(null); }}
      />

      {/* Modal WO */}
      <Modal open={showWo} onClose={() => setShowWo(false)} title="Terbitkan Work Order"
        footer={<><button className="btn-secondary" onClick={() => setShowWo(false)}>Batal</button><button className="btn-primary" onClick={saveWo}>Terbitkan</button></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label="Subkontraktor">
              <select className="input" value={woForm.sub} onChange={(e) => setWoForm({ ...woForm, sub: e.target.value })}>
                <option value="">Pilih…</option>
                {subcontractors.filter((s) => s.status === "Aktif").map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="Proyek">
              <select className="input" value={woForm.project} onChange={(e) => setWoForm({ ...woForm, project: e.target.value })}>
                <option value="">Pilih…</option>
                {projectOptions.filter((p) => p.status !== "Selesai").map((p) => <option key={p.id} value={p.id}>{p.id} · {p.vessel}</option>)}
              </select>
            </Field>
          </FormGrid>
          <Field label="Lingkup pekerjaan"><input className="input" value={woForm.scope} onChange={(e) => setWoForm({ ...woForm, scope: e.target.value })} placeholder="cth: Fabrikasi section 8-10" /></Field>
          <FormGrid>
            <Field label="Target selesai"><input type="date" className="input" value={woForm.targetDate} onChange={(e) => setWoForm({ ...woForm, targetDate: e.target.value })} /></Field>
            <Field label="Denda per hari (%)" hint="Default 0,1% · maks 5%"><input type="number" min={0} max={5} step={0.1} className="input" value={woForm.penaltyPct} onChange={(e) => setWoForm({ ...woForm, penaltyPct: e.target.value })} /></Field>
          </FormGrid>
        </div>
      </Modal>

      {/* Modal progres WO */}
      <Modal open={woProg !== null} onClose={() => setWoProg(null)} title={`Update progres ${woProg?.id ?? ""}`}
        footer={<><button className="btn-secondary" onClick={() => setWoProg(null)}>Batal</button><button className="btn-primary" onClick={saveWoProgress}>Simpan</button></>}>
        <div className="space-y-3">
          <Field label={`Progres: ${progVal}% (saat ini ${woProg?.progress ?? 0}%)`}>
            <input type="range" min={0} max={100} value={Number(progVal) || 0} onChange={(e) => setProgVal(e.target.value)} className="w-full" />
          </Field>
          <Field label="Catatan" hint="Wajib diisi jika progres dimundurkan">
            <input className="input" value={progNote} onChange={(e) => setProgNote(e.target.value)} placeholder="cth: Revisi hasil QC section 4" />
          </Field>
        </div>
      </Modal>

      {/* Konfirmasi WO selesai 100% */}
      <ConfirmModal
        open={confirmFinish !== null}
        title={`Selesaikan ${confirmFinish?.id ?? ""}?`}
        desc="Progres 100% menandai WO Selesai dan mengunci update progres berikutnya."
        confirmLabel="Ya, selesaikan"
        onCancel={() => setConfirmFinish(null)}
        onConfirm={() => { if (confirmFinish) applyWoProgress(confirmFinish.id, confirmFinish.v, confirmFinish.note); setConfirmFinish(null); setWoProg(null); setProgNote(""); }}
      />

      {/* Modal termin */}
      <Modal open={showTerm} onClose={() => setShowTerm(false)} title="Ajukan Termin Pembayaran" subtitle="WO mengikuti subkontraktor yang dipilih"
        footer={<><button className="btn-secondary" onClick={() => setShowTerm(false)}>Batal</button><button className="btn-primary" onClick={saveTerm}>Ajukan</button></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label="Subkontraktor">
              <select className="input" value={termForm.sub} onChange={(e) => setTermForm({ ...termForm, sub: e.target.value, wo: "", milestone: "" })}>
                <option value="">Pilih…</option>
                {subcontractors.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="Work Order">
              <select className="input" value={termForm.wo} onChange={(e) => setTermForm({ ...termForm, wo: e.target.value })} disabled={!termForm.sub}>
                <option value="">{termForm.sub ? "Pilih WO…" : "Pilih sub dulu…"}</option>
                {termWoOptions.map((w) => <option key={w.id} value={w.id}>{w.id} ({w.progress}%)</option>)}
              </select>
            </Field>
            <Field label="Milestone SOW" hint="Wajib · kumulatif per milestone divalidasi">
              <select className="input" value={termForm.milestone} onChange={(e) => setTermForm({ ...termForm, milestone: e.target.value })} disabled={!termForm.sub}>
                <option value="">{termForm.sub ? (termMsList.length ? "Pilih milestone…" : "Belum ada milestone — kelola dulu") : "Pilih sub dulu…"}</option>
                {termMsList.map((m) => <option key={m.title} value={m.title}>{m.title} ({m.pct}% · due {fmtTanggal(m.due)})</option>)}
              </select>
            </Field>
          </FormGrid>
          {termSub && termWo && (
            <p className="rounded-lg bg-surface px-3 py-2 text-xs text-steel-600">
              Batas termin WO ini {fmtRupiah(termCap)} (kontrak {fmtRupiah(Number(termSub.contract || 0))} × progres {termWo.progress}%) · sudah diajukan {fmtRupiah(termUsed)}
              {termMs ? ` · pagu ${termMs.title} ${fmtRupiah(termMsCap)} · terpakai ${fmtRupiah(termMsUsed)}` : ""}
              {termTsRef > 0 ? ` · referensi timesheet ${termTsHours} jam × ${fmtRupiah(Number(termWo.rate))} = ${fmtRupiah(termTsRef)}` : ""}
            </p>
          )}
          <Field label="Nilai termin (Rp)"><input type="number" min={0} className="input" value={termForm.amount} onChange={(e) => setTermForm({ ...termForm, amount: e.target.value })} /></Field>
          <FormGrid>
            <Field label="PPh — variatif RawData (0.5% final / 2%)">
              <select className="input" value={termForm.pphPct} onChange={(e) => setTermForm({ ...termForm, pphPct: e.target.value })}>
                <option value="0.5">0.5% Final (cth Pak Yusuf)</option>
                <option value="2">2% PPh 23</option>
              </select>
            </Field>
            <Field label="Retensi (%)"><input type="number" min={0} max={100} className="input" value={termForm.retPct} onChange={(e) => setTermForm({ ...termForm, retPct: e.target.value })} /></Field>
          </FormGrid>
        </div>
      </Modal>

      {/* Modal bukti bayar termin */}
      <Modal open={termPay !== null} onClose={() => setTermPay(null)} title={`Bayar ${termPay?.id ?? ""}?`} subtitle={`${termPay?.sub ?? ""} · neto ${fmtRupiah(termPay ? netoOf(termPay) : 0)}`}
        footer={<><button className="btn-secondary" onClick={() => setTermPay(null)}>Batal</button><button className="btn-primary" onClick={confirmBuktiTerm}>Simpan Bukti Bayar</button></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label="Tanggal bayar"><input type="date" required className="input" value={proof.date} onChange={(e) => setProof({ ...proof, date: e.target.value })} /></Field>
            <Field label="Metode">
              <select className="input" value={proof.method} onChange={(e) => setProof({ ...proof, method: e.target.value })}>
                {["Transfer", "Tunai", "Giro"].map((m) => <option key={m}>{m}</option>)}
              </select>
            </Field>
          </FormGrid>
          <Field label="No. referensi" hint="Wajib — no. bukti transfer / kuitansi">
            <input className="input font-mono" value={proof.ref} onChange={(e) => setProof({ ...proof, ref: e.target.value })} placeholder="cth: TRF-2026-0914" />
          </Field>
          <Field label="No. bukti potong PPh (opsional)" hint={`PPh ${termPay ? pphOf(termPay) : ""}% = ${fmtRupiah(termPay ? Math.round(Number(termPay.amount || 0) * pphOf(termPay) / 100) : 0)} dipotong saat bayar`}>
            <input className="input font-mono" value={withholdingRef} onChange={(e) => setWithholdingRef(e.target.value)} placeholder="cth: BUPOT-2026-001" />
          </Field>
        </div>
      </Modal>

      {/* Konfirmasi penolakan termin */}
      <ConfirmModal
        open={rejectTerm !== null}
        title={`Tolak ${rejectTerm?.id ?? ""}?`}
        desc="Termin yang ditolak tidak dihitung dalam kumulatif batas WO."
        confirmLabel="Ya, tolak"
        onCancel={() => setRejectTerm(null)}
        onConfirm={() => { if (rejectTerm) { update("termins", rejectTerm.id, { status: "Ditolak" }); toast(`${rejectTerm.id} ditolak`); } setRejectTerm(null); }}
      />

      {/* Modal release retensi */}
      <Modal open={releaseTerm !== null} onClose={() => setReleaseTerm(null)} title={`Release Retensi ${releaseTerm?.id ?? ""}?`} subtitle="Hanya setelah WO Selesai · status menjadi Retensi Released"
        footer={<><button className="btn-secondary" onClick={() => setReleaseTerm(null)}>Batal</button><button className="btn-primary" onClick={confirmRelease}>Rilis Retensi</button></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label="Tanggal rilis"><input type="date" className="input" value={releaseForm.date} onChange={(e) => setReleaseForm({ ...releaseForm, date: e.target.value })} /></Field>
            <Field label="No. berita acara"><input className="input font-mono" value={releaseForm.ba} onChange={(e) => setReleaseForm({ ...releaseForm, ba: e.target.value })} placeholder="cth: BA-2026-118" /></Field>
          </FormGrid>
        </div>
      </Modal>

      {/* Modal timesheet */}
      <Modal open={showTs} onClose={() => setShowTs(false)} title="Catat Timesheet"
        footer={<><button className="btn-secondary" onClick={() => setShowTs(false)}>Batal</button><button className="btn-primary" onClick={saveTimesheet}>Simpan</button></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label="Work Order">
              <select className="input" value={tsForm.wo} onChange={(e) => setTsForm({ ...tsForm, wo: e.target.value })}>
                <option value="">Pilih WO…</option>
                {workOrders.filter((w) => w.status !== "Selesai").map((w) => <option key={w.id} value={w.id}>{w.id} · {w.sub}</option>)}
              </select>
            </Field>
            <Field label="Karyawan">
              <select className="input" value={tsForm.employee} onChange={(e) => setTsForm({ ...tsForm, employee: e.target.value })}>
                <option value="">Pilih…</option>
                {employeeOptions.map((e) => <option key={e.id} value={e.id}>{e.name} · {e.role}</option>)}
              </select>
            </Field>
            <Field label="Tanggal"><input type="date" className="input" value={tsForm.date} onChange={(e) => setTsForm({ ...tsForm, date: e.target.value })} /></Field>
            <Field label="Jam kerja"><input type="number" min={0} step={0.5} className="input" value={tsForm.hours} onChange={(e) => setTsForm({ ...tsForm, hours: e.target.value })} /></Field>
          </FormGrid>
          <Field label="Catatan"><input className="input" value={tsForm.note} onChange={(e) => setTsForm({ ...tsForm, note: e.target.value })} placeholder="cth: Fabrikasi section 5" /></Field>
        </div>
      </Modal>
    </div>
  );
}
