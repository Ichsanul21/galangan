import { useState } from "react";
import { Plus, HardHat, FileSignature, Star } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Card, CardHeader, PageHeader, Badge, KpiCard, Tabs, ProgressBar, ChartTooltip, Modal, Field, FormGrid, toast } from "../../components/ui";
import { useStore, type StoreItem } from "../../data/store";
import { fmtMiliar, subcontractorScore, sparkRevenue } from "../../data";

const toneMap: Record<string, "green" | "blue" | "amber" | "red" | "gray" | "navy"> = {
  Aktif: "green",
  Kualifikasi: "amber",
  "Dalam Proses": "blue",
  Selesai: "green",
  Lunas: "green",
  Disetujui: "blue",
  "Belum Dibayar": "amber",
};

export default function Subcontractor() {
  const { data, add, update } = useStore();
  const subcontractors = data.subcontractors;
  const workOrders = data.workOrders;
  const payments = data.termins;
  const [tab, setTab] = useState("Subkontraktor");

  const [showSub, setShowSub] = useState(false);
  const [subForm, setSubForm] = useState({ name: "", services: "", contract: "", k3: "A" });
  const [showWo, setShowWo] = useState(false);
  const [woForm, setWoForm] = useState({ sub: "", project: "", scope: "" });
  const [woProg, setWoProg] = useState<StoreItem | null>(null);
  const [progVal, setProgVal] = useState("");
  const [showTerm, setShowTerm] = useState(false);
  const [termForm, setTermForm] = useState({ sub: "", wo: "", amount: "" });

  const runningWo = workOrders.filter((w) => w.status !== "Selesai").length;
  const avgRating = subcontractors.length ? Math.round(subcontractors.reduce((s, x) => s + Number(x.rating || 0), 0) / subcontractors.length) : 0;

  const saveSub = () => {
    if (!subForm.name.trim()) { toast("Nama subkontraktor wajib diisi", "info"); return; }
    const created = add("subcontractors", {
      name: subForm.name.trim(), services: subForm.services.trim() || "Umum",
      rating: 80, active: 0, contract: Number(subForm.contract) || 0, status: "Kualifikasi", k3: subForm.k3,
    }, { action: "meregistrasi subkontraktor", module: "Subkontraktor" });
    toast(`${created.id} teregistrasi (Kualifikasi)`);
    setShowSub(false);
    setSubForm({ name: "", services: "", contract: "", k3: "A" });
  };

  const saveWo = () => {
    if (!woForm.sub || !woForm.project || !woForm.scope.trim()) { toast("Sub, proyek & lingkup wajib diisi", "info"); return; }
    const created = add("workOrders", { sub: woForm.sub, project: woForm.project, scope: woForm.scope.trim(), progress: 0, status: "Dalam Proses" },
      { action: "menerbitkan WO", module: "Subkontraktor" });
    toast(`WO ${created.id} diterbitkan`);
    setShowWo(false);
    setWoForm({ sub: "", project: "", scope: "" });
  };

  const saveTerm = () => {
    if (!termForm.sub || !termForm.amount) { toast("Sub & nilai wajib diisi", "info"); return; }
    const created = add("termins", {
      sub: termForm.sub, progress: termForm.wo || "-", amount: Number(termForm.amount) || 0,
      pph23: "2%", retention: "5%", status: "Belum Dibayar",
    }, { action: "mengajukan termin", module: "Subkontraktor" });
    toast(`Termin ${created.id} diajukan`);
    setShowTerm(false);
    setTermForm({ sub: "", wo: "", amount: "" });
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
        <KpiCard label="Subkontraktor Aktif" value={String(subcontractors.filter((s) => s.status === "Aktif").length)} icon={<HardHat className="h-5 w-5" />} chip="navy" spark={sparkRevenue} hint="Terdaftar & tersertifikasi" />
        <KpiCard label="Nilai Kontrak Aktif" value={fmtMiliar(subcontractors.reduce((s, x) => s + Number(x.contract || 0), 0))} icon={<FileSignature className="h-5 w-5" />} chip="teal" />
        <KpiCard label="Work Order Berjalan" value={String(runningWo)} hint="Sedang eksekusi" icon={<HardHat className="h-5 w-5" />} chip="amber" />
        <KpiCard label="Rating Rata-rata" value={`${avgRating}%`} delta="Kinerja baik" deltaDirection="up" icon={<Star className="h-5 w-5" />} chip="violet" />
      </div>

      <div className="mt-4 card">
        <Tabs tabs={["Subkontraktor", "Work Order", "Termin & Pembayaran"]} active={tab} onChange={setTab} />
        <div className="p-4">
          {tab === "Subkontraktor" && (
            <div className="space-y-4">
              <Card>
                <CardHeader title="Evaluasi Kinerja Subkontraktor" subtitle="Skor biaya, kualitas, ketepatan kirim & keselamatan" />
                <div className="h-60 p-4 pt-0">
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
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {subcontractors.map((s) => (
                <Card key={s.id} className="p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-semibold text-navy-900">{s.name}</p>
                      <p className="text-xs text-steel-500">{s.services}</p>
                    </div>
                    <select className="input w-auto py-1 text-xs" value={s.status}
                      onChange={(e) => { update("subcontractors", s.id, { status: e.target.value }); toast(`${s.name} → ${e.target.value}`); }}>
                      {["Aktif", "Kualifikasi", "Nonaktif"].map((o) => <option key={o}>{o}</option>)}
                    </select>
                  </div>
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
                      <div className="flex items-center gap-3">
                        <div className="font-mono text-sm font-semibold text-navy-900">{w.id}</div>
                        <div className="text-sm text-steel-600">
                          {w.sub} · {w.project}
                          <p className="text-xs text-steel-500">{w.scope}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <ProgressBar value={w.progress} className="w-24" tone={w.status === "Selesai" ? "green" : "navy"} />
                          <span className="text-xs font-medium">{w.progress}%</span>
                        </div>
                        <Badge tone={toneMap[w.status] ?? "gray"}>{w.status}</Badge>
                        {w.status !== "Selesai" && (
                          <button className="btn-secondary text-xs" onClick={() => { setWoProg(w); setProgVal(String(w.progress)); }}>Update</button>
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
                  <thead className="bg-surface">
                    <tr><th className="th">Termin</th><th className="th">Subkontraktor</th><th className="th">Progress</th><th className="th">Nilai</th><th className="th">PPh 23</th><th className="th">Retention</th><th className="th">Status</th><th className="th">Aksi</th></tr>
                  </thead>
                  <tbody className="divide-y divide-steel-100">
                    {payments.map((p) => (
                      <tr key={p.id} className="hover:bg-surface">
                        <td className="td font-mono font-medium text-navy-900">{p.id}</td>
                        <td className="td text-steel-600">{p.sub}</td>
                        <td className="td font-mono text-xs text-steel-500">{p.progress}</td>
                        <td className="td font-semibold">{fmtMiliar(p.amount)}</td>
                        <td className="td text-steel-600">{p.pph23}</td>
                        <td className="td text-steel-600">{p.retention}</td>
                        <td className="td"><Badge tone={toneMap[p.status] ?? "gray"}>{p.status}</Badge></td>
                        <td className="td">
                          {p.status === "Belum Dibayar" && (
                            <button className="btn-secondary text-xs" onClick={() => { update("termins", p.id, { status: "Disetujui" }); toast(`${p.id} disetujui`); }}>Setujui</button>
                          )}
                          {p.status === "Disetujui" && (
                            <button className="btn-primary text-xs" onClick={() => { update("termins", p.id, { status: "Lunas" }); toast(`${p.id} lunas`); }}>Bayar</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
            <Field label="Nilai kontrak (Rp)"><input type="number" className="input" value={subForm.contract} onChange={(e) => setSubForm({ ...subForm, contract: e.target.value })} /></Field>
            <Field label="Rating K3">
              <select className="input" value={subForm.k3} onChange={(e) => setSubForm({ ...subForm, k3: e.target.value })}>
                {["A+", "A", "B+", "B", "C"].map((k) => <option key={k}>{k}</option>)}
              </select>
            </Field>
          </FormGrid>
        </div>
      </Modal>

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
                {data.projects.filter((p) => p.status !== "Selesai").map((p) => <option key={p.id} value={p.id}>{p.id} · {p.vessel}</option>)}
              </select>
            </Field>
          </FormGrid>
          <Field label="Lingkup pekerjaan"><input className="input" value={woForm.scope} onChange={(e) => setWoForm({ ...woForm, scope: e.target.value })} placeholder="cth: Fabrikasi section 8-10" /></Field>
        </div>
      </Modal>

      {/* Modal progres WO */}
      <Modal open={woProg !== null} onClose={() => setWoProg(null)} title={`Update progres ${woProg?.id}`}
        footer={<><button className="btn-secondary" onClick={() => setWoProg(null)}>Batal</button><button className="btn-primary" onClick={() => {
          if (!woProg) return;
          const v = Math.min(100, Math.max(0, Number(progVal) || 0));
          update("workOrders", woProg.id, { progress: v, status: v >= 100 ? "Selesai" : "Dalam Proses" });
          toast(`${woProg.id} → ${v}%`); setWoProg(null);
        }}>Simpan</button></>}>
        <Field label={`Progres: ${progVal}%`}>
          <input type="range" min={0} max={100} value={Number(progVal) || 0} onChange={(e) => setProgVal(e.target.value)} className="w-full" />
        </Field>
      </Modal>

      {/* Modal termin */}
      <Modal open={showTerm} onClose={() => setShowTerm(false)} title="Ajukan Termin Pembayaran"
        footer={<><button className="btn-secondary" onClick={() => setShowTerm(false)}>Batal</button><button className="btn-primary" onClick={saveTerm}>Ajukan</button></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label="Subkontraktor">
              <select className="input" value={termForm.sub} onChange={(e) => setTermForm({ ...termForm, sub: e.target.value })}>
                <option value="">Pilih…</option>
                {subcontractors.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="Referensi WO">
              <select className="input" value={termForm.wo} onChange={(e) => setTermForm({ ...termForm, wo: e.target.value })}>
                <option value="">—</option>
                {workOrders.map((w) => <option key={w.id} value={`${w.id} (${w.progress}%)`}>{w.id} ({w.progress}%)</option>)}
              </select>
            </Field>
          </FormGrid>
          <Field label="Nilai termin (Rp)"><input type="number" className="input" value={termForm.amount} onChange={(e) => setTermForm({ ...termForm, amount: e.target.value })} /></Field>
        </div>
      </Modal>
    </div>
  );
}
