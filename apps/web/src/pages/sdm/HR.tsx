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
  SortTh,
  StatusBadge,
  Tabs,
  sortRows,
  toast,
  toggleSort,
} from "../../components/ui";
import type { SortState } from "../../components/ui";
import { useStore } from "../../data/store";
import type { StoreItem } from "../../data/store";
import { activeEmployeeTrend, certifiedTrend, certExpireTrend, employeeTrend } from "../../data";
import { fmtTanggal, todayISO } from "../../utils/format";
import { getSetting } from "../../utils/settings";
import { useDraftState } from "../../utils/draft";
import { exportExcel } from "../../utils/export";

const CERT_WINDOW = 90;
const TIPE_KARYAWAN = ["Tetap", "Harian", "Kontrak", "Outsourcing"];
const PTKP_STATUS = ["TK/0", "TK/1", "TK/2", "TK/3", "K/0", "K/1", "K/2", "K/3"];
const SURAT_JENIS = ["SP 1", "SP 2", "SP 3", "Mutasi"];
const IMPORT_HEADERS = ["NIK", "Nama", "Jabatan", "Departemen", "Cabang", "Status", "Tanggal Gabung (YYYY-MM-DD)", "Tipe", "Gaji Pokok", "PTKP Status", "Tanggungan", "Kontrak Berakhir (YYYY-MM-DD)"];
const DEPT_OPTIONS = ["Direksi", "Proyek", "Produksi", "Quality", "Finance", "Procurement", "Support"];
const LEAVE_TYPES = ["Tahunan", "Sakit", "Izin", "Melahirkan", "Cuti Besar", "Unpaid"];

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

/* Parse CSV sederhana: baris dipisah newline, kolom dipisah koma, petik ganda opsional. */
function parseCSV(text: string): string[][] {
  return String(text)
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((line) => {
      const cells: string[] = [];
      let cur = "";
      let quoted = false;
      for (let i = 0; i < line.length; i += 1) {
        const ch = line[i];
        if (ch === '"') {
          if (quoted && line[i + 1] === '"') {
            cur += '"';
            i += 1;
          } else {
            quoted = !quoted;
          }
        } else if (ch === "," && !quoted) {
          cells.push(cur.trim());
          cur = "";
        } else {
          cur += ch;
        }
      }
      cells.push(cur.trim());
      return cells;
    });
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
  contractEnd: "",
  ptkpStatus: "TK/0",
  dependents: "0",
});

export default function HR() {
  const { data, add, update, log, branch, setBranch, inBranch } = useStore();
  const [tab, setTab] = useState("Karyawan");
  const [sort, setSort] = useState<SortState>({ key: null, dir: "asc" });
  const [sort2, setSort2] = useState<SortState>({ key: null, dir: "asc" });
  const [sort3, setSort3] = useState<SortState>({ key: null, dir: "asc" });

  /* ---------- filter karyawan ---------- */
  const [dept, setDept] = useState("Semua");
  const [q, setQ] = useState("");

  /* ---------- form karyawan ---------- */
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyEmpForm);
  const [contractSoonOnly, setContractSoonOnly] = useState(false);

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

  /* ---------- surat ---------- */
  const [showSurat, setShowSurat] = useState(false);
  const [suratForm, setSuratForm] = useState({ employeeId: "", jenis: "SP 1", isi: "", tanggal: todayISO() });
  const [arsipSurat, setArsipSurat] = useDraftState<StoreItem[]>("isms.draft.hr.arsipSurat", []);

  /* ---------- impor massal ---------- */
  const [importReport, setImportReport] = useState<{ ok: number; gagal: string[] } | null>(null);

  const branchCities = useMemo(() => data.branches.map((b) => String(b.city)), [data.branches]);
  const scopedEmployees = useMemo(() => inBranch(data.employees as Branchable[]), [data.employees, inBranch]);
  const jatahCuti = getSetting(data, "CUTI_JATAH", 12);
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
  const saldoCuti = (empId: string) => jatahCuti - (leaveUsed.get(empId) ?? 0);

  const contractDays = (e: StoreItem): number | null => daysUntil(String(e.contractEnd ?? "") || null);

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
        const cd = daysUntil(String(e.contractEnd ?? "") || null);
        const matchC = !contractSoonOnly || (cd !== null && cd >= 0 && cd <= 30);
        return matchD && matchQ && matchC;
      }),
    [scopedEmployees, dept, q, contractSoonOnly],
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

  /* ---------- KPI turnover & masa kerja ---------- */
  const nonaktifCount = data.employees.filter((e) => e.status !== "Aktif").length;
  const turnoverPct = data.employees.length > 0 ? (nonaktifCount / data.employees.length) * 100 : 0;
  const avgTenure = useMemo(() => {
    const now = new Date(todayISO() + "T00:00:00").getTime();
    const years = data.employees
      .map((e) => {
        const t = new Date(`${String(e.join ?? "")}T00:00:00`).getTime();
        if (Number.isNaN(t) || t > now) return null;
        return (now - t) / 31557600000;
      })
      .filter((v): v is number => v !== null);
    if (years.length === 0) return 0;
    return years.reduce((s, v) => s + v, 0) / years.length;
  }, [data.employees]);

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
      contractEnd: String(e.contractEnd ?? ""),
      ptkpStatus: String(e.ptkpStatus ?? "TK/0"),
      dependents: String(e.dependents ?? 0),
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
    if (!/^\d{16}$/.test(nik)) {
      toast("NIK harus 16 digit angka", "info");
      return;
    }
    if (!form.join) {
      toast("Tanggal bergabung wajib diisi", "info");
      return;
    }
    if (form.join > todayISO()) {
      toast("Tanggal bergabung tidak boleh di masa depan", "info");
      return;
    }
    if (!DEPT_OPTIONS.includes(form.dept)) {
      toast("Departemen tidak valid", "info");
      return;
    }
    if (!branchCities.includes(form.branch)) {
      toast("Cabang tidak terdaftar di master cabang", "info");
      return;
    }
    if ((form.tipe === "Kontrak" || form.tipe === "Outsourcing") && !form.contractEnd) {
      toast("Karyawan Kontrak/Outsourcing wajib isi akhir kontrak", "info");
      return;
    }
    if (form.contractEnd && form.contractEnd < form.join) {
      toast("Akhir kontrak tidak boleh sebelum tanggal bergabung", "info");
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
    const dependents = Math.min(3, Math.max(0, Number(form.dependents || 0)));
    if (!PTKP_STATUS.includes(form.ptkpStatus)) {
      toast("Status PTKP tidak valid", "info");
      return;
    }
    if (Number.isNaN(dependents)) {
      toast("Tanggungan harus angka 0–3", "info");
      return;
    }
    const empPatch = {
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
      contractEnd: form.contractEnd || "",
      ptkpStatus: form.ptkpStatus,
      dependents,
    };
    if (editingId) {
      update("employees", editingId, empPatch);
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
          contractEnd: form.contractEnd || "",
          ptkpStatus: form.ptkpStatus,
          dependents,
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
    const overlap = data.leaves.some(
      (l) =>
        String(l.employeeId) === leaveForm.employeeId &&
        String(l.status) !== "Ditolak" &&
        String(l.from) <= leaveForm.to &&
        leaveForm.from <= String(l.to),
    );
    if (overlap) {
      toast("Rentang cuti tumpang tindih dengan pengajuan lain", "info");
      return;
    }
    if (!leaveForm.note.trim() && (leaveForm.type === "Sakit" || leaveForm.type === "Unpaid")) {
      toast("Keterangan wajib diisi untuk Sakit/Unpaid", "info");
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

  // Cuti 2 tingkat: Diajukan → Disetujui Atasan → Disetujui (final HRD).
  const approveSupervisor = (l: StoreItem) => {
    update("leaves", l.id, { status: "Disetujui Atasan" });
    log("menyetujui cuti (atasan)", `${l.id} — ${empNameOf(l.employeeId)}`, "SDM");
    toast(`${l.id} disetujui atasan — menunggu HRD`);
  };

  const approveHrd = (l: StoreItem) => {
    update("leaves", l.id, { status: "Disetujui" });
    log("menyetujui cuti final (HRD)", `${l.id} — ${empNameOf(l.employeeId)}`, "SDM");
    toast(`${l.id} disetujui final`);
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
    if (!mutasiForm.reason.trim()) {
      toast("Alasan mutasi wajib diisi", "info");
      return;
    }
    if (!DEPT_OPTIONS.includes(mutasiForm.dept)) {
      toast("Departemen tujuan tidak valid", "info");
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

  /* ---------- surat peringatan / mutasi ---------- */
  const suratEmp = data.employees.find((e) => e.id === suratForm.employeeId);
  const suratPreview = suratEmp
    ? [
        `SURAT ${suratForm.jenis.toUpperCase()}`,
        `PT Syukur Bersaudara`,
        ``,
        `Nomor: ___/HR/${suratForm.tanggal.slice(0, 4)}`,
        `Tanggal: ${fmtTanggal(suratForm.tanggal)}`,
        ``,
        `Kepada Yth. ${suratEmp.name} (${empNik(suratEmp)})`,
        `Jabatan: ${suratEmp.role} · Departemen: ${suratEmp.dept} · Cabang: ${suratEmp.branch}`,
        ``,
        suratForm.isi.trim() || "(Isi surat belum ditulis)",
      ].join("\n")
    : "";

  const saveSurat = () => {
    if (!suratEmp) {
      toast("Pilih karyawan dulu", "info");
      return;
    }
    if (!suratForm.isi.trim()) {
      toast("Isi surat wajib diisi", "info");
      return;
    }
    if (!suratForm.tanggal) {
      toast("Tanggal surat wajib diisi", "info");
      return;
    }
    const entry: StoreItem = {
      id: `SRT-${suratForm.tanggal.replace(/-/g, "")}-${String(arsipSurat.length + 1).padStart(3, "0")}`,
      employeeId: suratEmp.id,
      nama: String(suratEmp.name),
      jenis: suratForm.jenis,
      tanggal: suratForm.tanggal,
      isi: suratForm.isi.trim(),
    };
    setArsipSurat((prev) => [entry, ...prev]);
    log("membuat surat", `${entry.id} · ${suratForm.jenis} → ${suratEmp.name}`, "SDM");
    toast(`Surat ${entry.id} dicatat di arsip sesi ini`);
    setShowSurat(false);
    setSuratForm({ employeeId: "", jenis: "SP 1", isi: "", tanggal: todayISO() });
  };

  const exportArsipSurat = () => {
    if (arsipSurat.length === 0) {
      toast("Arsip sesi ini masih kosong", "info");
      return;
    }
    const head = ["ID", "Karyawan", "Jenis", "Tanggal", "Isi"];
    const body = arsipSurat.map((s) => [s.id, s.nama, s.jenis, fmtTanggal(String(s.tanggal)), s.isi]);
    void exportExcel([head, ...body], "arsip-surat-sdm", "Arsip Surat");
    toast("Arsip surat diunduh");
  };

  /* ---------- impor massal via CSV ---------- */
  const downloadTemplate = () => {
    void exportExcel([IMPORT_HEADERS], "template-impor-karyawan", "Template");
    toast("Template diunduh — isi lalu simpan sebagai CSV");
  };

  const importCSV = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const rows = parseCSV(String(reader.result ?? ""));
      if (rows.length < 2) {
        toast("File kosong — minimal ada 1 baris data", "info");
        return;
      }
      const gagal: string[] = [];
      const seenNik = new Set(data.employees.map((e) => empNik(e).toLowerCase()));
      let ok = 0;
      rows.slice(1).forEach((cells, idx) => {
        const line = idx + 2;
        const [nikRaw, nama, jabatan, deptRaw, branchRaw, statusRaw, joinRaw, tipeRaw, basicRaw, ptkpRaw, tangRaw, kontrakRaw] = [
          ...cells,
          ...Array(Math.max(0, 12 - cells.length)).fill(""),
        ];
        const nik = String(nikRaw ?? "").trim();
        const name = String(nama ?? "").trim();
        const role = String(jabatan ?? "").trim();
        if (!nik || !name || !role) {
          gagal.push(`Baris ${line}: NIK, Nama, dan Jabatan wajib diisi`);
          return;
        }
        if (seenNik.has(nik.toLowerCase())) {
          gagal.push(`Baris ${line}: NIK ${nik} sudah terdaftar`);
          return;
        }
        if (!joinRaw || Number.isNaN(new Date(`${joinRaw}T00:00:00`).getTime())) {
          gagal.push(`Baris ${line}: tanggal gabung tidak valid (pakai YYYY-MM-DD)`);
          return;
        }
        const basic = Number(basicRaw || 0);
        if (Number.isNaN(basic) || basic < 0) {
          gagal.push(`Baris ${line}: gaji pokok harus angka valid`);
          return;
        }
        const tang = Math.min(3, Math.max(0, Number(tangRaw || 0)));
        if (Number.isNaN(tang)) {
          gagal.push(`Baris ${line}: tanggungan harus angka 0–3`);
          return;
        }
        const ptkp = String(ptkpRaw || "TK/0").trim();
        if (!PTKP_STATUS.includes(ptkp)) {
          gagal.push(`Baris ${line}: status PTKP harus salah satu ${PTKP_STATUS.join(", ")}`);
          return;
        }
        seenNik.add(nik.toLowerCase());
        add(
          "employees",
          {
            username: nik,
            name,
            role,
            dept: String(deptRaw || "Produksi").trim() || "Produksi",
            branch: String(branchRaw || "Samarinda").trim() || "Samarinda",
            status: String(statusRaw || "Aktif").trim() || "Aktif",
            join: String(joinRaw).trim(),
            tipe: String(tipeRaw || "Tetap").trim() || "Tetap",
            basic,
            allowances: 0,
            contractEnd: String(kontrakRaw ?? "").trim(),
            ptkpStatus: ptkp,
            dependents: tang,
            skills: defaultSkills(String(deptRaw || "Produksi"), role),
            certs: [],
          },
          undefined,
        );
        ok += 1;
      });
      setImportReport({ ok, gagal });
      log("impor karyawan", `${ok} berhasil · ${gagal.length} gagal`, "SDM");
      toast(`Impor selesai — ${ok} berhasil, ${gagal.length} gagal`);
    };
    reader.readAsText(file);
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
          ) : (
            <button className="btn-primary-gradient" onClick={() => setShowSurat(true)}>
              <Plus className="h-4 w-4" /> Buat Surat
            </button>
          )
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total Karyawan" value={String(data.employees.length)} icon={<Users className="h-5 w-5" />} chip="navy" spark={employeeTrend.map((d) => ({ name: d.month, v: d.count }))} hint="Data sesi berjalan" />
        <KpiCard label="Sertifikat Segera Expire" value={String(expiring.length)} delta={`Dalam ${String(CERT_WINDOW)} hari ke depan`} deltaDirection="down" icon={<Award className="h-5 w-5" />} chip="rose" spark={certExpireTrend} />
        <KpiCard label="Karyawan Aktif" value={String(activeCount)} delta={`Dari ${String(data.employees.length)} karyawan tercatat`} deltaDirection="up" icon={<BadgeCheck className="h-5 w-5" />} chip="teal" spark={activeEmployeeTrend} />
        <KpiCard label="Tenaga Bersertifikat" value={`${String(certifiedPct)}%`} icon={<BadgeCheck className="h-5 w-5" />} chip="violet" hint="Memiliki sertifikat tercatat" spark={certifiedTrend} />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <KpiCard label="Turnover (Nonaktif)" value={`${turnoverPct.toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`} hint={`${nonaktifCount} dari ${data.employees.length} karyawan`} chip="rose" />
        <KpiCard label="Masa Kerja Rata-rata" value={`${avgTenure.toLocaleString("id-ID", { maximumFractionDigits: 1 })} thn`} hint="Dihitung dari tanggal bergabung" chip="navy" />
      </div>

      <div className="mt-4 card">
        <Tabs tabs={["Karyawan", "Cuti & Izin", "Mutasi", "Org Chart", "Training", "Surat & Impor"]} active={tab} onChange={setTab} />
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
                <label className="flex cursor-pointer items-center gap-2 text-sm text-steel-600">
                  <input type="checkbox" checked={contractSoonOnly} onChange={(e) => setContractSoonOnly(e.target.checked)} />
                  Kontrak ≤30 hari
                </label>
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                <Card className="xl:col-span-2">
                  <div className="overflow-x-auto p-2">
                    <table className="w-full">
                      <thead className="bg-surface sticky top-0 z-10">
                        <tr>
                          <SortTh label="Karyawan" sortKey="name" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                          <SortTh label="NIK" sortKey="nik" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                          <SortTh label="Jabatan" sortKey="role" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                          <SortTh label="Cabang" sortKey="branch" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                          <SortTh label="Kontrak" sortKey="contract" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                          <SortTh label="Saldo Cuti" sortKey="saldo" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                          <SortTh label="Status" sortKey="status" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                          <th className="th">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-steel-100">
                        {sortRows(list, sort, (row, k) => {
                          const e = row as StoreItem;
                          switch (k) {
                            case "name": return String(e.name ?? "");
                            case "nik": return empNik(e);
                            case "role": return String(e.role ?? "");
                            case "branch": return String(e.branch ?? "");
                            case "contract": return String(e.contractEnd ?? "");
                            case "saldo": return Number(saldoCuti(String(e.id)));
                            case "status": return String(e.status ?? "");
                            default: return "";
                          }
                        }).map((e) => (
                          <tr key={e.id} className="hover:bg-surface">
                            <td className="td">
                              <p className="font-medium text-navy-900">{e.name}</p>
                              <p className="text-xs text-steel-500 font-mono">{e.id} · {e.dept}</p>
                            </td>
                            <td className="td font-mono text-steel-600">{empNik(e)}</td>
                            <td className="td text-steel-600 max-w-[160px] truncate" title={String(e.role)}>{e.role}</td>
                            <td className="td"><Badge tone="gray">{e.branch ?? "-"}</Badge></td>
                            <td className="td">
                              {e.contractEnd ? (
                                <div className="flex items-center gap-1.5 whitespace-nowrap">
                                  <span className="text-steel-600">{fmtTanggal(String(e.contractEnd))}</span>
                                  {(() => {
                                    const cd = contractDays(e);
                                    if (cd === null) return null;
                                    if (cd < 0) return <Badge tone="red">Lewat</Badge>;
                                    if (cd <= 30) return <Badge tone="amber">H-{cd}</Badge>;
                                    return null;
                                  })()}
                                </div>
                              ) : (
                                <span className="text-xs text-steel-400">—</span>
                              )}
                            </td>
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
                    <SortTh label="ID" sortKey="id" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} />
                    <SortTh label="Karyawan" sortKey="emp" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} />
                    <SortTh label="Tipe" sortKey="type" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} />
                    <SortTh label="Periode" sortKey="period" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} />
                    <SortTh label="Hari" sortKey="days" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} />
                    <SortTh label="Saldo Sisa" sortKey="saldo" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} />
                    <SortTh label="Status" sortKey="status" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} />
                    <th className="th">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-steel-100">
                  {sortRows(data.leaves, sort2, (row, k) => {
                    const l = row as StoreItem;
                    switch (k) {
                      case "id": return String(l.id ?? "");
                      case "emp": return String(empNameOf(String(l.employeeId ?? "")));
                      case "type": return String(l.type ?? "");
                      case "period": return String(l.from ?? "");
                      case "days": return Number(l.days ?? 0);
                      case "saldo": return String(l.type) === "Tahunan" ? Number(saldoCuti(String(l.employeeId ?? ""))) : Number(-1);
                      case "status": return String(l.status ?? "");
                      default: return "";
                    }
                  }).map((l) => (
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
                            <button className="text-sm font-semibold text-emerald-600 hover:underline" onClick={() => approveSupervisor(l)}>Setujui Atasan</button>
                            <button className="text-sm font-semibold text-rose-600 hover:underline" onClick={() => setRejectTarget(l)}>Tolak</button>
                          </div>
                        ) : l.status === "Disetujui Atasan" ? (
                          <div className="flex items-center gap-2 whitespace-nowrap">
                            <button className="text-sm font-semibold text-emerald-600 hover:underline" onClick={() => approveHrd(l)}>Setujui HRD</button>
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
                    <SortTh label="ID" sortKey="id" sort={sort3} onSort={(k) => setSort3((s) => toggleSort(s, k))} />
                    <SortTh label="Judul" sortKey="title" sort={sort3} onSort={(k) => setSort3((s) => toggleSort(s, k))} />
                    <SortTh label="Tanggal" sortKey="date" sort={sort3} onSort={(k) => setSort3((s) => toggleSort(s, k))} />
                    <SortTh label="Provider" sortKey="provider" sort={sort3} onSort={(k) => setSort3((s) => toggleSort(s, k))} />
                    <SortTh label="Peserta" sortKey="participants" sort={sort3} onSort={(k) => setSort3((s) => toggleSort(s, k))} />
                    <SortTh label="Status" sortKey="status" sort={sort3} onSort={(k) => setSort3((s) => toggleSort(s, k))} />
                    <th className="th">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-steel-100">
                  {sortRows(data.trainings, sort3, (row, k) => {
                    const t = row as StoreItem;
                    switch (k) {
                      case "id": return String(t.id ?? "");
                      case "title": return String(t.title ?? "");
                      case "date": return String(t.date ?? "");
                      case "provider": return String(t.provider ?? "");
                      case "participants": return Number(((t.participants ?? []) as unknown[]).length);
                      case "status": return String(t.status ?? "");
                      default: return "";
                    }
                  }).map((t) => {
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

          {tab === "Surat & Impor" && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card className="p-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-navy-900">Arsip Surat (sesi ini)</h3>
                  <div className="flex items-center gap-2">
                    <button className="btn-secondary text-xs" onClick={exportArsipSurat}>Export Excel</button>
                    <button className="btn-primary text-xs" onClick={() => setShowSurat(true)}>Buat Surat</button>
                  </div>
                </div>
                <div className="mt-3 space-y-2.5">
                  {arsipSurat.map((s) => (
                    <div key={s.id} className="rounded-lg bg-surface p-2.5 text-sm">
                      <p className="font-medium text-navy-900">{s.jenis} · {s.nama}</p>
                      <p className="text-xs text-steel-500">{s.id} · {fmtTanggal(String(s.tanggal))}</p>
                    </div>
                  ))}
                  {arsipSurat.length === 0 && <p className="text-xs text-steel-400">Belum ada surat dibuat sesi ini.</p>}
                </div>
              </Card>
              <Card className="p-5">
                <h3 className="text-sm font-semibold text-navy-900">Impor Karyawan Massal</h3>
                <p className="mt-1 text-xs text-steel-500">
                  Unduh template Excel, isi, lalu simpan sebagai CSV (koma) sebelum diimpor. NIK harus unik — baris gagal dilaporkan per baris.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button className="btn-secondary text-xs" onClick={downloadTemplate}>Unduh Template</button>
                  <label className="btn-primary cursor-pointer text-xs">
                    Impor CSV
                    <input
                      type="file"
                      accept=".csv"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) importCSV(f);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
                {importReport && (
                  <div className="mt-3 rounded-xl bg-surface p-3 text-sm">
                    <p className="font-semibold text-navy-900">{importReport.ok} berhasil · {importReport.gagal.length} gagal</p>
                    {importReport.gagal.length > 0 && (
                      <ul className="mt-1.5 max-h-40 space-y-1 overflow-y-auto text-xs text-rose-600">
                        {importReport.gagal.map((g) => <li key={g}>{g}</li>)}
                      </ul>
                    )}
                  </div>
                )}
              </Card>
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
            <Field label="Kontrak berakhir"><input type="date" className="input" value={form.contractEnd} onChange={(e) => setForm({ ...form, contractEnd: e.target.value })} /></Field>
            <Field label="Status PTKP">
              <select className="input" value={form.ptkpStatus} onChange={(e) => setForm({ ...form, ptkpStatus: e.target.value })}>
                {PTKP_STATUS.map((s) => <option key={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Tanggungan (0–3)">
              <select className="input" value={form.dependents} onChange={(e) => setForm({ ...form, dependents: e.target.value })}>
                {["0", "1", "2", "3"].map((d) => <option key={d}>{d}</option>)}
              </select>
            </Field>
          </FormGrid>
        </div>
      </Modal>

      {/* ---------- modal cuti ---------- */}
      <Modal
        open={showLeave}
        onClose={() => setShowLeave(false)}
        title="Ajukan Cuti & Izin"
        subtitle={`Durasi dihitung otomatis · jatah tahunan ${jatahCuti} hari`}
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

      {/* ---------- modal surat ---------- */}
      <Modal
        open={showSurat}
        onClose={() => setShowSurat(false)}
        title="Generator Surat"
        subtitle="Surat Peringatan / Mutasi + pratinjau + arsip Excel"
        wide
        footer={
          <>
            <button className="btn-secondary" onClick={() => setShowSurat(false)}>Batal</button>
            <button className="btn-primary" onClick={saveSurat}>Simpan ke Arsip</button>
          </>
        }
      >
        <div className="space-y-3">
          <FormGrid>
            <Field label="Karyawan">
              <select className="input" value={suratForm.employeeId} onChange={(e) => setSuratForm({ ...suratForm, employeeId: e.target.value })}>
                <option value="">— Pilih —</option>
                {data.employees.map((e) => (
                  <option key={e.id} value={e.id}>{e.name} · {e.role}</option>
                ))}
              </select>
            </Field>
            <Field label="Jenis surat">
              <select className="input" value={suratForm.jenis} onChange={(e) => setSuratForm({ ...suratForm, jenis: e.target.value })}>
                {SURAT_JENIS.map((s) => <option key={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Tanggal"><input type="date" className="input" value={suratForm.tanggal} onChange={(e) => setSuratForm({ ...suratForm, tanggal: e.target.value })} /></Field>
          </FormGrid>
          <Field label="Isi surat"><textarea className="input" rows={4} value={suratForm.isi} onChange={(e) => setSuratForm({ ...suratForm, isi: e.target.value })} placeholder="cth: ...diberikan peringatan pertama atas..." /></Field>
          {suratPreview && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-steel-500">Pratinjau</p>
              <pre className="whitespace-pre-wrap rounded-xl bg-surface p-3 text-sm text-navy-900">{suratPreview}</pre>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
