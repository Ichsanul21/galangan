import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Ship, FileCheck2, History, Plus, Pencil, ShieldCheck, ClipboardCheck, Anchor } from "lucide-react";
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
} from "../../components/ui";
import SparepartServiceSection from "../proyek/SparepartServiceSection";
import { useStore } from "../../data/store";
import { fmtBulan, fmtJumlah, fmtRupiah, fmtTanggal, monthISO, todayISO } from "../../utils/format";
import { COMPLIANCE_ITEMS, complianceSummary } from "./Vessels";

function monthDiff(expires: string, base: string): number | null {
  const m1 = /^(\d{4})-(\d{2})$/.exec(expires ?? "");
  const m2 = /^(\d{4})-(\d{2})$/.exec(base ?? "");
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
  const { data, update, add } = useStore();
  const v = data.vessels.find((x) => x.id === id) ?? data.vessels[0];

  const [showCert, setShowCert] = useState(false);
  const [certForm, setCertForm] = useState({ name: "", issued: monthISO(), expires: "" });
  const [showSurvey, setShowSurvey] = useState(false);
  const [surveyForm, setSurveyForm] = useState({ type: "Annual Survey", date: "", status: "Terjadwal" });
  const [tab, setTab] = useState("Sertifikat & Timeline");
  const [showSpec, setShowSpec] = useState(false);
  const [specForm, setSpecForm] = useState({ mmsi: "", gt: "", nt: "", bhp: "", engineType: "" });
  const [showPsc, setShowPsc] = useState(false);
  const [pscForm, setPscForm] = useState({ date: todayISO(), port: "", deficiencies: "0", status: "Bersih" });
  const [showDock, setShowDock] = useState(false);
  const [dockForm, setDockForm] = useState({ date: todayISO(), dock: "", scope: "", result: "", nextDue: "" });
  const [editingDock, setEditingDock] = useState<number | null>(null);
  const [planForm, setPlanForm] = useState({ year: String(new Date().getFullYear() + 1), type: "Docking", note: "" });
  const [bunkerForm, setBunkerForm] = useState({ date: todayISO(), jenis: "Solar", qty: "", satuan: "liter" });
  const [crewForm, setCrewForm] = useState({ name: "", role: "" });
  const [insForm, setInsForm] = useState({ polis: "", premi: "", expiry: "" });
  const [showIns, setShowIns] = useState(false);

  if (!v) return <p className="text-sm text-steel-500">Kapal tidak ditemukan.</p>;

  const nowMonth = todayISO().slice(0, 7);
  const projects = data.projects.filter((p) => p.vessel === v.name);
  const surveys = data.surveys.filter((s) => s.vessel === v.name);
  const certs = (v.certificates ?? []) as { name: string; issued?: string; expires: string }[];
  const slots = data.dockSlots.filter((s) => s.vessel === v.name);
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

  const saveCert = () => {
    if (!certForm.name.trim() || !certForm.issued || !certForm.expires) { toast("Nama, bulan terbit & masa berlaku wajib diisi", "info"); return; }
    update("vessels", v.id, { certificates: [...certs, { name: certForm.name.trim(), issued: certForm.issued, expires: certForm.expires }] });
    toast(`Sertifikat ditambahkan ke ${v.name}`);
    setShowCert(false);
    setCertForm({ name: "", issued: monthISO(), expires: "" });
  };

  const saveSurvey = () => {
    if (!surveyForm.date) { toast("Tanggal wajib diisi", "info"); return; }
    add("surveys", { vessel: v.name, type: surveyForm.type, status: surveyForm.status, date: surveyForm.date, classSurveyor: "BKI" },
      { action: "menjadwalkan survey", target: `${v.name} · ${surveyForm.type}`, module: "Kapal" });
    update("vessels", v.id, { history: [...(v.history ?? []), { date: surveyForm.date, event: `${surveyForm.type} (${surveyForm.status.toLowerCase()})`, type: "Survey" }] });
    toast("Survey terjadwal & masuk timeline");
    setShowSurvey(false);
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

  const saveSpec = () => {
    const gt = Number(specForm.gt);
    const bhp = Number(specForm.bhp);
    const nt = specForm.nt.trim() === "" ? 0 : Number(specForm.nt);
    if (!Number.isFinite(gt) || !Number.isFinite(bhp)) { toast("GT & BHP wajib diisi angka", "info"); return; }
    if (String(v.status) !== "Dalam Pembangunan" && (gt <= 0 || bhp <= 0)) { toast("GT & BHP harus lebih dari 0 (kecuali dalam pembangunan)", "info"); return; }
    if (!Number.isFinite(nt) || nt < 0) { toast("NT harus angka 0 atau lebih", "info"); return; }
    if (!specForm.engineType.trim()) { toast("Tipe mesin utama wajib diisi", "info"); return; }
    if (specForm.mmsi.trim() !== "" && !/^\d{9}$/.test(specForm.mmsi.trim())) { toast("MMSI harus 9 digit angka (atau kosongkan)", "info"); return; }
    update("vessels", v.id, {
      mmsi: specForm.mmsi.trim(),
      gt, nt, bhp,
      engineType: specForm.engineType.trim(),
    });
    toast("Spesifikasi kapal diperbarui");
    setShowSpec(false);
  };

  const setCompliance = (name: string, patch: { status?: string; date?: string }) => {
    const current = ((v.compliance ?? []) as { name: string; status: string; date: string }[]).slice();
    const idx = current.findIndex((r) => r.name === name);
    if (idx >= 0) {
      current[idx] = { ...current[idx], ...patch };
    } else {
      current.push({ name, status: patch.status ?? "", date: patch.date ?? "" });
    }
    update("vessels", v.id, { compliance: current });
  };

  const savePsc = () => {
    if (!pscForm.date || !pscForm.port.trim()) { toast("Tanggal & pelabuhan wajib diisi", "info"); return; }
    const def = Number(pscForm.deficiencies);
    if (!Number.isFinite(def) || def < 0) { toast("Jumlah defisiensi harus angka 0 atau lebih", "info"); return; }
    update("vessels", v.id, {
      psc: [...pscRows, { date: pscForm.date, port: pscForm.port.trim(), deficiencies: def, status: pscForm.status }],
    });
    toast("Catatan PSC ditambahkan");
    setShowPsc(false);
    setPscForm({ date: todayISO(), port: "", deficiencies: "0", status: "Bersih" });
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

  const saveDock = () => {
    if (!dockForm.date || !dockForm.dock.trim()) { toast("Tanggal & dok/galangan wajib diisi", "info"); return; }
    if (!dockForm.nextDue) { toast("Next due wajib diisi", "info"); return; }
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
    update("vessels", v.id, { dockHistory: next });
    toast(editingDock === null ? "Riwayat docking ditambahkan" : "Riwayat docking diperbarui");
    setShowDock(false);
    setEditingDock(null);
  };

  const savePlan = () => {
    const year = Number(planForm.year);
    if (!Number.isFinite(year) || year <= baseYear || year > baseYear + 5) { toast(`Tahun rencana harus ${baseYear + 1}–${baseYear + 5}`, "info"); return; }
    update("vessels", v.id, { plan5: [...plan5, { year, type: planForm.type, note: planForm.note.trim() }] });
    toast(`Rencana ${year} ditambahkan`);
    setPlanForm({ year: String(baseYear + 1), type: "Docking", note: "" });
  };

  const removePlan = (idx: number) => {
    update("vessels", v.id, { plan5: plan5.filter((_, i) => i !== idx) });
    toast("Rencana manual dihapus", "info");
  };

  const saveBunker = () => {
    if (!bunkerForm.date) { toast("Tanggal wajib diisi", "info"); return; }
    const qty = Number(bunkerForm.qty);
    if (!Number.isFinite(qty) || qty <= 0) { toast("Qty harus lebih dari 0", "info"); return; }
    if (!bunkerForm.satuan.trim()) { toast("Satuan wajib diisi", "info"); return; }
    update("vessels", v.id, { bunker: [...bunkerRows, { date: bunkerForm.date, jenis: bunkerForm.jenis, qty, satuan: bunkerForm.satuan.trim() }] });
    toast("Catatan bunker ditambahkan");
    setBunkerForm({ date: todayISO(), jenis: "Solar", qty: "", satuan: "liter" });
  };

  const saveCrew = () => {
    if (!crewForm.name.trim() || !crewForm.role.trim()) { toast("Nama & jabatan wajib diisi", "info"); return; }
    update("vessels", v.id, { crew: [...crewRows, { name: crewForm.name.trim(), role: crewForm.role.trim() }] });
    toast("Kru ditambahkan");
    setCrewForm({ name: "", role: "" });
  };

  const removeCrew = (idx: number) => {
    update("vessels", v.id, { crew: crewRows.filter((_, i) => i !== idx) });
    toast("Kru dihapus", "info");
  };

  const openIns = () => {
    setInsForm({ polis: String(insurance?.polis ?? ""), premi: insurance?.premi ? String(insurance.premi) : "", expiry: String(insurance?.expiry ?? "") });
    setShowIns(true);
  };

  const saveIns = () => {
    if (!insForm.polis.trim()) { toast("No. polis wajib diisi", "info"); return; }
    const premi = Number(insForm.premi || 0);
    if (!Number.isFinite(premi) || premi < 0) { toast("Premi harus 0 atau lebih", "info"); return; }
    if (!insForm.expiry) { toast("Expiry polis wajib diisi", "info"); return; }
    update("vessels", v.id, { insurance: { polis: insForm.polis.trim(), premi, expiry: insForm.expiry } });
    toast("Asuransi kapal disimpan");
    setShowIns(false);
  };

  return (
    <div>
      <Link to="/kapal" className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-ocean-600 hover:underline">
        <ArrowLeft className="h-4 w-4" /> Kembali ke Kapal
      </Link>
      <PageHeader
        title={v.name}
        subtitle={`${v.imo}${v.mmsi ? ` · MMSI ${v.mmsi}` : ""} · ${v.class} · ${v.flag} · Dibangun ${v.built}`}
        actions={
          <div className="flex items-center gap-2">
            <Badge tone={comp.state === "ok" ? "green" : comp.state === "issue" ? "red" : "gray"}>
              {comp.state === "ok" ? "Patuh" : comp.state === "issue" ? `Kepatuhan ${comp.valid}/${comp.total}` : "Belum dinilai"}
            </Badge>
            <select className="input w-auto py-1.5 text-sm" value={v.status}
              onChange={(e) => { update("vessels", v.id, { status: e.target.value }); toast(`Status kapal → ${e.target.value}`); }}>
              {["Dalam Operasi", "Dalam Docking", "Dalam Pembangunan", "Menganggur"].map((s) => <option key={s}>{s}</option>)}
            </select>
            <Badge tone="blue">{v.status}</Badge>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="LOA" value={`${v.loa} m`} icon={<Ship className="h-5 w-5" />} />
        <KpiCard label="Beam" value={`${v.beam} m`} icon={<Ship className="h-5 w-5" />} />
        <KpiCard label="Draft" value={`${v.draft} m`} icon={<Ship className="h-5 w-5" />} />
        <KpiCard label="Bollard Pull" value={`${v.bollard} T`} icon={<Ship className="h-5 w-5" />} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="MMSI" value={v.mmsi ? String(v.mmsi) : "—"} icon={<Ship className="h-5 w-5" />} />
        <KpiCard label="Tonase GT / NT" value={v.gt !== undefined ? `${v.gt} / ${v.nt ?? "—"}` : "—"} icon={<Ship className="h-5 w-5" />} />
        <KpiCard label="BHP Mesin Utama" value={v.bhp !== undefined && v.bhp !== "" ? `${v.bhp} HP` : "—"} icon={<Ship className="h-5 w-5" />} />
        <KpiCard label="Tipe Mesin" value={v.engineType ? String(v.engineType) : "—"} icon={<Ship className="h-5 w-5" />} />
      </div>

      {projects.length > 0 && (
        <Card className="mt-5 p-4">
          <h3 className="mb-2 text-sm font-semibold text-navy-900">Proyek Terkait ({projects.length})</h3>
          <div className="flex flex-wrap gap-2">
            {projects.map((p) => (
              <Link key={p.id} to={`/proyek/${p.id}`} className="rounded-lg border border-steel-200 px-3 py-1.5 text-sm font-medium text-navy-800 hover:border-ocean-400 hover:text-ocean-600">
                {p.id} · {p.progress}%
              </Link>
            ))}
          </div>
        </Card>
      )}

      <div className="mt-5 card">
        <Tabs tabs={["Sertifikat & Timeline", "Spesifikasi", "Kepatuhan & PSC", "Rencana & Operasional", "3D Viewer", "Service", "Sparepart"]} active={tab} onChange={setTab} />
        <div className="p-5">
          {tab === "Sertifikat & Timeline" && (
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
              <Card className="p-5 lg:col-span-1">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-navy-900"><FileCheck2 className="h-4 w-4" /> Sertifikat & Kepatuhan</h3>
                  <button className="btn-secondary text-xs" aria-label="Tambah sertifikat" onClick={() => setShowCert(true)}><Plus className="h-3.5 w-3.5" /></button>
                </div>
                <div className="space-y-2.5">
                  {certs.map((c) => {
                    const tone = certTone(c.expires, nowMonth);
                    return (
                      <div key={c.name} className="rounded-lg border border-steel-100 p-3">
                        <p className="text-sm font-medium text-navy-900">{c.name}</p>
                        <p className="text-xs text-steel-500">Terbit {fmtBulan(c.issued)} · Berakhir {fmtBulan(c.expires)}</p>
                        <Badge tone={tone} className="mt-1">
                          {tone === "green" ? "Berlaku" : tone === "amber" ? "Hampir Expire" : "Kedaluwarsa"}
                        </Badge>
                      </div>
                    );
                  })}
                  {certs.length === 0 && (
                    <p className="text-sm text-steel-400">Belum ada sertifikat — kapal masih dalam pembangunan.</p>
                  )}
                </div>
              </Card>

              <Card className="p-5 lg:col-span-2">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-navy-900"><History className="h-4 w-4" /> Timeline Riwayat</h3>
                  <button className="btn-secondary text-xs" aria-label="Jadwalkan survey" onClick={() => setShowSurvey(true)}><Plus className="h-3.5 w-3.5" /> Jadwalkan Survey</button>
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
                    <p className="mb-2 text-xs font-semibold text-steel-500">SURVEY TERJADWAL</p>
                    {surveys.map((s) => (
                      <div key={s.id} className="flex items-center justify-between py-1 text-sm">
                        <span className="text-steel-700">{s.type} · {fmtTanggal(String(s.date))}</span>
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
                <h3 className="text-sm font-semibold text-navy-900">Spesifikasi Teknis</h3>
                <button className="btn-secondary text-xs" onClick={openSpec}><Pencil className="h-3.5 w-3.5" /> Edit Spesifikasi</button>
              </div>
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <div className="rounded-lg bg-surface p-3"><dt className="text-xs text-steel-500">Tipe</dt><dd className="text-sm font-medium text-navy-900">{v.type}</dd></div>
                <div className="rounded-lg bg-surface p-3"><dt className="text-xs text-steel-500">Pemilik</dt><dd className="text-sm font-medium text-navy-900">{v.owner}</dd></div>
                <div className="rounded-lg bg-surface p-3"><dt className="text-xs text-steel-500">Class</dt><dd className="text-sm font-medium text-navy-900">{v.class}</dd></div>
                <div className="rounded-lg bg-surface p-3"><dt className="text-xs text-steel-500">Bendera</dt><dd className="text-sm font-medium text-navy-900">{v.flag}</dd></div>
                <div className="rounded-lg bg-surface p-3"><dt className="text-xs text-steel-500">LOA / Beam / Draft</dt><dd className="text-sm font-medium text-navy-900">{v.loa} / {v.beam} / {v.draft} m</dd></div>
                <div className="rounded-lg bg-surface p-3"><dt className="text-xs text-steel-500">Bollard Pull</dt><dd className="text-sm font-medium text-navy-900">{v.bollard} T</dd></div>
                <div className="rounded-lg bg-surface p-3"><dt className="text-xs text-steel-500">MMSI</dt><dd className="text-sm font-medium text-navy-900">{v.mmsi ?? "—"}</dd></div>
                <div className="rounded-lg bg-surface p-3"><dt className="text-xs text-steel-500">GT / NT</dt><dd className="text-sm font-medium text-navy-900">{v.gt ?? "—"} / {v.nt ?? "—"}</dd></div>
                <div className="rounded-lg bg-surface p-3"><dt className="text-xs text-steel-500">Mesin Utama</dt><dd className="text-sm font-medium text-navy-900">{v.engineType ?? "—"} · {v.bhp ?? "—"} HP</dd></div>
              </dl>
            </Card>
          )}

          {tab === "Kepatuhan & PSC" && (
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <Card className="p-5">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-navy-900"><ShieldCheck className="h-4 w-4" /> Kepatuhan (SOLAS / MARPOL / ISM / Flag / PSC)</h3>
                  <Badge tone={comp.state === "ok" ? "green" : comp.state === "issue" ? "red" : "gray"}>
                    {comp.state === "ok" ? "Semua berlaku" : comp.state === "issue" ? `${comp.valid}/${comp.total} berlaku` : "Belum dinilai"}
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
                          onChange={(e) => { setCompliance(r.name, { status: e.target.value }); toast(`Kepatuhan ${r.name} → ${e.target.value || "belum dinilai"}`); }}
                        >
                          <option value="">Belum dinilai</option>
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
                          aria-label={`Tanggal ${r.name}`}
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
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-navy-900"><ClipboardCheck className="h-4 w-4" /> Inspeksi PSC ({pscRows.length})</h3>
                    <button className="btn-secondary text-xs" onClick={() => setShowPsc(true)}><Plus className="h-3.5 w-3.5" /> Catat PSC</button>
                  </div>
                  {pscRows.length === 0 && <p className="text-sm text-steel-400">Belum ada catatan inspeksi PSC.</p>}
                  <div className="space-y-2">
                    {pscRows.map((p, i) => (
                      <div key={i} className="flex items-center justify-between rounded-lg border border-steel-100 p-3 text-sm">
                        <div>
                          <p className="font-medium text-navy-900">{p.port} · {fmtTanggal(p.date)}</p>
                          <p className="text-xs text-steel-500">{p.deficiencies} defisiensi</p>
                        </div>
                        <Badge tone={p.status === "Bersih" ? "green" : p.status === "Ditahan" ? "red" : "amber"}>{p.status}</Badge>
                      </div>
                    ))}
                  </div>
                </Card>

                <Card className="p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-navy-900"><Anchor className="h-4 w-4" /> Riwayat Docking</h3>
                    <button className="btn-secondary text-xs" onClick={openDockAdd}><Plus className="h-3.5 w-3.5" /> Tambah Riwayat</button>
                  </div>
                  {slots.length > 0 && (
                    <div className="mb-3">
                      <p className="mb-1.5 text-xs font-semibold text-steel-500">SLOT AKTIF DI DRYDOCK</p>
                      {slots.map((s) => (
                        <div key={s.id} className="flex items-center justify-between py-1 text-sm">
                          <span className="text-steel-700">{s.dockId} · {s.project}</span>
                          <Badge tone="blue">Terjadwal</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                  {dockHistory.length === 0 && <p className="text-sm text-steel-400">Belum ada riwayat docking manual.</p>}
                  <div className="space-y-2">
                    {dockHistory.map((d, i) => (
                      <div key={i} className="rounded-lg border border-steel-100 p-3">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-navy-900">{d.dock} · {fmtTanggal(d.date)}</p>
                          <button className="btn-secondary text-xs" onClick={() => openDockEdit(i)}><Pencil className="h-3 w-3" /> Edit</button>
                        </div>
                        {d.scope && <p className="mt-1 text-xs text-steel-600">Scope: {d.scope}</p>}
                        {d.result && <p className="text-xs text-steel-600">Hasil: {d.result}</p>}
                        <p className="mt-1 text-xs text-steel-500">Next due: {fmtTanggal(d.nextDue)}</p>
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
                <h3 className="text-sm font-semibold text-navy-900">Docking Plan 5 Tahun ({baseYear + 1}–{baseYear + 5})</h3>
                <p className="mt-0.5 text-xs text-steel-500">Survey/docking terjadwal otomatis dari daftar survey & next due riwayat docking · tambah rencana manual di bawah</p>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full">
                    <thead className="sticky top-0 z-10 bg-surface">
                      <tr><th className="th">Tahun</th><th className="th">Terjadwal (survey / next due)</th><th className="th">Rencana Manual</th></tr>
                    </thead>
                    <tbody className="divide-y divide-steel-100">
                      {planYears.map((y) => {
                        const auto: string[] = [
                          ...surveys.filter((s) => String(s.date ?? "").slice(0, 4) === String(y)).map((s) => `${s.type} · ${fmtTanggal(String(s.date))}`),
                          ...dockHistory.filter((d) => String(d.nextDue ?? "").slice(0, 4) === String(y)).map((d) => `Next due docking · ${fmtTanggal(d.nextDue)} (${d.dock})`),
                        ];
                        const manual = plan5.map((p, i) => ({ ...p, idx: i })).filter((p) => Number(p.year) === y);
                        return (
                          <tr key={y} className="hover:bg-surface">
                            <td className="td font-semibold text-navy-900">{y}</td>
                            <td className="td text-xs text-steel-600">
                              {auto.length === 0 && <span className="text-steel-400">—</span>}
                              {auto.map((a, i) => <p key={i}>{a}</p>)}
                            </td>
                            <td className="td text-xs text-steel-600">
                              {manual.length === 0 && <span className="text-steel-400">—</span>}
                              {manual.map((m) => (
                                <p key={m.idx} className="flex flex-wrap items-center justify-between gap-2">
                                  <span>{m.type}{m.note ? ` — ${m.note}` : ""}</span>
                                  <button className="btn-secondary text-xs" onClick={() => removePlan(m.idx)}>Hapus</button>
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
                  <Field label="Tahun">
                    <select className="input" value={planForm.year} onChange={(e) => setPlanForm({ ...planForm, year: e.target.value })}>
                      {planYears.map((y) => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </Field>
                  <Field label="Tipe">
                    <select className="input" value={planForm.type} onChange={(e) => setPlanForm({ ...planForm, type: e.target.value })}>
                      {PLAN_TYPES.map((t) => <option key={t}>{t}</option>)}
                    </select>
                  </Field>
                  <Field label="Catatan"><input className="input" value={planForm.note} onChange={(e) => setPlanForm({ ...planForm, note: e.target.value })} placeholder="cth: Docking besar + coating" /></Field>
                  <div className="flex items-end"><button className="btn-secondary text-xs" onClick={savePlan}><Plus className="h-3.5 w-3.5" /> Tambah Rencana</button></div>
                </div>
              </Card>

              <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                <Card className="p-5">
                  <h3 className="text-sm font-semibold text-navy-900">Bunker / Consumption Log</h3>
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
                    {bunkerRows.length === 0 && <p className="text-xs text-steel-400">Belum ada catatan bunker.</p>}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 border-t border-steel-100 pt-3">
                    <Field label="Tanggal"><input type="date" className="input" value={bunkerForm.date} onChange={(e) => setBunkerForm({ ...bunkerForm, date: e.target.value })} /></Field>
                    <Field label="Jenis">
                      <select className="input" value={bunkerForm.jenis} onChange={(e) => setBunkerForm({ ...bunkerForm, jenis: e.target.value })}>
                        {BUNKER_JENIS.map((j) => <option key={j}>{j}</option>)}
                      </select>
                    </Field>
                    <Field label="Qty"><input type="number" min={0} className="input" value={bunkerForm.qty} onChange={(e) => setBunkerForm({ ...bunkerForm, qty: e.target.value })} placeholder="cth: 5000" /></Field>
                    <Field label="Satuan"><input className="input" value={bunkerForm.satuan} onChange={(e) => setBunkerForm({ ...bunkerForm, satuan: e.target.value })} placeholder="liter / m³" /></Field>
                  </div>
                  <button className="btn-secondary mt-2 text-xs" onClick={saveBunker}><Plus className="h-3.5 w-3.5" /> Tambah Bunker</button>
                </Card>

                <div className="space-y-5">
                  <Card className="p-5">
                    <h3 className="text-sm font-semibold text-navy-900">Crew List ({crewRows.length})</h3>
                    <div className="mt-2 space-y-1.5">
                      {crewRows.map((c, i) => (
                        <div key={i} className="flex items-center justify-between gap-2 border-b border-steel-100 py-1.5 text-sm">
                          <div>
                            <p className="font-medium text-navy-900">{c.name}</p>
                            <p className="text-xs text-steel-500">{c.role}</p>
                          </div>
                          <button className="btn-secondary text-xs" onClick={() => removeCrew(i)}>Hapus</button>
                        </div>
                      ))}
                      {crewRows.length === 0 && <p className="text-xs text-steel-400">Belum ada kru tercatat.</p>}
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 border-t border-steel-100 pt-3">
                      <Field label="Nama"><input className="input" value={crewForm.name} onChange={(e) => setCrewForm({ ...crewForm, name: e.target.value })} placeholder="cth: Capt. Bambang" /></Field>
                      <Field label="Jabatan"><input className="input" value={crewForm.role} onChange={(e) => setCrewForm({ ...crewForm, role: e.target.value })} placeholder="cth: Nakhoda" /></Field>
                    </div>
                    <button className="btn-secondary mt-2 text-xs" onClick={saveCrew}><Plus className="h-3.5 w-3.5" /> Tambah Kru</button>
                  </Card>

                  <Card className="p-5">
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-navy-900">Asuransi</h3>
                      <button className="btn-secondary text-xs" onClick={openIns}><Pencil className="h-3 w-3" /> {insurance ? "Edit" : "Isi"}</button>
                    </div>
                    {insurance ? (
                      <dl className="space-y-1.5 text-sm">
                        <div className="flex justify-between"><dt className="text-steel-500">Polis</dt><dd className="font-medium font-mono">{insurance.polis}</dd></div>
                        <div className="flex justify-between"><dt className="text-steel-500">Premi</dt><dd className="font-medium">{fmtRupiah(Number(insurance.premi || 0))}</dd></div>
                        <div className="flex justify-between"><dt className="text-steel-500">Expiry</dt><dd className="font-medium">{fmtTanggal(insurance.expiry)}</dd></div>
                      </dl>
                    ) : (
                      <p className="text-xs text-steel-400">Belum ada data asuransi.</p>
                    )}
                  </Card>
                </div>
              </div>
            </div>
          )}

          {tab === "3D Viewer" && <SparepartServiceSection vesselId={v.id} view="3d" />}
          {tab === "Service" && <SparepartServiceSection vesselId={v.id} view="service" />}
          {tab === "Sparepart" && <SparepartServiceSection vesselId={v.id} view="sparepart" />}
        </div>
      </div>

      <Modal open={showCert} onClose={() => setShowCert(false)} title={`Tambah Sertifikat — ${v.name}`}
        footer={<><button className="btn-secondary" onClick={() => setShowCert(false)}>Batal</button><button className="btn-primary" onClick={saveCert}>Simpan</button></>}>
        <div className="space-y-3">
          <Field label="Nama sertifikat"><input className="input" value={certForm.name} onChange={(e) => setCertForm({ ...certForm, name: e.target.value })} placeholder="cth: Load Line Certificate" /></Field>
          <FormGrid>
            <Field label="Terbit"><input type="month" className="input" value={certForm.issued} onChange={(e) => setCertForm({ ...certForm, issued: e.target.value })} /></Field>
            <Field label="Berlaku hingga"><input type="month" className="input" value={certForm.expires} onChange={(e) => setCertForm({ ...certForm, expires: e.target.value })} /></Field>
          </FormGrid>
        </div>
      </Modal>

      <Modal open={showSurvey} onClose={() => setShowSurvey(false)} title={`Jadwalkan Survey — ${v.name}`} subtitle="Masuk ke timeline & daftar survey"
        footer={<><button className="btn-secondary" onClick={() => setShowSurvey(false)}>Batal</button><button className="btn-primary" onClick={saveSurvey}>Jadwalkan</button></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label="Tipe survey">
              <select className="input" value={surveyForm.type} onChange={(e) => setSurveyForm({ ...surveyForm, type: e.target.value })}>
                {["Annual Survey", "Special Survey", "Docking Survey", "Intermediate Survey"].map((t) => <option key={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Status">
              <select className="input" value={surveyForm.status} onChange={(e) => setSurveyForm({ ...surveyForm, status: e.target.value })}>
                {["Terjadwal", "Dalam Proses", "Selesai"].map((s) => <option key={s}>{s}</option>)}
              </select>
            </Field>
          </FormGrid>
          <Field label="Tanggal"><input type="date" className="input" value={surveyForm.date} onChange={(e) => setSurveyForm({ ...surveyForm, date: e.target.value })} /></Field>
        </div>
      </Modal>

      <Modal open={showSpec} onClose={() => setShowSpec(false)} title={`Edit Spesifikasi — ${v.name}`}
        footer={<><button className="btn-secondary" onClick={() => setShowSpec(false)}>Batal</button><button className="btn-primary" onClick={saveSpec}>Simpan</button></>}>
        <FormGrid>
          <Field label="MMSI (9 digit)"><input className="input font-mono" value={specForm.mmsi} onChange={(e) => setSpecForm({ ...specForm, mmsi: e.target.value })} placeholder="cth: 525003456" /></Field>
          <Field label="Tipe mesin utama"><input className="input" value={specForm.engineType} onChange={(e) => setSpecForm({ ...specForm, engineType: e.target.value })} placeholder="cth: MAN 6L27/38" /></Field>
          <Field label="GT"><input type="number" min={0} className="input" value={specForm.gt} onChange={(e) => setSpecForm({ ...specForm, gt: e.target.value })} /></Field>
          <Field label="NT"><input type="number" min={0} className="input" value={specForm.nt} onChange={(e) => setSpecForm({ ...specForm, nt: e.target.value })} /></Field>
          <Field label="BHP mesin utama"><input type="number" min={0} className="input" value={specForm.bhp} onChange={(e) => setSpecForm({ ...specForm, bhp: e.target.value })} /></Field>
        </FormGrid>
      </Modal>

      <Modal open={showPsc} onClose={() => setShowPsc(false)} title={`Catat Inspeksi PSC — ${v.name}`}
        footer={<><button className="btn-secondary" onClick={() => setShowPsc(false)}>Batal</button><button className="btn-primary" onClick={savePsc}>Simpan</button></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label="Tanggal"><input type="date" className="input" value={pscForm.date} onChange={(e) => setPscForm({ ...pscForm, date: e.target.value })} /></Field>
            <Field label="Pelabuhan"><input className="input" value={pscForm.port} onChange={(e) => setPscForm({ ...pscForm, port: e.target.value })} placeholder="cth: Balikpapan" /></Field>
            <Field label="Jumlah defisiensi"><input type="number" min={0} className="input" value={pscForm.deficiencies} onChange={(e) => setPscForm({ ...pscForm, deficiencies: e.target.value })} /></Field>
            <Field label="Status">
              <select className="input" value={pscForm.status} onChange={(e) => setPscForm({ ...pscForm, status: e.target.value })}>
                {PSC_STATUS.map((s) => <option key={s}>{s}</option>)}
              </select>
            </Field>
          </FormGrid>
        </div>
      </Modal>

      <Modal open={showDock} onClose={() => setShowDock(false)} title={`${editingDock === null ? "Tambah" : "Edit"} Riwayat Docking — ${v.name}`} subtitle="Scope, hasil & next due tersimpan di kapal"
        footer={<><button className="btn-secondary" onClick={() => setShowDock(false)}>Batal</button><button className="btn-primary" onClick={saveDock}>Simpan</button></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label="Tanggal"><input type="date" className="input" value={dockForm.date} onChange={(e) => setDockForm({ ...dockForm, date: e.target.value })} /></Field>
            <Field label="Next due"><input type="date" className="input" value={dockForm.nextDue} onChange={(e) => setDockForm({ ...dockForm, nextDue: e.target.value })} /></Field>
          </FormGrid>
          <Field label="Dok / galangan"><input className="input" value={dockForm.dock} onChange={(e) => setDockForm({ ...dockForm, dock: e.target.value })} placeholder="cth: DD-1 Drydock Samarinda" /></Field>
          <Field label="Scope"><input className="input" value={dockForm.scope} onChange={(e) => setDockForm({ ...dockForm, scope: e.target.value })} placeholder="cth: Blasting + coating lambung" /></Field>
          <Field label="Hasil"><input className="input" value={dockForm.result} onChange={(e) => setDockForm({ ...dockForm, result: e.target.value })} placeholder="cth: Selesai, lulus inspeksi BKI" /></Field>
        </div>
      </Modal>

      <Modal open={showIns} onClose={() => setShowIns(false)} title={`Asuransi — ${v.name}`} subtitle="Polis, premi & expiry · alert H-30 tampil di kartu kapal"
        footer={<><button className="btn-secondary" onClick={() => setShowIns(false)}>Batal</button><button className="btn-primary" onClick={saveIns}>Simpan</button></>}>
        <div className="space-y-3">
          <Field label="No. polis"><input className="input font-mono" value={insForm.polis} onChange={(e) => setInsForm({ ...insForm, polis: e.target.value })} placeholder="cth: HULL-2026-014" /></Field>
          <FormGrid>
            <Field label="Premi (Rp)"><input type="number" min={0} className="input" value={insForm.premi} onChange={(e) => setInsForm({ ...insForm, premi: e.target.value })} placeholder="cth: 850000000" /></Field>
            <Field label="Expiry"><input type="date" className="input" value={insForm.expiry} onChange={(e) => setInsForm({ ...insForm, expiry: e.target.value })} /></Field>
          </FormGrid>
        </div>
      </Modal>
    </div>
  );
}
