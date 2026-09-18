import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Ship, FileCheck2, History, Plus } from "lucide-react";
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

export default function VesselDetail() {
  const { id } = useParams();
  const { data, update, add } = useStore();
  const v = data.vessels.find((x) => x.id === id) ?? data.vessels[0];

  const [showCert, setShowCert] = useState(false);
  const [certForm, setCertForm] = useState({ name: "", expires: "" });
  const [showSurvey, setShowSurvey] = useState(false);
  const [surveyForm, setSurveyForm] = useState({ type: "Annual Survey", date: "", status: "Terjadwal" });
  const [tab, setTab] = useState("Sertifikat");

  if (!v) return <p className="text-sm text-steel-500">Kapal tidak ditemukan.</p>;

  const projects = data.projects.filter((p) => p.vessel === v.name);
  const surveys = data.surveys.filter((s) => s.vessel === v.name);
  const certs = (v.certificates ?? []) as { name: string; issued?: string; expires: string; tone: string }[];

  const saveCert = () => {
    if (!certForm.name.trim() || !certForm.expires) { toast("Nama & masa berlaku wajib diisi", "info"); return; }
    update("vessels", v.id, { certificates: [...certs, { name: certForm.name.trim(), issued: new Date().toISOString().slice(0, 7), expires: certForm.expires, tone: "green" }] });
    toast(`Sertifikat ditambahkan ke ${v.name}`);
    setShowCert(false);
    setCertForm({ name: "", expires: "" });
  };

  const saveSurvey = () => {
    if (!surveyForm.date) { toast("Tanggal wajib diisi", "info"); return; }
    add("surveys", { vessel: v.name, type: surveyForm.type, status: surveyForm.status, date: surveyForm.date, classSurveyor: "BKI" },
      { action: "menjadwalkan survey", target: `${v.name} · ${surveyForm.type}`, module: "Kapal" });
    update("vessels", v.id, { history: [...(v.history ?? []), { date: surveyForm.date, event: `${surveyForm.type} (${surveyForm.status.toLowerCase()})`, type: "Survey" }] });
    toast("Survey terjadwal & masuk timeline");
    setShowSurvey(false);
  };

  return (
    <div>
      <Link to="/kapal" className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-ocean-600 hover:underline">
        <ArrowLeft className="h-4 w-4" /> Kembali ke Kapal
      </Link>
      <PageHeader
        title={v.name}
        subtitle={`${v.imo} · ${v.class} · ${v.flag} · Dibangun ${v.built}`}
        actions={
          <div className="flex items-center gap-2">
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
        <Tabs tabs={["Sertifikat & Timeline", "Spesifikasi", "3D Viewer", "Service", "Sparepart"]} active={tab} onChange={setTab} />
        <div className="p-5">
          {tab === "Sertifikat & Timeline" && (
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
              <Card className="p-5 lg:col-span-1">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-navy-900"><FileCheck2 className="h-4 w-4" /> Sertifikat & Kepatuhan</h3>
                  <button className="btn-secondary text-xs" onClick={() => setShowCert(true)}><Plus className="h-3.5 w-3.5" /></button>
                </div>
                <div className="space-y-2.5">
                  {certs.map((c) => {
                    const tone = c.tone as "green" | "amber" | "red";
                    return (
                      <div key={c.name} className="rounded-lg border border-steel-100 p-3">
                        <p className="text-sm font-medium text-navy-900">{c.name}</p>
                        <p className="text-xs text-steel-500">Terbit {c.issued} · Berakhir {c.expires}</p>
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
                  <button className="btn-secondary text-xs" onClick={() => setShowSurvey(true)}><Plus className="h-3.5 w-3.5" /> Jadwalkan Survey</button>
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
                        <p className="text-xs text-steel-500">{h.date} · {h.type}</p>
                      </div>
                    </div>
                  ))}
                </div>
                {surveys.length > 0 && (
                  <div className="mt-4 border-t border-steel-100 pt-3">
                    <p className="mb-2 text-xs font-semibold text-steel-500">SURVEY TERJADWAL</p>
                    {surveys.map((s) => (
                      <div key={s.id} className="flex items-center justify-between py-1 text-sm">
                        <span className="text-steel-700">{s.type} · {s.date}</span>
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
              <h3 className="mb-3 text-sm font-semibold text-navy-900">Spesifikasi Teknis</h3>
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <div className="rounded-lg bg-surface p-3"><dt className="text-xs text-steel-500">Tipe</dt><dd className="text-sm font-medium text-navy-900">{v.type}</dd></div>
                <div className="rounded-lg bg-surface p-3"><dt className="text-xs text-steel-500">Pemilik</dt><dd className="text-sm font-medium text-navy-900">{v.owner}</dd></div>
                <div className="rounded-lg bg-surface p-3"><dt className="text-xs text-steel-500">Class</dt><dd className="text-sm font-medium text-navy-900">{v.class}</dd></div>
                <div className="rounded-lg bg-surface p-3"><dt className="text-xs text-steel-500">Bendera</dt><dd className="text-sm font-medium text-navy-900">{v.flag}</dd></div>
                <div className="rounded-lg bg-surface p-3"><dt className="text-xs text-steel-500">LOA / Beam / Draft</dt><dd className="text-sm font-medium text-navy-900">{v.loa} / {v.beam} / {v.draft} m</dd></div>
                <div className="rounded-lg bg-surface p-3"><dt className="text-xs text-steel-500">Bollard Pull</dt><dd className="text-sm font-medium text-navy-900">{v.bollard} T</dd></div>
              </dl>
            </Card>
          )}

          {tab === "3D Viewer" && <SparepartServiceSection vesselId={v.id} />}
          {tab === "Service" && <SparepartServiceSection vesselId={v.id} />}
          {tab === "Sparepart" && <SparepartServiceSection vesselId={v.id} />}
        </div>
      </div>

      {/* Modal sertifikat */}
      <Modal open={showCert} onClose={() => setShowCert(false)} title={`Tambah Sertifikat — ${v.name}`}
        footer={<><button className="btn-secondary" onClick={() => setShowCert(false)}>Batal</button><button className="btn-primary" onClick={saveCert}>Simpan</button></>}>
        <div className="space-y-3">
          <Field label="Nama sertifikat"><input className="input" value={certForm.name} onChange={(e) => setCertForm({ ...certForm, name: e.target.value })} placeholder="cth: Load Line Certificate" /></Field>
          <Field label="Berlaku hingga"><input type="month" className="input" value={certForm.expires} onChange={(e) => setCertForm({ ...certForm, expires: e.target.value })} /></Field>
        </div>
      </Modal>

      {/* Modal survey */}
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
    </div>
  );
}
