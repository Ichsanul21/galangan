import { useState } from "react";
import { Plus, Cpu, Wrench, AlertTriangle, Gauge } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Card, CardHeader, PageHeader, Badge, KpiCard, Tabs, ProgressBar, ChartTooltip, RadialGauge, Modal, Field, FormGrid, toast } from "../../components/ui";
import { useStore } from "../../data/store";
import { equipmentHours, sparkUtil } from "../../data";

export default function EquipmentPage() {
  const { data, add, update } = useStore();
  const equipment = data.equipment;
  const bookings = data.bookings;
  const [tab, setTab] = useState("Register");

  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", category: "Pengangkat", code: "", branch: "Batam", model: "", util: "50" });
  const [showService, setShowService] = useState(false);
  const [svcDate, setSvcDate] = useState("");
  const [svcTarget, setSvcTarget] = useState("");
  const [showBook, setShowBook] = useState(false);
  const [bookForm, setBookForm] = useState({ equip: "", proyek: "", jam: "", date: new Date().toISOString().slice(0, 10) });

  const statusTone: Record<string, "green" | "blue" | "amber" | "gray"> = {
    Tersedia: "green",
    Terpakai: "blue",
    Maintenance: "amber",
  };

  const maintenance = equipment.filter((e) => e.status === "Maintenance").length;
  const avgUtil = equipment.length ? Math.round(equipment.reduce((s, e) => s + Number(e.util || 0), 0) / equipment.length) : 0;

  const saveAdd = () => {
    if (!form.name.trim() || !form.code.trim()) { toast("Nama & kode wajib diisi", "info"); return; }
    const created = add("equipment", {
      name: form.name.trim(), category: form.category, code: form.code.trim().toUpperCase(), branch: form.branch,
      status: "Tersedia", util: Number(form.util) || 0, nextService: "-", lastHours: 0, model: form.model.trim() || "-",
    }, { action: "mendaftarkan equipment", module: "Equipment" });
    toast(`Equipment ${created.id} ditambahkan`);
    setShowAdd(false);
    setForm({ name: "", category: "Pengangkat", code: "", branch: "Batam", model: "", util: "50" });
  };

  const saveService = () => {
    if (!svcTarget || !svcDate) { toast("Pilih equipment & tanggal", "info"); return; }
    update("equipment", svcTarget, { nextService: svcDate });
    toast("Jadwal servis diperbarui");
    setShowService(false);
  };

  const saveBooking = () => {
    if (!bookForm.equip || !bookForm.proyek || !bookForm.jam.trim()) { toast("Lengkapi booking", "info"); return; }
    const clash = bookings.some((b) => b.equip === bookForm.equip && b.date === bookForm.date);
    const created = add("bookings", { equip: bookForm.equip, proyek: bookForm.proyek, jam: bookForm.jam.trim(), status: "Terjadwal", date: bookForm.date },
      { action: "membooking equipment", target: `${bookForm.equip}`, module: "Equipment" });
    const eq = equipment.find((e) => e.name === bookForm.equip);
    if (eq) update("equipment", eq.id, { status: "Terpakai" });
    toast(clash ? `Booking ${created.id} dibuat — PERINGATAN: bentrok jadwal!` : `Booking ${created.id} dibuat`);
    setShowBook(false);
    setBookForm({ equip: "", proyek: "", jam: "", date: new Date().toISOString().slice(0, 10) });
  };

  return (
    <div>
      <PageHeader
        title="Utilisasi Equipment Galangan"
        subtitle="Asset register, alokasi, dan jadwal maintenance peralatan"
        icon={<Cpu className="h-5 w-5" />}
        actions={<button className="btn-primary-gradient" onClick={() => setShowAdd(true)}><Plus className="h-4 w-4" /> Tambah Equipment</button>}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total Equipment" value={String(equipment.length)} icon={<Cpu className="h-5 w-5" />} chip="navy" spark={sparkUtil} hint="Seluruh cabang" />
        <KpiCard label="Utilitas Rata-rata" value={`${avgUtil}%`} delta="Target 75%" deltaDirection="flat" icon={<Gauge className="h-5 w-5" />} chip="teal" />
        <KpiCard label="Dalam Maintenance" value={String(maintenance)} delta="Jadwal servis" deltaDirection="down" icon={<Wrench className="h-5 w-5" />} chip="amber" />
        <KpiCard label="Perlu Servis (30 hari)" value="2" delta="SMAW-05 & MCR-100" deltaDirection="down" icon={<AlertTriangle className="h-5 w-5" />} chip="rose" />
      </div>

      <div className="mt-4 card">
        <Tabs tabs={["Register", "Alokasi / Booking", "Maintenance", "Utilisasi"]} active={tab} onChange={setTab} />
        <div className="p-4">
          {tab === "Register" && (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-surface">
                  <tr><th className="th">Equipment</th><th className="th">Kategori</th><th className="th">Model</th><th className="th">Status</th><th className="th">Utilisasi</th><th className="th">Jam Pakai</th><th className="th">Ubah Status</th></tr>
                </thead>
                <tbody className="divide-y divide-steel-100">
                  {equipment.map((e) => (
                    <tr key={e.id} className="hover:bg-surface">
                      <td className="td">
                        <p className="font-medium text-navy-900">{e.name}</p>
                        <p className="text-xs text-steel-500 font-mono">{e.code}</p>
                      </td>
                      <td className="td"><Badge tone="gray">{e.category}</Badge></td>
                      <td className="td text-steel-600">{e.model}</td>
                      <td className="td"><Badge tone={statusTone[e.status] ?? "gray"}>{e.status}</Badge></td>
                      <td className="td">
                        <div className="flex items-center gap-2">
                          <ProgressBar value={e.util} className="w-20" tone={e.util > 75 ? "amber" : "navy"} />
                          <span className="text-xs font-medium">{e.util}%</span>
                        </div>
                      </td>
                      <td className="td text-steel-600 font-mono text-xs">{Number(e.lastHours).toLocaleString()} jam</td>
                      <td className="td">
                        <select className="input w-auto py-1 text-xs" value={e.status}
                          onChange={(ev) => { update("equipment", e.id, { status: ev.target.value }); toast(`${e.name} → ${ev.target.value}`); }}>
                          {["Tersedia", "Terpakai", "Maintenance"].map((s) => <option key={s}>{s}</option>)}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === "Alokasi / Booking" && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card className="p-5">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-navy-900">Booking Berjalan</h3>
                  <button className="btn-secondary text-xs" onClick={() => setShowBook(true)}><Plus className="h-3.5 w-3.5" /> Booking</button>
                </div>
                <div className="space-y-2.5">
                  {bookings.map((b) => (
                    <div key={b.id} className="flex items-center justify-between border-b border-steel-100 py-2 text-sm">
                      <div>
                        <p className="font-medium text-navy-900">{b.equip}</p>
                        <p className="text-xs text-steel-500">{b.proyek} · {b.jam} · {b.date}</p>
                      </div>
                      <Badge tone={b.status === "Terpakai" ? "blue" : "gray"}>{b.status}</Badge>
                    </div>
                  ))}
                  {bookings.length === 0 && <p className="text-xs text-steel-400">Belum ada booking.</p>}
                </div>
              </Card>
              <Card className="p-5">
                <h3 className="mb-3 text-sm font-semibold text-navy-900">Deteksi Konflik</h3>
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  <p className="font-medium">2 konflik alokasi</p>
                  <p className="mt-1 text-xs">Mesin Las MIG-12 & Mobile Crane 100T dipesan 2 proyek pada jam yang sama tanggal 2 Agu.</p>
                </div>
                <button className="btn-primary mt-3" onClick={() => toast("Jadwal alokasi dibuka (demo)", "info")}>Tinjau Jadwal Alokasi</button>
              </Card>
            </div>
          )}

          {tab === "Maintenance" && (
            <div>
              <div className="mb-3 flex justify-end">
                <button className="btn-secondary text-xs" onClick={() => setShowService(true)}><Wrench className="h-3.5 w-3.5" /> Jadwalkan Servis</button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-surface">
                    <tr><th className="th">Equipment</th><th className="th">Jadwal Servis</th><th className="th">Tipe</th><th className="th">Status</th></tr>
                  </thead>
                  <tbody className="divide-y divide-steel-100">
                    {equipment.map((e) => (
                      <tr key={e.id} className="hover:bg-surface">
                        <td className="td font-medium text-navy-900">{e.name}</td>
                        <td className="td text-steel-600">{e.nextService}</td>
                        <td className="td"><Badge tone="gray">Preventive</Badge></td>
                        <td className="td"><Badge tone={e.status === "Maintenance" ? "amber" : "green"}>{e.status === "Maintenance" ? "Dalam Servis" : "Terjadwal"}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === "Utilisasi" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <Card className="p-5">
                  <CardHeader title="Utilitas Keseluruhan" />
                  <div className="flex items-center justify-center">
                    <RadialGauge value={avgUtil} label="Equipment" size={140} />
                  </div>
                  <p className="mt-2 text-center text-xs text-steel-500">Rata-rata seluruh peralatan dari target 75%</p>
                </Card>
                <Card className="lg:col-span-2">
                  <CardHeader title="Jam Pakai per Bulan" subtitle="Total jam operasional semua equipment" />
                  <div className="h-52 p-4 pt-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={equipmentHours} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
                        <defs><linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#2e9ad4" stopOpacity={0.35} /><stop offset="95%" stopColor="#2e9ad4" stopOpacity={0} /></linearGradient></defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e9eff4" vertical={false} />
                        <XAxis dataKey="month" stroke="#8aa2b6" axisLine={false} tickLine={false} />
                        <YAxis stroke="#8aa2b6" axisLine={false} tickLine={false} tickFormatter={(v) => `${Math.round(Number(v) / 1000)}rb`} />
                        <Tooltip content={<ChartTooltip formatter={(v) => `${Number(v).toLocaleString()} jam`} />} />
                        <Area type="monotone" dataKey="jam" stroke="#2e9ad4" strokeWidth={2.5} fill="url(#eqGrad)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {equipment.slice(0, 6).map((e) => (
                  <div key={e.id}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="text-steel-600">{e.name}</span>
                      <span className="font-semibold text-navy-900">{e.util}%</span>
                    </div>
                    <ProgressBar value={e.util} tone={e.util > 75 ? "red" : e.util > 60 ? "amber" : "green"} />
                  </div>
                ))}
              </div>
              <p className="text-xs text-steel-400">Forecast kebutuhan equipment & downtime prediktif tersedia di modul Analytics (Prediktif).</p>
            </div>
          )}
        </div>
      </div>

      {/* Modal tambah */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Tambah Equipment"
        wide footer={<><button className="btn-secondary" onClick={() => setShowAdd(false)}>Batal</button><button className="btn-primary" onClick={saveAdd}>Simpan</button></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label="Nama equipment"><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="cth: Excavator Mini" /></Field>
            <Field label="Kode aset"><input className="input font-mono" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="cth: EXC-01" /></Field>
            <Field label="Kategori">
              <select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {["Pengangkat", "Pengelasan", "Tenaga", "Transportasi", "Pengecatan", "Lainnya"].map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Cabang">
              <select className="input" value={form.branch} onChange={(e) => setForm({ ...form, branch: e.target.value })}>
                <option>Batam</option><option>Surabaya</option>
              </select>
            </Field>
            <Field label="Model"><input className="input" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} /></Field>
            <Field label="Utilisasi awal (%)"><input type="number" className="input" value={form.util} onChange={(e) => setForm({ ...form, util: e.target.value })} /></Field>
          </FormGrid>
        </div>
      </Modal>

      {/* Modal servis */}
      <Modal open={showService} onClose={() => setShowService(false)} title="Jadwalkan Servis"
        footer={<><button className="btn-secondary" onClick={() => setShowService(false)}>Batal</button><button className="btn-primary" onClick={saveService}>Simpan</button></>}>
        <div className="space-y-3">
          <Field label="Equipment">
            <select className="input" value={svcTarget} onChange={(e) => setSvcTarget(e.target.value)}>
              <option value="">Pilih…</option>
              {equipment.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.code})</option>)}
            </select>
          </Field>
          <Field label="Tanggal servis"><input type="date" className="input" value={svcDate} onChange={(e) => setSvcDate(e.target.value)} /></Field>
        </div>
      </Modal>

      {/* Modal booking */}
      <Modal open={showBook} onClose={() => setShowBook(false)} title="Booking Equipment" subtitle="Bentrok jadwal terdeteksi otomatis"
        footer={<><button className="btn-secondary" onClick={() => setShowBook(false)}>Batal</button><button className="btn-primary" onClick={saveBooking}>Simpan Booking</button></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label="Equipment">
              <select className="input" value={bookForm.equip} onChange={(e) => setBookForm({ ...bookForm, equip: e.target.value })}>
                <option value="">Pilih…</option>
                {equipment.filter((e) => e.status !== "Maintenance").map((e) => <option key={e.id} value={e.name}>{e.name}</option>)}
              </select>
            </Field>
            <Field label="Proyek">
              <select className="input" value={bookForm.proyek} onChange={(e) => setBookForm({ ...bookForm, proyek: e.target.value })}>
                <option value="">Pilih…</option>
                {data.projects.filter((p) => p.status !== "Selesai").map((p) => <option key={p.id} value={p.id}>{p.id} · {p.vessel}</option>)}
              </select>
            </Field>
            <Field label="Jam pakai"><input className="input" value={bookForm.jam} onChange={(e) => setBookForm({ ...bookForm, jam: e.target.value })} placeholder="cth: 08:00–17:00" /></Field>
            <Field label="Tanggal"><input type="date" className="input" value={bookForm.date} onChange={(e) => setBookForm({ ...bookForm, date: e.target.value })} /></Field>
          </FormGrid>
        </div>
      </Modal>
    </div>
  );
}
