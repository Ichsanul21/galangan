import { useState } from "react";
import { Plus, ShieldCheck, AlertTriangle, Siren, Award } from "lucide-react";
import { ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Card, CardHeader, PageHeader, Badge, KpiCard, Tabs, StatusBadge, Donut, ChartTooltip, Modal, Field, FormGrid, toast } from "../../components/ui";
import { useStore, type StoreItem } from "../../data/store";
import { inspectionTrend, ncrTrend, incidentTrend, hseTrend } from "../../data";
import { fmtTanggal, todayISO } from "../../utils/format";

const CERT_WINDOW = 90;

const ncrTone: Record<string, "red" | "amber" | "blue" | "green"> = {
  Terbuka: "amber",
  "Dalam Perbaikan": "blue",
  Tertutup: "green",
};

const NCR_FLOW = ["Terbuka", "Dalam Perbaikan", "Tertutup"];
const ROOT_CAUSES = ["Manusia", "Metode", "Material", "Mesin", "Lingkungan"];
const NCR_COLORS = ["#f59e0b", "#2e9ad4", "#8b5cf6", "#0d9488", "#f43f5e", "#64748b"];

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

export default function QCSafety() {
  const { data, add, update, log } = useStore();
  const ncrList = data.ncr;
  const incidents = data.incidents;
  const inspections = data.inspections;
  const vessels = data.vessels;
  const [tab, setTab] = useState("Inspeksi (ITP)");

  const [showInsp, setShowInsp] = useState(false);
  const [inspForm, setInspForm] = useState({ project: "", point: "", status: "Terjadwal", date: todayISO() });
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
    const itp = nextItp(inspections);
    const created = add("inspections", {
      project: inspForm.project, point: inspForm.point.trim(), itp,
      status: inspForm.status, date: inspForm.date,
    }, { action: "mencatat inspeksi", module: "QC" });
    // Integrasi: hasil NCR otomatis menerbitkan NCR
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
    setInspForm({ project: "", point: "", status: "Terjadwal", date: todayISO() });
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
  };

  const saveDue = () => {
    if (!ncrDetail) return;
    if (!dueDraft) { toast("Tenggat CAPA wajib diisi", "info"); return; }
    update("ncr", ncrDetail.id, { due: dueDraft });
    log("memperbarui tenggat CAPA", ncrDetail.id, "QC");
    setNcrDetail({ ...ncrDetail, due: dueDraft });
    toast("Tenggat CAPA diperbarui");
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
        <Tabs tabs={["Inspeksi (ITP)", "NCR", "Insiden", "Sertifikat"]} active={tab} onChange={setTab} />
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
                    <tr><th className="th">Inspeksi</th><th className="th">Proyek</th><th className="th">Titik Inspeksi</th><th className="th">ITP</th><th className="th">Tanggal</th><th className="th">Hasil</th></tr>
                  </thead>
                  <tbody className="divide-y divide-steel-100">
                    {inspections.map((i) => (
                      <tr key={i.id} className="hover:bg-surface">
                        <td className="td font-mono font-medium text-navy-900">{i.id}</td>
                        <td className="td text-steel-600 font-mono text-xs">{i.project}</td>
                        <td className="td text-steel-600 max-w-[240px] truncate" title={String(i.point)}>{i.point}</td>
                        <td className="td text-steel-600 font-mono text-xs">{i.itp}</td>
                        <td className="td text-steel-600">{fmtTanggal(i.date)}</td>
                        <td className="td"><StatusBadge status={i.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === "NCR" && (
            <div className="space-y-3">
              {ncrList.map((n) => (
                <Card key={n.id} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-navy-900 font-mono">{n.id}</p>
                        <Badge tone={n.severity === "Critical" ? "red" : n.severity === "Major" ? "amber" : "blue"}>{n.severity}</Badge>
                        {dueBadge(n)}
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
          </div>
        )}
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
    </div>
  );
}
