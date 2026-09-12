import { useState } from "react";
import { Plus, Send, Users2, Star, Handshake, ArrowRight } from "lucide-react";
import { Card, CardHeader, PageHeader, Badge, KpiCard, Tabs, ProgressBar, Donut, Modal, Field, FormGrid, toast } from "../../components/ui";
import { useStore, type StoreItem } from "../../data/store";
import { fmtMiliar, fmtRupiah, sparkRevenue } from "../../data";

const stages = ["Lead", "Penawaran", "Negosiasi", "Menang"];

export default function CRM() {
  const { data, add, update } = useStore();
  const quotations = data.quotations;
  const clients = data.clients;
  const [tab, setTab] = useState("Pipeline");

  const [showQ, setShowQ] = useState(false);
  const [qForm, setQForm] = useState({ client: "", vessel: "", type: "New Build", value: "", stage: "Lead" });
  const [showClient, setShowClient] = useState(false);
  const [cForm, setCForm] = useState({ name: "", fleet: "1", rating: "80" });
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");

  const pipelineTotal = quotations.reduce((s, q) => s + Number(q.value || 0), 0);
  const won = quotations.filter((q) => q.stage === "Menang").reduce((s, q) => s + Number(q.value || 0), 0);
  const stageDist = stages.map((s, i) => ({
    name: s,
    value: quotations.filter((q) => q.stage === s).length,
    color: ["#2e9ad4", "#f59e0b", "#8b5cf6", "#22c55e"][i],
  }));

  const advance = (q: StoreItem) => {
    const idx = stages.indexOf(q.stage);
    if (idx < 0 || idx >= stages.length - 1) return;
    const next = stages[idx + 1];
    update("quotations", q.id, { stage: next });
    toast(`${q.id} naik ke tahap ${next}`);
  };

  const convertToProject = (q: StoreItem) => {
    const exists = data.projects.some((p) => p.vessel === q.vessel);
    if (exists) { toast("Proyek untuk kapal ini sudah ada", "info"); return; }
    const created = add("projects", {
      vessel: q.vessel, type: q.type, client: q.client, status: "Dalam Proses",
      branch: "Samarinda", start: new Date().toISOString().slice(0, 10), end: "-", progress: 0,
      budget: Number(q.value) || 0, actual: 0, manager: "Belum ditentukan", scope: [q.type],
    }, { action: "mengkonversi quotation", target: `${q.id} → proyek`, module: "CRM" });
    toast(`${q.id} menjadi proyek ${created.id}`);
  };

  const saveQuotation = () => {
    if (!qForm.client || !qForm.vessel.trim()) { toast("Klien & kapal wajib diisi", "info"); return; }
    const created = add("quotations", {
      client: qForm.client, vessel: qForm.vessel.trim(), type: qForm.type,
      value: Number(qForm.value) || 0, stage: qForm.stage, date: new Date().toISOString().slice(0, 10),
    }, { action: "membuat penawaran", module: "CRM" });
    toast(`Penawaran ${created.id} dibuat`);
    setShowQ(false);
    setQForm({ client: "", vessel: "", type: "New Build", value: "", stage: "Lead" });
  };

  const saveClient = () => {
    if (!cForm.name.trim()) { toast("Nama klien wajib diisi", "info"); return; }
    const created = add("clients", {
      name: cForm.name.trim(), fleet: Number(cForm.fleet) || 1, rating: Number(cForm.rating) || 80,
      since: new Date().getFullYear(),
    }, { action: "mendaftarkan klien", module: "CRM" });
    toast(`Klien ${created.id} ditambahkan`);
    setShowClient(false);
    setCForm({ name: "", fleet: "1", rating: "80" });
  };

  return (
    <div>
      <PageHeader
        title="CRM & Manajemen Klien"
        subtitle="Penawaran, pipeline penjualan, dan armada klien"
        icon={<Handshake className="h-5 w-5" />}
        actions={<button className="btn-primary-gradient" onClick={() => setShowQ(true)}><Plus className="h-4 w-4" /> Penawaran Baru</button>}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total Klien Aktif" value={String(clients.length)} icon={<Users2 className="h-5 w-5" />} chip="navy" spark={sparkRevenue} hint="Rata-rata 10 kapal/fleet" />
        <KpiCard label="Nilai Pipeline" value={fmtMiliar(pipelineTotal)} delta={`${quotations.length} penawaran aktif`} deltaDirection="up" chip="teal" hint="Lead → Menang" />
        <KpiCard label="Win Rate" value="68%" delta="+5pt vs kuartal lalu" deltaDirection="up" icon={<Star className="h-5 w-5" />} chip="violet" />
        <KpiCard label="Nilai Kontrak Menang" value={fmtMiliar(won)} delta="Siap dikonversi ke proyek" deltaDirection="up" chip="amber" hint="Bulan berjalan" />
      </div>

      <div className="mt-4 card">
        <Tabs tabs={["Pipeline", "Klien", "Penawaran", "Portal Klien"]} active={tab} onChange={setTab} />
        <div className="p-4">
          {tab === "Pipeline" && (
            <div className="space-y-4">
              <Card>
                <CardHeader title="Distribusi Penawaran" subtitle="Jumlah penawaran per tahap" />
                <div className="flex flex-wrap items-center gap-6 p-4 pt-0">
                  <Donut data={stageDist} colors={stageDist.map((d) => d.color)} size={150} thickness={20} centerValue={String(quotations.length)} centerLabel="QT" />
                  <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
                    {stageDist.map((d) => (
                      <div key={d.name} className="flex items-center gap-2 text-sm">
                        <span className="h-3 w-3 rounded-sm" style={{ background: d.color }} />
                        <span className="text-steel-600">{d.name}</span>
                        <span className="ml-auto font-semibold text-navy-900">{d.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                {stages.map((stage) => {
                  const items = quotations.filter((q) => q.stage === stage);
                  return (
                    <div key={stage} className="rounded-xl bg-surface p-3">
                      <div className="mb-3 flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-navy-900">{stage}</h3>
                        <Badge tone="gray">{items.length}</Badge>
                      </div>
                      <div className="space-y-2.5">
                        {items.map((q) => (
                          <Card key={q.id} className="card-hover p-3">
                            <p className="text-sm font-semibold text-navy-900">{q.vessel}</p>
                            <p className="text-xs text-steel-500">{q.client}</p>
                            <p className="text-xs text-steel-500 mt-0.5">{q.type}</p>
                            <div className="mt-2 flex items-center justify-between">
                              <span className="font-semibold text-navy-800">{fmtMiliar(q.value)}</span>
                              <Badge tone={stage === "Menang" ? "green" : "gray"}>{q.id}</Badge>
                            </div>
                            <div className="mt-2 flex gap-1.5">
                              {stage !== "Menang" ? (
                                <button className="btn-secondary flex-1 justify-center py-1 text-xs" onClick={() => advance(q)}>
                                  Maju <ArrowRight className="h-3 w-3" />
                                </button>
                              ) : (
                                <button className="btn-primary flex-1 justify-center py-1 text-xs" onClick={() => convertToProject(q)}>
                                  Jadikan Proyek
                                </button>
                              )}
                            </div>
                          </Card>
                        ))}
                        {items.length === 0 && <p className="text-xs text-steel-400 text-center py-4">Kosong</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {tab === "Klien" && (
            <div>
              <div className="mb-3 flex justify-end">
                <button className="btn-secondary text-xs" onClick={() => setShowClient(true)}><Plus className="h-3.5 w-3.5" /> Tambah Klien</button>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {clients.map((c) => (
                  <Card key={c.id} className="p-5">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-navy-700 text-sm font-bold text-white">
                          {String(c.name).replace("PT ", "").split(" ").map((n: string) => n[0]).slice(0, 2).join("")}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-navy-900">{c.name}</p>
                          <p className="text-xs text-steel-500">{c.id} · sejak {c.since}</p>
                        </div>
                      </div>
                      <Badge tone="green"><Star className="h-3 w-3 mr-0.5" /> {c.rating}%</Badge>
                    </div>
                    <div className="mt-4 border-t border-steel-100 pt-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-steel-500">Armada kapal</span>
                        <span className="font-semibold">{c.fleet} unit</span>
                      </div>
                      <div className="mt-1 flex justify-between text-sm">
                        <span className="text-steel-500">Nilai order</span>
                        <span className="font-semibold">{fmtRupiah(Number(c.fleet) * 48000000000 / 100)}</span>
                      </div>
                      <div className="mt-1 flex justify-between text-sm">
                        <span className="text-steel-500">Proyek berjalan</span>
                        <span className="font-semibold">{data.projects.filter((p) => p.client === c.name && p.status !== "Selesai").length} proyek</span>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {tab === "Penawaran" && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {quotations.map((q) => (
                <Card key={q.id} className="p-4">
                  <div className="flex justify-between">
                    <div>
                      <p className="font-semibold text-navy-900">{q.vessel}</p>
                      <p className="text-xs text-steel-500">{q.client} · {q.type}</p>
                    </div>
                    <Badge tone={q.stage === "Menang" ? "green" : q.stage === "Negosiasi" ? "amber" : "gray"}>{q.stage}</Badge>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-lg font-bold text-navy-900">{fmtMiliar(q.value)}</span>
                    <div className="flex gap-1.5">
                      <button className="btn-secondary text-xs" onClick={() => toast(`${q.id} dikirim ke ${q.client} (demo)`, "info")}><Send className="h-3.5 w-3.5" /> Kirim</button>
                      {q.stage !== "Menang" && <button className="btn-secondary text-xs" onClick={() => advance(q)}>Maju</button>}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {tab === "Portal Klien" && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <p className="text-sm text-steel-600 mb-3">Portal klien adalah tampilan read-only di mana pemilik kapal bisa memantau progres proyek & invoice miliknya.</p>
                <Card className="p-4">
                  <p className="text-xs text-steel-500">PT Samudra Jaya Perkasa — TB Samudra Jaya 07</p>
                  <div className="mt-2 flex items-center gap-4">
                    <ProgressBar value={62} className="flex-1" />
                    <span className="text-sm font-bold text-navy-900">62%</span>
                  </div>
                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    {[
                      { k: "Tahap", v: "Pengecatan" },
                      { k: "Delivery", v: "30 Sep 2026" },
                      { k: "Invoice", v: "INV-2607" },
                    ].map((x) => (
                      <div key={x.k} className="rounded-lg bg-surface p-3">
                        <p className="text-xs text-steel-500">{x.k}</p>
                        <p className="text-sm font-semibold text-navy-900">{x.v}</p>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
              <Card className="p-5">
                <h3 className="mb-2 text-sm font-semibold text-navy-900">Akses Portal</h3>
                <p className="text-sm text-steel-600">Undang klien untuk melihat progres proyek secara real-time.</p>
                <button className="btn-primary mt-4 w-full justify-center" onClick={() => setShowInvite(true)}><Send className="h-4 w-4" /> Kirim Undangan</button>
              </Card>
            </div>
          )}
        </div>
      </div>

      {/* Modal penawaran */}
      <Modal open={showQ} onClose={() => setShowQ(false)} title="Penawaran Baru" subtitle="Masuk ke tahap pipeline terpilih"
        wide footer={<><button className="btn-secondary" onClick={() => setShowQ(false)}>Batal</button><button className="btn-primary" onClick={saveQuotation}>Simpan Penawaran</button></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label="Klien">
              <select className="input" value={qForm.client} onChange={(e) => setQForm({ ...qForm, client: e.target.value })}>
                <option value="">Pilih klien…</option>
                {clients.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Kapal / pekerjaan"><input className="input" value={qForm.vessel} onChange={(e) => setQForm({ ...qForm, vessel: e.target.value })} placeholder="cth: TB Baru RJ-04" /></Field>
            <Field label="Jenis">
              <select className="input" value={qForm.type} onChange={(e) => setQForm({ ...qForm, type: e.target.value })}>
                <option>New Build</option><option>Repair</option><option>Retrofit</option>
              </select>
            </Field>
            <Field label="Tahap awal">
              <select className="input" value={qForm.stage} onChange={(e) => setQForm({ ...qForm, stage: e.target.value })}>
                {stages.map((s) => <option key={s}>{s}</option>)}
              </select>
            </Field>
          </FormGrid>
          <Field label="Nilai penawaran (Rp)"><input type="number" className="input" value={qForm.value} onChange={(e) => setQForm({ ...qForm, value: e.target.value })} /></Field>
        </div>
      </Modal>

      {/* Modal klien */}
      <Modal open={showClient} onClose={() => setShowClient(false)} title="Tambah Klien"
        footer={<><button className="btn-secondary" onClick={() => setShowClient(false)}>Batal</button><button className="btn-primary" onClick={saveClient}>Simpan</button></>}>
        <div className="space-y-3">
          <Field label="Nama perusahaan"><input className="input" value={cForm.name} onChange={(e) => setCForm({ ...cForm, name: e.target.value })} placeholder="cth: PT Bahari Baru" /></Field>
          <FormGrid>
            <Field label="Jumlah armada"><input type="number" className="input" value={cForm.fleet} onChange={(e) => setCForm({ ...cForm, fleet: e.target.value })} /></Field>
            <Field label="Rating (%)"><input type="number" max={100} className="input" value={cForm.rating} onChange={(e) => setCForm({ ...cForm, rating: e.target.value })} /></Field>
          </FormGrid>
        </div>
      </Modal>

      {/* Modal undangan portal */}
      <Modal open={showInvite} onClose={() => setShowInvite(false)} title="Kirim Undangan Portal"
        footer={<><button className="btn-secondary" onClick={() => setShowInvite(false)}>Batal</button><button className="btn-primary" onClick={() => {
          if (!inviteEmail.includes("@")) { toast("Email tidak valid", "info"); return; }
          toast(`Undangan terkirim ke ${inviteEmail}`); setShowInvite(false); setInviteEmail("");
        }}>Kirim</button></>}>
        <Field label="Email klien"><input type="email" className="input" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="cth: ops@samudrajaya.co.id" /></Field>
      </Modal>
    </div>
  );
}
