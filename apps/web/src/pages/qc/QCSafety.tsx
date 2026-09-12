import { useState } from "react";
import { Plus, ShieldCheck, AlertTriangle, Siren, Award } from "lucide-react";
import { ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Card, CardHeader, PageHeader, Badge, KpiCard, Tabs, StatusBadge, Donut, ChartTooltip, Modal, Field, FormGrid, toast } from "../../components/ui";
import { useStore, type StoreItem } from "../../data/store";
import { ncrStats, inspectionTrend, sparkUtil } from "../../data";

const ncrTone: Record<string, "red" | "amber" | "blue" | "green"> = {
  Terbuka: "amber",
  "Dalam Perbaikan": "blue",
  Tertutup: "green",
};

const NCR_FLOW = ["Terbuka", "Dalam Perbaikan", "Tertutup"];

export default function QCSafety() {
  const { data, add, update } = useStore();
  const ncrList = data.ncr;
  const incidents = data.incidents;
  const inspections = data.inspections;
  const vessels = data.vessels;
  const [tab, setTab] = useState("Inspeksi");

  const [showInsp, setShowInsp] = useState(false);
  const [inspForm, setInspForm] = useState({ project: "", point: "", itp: "", status: "Terjadwal", date: new Date().toISOString().slice(0, 10) });
  const [ncrDetail, setNcrDetail] = useState<StoreItem | null>(null);
  const [showNcr, setShowNcr] = useState(false);
  const [ncrForm, setNcrForm] = useState({ project: "", vessel: "", type: "Pengelasan", severity: "Minor", issue: "" });
  const [showInc, setShowInc] = useState(false);
  const [incForm, setIncForm] = useState({ type: "Near Miss", location: "", desc: "", severity: "Rendah" });

  const openNcr = ncrList.filter((n) => n.status !== "Tertutup").length;

  const saveInspection = () => {
    if (!inspForm.project || !inspForm.point.trim()) { toast("Proyek & titik inspeksi wajib diisi", "info"); return; }
    const created = add("inspections", {
      project: inspForm.project, point: inspForm.point.trim(), itp: inspForm.itp.trim() || "-",
      status: inspForm.status, date: inspForm.date,
    }, { action: "mencatat inspeksi", module: "QC" });
    // Integrasi: hasil NCR otomatis menerbitkan NCR
    if (inspForm.status === "NCR") {
      const proj = data.projects.find((p) => p.id === inspForm.project);
      add("ncr", {
        project: inspForm.project, vessel: proj?.vessel ?? "-", type: "Umum",
        status: "Terbuka", severity: "Major", raised: inspForm.date, issue: `Temuan dari ${created.id}: ${inspForm.point.trim()}`,
      }, { action: "menerbitkan NCR", module: "QC" });
      toast(`Inspeksi ${created.id} + NCR diterbitkan otomatis`);
    } else {
      toast(`Inspeksi ${created.id} dijadwalkan`);
    }
    setShowInsp(false);
    setInspForm({ project: "", point: "", itp: "", status: "Terjadwal", date: new Date().toISOString().slice(0, 10) });
  };

  const saveNcr = () => {
    if (!ncrForm.project || !ncrForm.issue.trim()) { toast("Proyek & uraian wajib diisi", "info"); return; }
    const proj = data.projects.find((p) => p.id === ncrForm.project);
    const created = add("ncr", {
      project: ncrForm.project, vessel: ncrForm.vessel || proj?.vessel || "-", type: ncrForm.type,
      status: "Terbuka", severity: ncrForm.severity, raised: new Date().toISOString().slice(0, 10), issue: ncrForm.issue.trim(),
    }, { action: "menerbitkan NCR", module: "QC" });
    toast(`NCR ${created.id} diterbitkan`);
    setShowNcr(false);
    setNcrForm({ project: "", vessel: "", type: "Pengelasan", severity: "Minor", issue: "" });
  };

  const advanceNcr = (n: StoreItem) => {
    const idx = NCR_FLOW.indexOf(n.status);
    if (idx < 0 || idx >= NCR_FLOW.length - 1) return;
    update("ncr", n.id, { status: NCR_FLOW[idx + 1] });
    toast(`${n.id} → ${NCR_FLOW[idx + 1]}`);
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
        <KpiCard label="NCR Terbuka" value={String(openNcr)} delta={`${ncrList.filter((n) => n.severity === "Critical" && n.status !== "Tertutup").length} critical`} deltaDirection="down" icon={<AlertTriangle className="h-5 w-5" />} chip="rose" spark={sparkUtil} />
        <KpiCard label="Inspeksi Bulan Ini" value={String(inspections.length + 186)} delta={`${ncrList.length} NCR terkait`} deltaDirection="flat" icon={<ShieldCheck className="h-5 w-5" />} chip="navy" />
        <KpiCard label="Insiden (YTD)" value={String(incidents.length + 7)} delta="termasuk near miss" deltaDirection="down" icon={<Siren className="h-5 w-5" />} chip="amber" />
        <KpiCard label="HSE Score" value="A" delta="Kinerja baik" deltaDirection="up" icon={<Award className="h-5 w-5" />} chip="teal" />
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
                    <Donut data={ncrStats} colors={ncrStats.map((d) => d.color)} size={130} thickness={18} centerValue={String(ncrList.length + 27)} centerLabel="NCR" />
                    <div className="flex-1 space-y-1.5">
                      {ncrStats.map((d) => (
                        <div key={d.name} className="flex items-center gap-2 text-sm">
                          <span className="h-3 w-3 rounded-sm" style={{ background: d.color }} />
                          <span className="truncate text-steel-600">{d.name}</span>
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
                  <thead className="bg-surface">
                    <tr><th className="th">Inspeksi</th><th className="th">Proyek</th><th className="th">Titik Inspeksi</th><th className="th">ITP</th><th className="th">Tanggal</th><th className="th">Hasil</th></tr>
                  </thead>
                  <tbody className="divide-y divide-steel-100">
                    {inspections.map((i) => (
                      <tr key={i.id} className="hover:bg-surface">
                        <td className="td font-mono font-medium text-navy-900">{i.id}</td>
                        <td className="td text-steel-600 font-mono text-xs">{i.project}</td>
                        <td className="td text-steel-600">{i.point}</td>
                        <td className="td text-steel-600 font-mono text-xs">{i.itp}</td>
                        <td className="td text-steel-600">{i.date}</td>
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
                      </div>
                      <p className="mt-1 text-sm text-steel-700">{n.issue}</p>
                      <p className="text-xs text-steel-500 mt-0.5">{n.project} · {n.vessel} · {n.type} · {n.raised}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={ncrTone[n.status] ?? "gray"}>{n.status}</Badge>
                      <button className="btn-secondary text-xs" onClick={() => setNcrDetail(n)}>Detail</button>
                      {n.status !== "Tertutup" && (
                        <button className="btn-primary text-xs" onClick={() => advanceNcr(n)}>Proses</button>
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
                        <p className="text-xs text-steel-500 mt-0.5">{i.date} · {i.location} · Severity {i.severity}</p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {tab === "Sertifikat" && (
            <div className="space-y-4">
              {vessels.map((v) => (
                <div key={v.id}>
                  <h3 className="mb-2 text-sm font-semibold text-navy-900">{v.name}</h3>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {(v.certificates ?? []).map((c: { name: string; expires: string; tone: string; issued?: string }) => {
                      const tone = c.tone as "green" | "amber" | "red";
                      return (
                        <Card key={c.name} className="p-3">
                          <p className="text-sm font-medium text-navy-900">{c.name}</p>
                          <p className="text-xs text-steel-500">Exp: {c.expires}</p>
                          <Badge tone={tone} className="mt-1">{tone === "green" ? "Berlaku" : tone === "amber" ? "Hampir Expire" : "Kedaluwarsa"}</Badge>
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
            <Field label="Nomor ITP"><input className="input font-mono" value={inspForm.itp} onChange={(e) => setInspForm({ ...inspForm, itp: e.target.value })} placeholder="cth: ITP-015" /></Field>
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
          </FormGrid>
          <Field label="Uraian temuan"><textarea className="input" rows={3} value={ncrForm.issue} onChange={(e) => setNcrForm({ ...ncrForm, issue: e.target.value })} /></Field>
        </div>
      </Modal>

      {/* Modal detail NCR */}
      <Modal open={ncrDetail !== null} onClose={() => setNcrDetail(null)} title={ncrDetail?.id ?? ""} subtitle="Detail temuan & tindak lanjut"
        footer={ncrDetail && ncrDetail.status !== "Tertutup" ? <button className="btn-primary" onClick={() => { advanceNcr(ncrDetail); setNcrDetail({ ...ncrDetail, status: NCR_FLOW[NCR_FLOW.indexOf(ncrDetail.status) + 1] }); }}>Proses ke tahap berikut</button> : undefined}>
        {ncrDetail && (
          <dl className="space-y-2.5 text-sm">
            {[["Proyek", ncrDetail.project], ["Kapal", ncrDetail.vessel], ["Kategori", ncrDetail.type], ["Severity", ncrDetail.severity], ["Dilaporkan", ncrDetail.raised], ["Uraian", ncrDetail.issue]].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4"><dt className="shrink-0 text-steel-500">{k}</dt><dd className="text-right font-medium text-navy-900">{v}</dd></div>
            ))}
            <div className="flex justify-between gap-4"><dt className="text-steel-500">Status</dt><dd><Badge tone={ncrTone[ncrDetail.status] ?? "gray"}>{ncrDetail.status}</Badge></dd></div>
          </dl>
        )}
      </Modal>

      {/* Modal insiden */}
      <Modal open={showInc} onClose={() => setShowInc(false)} title="Catat Insiden / Near Miss"
        footer={<><button className="btn-secondary" onClick={() => setShowInc(false)}>Batal</button><button className="btn-primary" onClick={() => {
          if (!incForm.desc.trim() || !incForm.location.trim()) { toast("Lokasi & uraian wajib diisi", "info"); return; }
          const created = add("incidents", { type: incForm.type, date: new Date().toISOString().slice(0, 10), location: incForm.location.trim(), desc: incForm.desc.trim(), severity: incForm.severity },
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
