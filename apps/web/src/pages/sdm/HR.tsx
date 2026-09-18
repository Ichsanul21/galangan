import { useState } from "react";
import { Plus, Search, Users, Award, BadgeCheck, Network } from "lucide-react";
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
import { attendanceSeries, employeeTrend, certExpireTrend, certifiedTrend, activeEmployeeTrend } from "../../data";
import { fmtTanggal, todayISO } from "../../utils/format";

const CERT_WINDOW = 90;

const SKILL_BY_DEPT: Record<string, string[]> = {
  Direksi: ["Kepemimpinan", "Strategi", "Keuangan"],
  Proyek: ["Perencanaan Proyek", "Koordinasi Lapangan", "Pelaporan"],
  Produksi: ["Pengelasan", "Fabrikasi", "Blasting & Coating"],
  Quality: ["Inspeksi Visual", "NDT", "Dokumentasi QC"],
  Finance: ["Akuntansi", "Penganggaran", "Perpajakan"],
  Procurement: ["Sourcing", "Negosiasi", "Kepabeanan"],
  Support: ["Administrasi", "K3", "Logistik"],
};

const DEPT_COLORS = ["#0b3a63", "#2e9ad4", "#0d9488", "#8b5cf6", "#f59e0b", "#f43f5e", "#64748b"];

interface EmpCert {
  name: string;
  expires: string;
}

function addYearsISO(iso: string, years = 2): string {
  const m = String(iso).match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/);
  if (!m) return todayISO();
  return `${Number(m[1]) + years}-${m[2]}-${m[3] ?? "01"}`;
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

function defaultSkills(dept: string, role: string): string[] {
  const base = [...(SKILL_BY_DEPT[dept] ?? ["Administrasi", "K3"])];
  if (/manager|superintendent|foreman|direktur/i.test(role) && !base.includes("Manajemen Tim")) base.push("Manajemen Tim");
  return base;
}

function getSkills(e: StoreItem): string[] {
  if (Array.isArray(e.skills) && e.skills.length > 0) return e.skills.map((s) => String(s));
  return defaultSkills(String(e.dept ?? ""), String(e.role ?? ""));
}

function normCerts(e: StoreItem): EmpCert[] {
  const fallback = addYearsISO(String(e.join ?? todayISO()));
  const raw = e.certs;
  if (Array.isArray(raw)) {
    return raw.map((c) =>
      typeof c === "string"
        ? { name: c, expires: fallback }
        : { name: String(c.name ?? "Sertifikat"), expires: String(c.expires ?? fallback) },
    );
  }
  if (typeof raw === "string" && raw.trim()) {
    return raw.split(",").map((c) => ({ name: c.trim(), expires: fallback })).filter((c) => c.name);
  }
  return [];
}

export default function HR() {
  const { data, add, update, log } = useStore();
  const employees = data.employees;
  const [dept, setDept] = useState("Semua");
  const [q, setQ] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", username: "", role: "", dept: "Produksi", branch: "Samarinda", join: "", skills: "", certs: "" });
  const [detail, setDetail] = useState<StoreItem | null>(null);
  const [skillInput, setSkillInput] = useState("");
  const [certName, setCertName] = useState("");
  const [certMonth, setCertMonth] = useState("");

  const deptOptions = ["Semua", ...Array.from(new Set(employees.map((e) => String(e.dept))))];

  const list = employees.filter((e) => {
    const matchD = dept === "Semua" || e.dept === dept;
    const matchQ = String(e.name).toLowerCase().includes(q.toLowerCase());
    return matchD && matchQ;
  });

  const deptCounts = Array.from(
    employees.reduce((m, e) => m.set(String(e.dept), (m.get(String(e.dept)) ?? 0) + 1), new Map<string, number>()),
  ).map(([name, value], i) => ({ name, value, color: DEPT_COLORS[i % DEPT_COLORS.length] }));

  const expiring = employees
    .flatMap((e) =>
      normCerts(e).map((c) => ({ emp: String(e.name), empId: String(e.id), name: c.name, expires: c.expires, days: daysUntil(c.expires) })),
    )
    .filter((c) => c.days !== null && (c.days as number) <= CERT_WINDOW)
    .sort((a, b) => (a.days as number) - (b.days as number));

  const certifiedCount = employees.filter((e) => normCerts(e).length > 0).length;
  const certifiedPct = employees.length > 0 ? Math.round((certifiedCount / employees.length) * 100) : 0;
  const activeCount = employees.filter((e) => e.status === "Aktif").length;

  const skillFreq = new Map<string, number>();
  employees.forEach((e) => {
    getSkills(e).forEach((s) => skillFreq.set(s, (skillFreq.get(s) ?? 0) + 1));
  });
  const topSkills = Array.from(skillFreq.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  const openDetail = (e: StoreItem) => {
    setDetail(e);
    setSkillInput("");
    setCertName("");
    setCertMonth("");
  };

  const save = () => {
    if (!form.name.trim() || !form.role.trim()) { toast("Nama & jabatan wajib diisi", "info"); return; }
    if (!form.join) { toast("Tanggal bergabung wajib diisi", "info"); return; }
    if (!form.username.trim()) { toast("NIK / username wajib diisi", "info"); return; }
    const dupe = employees.some(
      (e) => String(e.name).toLowerCase() === form.name.trim().toLowerCase()
        || String(e.username ?? "").toLowerCase() === form.username.trim().toLowerCase(),
    );
    if (dupe) { toast("Nama atau NIK sudah terdaftar", "info"); return; }
    const certExpires = addYearsISO(form.join);
    const created = add("employees", {
      name: form.name.trim(), username: form.username.trim(), role: form.role.trim(), dept: form.dept, branch: form.branch,
      status: "Aktif", join: form.join,
      skills: form.skills.split(",").map((s) => s.trim()).filter(Boolean),
      certs: form.certs.split(",").map((c) => c.trim()).filter(Boolean).map((name) => ({ name, expires: certExpires })),
    }, { action: "mendaftarkan karyawan", module: "SDM" });
    toast(`Karyawan ${created.id} ditambahkan`);
    setShowAdd(false);
    setForm({ name: "", username: "", role: "", dept: "Produksi", branch: "Samarinda", join: "", skills: "", certs: "" });
  };

  const saveSkills = () => {
    if (!detail) return;
    const extra = skillInput.split(",").map((s) => s.trim()).filter(Boolean);
    if (extra.length === 0) { toast("Isi minimal satu skill", "info"); return; }
    const merged = Array.from(new Set([...getSkills(detail), ...extra]));
    update("employees", detail.id, { skills: merged });
    log("memperbarui skill karyawan", detail.id, "SDM");
    setDetail({ ...detail, skills: merged });
    setSkillInput("");
    toast("Skill karyawan diperbarui");
  };

  const saveCert = () => {
    if (!detail) return;
    if (!certName.trim() || !certMonth) { toast("Nama sertifikat & berlaku hingga wajib diisi", "info"); return; }
    const next = [...normCerts(detail), { name: certName.trim(), expires: certMonth }];
    update("employees", detail.id, { certs: next });
    log("menambah sertifikat karyawan", detail.id, "SDM");
    setDetail({ ...detail, certs: next });
    setCertName("");
    setCertMonth("");
    toast("Sertifikat ditambahkan");
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
        <KpiCard label="Total Karyawan" value={String(employees.length)} icon={<Users className="h-5 w-5" />} chip="navy" spark={employeeTrend.map((d) => ({ name: d.month, v: d.count }))} hint="Data sesi berjalan" />
        <KpiCard label="Sertifikat Segera Expire" value={String(expiring.length)} delta={`Dalam ${String(CERT_WINDOW)} hari ke depan`} deltaDirection="down" icon={<Award className="h-5 w-5" />} chip="rose" spark={certExpireTrend} />
        <KpiCard label="Karyawan Aktif" value={String(activeCount)} delta={`Dari ${String(employees.length)} karyawan tercatat`} deltaDirection="up" icon={<BadgeCheck className="h-5 w-5" />} chip="teal" spark={activeEmployeeTrend} />
        <KpiCard label="Tenaga Bersertifikat" value={`${String(certifiedPct)}%`} icon={<BadgeCheck className="h-5 w-5" />} chip="violet" hint="Memiliki sertifikat tercatat" spark={certifiedTrend} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <div className="p-4">
              <div className="mb-3 flex flex-wrap gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-steel-400" />
                  <input className="input pl-9 w-full sm:w-64" placeholder="Cari karyawan..." value={q} onChange={(e) => setQ(e.target.value)} />
                </div>
                <div className="flex gap-1 overflow-x-auto">
                  {deptOptions.map((d) => (
                    <button key={d} onClick={() => setDept(d)}
                      className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap ${dept === d ? "bg-navy-700 text-white" : "border border-steel-200 text-steel-600 hover:bg-steel-100"}`}>
                      {d}
                    </button>
                  ))}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-surface sticky top-0 z-10">
                    <tr><th className="th">Nama</th><th className="th">Jabatan</th><th className="th">Departemen</th><th className="th">Bergabung</th><th className="th">Sertifikasi</th><th className="th">Status</th></tr>
                  </thead>
                  <tbody className="divide-y divide-steel-100">
                    {list.map((e) => (
                      <tr key={e.id} className="hover:bg-surface cursor-pointer" onClick={() => openDetail(e)}>
                        <td className="td">
                          <div className="flex items-center gap-2.5">
                            <Avatar name={String(e.name)} className="h-8 w-8 shrink-0" />
                            <div>
                              <p className="truncate font-medium text-navy-900" title={String(e.name)}>{e.name}</p>
                              <p className="text-xs text-steel-500 font-mono">{e.id}</p>
                            </div>
                          </div>
                        </td>
                        <td className="td text-steel-600 max-w-[160px] truncate" title={String(e.role)}>{e.role}</td>
                        <td className="td"><Badge tone="gray">{e.dept}</Badge></td>
                        <td className="td text-steel-600">{fmtTanggal(e.join)}</td>
                        <td className="td">
                          <div className="flex flex-wrap gap-1">
                            {normCerts(e).length ? normCerts(e).map((c) => <Badge key={c.name} tone="blue" className="max-w-[140px] truncate" >{c.name}</Badge>) : <span className="text-steel-400 text-xs">—</span>}
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
              <Donut data={deptCounts.map(({ name, value }) => ({ name, value }))} colors={deptCounts.map((d) => d.color)} size={150} thickness={20} centerValue={String(employees.length)} centerLabel="karyawan" />
              <div className="flex-1 space-y-1.5">
                {deptCounts.map((d) => (
                  <div key={d.name} className="flex items-center gap-2 text-sm">
                    <span className="h-3 w-3 rounded-sm" style={{ background: d.color }} />
                    <span className="truncate text-steel-600" title={d.name}>{d.name}</span>
                    <span className="ml-auto font-semibold text-navy-900">{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <h3 className="mb-3 text-sm font-semibold text-navy-900">Skill Matrix</h3>
            <div className="space-y-3">
              {topSkills.map((s) => (
                <div key={s.name}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="truncate text-steel-600" title={s.name}>{s.name}</span>
                    <span className="font-semibold text-navy-900">{s.count} orang</span>
                  </div>
                  <ProgressBar value={employees.length > 0 ? (s.count / employees.length) * 100 : 0} tone="ocean" />
                </div>
              ))}
              {topSkills.length === 0 && <p className="text-xs text-steel-400">Belum ada skill tercatat.</p>}
            </div>
          </Card>

          <Card className="p-5">
            <h3 className="mb-3 text-sm font-semibold text-navy-900">Peringatan Sertifikat</h3>
            <div className="space-y-2 text-sm">
              {expiring.slice(0, 8).map((c) => (
                <div key={`${c.empId}-${c.name}`} className="flex justify-between gap-2">
                  <span className="truncate text-steel-600" title={`${c.name} — ${c.emp} · berlaku hingga ${fmtTanggal(c.expires)}`}>{c.name} — {c.emp}</span>
                  <Badge tone={(c.days as number) < 0 ? "red" : (c.days as number) <= 30 ? "red" : "amber"}>
                    {(c.days as number) < 0 ? `Lewat ${String(Math.abs(c.days as number))} hari` : `${String(c.days)} hari`}
                  </Badge>
                </div>
              ))}
              {expiring.length === 0 && <p className="text-xs text-steel-400">Tidak ada sertifikat yang expire dalam waktu dekat.</p>}
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
            <Field label="NIK / username"><input className="input" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="cth: EMP-009" /></Field>
            <Field label="Jabatan"><input className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="cth: Welder" /></Field>
            <Field label="Tanggal bergabung"><input type="date" className="input" value={form.join} onChange={(e) => setForm({ ...form, join: e.target.value })} /></Field>
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
          <Field label="Skill awal (pisahkan koma)" hint="Kosongkan untuk memakai skill bawaan departemen">
            <input className="input" value={form.skills} onChange={(e) => setForm({ ...form, skills: e.target.value })} />
          </Field>
          <Field label="Sertifikasi (pisahkan koma)" hint="Masa berlaku awal mengikuti tanggal bergabung">
            <input className="input" value={form.certs} onChange={(e) => setForm({ ...form, certs: e.target.value })} />
          </Field>
        </div>
      </Modal>

      {/* Modal profil */}
      <Modal open={detail !== null} onClose={() => setDetail(null)} title={detail ? String(detail.name) : ""} subtitle={detail ? `${detail.id} · ${detail.role}` : ""} wide>
        {detail && (
          <div>
            <div className="flex items-center gap-3">
              <Avatar name={String(detail.name)} className="h-14 w-14" />
              <div>
                <p className="font-bold text-navy-900">{detail.name}</p>
                <p className="text-sm text-steel-500">{detail.role} · {detail.dept} · {detail.branch}</p>
              </div>
            </div>
            <dl className="mt-4 space-y-2.5 text-sm">
              <div className="flex justify-between"><dt className="text-steel-500">Bergabung</dt><dd className="font-medium">{fmtTanggal(detail.join)}</dd></div>
              <div className="flex justify-between"><dt className="text-steel-500">Status</dt><dd><StatusBadge status={detail.status} /></dd></div>
              <div className="flex justify-between"><dt className="text-steel-500">Proyek ditangani</dt><dd className="font-medium">{data.projects.filter((p) => p.manager === detail.name && p.status !== "Selesai").length} proyek</dd></div>
            </dl>
            <h4 className="mb-2 mt-4 text-sm font-semibold text-navy-900">Skill</h4>
            <div className="flex flex-wrap gap-1.5">
              {getSkills(detail).map((s) => <Badge key={s} tone="navy">{s}</Badge>)}
            </div>
            <div className="mt-2 flex gap-2">
              <input className="input flex-1" value={skillInput} onChange={(e) => setSkillInput(e.target.value)} placeholder="Tambah skill, pisahkan koma" />
              <button className="btn-secondary text-xs whitespace-nowrap" onClick={saveSkills}>Tambah</button>
            </div>
            <h4 className="mb-2 mt-4 text-sm font-semibold text-navy-900">Sertifikasi</h4>
            <div className="space-y-2">
              {normCerts(detail).length ? normCerts(detail).map((c) => {
                const left = daysUntil(c.expires);
                return (
                  <div key={c.name} className="flex items-center justify-between gap-2 rounded-lg bg-surface p-2.5 text-sm">
                    <div>
                      <p className="font-medium text-navy-900">{c.name}</p>
                      <p className="text-xs text-steel-500">Berlaku hingga {fmtTanggal(c.expires)}</p>
                    </div>
                    {left !== null && left <= CERT_WINDOW && (
                      <Badge tone={left < 0 ? "red" : left <= 30 ? "red" : "amber"}>
                        {left < 0 ? `Lewat ${String(Math.abs(left))} hari` : `Sisa ${String(left)} hari`}
                      </Badge>
                    )}
                  </div>
                );
              }) : <span className="text-xs text-steel-400">Belum ada sertifikasi tercatat.</span>}
            </div>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_160px_auto]">
              <input className="input" value={certName} onChange={(e) => setCertName(e.target.value)} placeholder="Nama sertifikat" />
              <input type="month" className="input" value={certMonth} onChange={(e) => setCertMonth(e.target.value)} aria-label="Berlaku hingga" />
              <button className="btn-secondary text-xs whitespace-nowrap" onClick={saveCert}>Tambah</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
