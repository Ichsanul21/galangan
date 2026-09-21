import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Award, BadgeCheck, Network, Plus, Search, Users } from "lucide-react";
import {
  Badge,
  Card,
  ConfirmModal,
  Donut,
  EmptyState,
  Field,
  FormGrid,
  KpiCard,
  Modal,
  PageHeader,
  ProgressBar,
  StatusBadge,
  Tabs,
  toast,
} from "../../components/ui";
import { useStore } from "../../data/store";
import type { StoreItem } from "../../data/store";
import { activeEmployeeTrend, certifiedTrend, certExpireTrend, employeeTrend } from "../../data";
import { fmtTanggal, todayISO } from "../../utils/format";

const CERT_WINDOW = 90;
const JATAH_CUTI = 12;
const TIPE_KARYAWAN = ["Tetap", "Harian", "Kontrak", "Outsourcing"];
const DEPT_OPTIONS = ["Direksi", "Proyek", "Produksi", "Quality", "Finance", "Procurement", "Support"];
const LEAVE_TYPES = ["Tahunan", "Sakit", "Melahirkan", "Unpaid"];

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

/* StoreItem ber-index-signature sehingga tidak memenuhi constraint generik inBranch;
   intersection ini mempertahankan field sekaligus memuaskan constraint. */
type Branchable = StoreItem & { branch?: string };

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
    return raw
      .split(",")
      .map((c) => ({ name: c.trim(), expires: fallback }))
      .filter((c) => c.name);
  }
  return [];
}

function empNik(e: StoreItem): string {
  const nik = String(e.username ?? "").trim();
  return nik || String(e.id);
}

function calcDays(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00`).getTime();
  const b = new Date(`${to}T00:00:00`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 0;
  return Math.round((b - a) / 86400000) + 1;
}

const emptyEmpForm = () => ({
  nik: "",
  name: "",
  role: "",
  dept: "Produksi",
  branch: "Samarinda",
  status: "Aktif",
  join: "",
  tipe: "Tetap",
  basic: "",
  allowances: "",
});

export default function HR() {
  const { data, add, update, log, branch, setBranch, inBranch } = useStore();
  const [tab, setTab] = useState("Karyawan");

  /* ---------- filter karyawan ---------- */
  const [dept, setDept] = useState("Semua");
  const [q, setQ] = useState("");

  /* ---------- form karyawan ---------- */
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyEmpForm);

  /* ---------- cuti ---------- */
  const [showLeave, setShowLeave] = useState(false);
  const [leaveForm, setLeaveForm] = useState({ employeeId: "", type: "Tahunan", from: todayISO(), to: todayISO(), note: "" });
  const [rejectTarget, setRejectTarget] = useState<StoreItem | null>(null);

  /* ---------- mutasi ---------- */
  const [showMutasi, setShowMutasi] = useState(false);
  const [mutasiForm, setMutasiForm] = useState({ employeeId: "", dept: "Produksi", branch: "Samarinda", role: "", date: todayISO(), reason: "" });

  /* ---------- training ---------- */
  const [showTraining, setShowTraining] = useState(false);
  const [trainingForm, setTrainingForm] = useState({ title: "", date: todayISO(), provider: "", participants: [] as string[] });
  const [certTarget, setCertTarget] = useState<StoreItem | null>(null);
  const [certForm, setCertForm] = useState({ name: "", expires: todayISO().slice(0, 7) });

  const branchCities = useMemo(() => data.branches.map((b) => String(b.city)), [data.branches]);
  const scopedEmployees = useMemo(() => inBranch(data.employees as Branchable[]), [data.employees, inBranch]);
  const deptOptions = useMemo(
    () => ["Semua", ...Array.from(new Set(data.employees.map((e) => String(e.dept))))],
    [data.employees],
  );

  const leaveUsed = useMemo(() => {
    const m = new Map<string, number>();
    data.leaves
      .filter((l) => l.type === "Tahunan" && l.status === "Disetujui")
      .forEach((l) => m.set(String(l.employeeId), (m.get(String(l.employeeId)) ?? 0) + Number(l.days || 0)));
    return m;
  }, [data.leaves]);
  const saldoCuti = (empId: string) => JATAH_CUTI - (leaveUsed.get(empId) ?? 0);

  const list = useMemo(
    () =>
      scopedEmployees.filter((e) => {
        const matchD = dept === "Semua" || e.dept === dept;
        const needle = q.trim().toLowerCase();
        const matchQ =
          !needle ||
          String(e.name).toLowerCase().includes(needle) ||
          empNik(e).toLowerCase().includes(needle) ||
          String(e.role ?? "").toLowerCase().includes(needle);
        return matchD && matchQ;
      }),
    [scopedEmployees, dept, q],
  );

  const deptCounts = useMemo(() => {
    const m = new Map<string, number>();
    scopedEmployees.forEach((e) => m.set(String(e.dept), (m.get(String(e.dept)) ?? 0) + 1));
    return Array.from(m.entries()).map(([name, value], i) => ({ name, value, color: DEPT_COLORS[i % DEPT_COLORS.length] }));
  }, [scopedEmployees]);

  const expiring = useMemo(
    () =>
      data.employees
        .flatMap((e) =>
          normCerts(e).map((c) => ({
            emp: String(e.name),
            empId: String(e.id),
            name: c.name,
            expires: c.expires,
            days: daysUntil(c.expires),
          })),
        )
        .filter((c) => c.days !== null && (c.days as number) <= CERT_WINDOW)
        .sort((a, b) => (a.days as number) - (b.days as number)),
    [data.employees],
  );

  const certifiedCount = data.employees.filter((e) => normCerts(e).length > 0).length;
  const certifiedPct = data.employees.length > 0 ? Math.round((certifiedCount / data.employees.length) * 100) : 0;
  const activeCount = data.employees.filter((e) => e.status === "Aktif").length;

  const topSkills = useMemo(() => {
    const freq = new Map<string, number>();
    data.employees.forEach((e) => {
      getSkills(e).forEach((s) => freq.set(s, (freq.get(s) ?? 0) + 1));
    });
    return Array.from(freq.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [data.employees]);

  const mutasiLog = useMemo(
    () =>
      data.activities
        .filter((a) => `${a.action} ${a.target}`.toLowerCase().includes("mutasi"))
        .slice(0, 5),
    [data.activities],
  );

  const orgGroups = useMemo(() => {
    const m = new Map<string, StoreItem[]>();
    scopedEmployees.forEach((e) => {
      const k = String(e.dept || "Lainnya");
      m.set(k, [...(m.get(k) ?? []), e]);
    });
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [scopedEmployees]);

  /* ---------- simpan karyawan ---------- */
  const openAdd = () => {
    setEditingId(null);
    setForm({ ...emptyEmpForm(), branch: branch === "SEMUA" ? "Samarinda" : branch });
    setShowForm(true);
  };

  const openEdit = (e: StoreItem) => {
    setEditingId(e.id);
    setForm({
      nik: empNik(e),
      name: String(e.name ?? ""),
      role: String(e.role ?? ""),
      dept: String(e.dept ?? "Produksi"),
      branch: String(e.branch ?? "Samarinda"),
      status: String(e.status ?? "Aktif"),
      join: String(e.join ?? ""),
      tipe: String(e.tipe ?? "Tetap"),
      basic: String(e.basic ?? ""),
      allowances: String(e.allowances ?? ""),
    });
    setShowForm(true);
  };

  const saveEmployee = () => {
    const nik = form.nik.trim();
    const name = form.name.trim();
    const role = form.role.trim();
    if (!name || !role) {
      toast("Nama & jabatan wajib diisi", "info");
      return;
    }
    if (!nik) {
      toast("NIK wajib diisi", "info");
      return;
    }
    if (!form.join) {
      toast("Tanggal bergabung wajib diisi", "info");
      return;
    }
    const dupe = data.employees.some(
      (e) =>
        e.id !== editingId &&
        (String(e.name).toLowerCase() === name.toLowerCase() ||
          empNik(e).toLowerCase() === nik.toLowerCase()),
    );
    if (dupe) {
      toast("Nama atau NIK sudah terdaftar", "info");
      return;
    }
    const basic = Number(form.basic || 0);
    const allowances = Number(form.allowances || 0);
    if (Number.isNaN(basic) || basic < 0 || Number.isNaN(allowances) || allowances < 0) {
      toast("Gaji pokok & tunjangan harus angka valid", "info");
      return;
    }
    if (editingId) {
      update("employees", editingId, {
        username: nik,
        name,
        role,
        dept: form.dept,
        branch: form.branch,
        status: form.status,
        join: form.join,
        tipe: form.tipe,
        basic,
        allowances,
      });
      log("memperbarui data karyawan", editingId, "SDM");
      toast(`Karyawan ${editingId} diperbarui`);
    } else {
      const created = add(
        "employees",
        {
          username: nik,
          name,
          role,
          dept: form.dept,
          branch: form.branch,
          status: form.status,
          join: form.join,
          tipe: form.tipe,
          basic,
          allowances,
          skills: defaultSkills(form.dept, role),
          certs: [],
        },
        { action: "mendaftarkan karyawan", module: "SDM" },
      );
      toast(`Karyawan ${created.id} ditambahkan`);
    }
    setShowForm(false);
    setEditingId(null);
    setForm(emptyEmpForm());
  };

  /* ---------- cuti ---------- */
  const leaveDays = calcDays(leaveForm.from, leaveForm.to);

  const saveLeave = () => {
    if (!leaveForm.employeeId) {
      toast("Pilih karyawan dulu", "info");
      return;
    }
    if (leaveDays <= 0) {
      toast("Rentang tanggal cuti tidak valid", "info");
      return;
    }
    if (leaveForm.type === "Tahunan" && saldoCuti(leaveForm.employeeId) < leaveDays) {
      toast("Saldo cuti tahunan tidak mencukupi", "info");
      return;
    }
    const created = add(
      "leaves",
      {
        employeeId: leaveForm.employeeId,
        type: leaveForm.type,
        from: leaveForm.from,
        to: leaveForm.to,
        days: leaveDays,
        status: "Diajukan",
        note: leaveForm.note.trim(),
      },
      { action: "mengajukan cuti", module: "SDM" },
    );
    toast(`Pengajuan ${created.id} dicatat (${leaveDays} hari)`);
    setShowLeave(false);
    setLeaveForm({ employeeId: "", type: "Tahunan", from: todayISO(), to: todayISO(), note: "" });
  };

  const approveLeave = (l: StoreItem) => {
    update("leaves", l.id, { status: "Disetujui" });
    log("menyetujui cuti", `${l.id} · ${empNameOf(l.employeeId)}`, "SDM");
    toast(`${l.id} disetujui`);
  };

  const empNameOf = (id: string) => data.employees.find((e) => e.id === id)?.name ?? id;

  /* ---------- mutasi ---------- */
  const saveMutasi = () => {
    const emp = data.employees.find((e) => e.id === mutasiForm.employeeId);
    if (!emp) {
      toast("Pilih karyawan dulu", "info");
      return;
    }
    if (!mutasiForm.role.trim()) {
      toast("Jabatan baru wajib diisi", "info");
      return;
    }
    if (!mutasiForm.date) {
      toast("Tanggal mutasi wajib diisi", "info");
      return;
    }
    const from = `${emp.dept}/${emp.branch}/${emp.role}`;
    const to = `${mutasiForm.dept}/${mutasiForm.branch}/${mutasiForm.role.trim()}`;
    update("employees", emp.id, { dept: mutasiForm.dept, branch: mutasiForm.branch, role: mutasiForm.role.trim() });
    log(`mutasi ${from} → ${to} per ${mutasiForm.date}${mutasiForm.reason.trim() ? ` · ${mutasiForm.reason.trim()}` : ""}`, emp.id, "SDM");
    toast(`Mutasi ${emp.id} dicatat`);
    setShowMutasi(false);
    setMutasiForm({ employeeId: "", dept: "Produksi", branch: "Samarinda", role: "", date: todayISO(), reason: "" });
  };

  /* ---------- training ---------- */
  const toggleParticipant = (id: string) => {
    setTrainingForm((f) => ({
      ...f,
      participants: f.participants.includes(id) ? f.participants.filter((p) => p !== id) : [...f.participants, id],
    }));
  };

  const saveTraining = () => {
    if (!trainingForm.title.trim()) {
      toast("Judul training wajib diisi", "info");
      return;
    }
    if (!trainingForm.date) {
      toast("Tanggal training wajib diisi", "info");
      return;
    }
    if (trainingForm.participants.length === 0) {
      toast("Pilih minimal satu peserta", "info");
      return;
    }
    const created = add(
      "trainings",
      {
        title: trainingForm.title.trim(),
        date: trainingForm.date,
        participants: trainingForm.participants,
        provider: trainingForm.provider.trim() || "-",
        status: "Terjadwal",
      },
      { action: "menjadwalkan training", module: "SDM" },
    );
    toast(`Training ${created.id} dijadwalkan`);
    setShowTraining(false);
    setTrainingForm({ title: "", date: todayISO(), provider: "", participants: [] });
  };

  const finishTraining = (t: StoreItem) => {
    update("trainings", t.id, { status: "Selesai" });
    log("menyelesaikan training", `${t.id} · ${t.title}`, "SDM");
    toast(`${t.id} selesai — terapkan sertifikat bila perlu`);
  };

  const applyCert = () => {
    if (!certTarget) return;
    if (!certForm.name.trim() || !certForm.expires) {
      toast("Nama sertifikat & berlaku hingga wajib diisi", "info");
      return;
    }
    const ids = (certTarget.participants ?? []) as string[];
    ids.forEach((empId) => {
      const emp = data.employees.find((e) => e.id === empId);
      if (!emp) return;
      const next = [...normCerts(emp), { name: certForm.name.trim(), expires: certForm.expires }];
      update("employees", empId, { certs: next });
    });
    log("menerapkan sertifikat training", `${certTarget.id} · ${certForm.name.trim()} → ${ids.length} peserta`, "SDM");
    toast(`Sertifikat diterapkan ke ${ids.length} peserta`);
    setCertTarget(null);
    setCertForm({ name: "", expires: todayISO().slice(0, 7) });
  };

  return (
    <div>
      <PageHeader
        title="SDM & Karyawan"
        subtitle="Data karyawan, cuti, mutasi, struktur organisasi, dan training"
        icon={<Users className="h-5 w-5" />}
        actions={
          tab === "Karyawan" ? (
            <button className="btn-primary-gradient" onClick={openAdd}>
              <Plus className="h-4 w-4" /> Tambah Karyawan
            </button>
          ) : tab === "Cuti & Izin" ? (
            <button className="btn-primary-gradient" onClick={() => setShowLeave(true)}>
              <Plus className="h-4 w-4" /> Ajukan Cuti
            </button>
          ) : tab === "Mutasi" ? (
            <button className="btn-primary-gradient" onClick={() => setShowMutasi(true)}>
              <Plus className="h-4 w-4" /> Catat Mutasi
            </button>
          ) : tab === "Training" ? (
            <button className="btn-primary-gradient" onClick={() => setShowTraining(true)}>
              <Plus className="h-4 w-4" /> Jadwalkan Training
            </button>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total Karyawan" value={String(data.employees.length)} icon={<Users className="h-5 w-5" />} chip="navy" spark={employeeTrend.map((d) => ({ name: d.month, v: d.count }))} hint="Data sesi berjalan" />
        <KpiCard label="Sertifikat Segera Expire" value={String(expiring.length)} delta={`Dalam ${String(CERT_WINDOW)} hari ke depan`} deltaDirection="down" icon={<Award className="h-5 w-5" />} chip="rose" spark={certExpireTrend} />
        <KpiCard label="Karyawan Aktif" value={String(activeCount)} delta={`Dari ${String(data.employees.length)} karyawan tercatat`} deltaDirection="up" icon={<BadgeCheck className="h-5 w-5" />} chip="teal" spark={activeEmployeeTrend} />
        <KpiCard label="Tenaga Bersertifikat" value={`${String(certifiedPct)}%`} icon={<BadgeCheck className="h-5 w-5" />} chip="violet" hint="Memiliki sertifikat tercatat" spark={certifiedTrend} />
      </div>

      <div className="mt-4 card">
        <Tabs tabs={["Karyawan", "Cuti & Izin", "Mutasi", "Org Chart", "Training"]} active={tab} onChange={setTab} />
        <div className="p-4">
          {tab === "Karyawan" && (
            <div>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-steel-400" />
                  <input className="input pl-9 w-full sm:w-60" placeholder="Cari nama / NIK / jabatan..." value={q} onChange={(e) => setQ(e.target.value)} />
                </div>
                <select className="input w-auto" value={dept} onChange={(e) => setDept(e.target.value)} aria-label="Filter departemen">
                  {deptOptions.map((d) => (
                    <option key={d} value={d}>{d === "Semua" ? "Semua Dept" : d}</option>
                  ))}
                </select>
                <select className="input w-auto" value={branch} onChange={(e) => setBranch(e.target.value)} aria-label="Filter cabang">
                  <option value="SEMUA">Semua Cabang</option>
                  {branchCities.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                <Card className="xl:col-span-2">
                  <div className="overflow-x-auto p-2">
                    <table className="w-full">
                      <thead className="bg-surface sticky top-0 z-10">
                        <tr>
                          <th className="th">Karyawan</th>
                          <th className="th">NIK</th>
                          <th className="th">Jabatan</th>
                          <th className="th">Cabang</th>
                          <th className="th">Saldo Cuti</th>
                          <th className="th">Status</th>
                          <th className="th">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-steel-100">
                        {list.map((e) => (
                          <tr key={e.id} className="hover:bg-surface">
                            <td className="td">
                              <p className="font-medium text-navy-900">{e.name}</p>
                              <p className="text-xs text-steel-500 font-mono">{e.id} · {e.dept}</p>
                            </td>
                            <td className="td font-mono text-steel-600">{empNik(e)}</td>
                            <td className="td text-steel-600 max-w-[160px] truncate" title={String(e.role)}>{e.role}</td>
                            <td className="td"><Badge tone="gray">{e.branch ?? "-"}</Badge></td>
                            <td className="td font-semibold text-navy-900">{saldoCuti(e.id)} hari</td>
                            <td className="td"><StatusBadge status={String(e.status)} /></td>
                            <td className="td">
                              <div className="flex items-center gap-2 whitespace-nowrap">
                                <Link to={`/sdm/karyawan/${e.id}`} className="text-sm font-semibold text-ocean-600 hover:underline">Detail</Link>
                                <button className="text-sm font-semibold text-navy-700 hover:underline" onClick={() => openEdit(e)}>Edit</button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {list.length === 0 && <EmptyState title="Tidak ada karyawan yang cocok" subtitle="Ubah kata kunci atau filter cabang." />}
                  </div>
                </Card>

                <div className="space-y-4">
                  <Card className="p-5">
                    <div className="flex items-center gap-2">
                      <Network className="h-4 w-4 text-navy-700" />
                      <h3 className="text-sm font-semibold text-navy-900">Komposisi Departemen</h3>
                    </div>
                    <div className="mt-3 flex items-center gap-4">
                      <Donut data={deptCounts.map(({ name, value }) => ({ name, value }))} colors={deptCounts.map((d) => d.color)} size={140} thickness={20} centerValue={String(scopedEmployees.length)} centerLabel="karyawan" />
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
                          <ProgressBar value={data.employees.length > 0 ? (s.count / data.employees.length) * 100 : 0} tone="ocean" />
                        </div>
                      ))}
                      {topSkills.length === 0 && <p className="text-xs text-steel-400">Belum ada skill tercatat.</p>}
                    </div>
                  </Card>
                </div>
              </div>
            </div>
          )}

          {tab === "Cuti & Izin" && (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-surface sticky top-0 z-10">
                  <tr>
                    <th className="th">ID</th>
                    <th className="th">Karyawan</th>
                    <th className="th">Tipe</th>
                    <th className="th">Periode</th>
                    <th className="th">Hari</th>
                    <th className="th">Saldo Sisa</th>
                    <th className="th">Status</th>
                    <th className="th">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-steel-100">
                  {data.leaves.map((l) => (
                    <tr key={l.id} className="hover:bg-surface">
                      <td className="td font-mono text-steel-600">{l.id}</td>
                      <td className="td text-navy-900">{empNameOf(String(l.employeeId))}</td>
                      <td className="td"><Badge tone="gray">{l.type}</Badge></td>
                      <td className="td text-steel-600">{fmtTanggal(l.from)} → {fmtTanggal(l.to)}</td>
                      <td className="td font-semibold">{l.days} hari</td>
                      <td className="td text-steel-600">{l.type === "Tahunan" ? `${saldoCuti(String(l.employeeId))} hari` : "—"}</td>
                      <td className="td"><StatusBadge status={String(l.status)} /></td>
                      <td className="td">
                        {l.status === "Diajukan" ? (
                          <div className="flex items-center gap-2 whitespace-nowrap">
                            <button className="text-sm font-semibold text-emerald-600 hover:underline" onClick={() => approveLeave(l)}>Setujui</button>
                            <button className="text-sm font-semibold text-rose-600 hover:underline" onClick={() => setRejectTarget(l)}>Tolak</button>
                          </div>
                        ) : (
                          <span className="text-xs text-steel-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.leaves.length === 0 && <EmptyState title="Belum ada pengajuan cuti" subtitle="Klik Ajukan Cuti untuk mencatat." />}
            </div>
          )}

          {tab === "Mutasi" && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card className="p-5">
                <h3 className="text-sm font-semibold text-navy-900">5 Mutasi Terakhir</h3>
                <div className="mt-3 space-y-2.5">
                  {mutasiLog.map((a) => (
                    <div key={a.id} className="rounded-lg bg-surface p-2.5 text-sm">
                      <p className="font-medium text-navy-900">{a.action}</p>
                      <p className="text-xs text-steel-500">{a.target} · {a.time}</p>
                    </div>
                  ))}
                  {mutasiLog.length === 0 && <p className="text-xs text-steel-400">Belum ada mutasi tercatat.</p>}
                </div>
              </Card>
              <Card className="p-5">
                <h3 className="text-sm font-semibold text-navy-900">Karyawan per Cabang</h3>
                <div className="mt-3 space-y-2">
                  {branchCities.map((c) => (
                    <div key={c} className="flex items-center justify-between text-sm">
                      <span className="text-steel-600">{c}</span>
                      <span className="font-semibold text-navy-900">{data.employees.filter((e) => e.branch === c).length} orang</span>
                    </div>
                  ))}
                </div>
                <button className="btn-secondary mt-4 text-xs" onClick={() => setShowMutasi(true)}>Catat mutasi baru</button>
              </Card>
            </div>
          )}

          {tab === "Org Chart" && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {orgGroups.map(([deptName, members]) => {
                const head = members.find((m) => /manager/i.test(String(m.role))) ?? members[0];
                const rest = members.filter((m) => m.id !== head?.id);
                return (
                  <Card key={deptName} className="p-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-navy-900">{deptName}</h3>
                      <Badge tone="navy">{members.length} orang</Badge>
                    </div>
                    {head && (
                      <div className="mt-3 rounded-xl border border-navy-200 bg-navy-50 p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-navy-600">Kepala</p>
                        <p className="mt-0.5 font-semibold text-navy-900">{head.name}</p>
                        <p className="text-xs text-steel-500">{head.role} · {head.branch}</p>
                      </div>
                    )}
                    <div className="mt-2 space-y-1.5">
                      {rest.map((m) => (
                        <div key={m.id} className="flex items-center justify-between rounded-lg bg-surface px-2.5 py-1.5 text-sm">
                          <span className="truncate text-steel-700" title={`${m.name} · ${m.role}`}>{m.name}</span>
                          <span className="ml-2 shrink-0 text-xs text-steel-400">{m.role}</span>
                        </div>
                      ))}
                      {rest.length === 0 && <p className="text-xs text-steel-400">Hanya kepala departemen.</p>}
                    </div>
                  </Card>
                );
              })}
              {orgGroups.length === 0 && <EmptyState title="Belum ada data organisasi" subtitle="Tambahkan karyawan terlebih dahulu." />}
            </div>
          )}

          {tab === "Training" && (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-surface sticky top-0 z-10">
                  <tr>
                    <th className="th">ID</th>
                    <th className="th">Judul</th>
                    <th className="th">Tanggal</th>
                    <th className="th">Provider</th>
                    <th className="th">Peserta</th>
                    <th className="th">Status</th>
                    <th className="th">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-steel-100">
                  {data.trainings.map((t) => {
                    const parts = ((t.participants ?? []) as string[]).map((id) => empNameOf(id));
                    return (
                      <tr key={t.id} className="hover:bg-surface">
                        <td className="td font-mono text-steel-600">{t.id}</td>
                        <td className="td font-medium text-navy-900">{t.title}</td>
                        <td className="td text-steel-600">{fmtTanggal(t.date)}</td>
                        <td className="td text-steel-600">{t.provider}</td>
                        <td className="td text-steel-600 max-w-[220px] truncate" title={parts.join(", ")}>{parts.length} orang · {parts.join(", ")}</td>
                        <td className="td"><StatusBadge status={String(t.status)} /></td>
                        <td className="td">
                          <div className="flex items-center gap-2 whitespace-nowrap">
                            {t.status !== "Selesai" && (
                              <button className="text-sm font-semibold text-emerald-600 hover:underline" onClick={() => finishTraining(t)}>Tandai Selesai</button>
                            )}
                            {t.status === "Selesai" && (
                              <button className="text-sm font-semibold text-ocean-600 hover:underline" onClick={() => setCertTarget(t)}>Terapkan Sertifikat</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {data.trainings.length === 0 && <EmptyState title="Belum ada training" subtitle="Klik Jadwalkan Training untuk menambah." />}
            </div>
          )}
        </div>
      </div>

      {/* ---------- modal karyawan ---------- */}
      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editingId ? "Edit Karyawan" : "Tambah Karyawan"}
        subtitle="NIK harus unik — angka & saldo cuti ditarik dari data"
        wide
        footer={
          <>
            <button className="btn-secondary" onClick={() => setShowForm(false)}>Batal</button>
            <button className="btn-primary" onClick={saveEmployee}>Simpan</button>
          </>
        }
      >
        <div className="space-y-3">
          <FormGrid>
            <Field label="NIK"><input className="input" value={form.nik} onChange={(e) => setForm({ ...form, nik: e.target.value })} placeholder="cth: 640701..." /></Field>
            <Field label="Nama lengkap"><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="cth: Joko Prasetyo" /></Field>
            <Field label="Jabatan"><input className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="cth: Welder" /></Field>
            <Field label="Departemen">
              <select className="input" value={form.dept} onChange={(e) => setForm({ ...form, dept: e.target.value })}>
                {DEPT_OPTIONS.map((d) => <option key={d}>{d}</option>)}
              </select>
            </Field>
            <Field label="Cabang">
              <select className="input" value={form.branch} onChange={(e) => setForm({ ...form, branch: e.target.value })}>
                {branchCities.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Status">
              <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option>Aktif</option>
                <option>Nonaktif</option>
                <option>Cuti</option>
              </select>
            </Field>
            <Field label="Tanggal bergabung"><input type="date" className="input" value={form.join} onChange={(e) => setForm({ ...form, join: e.target.value })} /></Field>
            <Field label="Tipe karyawan">
              <select className="input" value={form.tipe} onChange={(e) => setForm({ ...form, tipe: e.target.value })}>
                {TIPE_KARYAWAN.map((t) => <option key={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Gaji pokok (Rp)"><input type="number" min="0" className="input" value={form.basic} onChange={(e) => setForm({ ...form, basic: e.target.value })} placeholder="cth: 6500000" /></Field>
            <Field label="Tunjangan (Rp)"><input type="number" min="0" className="input" value={form.allowances} onChange={(e) => setForm({ ...form, allowances: e.target.value })} placeholder="cth: 1500000" /></Field>
          </FormGrid>
        </div>
      </Modal>

      {/* ---------- modal cuti ---------- */}
      <Modal
        open={showLeave}
        onClose={() => setShowLeave(false)}
        title="Ajukan Cuti & Izin"
        subtitle={`Durasi dihitung otomatis · jatah tahunan ${JATAH_CUTI} hari`}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setShowLeave(false)}>Batal</button>
            <button className="btn-primary" onClick={saveLeave}>Simpan Pengajuan</button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Karyawan">
            <select className="input" value={leaveForm.employeeId} onChange={(e) => setLeaveForm({ ...leaveForm, employeeId: e.target.value })}>
              <option value="">— Pilih —</option>
              {scopedEmployees.map((e) => (
                <option key={e.id} value={e.id}>{e.name} · sisa {saldoCuti(e.id)} hari</option>
              ))}
            </select>
          </Field>
          <FormGrid>
            <Field label="Tipe">
              <select className="input" value={leaveForm.type} onChange={(e) => setLeaveForm({ ...leaveForm, type: e.target.value })}>
                {LEAVE_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Durasi"><input className="input" value={`${leaveDays} hari`} disabled /></Field>
            <Field label="Dari"><input type="date" className="input" value={leaveForm.from} onChange={(e) => setLeaveForm({ ...leaveForm, from: e.target.value })} /></Field>
            <Field label="Sampai"><input type="date" className="input" value={leaveForm.to} onChange={(e) => setLeaveForm({ ...leaveForm, to: e.target.value })} /></Field>
          </FormGrid>
          <Field label="Keterangan"><input className="input" value={leaveForm.note} onChange={(e) => setLeaveForm({ ...leaveForm, note: e.target.value })} placeholder="Keperluan..." /></Field>
        </div>
      </Modal>

      <ConfirmModal
        open={rejectTarget !== null}
        title="Tolak pengajuan?"
        desc={`Pengajuan ${rejectTarget?.id ?? ""} akan ditolak dan saldo cuti tidak terpotong.`}
        confirmLabel="Ya, tolak"
        danger
        onCancel={() => setRejectTarget(null)}
        onConfirm={() => {
          if (rejectTarget) {
            update("leaves", rejectTarget.id, { status: "Ditolak" });
            log("menolak cuti", rejectTarget.id, "SDM");
            toast(`${rejectTarget.id} ditolak`);
          }
          setRejectTarget(null);
        }}
      />

      {/* ---------- modal mutasi ---------- */}
      <Modal
        open={showMutasi}
        onClose={() => setShowMutasi(false)}
        title="Catat Mutasi"
        subtitle="Perpindahan dept / cabang / jabatan + alasan"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setShowMutasi(false)}>Batal</button>
            <button className="btn-primary" onClick={saveMutasi}>Simpan Mutasi</button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Karyawan">
            <select className="input" value={mutasiForm.employeeId} onChange={(e) => setMutasiForm({ ...mutasiForm, employeeId: e.target.value })}>
              <option value="">— Pilih —</option>
              {data.employees.map((e) => (
                <option key={e.id} value={e.id}>{e.name} · {e.dept}/{e.branch}/{e.role}</option>
              ))}
            </select>
          </Field>
          <FormGrid>
            <Field label="Dept baru">
              <select className="input" value={mutasiForm.dept} onChange={(e) => setMutasiForm({ ...mutasiForm, dept: e.target.value })}>
                {DEPT_OPTIONS.map((d) => <option key={d}>{d}</option>)}
              </select>
            </Field>
            <Field label="Cabang baru">
              <select className="input" value={mutasiForm.branch} onChange={(e) => setMutasiForm({ ...mutasiForm, branch: e.target.value })}>
                {branchCities.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Jabatan baru"><input className="input" value={mutasiForm.role} onChange={(e) => setMutasiForm({ ...mutasiForm, role: e.target.value })} placeholder="cth: Foreman" /></Field>
            <Field label="Tanggal mutasi"><input type="date" className="input" value={mutasiForm.date} onChange={(e) => setMutasiForm({ ...mutasiForm, date: e.target.value })} /></Field>
          </FormGrid>
          <Field label="Alasan"><input className="input" value={mutasiForm.reason} onChange={(e) => setMutasiForm({ ...mutasiForm, reason: e.target.value })} placeholder="Kebutuhan proyek / promosi..." /></Field>
        </div>
      </Modal>

      {/* ---------- modal training ---------- */}
      <Modal
        open={showTraining}
        onClose={() => setShowTraining(false)}
        title="Jadwalkan Training"
        wide
        footer={
          <>
            <button className="btn-secondary" onClick={() => setShowTraining(false)}>Batal</button>
            <button className="btn-primary" onClick={saveTraining}>Simpan Jadwal</button>
          </>
        }
      >
        <div className="space-y-3">
          <FormGrid>
            <Field label="Judul"><input className="input" value={trainingForm.title} onChange={(e) => setTrainingForm({ ...trainingForm, title: e.target.value })} placeholder="cth: Welding Inspector Refresh" /></Field>
            <Field label="Tanggal"><input type="date" className="input" value={trainingForm.date} onChange={(e) => setTrainingForm({ ...trainingForm, date: e.target.value })} /></Field>
          </FormGrid>
          <Field label="Provider"><input className="input" value={trainingForm.provider} onChange={(e) => setTrainingForm({ ...trainingForm, provider: e.target.value })} placeholder="cth: B4T / Internal HSE" /></Field>
          <Field label={`Peserta (${trainingForm.participants.length} dipilih)`}>
            <div className="max-h-48 space-y-1.5 overflow-y-auto rounded-xl border border-steel-200 p-2.5">
              {scopedEmployees.map((e) => (
                <label key={e.id} className="flex cursor-pointer items-center gap-2 text-sm text-steel-700">
                  <input type="checkbox" checked={trainingForm.participants.includes(e.id)} onChange={() => toggleParticipant(e.id)} />
                  {e.name} · {e.role}
                </label>
              ))}
              {scopedEmployees.length === 0 && <p className="text-xs text-steel-400">Tidak ada karyawan pada cabang ini.</p>}
            </div>
          </Field>
        </div>
      </Modal>

      <Modal
        open={certTarget !== null}
        onClose={() => setCertTarget(null)}
        title="Terapkan Sertifikat"
        subtitle={certTarget ? `${certTarget.id} · ${(certTarget.participants as string[]).length} peserta` : ""}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setCertTarget(null)}>Batal</button>
            <button className="btn-primary" onClick={applyCert}>Terapkan</button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Nama sertifikat"><input className="input" value={certForm.name} onChange={(e) => setCertForm({ ...certForm, name: e.target.value })} placeholder="cth: Welding Inspector" /></Field>
          <Field label="Berlaku hingga"><input type="month" className="input" value={certForm.expires} onChange={(e) => setCertForm({ ...certForm, expires: e.target.value })} /></Field>
        </div>
      </Modal>
    </div>
  );
}
