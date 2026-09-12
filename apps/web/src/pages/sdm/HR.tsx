import { useState } from "react";
import { Plus, Search, Users, Award, BadgeCheck, Clock, Network } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import {
  Card,
  CardHeader,
  PageHeader,
  Badge,
  KpiCard,
  ProgressBar,
  StatusBadge,
  ChartTooltip,
  Donut,
  Avatar,
  Modal,
  Field,
  FormGrid,
  toast,
} from "../../components/ui";
import { useStore, type StoreItem } from "../../data/store";
import { deptDistribution, attendanceSeries, employeeTrend, sparkUtil } from "../../data";

const deptFilter = ["Semua", "Direksi", "Proyek", "Produksi", "Quality", "Finance", "Procurement"];

const skills = [
  { name: "Welding SMAW", level: 5 },
  { name: "Welding MIG", level: 4 },
  { name: "NDT Level II", level: 5 },
  { name: "Marine Survey", level: 4 },
  { name: "Project Management", level: 5 },
  { name: "Electrical", level: 3 },
];

export default function HR() {
  const { data, add } = useStore();
  const employees = data.employees;
  const [dept, setDept] = useState("Semua");
  const [q, setQ] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", role: "", dept: "Produksi", branch: "Samarinda", certs: "" });
  const [detail, setDetail] = useState<StoreItem | null>(null);

  const list = employees.filter((e) => {
    const matchD = dept === "Semua" || e.dept === dept;
    const matchQ = e.name.toLowerCase().includes(q.toLowerCase());
    return matchD && matchQ;
  });

  const save = () => {
    if (!form.name.trim() || !form.role.trim()) { toast("Nama & jabatan wajib diisi", "info"); return; }
    const created = add("employees", {
      name: form.name.trim(), role: form.role.trim(), dept: form.dept, branch: form.branch,
      status: "Aktif", join: new Date().toISOString().slice(0, 10),
      certs: form.certs.split(",").map((c) => c.trim()).filter(Boolean),
    }, { action: "mendaftarkan karyawan", module: "SDM" });
    toast(`Karyawan ${created.id} ditambahkan`);
    setShowAdd(false);
    setForm({ name: "", role: "", dept: "Produksi", branch: "Samarinda", certs: "" });
  };

  return (
    <div>
      <PageHeader
        title="SDM & Karyawan"
        subtitle="Data karyawan, skill matrix, sertifikasi, dan payroll"
        icon={<Users className="h-5 w-5" />}
        actions={<button className="btn-primary-gradient" onClick={() => setShowAdd(true)}><Plus className="h-4 w-4" /> Tambah Karyawan</button>}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total Karyawan" value="272" delta="+4 vs bulan lalu" deltaDirection="up" icon={<Users className="h-5 w-5" />} chip="navy" spark={sparkUtil} />
        <KpiCard label="Sertifikat Segera Expire" value="7" delta="90 hari ke depan" deltaDirection="down" icon={<Award className="h-5 w-5" />} chip="rose" />
        <KpiCard label="Kehadiran (Ags)" value="97,4%" delta="+1,1pt" deltaDirection="up" icon={<Clock className="h-5 w-5" />} chip="teal" />
        <KpiCard label="Tenaga Bersertifikat" value="82%" icon={<BadgeCheck className="h-5 w-5" />} chip="violet" hint="Dari total staf teknis" />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <div className="p-4">
              <div className="mb-3 flex flex-wrap gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-steel-400" />
                  <input className="input pl-9 w-64" placeholder="Cari karyawan..." value={q} onChange={(e) => setQ(e.target.value)} />
                </div>
                <div className="flex gap-1 overflow-x-auto">
                  {deptFilter.map((d) => (
                    <button key={d} onClick={() => setDept(d)}
                      className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap ${dept === d ? "bg-navy-700 text-white" : "border border-steel-200 text-steel-600 hover:bg-steel-100"}`}>
                      {d}
                    </button>
                  ))}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-surface">
                    <tr><th className="th">Nama</th><th className="th">Jabatan</th><th className="th">Departemen</th><th className="th">Cabang</th><th className="th">Sertifikasi</th><th className="th">Status</th></tr>
                  </thead>
                  <tbody className="divide-y divide-steel-100">
                    {list.map((e) => (
                      <tr key={e.id} className="hover:bg-surface cursor-pointer" onClick={() => setDetail(e)}>
                        <td className="td">
                          <div className="flex items-center gap-2.5">
                            <Avatar name={e.name} className="h-8 w-8 shrink-0" />
                            <div>
                              <p className="font-medium text-navy-900">{e.name}</p>
                              <p className="text-xs text-steel-500 font-mono">{e.id}</p>
                            </div>
                          </div>
                        </td>
                        <td className="td text-steel-600">{e.role}</td>
                        <td className="td"><Badge tone="gray">{e.dept}</Badge></td>
                        <td className="td text-steel-600">{e.branch}</td>
                        <td className="td">
                          <div className="flex flex-wrap gap-1">
                            {(e.certs ?? []).length ? (e.certs as string[]).map((c: string) => <Badge key={c} tone="blue">{c}</Badge>) : <span className="text-steel-400 text-xs">—</span>}
                          </div>
                        </td>
                        <td className="td"><StatusBadge status={e.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {list.length === 0 && <p className="py-8 text-center text-sm text-steel-400">Tidak ada karyawan yang cocok.</p>}
              </div>
            </div>
          </Card>

          <Card className="mt-5">
            <CardHeader title="Tren Kepala & Kehadiran" subtitle="Total pekerja vs tingkat kehadiran bulanan" />
            <div className="grid grid-cols-1 gap-4 p-4 pt-0 lg:grid-cols-2">
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={employeeTrend} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                    <defs><linearGradient id="empGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#0b3a63" stopOpacity={0.3} /><stop offset="95%" stopColor="#0b3a63" stopOpacity={0} /></linearGradient></defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e9eff4" vertical={false} />
                    <XAxis dataKey="month" stroke="#8aa2b6" axisLine={false} tickLine={false} />
                    <YAxis stroke="#8aa2b6" axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTooltip formatter={(v) => `${v} orang`} />} />
                    <Area type="monotone" dataKey="count" name="Karyawan" stroke="#0b3a63" strokeWidth={2.5} fill="url(#empGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={attendanceSeries} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e9eff4" vertical={false} />
                    <XAxis dataKey="month" stroke="#8aa2b6" axisLine={false} tickLine={false} />
                    <YAxis domain={[94, 98]} stroke="#8aa2b6" axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTooltip formatter={(v) => `${v}%`} />} />
                    <Area type="monotone" dataKey="tingkat" name="Kehadiran" stroke="#0d9488" strokeWidth={2.5} fill="transparent" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="p-5">
            <div className="flex items-center gap-2">
              <Network className="h-4 w-4 text-navy-700" />
              <h3 className="text-sm font-semibold text-navy-900">Komposisi Departemen</h3>
            </div>
            <div className="mt-3 flex items-center gap-4">
              <Donut data={deptDistribution} colors={deptDistribution.map((d) => d.color)} size={150} thickness={20} centerValue="250" centerLabel="staf" />
              <div className="flex-1 space-y-1.5">
                {deptDistribution.map((d) => (
                  <div key={d.name} className="flex items-center gap-2 text-sm">
                    <span className="h-3 w-3 rounded-sm" style={{ background: d.color }} />
                    <span className="truncate text-steel-600">{d.name}</span>
                    <span className="ml-auto font-semibold text-navy-900">{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <h3 className="mb-3 text-sm font-semibold text-navy-900">Skill Matrix</h3>
            <div className="space-y-3">
              {skills.map((s) => (
                <div key={s.name}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="text-steel-600">{s.name}</span>
                    <span className="font-semibold text-navy-900">{s.level}/5</span>
                  </div>
                  <ProgressBar value={s.level * 20} tone="ocean" />
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <h3 className="mb-3 text-sm font-semibold text-navy-900">Peringatan Sertifikat</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-steel-600">CWI — Sari Wulandari</span><Badge tone="amber">30 hari</Badge></div>
              <div className="flex justify-between"><span className="text-steel-600">NDT II — Rudi H.</span><Badge tone="red">7 hari</Badge></div>
              <div className="flex justify-between"><span className="text-steel-600">PMP — B. Santoso</span><Badge tone="amber">60 hari</Badge></div>
            </div>
          </Card>
        </div>
      </div>

      {/* Modal tambah */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Tambah Karyawan"
        wide footer={<><button className="btn-secondary" onClick={() => setShowAdd(false)}>Batal</button><button className="btn-primary" onClick={save}>Simpan</button></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label="Nama lengkap"><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="cth: Joko Prasetyo" /></Field>
            <Field label="Jabatan"><input className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="cth: Welder" /></Field>
            <Field label="Departemen">
              <select className="input" value={form.dept} onChange={(e) => setForm({ ...form, dept: e.target.value })}>
                {["Direksi", "Proyek", "Produksi", "Quality", "Finance", "Procurement", "Support"].map((d) => <option key={d}>{d}</option>)}
              </select>
            </Field>
            <Field label="Cabang">
              <select className="input" value={form.branch} onChange={(e) => setForm({ ...form, branch: e.target.value })}>
                <option>Samarinda</option>
              </select>
            </Field>
          </FormGrid>
          <Field label="Sertifikasi (pisahkan koma)" hint="cth: SMAW, NDT Level I">
            <input className="input" value={form.certs} onChange={(e) => setForm({ ...form, certs: e.target.value })} />
          </Field>
        </div>
      </Modal>

      {/* Modal profil */}
      <Modal open={detail !== null} onClose={() => setDetail(null)} title={detail?.name ?? ""} subtitle={detail ? `${detail.id} · ${detail.role}` : ""}>
        {detail && (
          <div>
            <div className="flex items-center gap-3">
              <Avatar name={detail.name} className="h-14 w-14" />
              <div>
                <p className="font-bold text-navy-900">{detail.name}</p>
                <p className="text-sm text-steel-500">{detail.role} · {detail.dept} · {detail.branch}</p>
              </div>
            </div>
            <dl className="mt-4 space-y-2.5 text-sm">
              <div className="flex justify-between"><dt className="text-steel-500">Bergabung</dt><dd className="font-medium">{detail.join}</dd></div>
              <div className="flex justify-between"><dt className="text-steel-500">Status</dt><dd><StatusBadge status={detail.status} /></dd></div>
              <div className="flex justify-between"><dt className="text-steel-500">Proyek ditangani</dt><dd className="font-medium">{data.projects.filter((p) => p.manager === detail.name && p.status !== "Selesai").length} proyek</dd></div>
            </dl>
            <h4 className="mb-2 mt-4 text-sm font-semibold text-navy-900">Sertifikasi</h4>
            <div className="flex flex-wrap gap-1.5">
              {(detail.certs ?? []).length ? (detail.certs as string[]).map((c: string) => <Badge key={c} tone="blue">{c}</Badge>) : <span className="text-xs text-steel-400">Belum ada sertifikasi tercatat.</span>}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
