import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Download, KeyRound, Plus, RefreshCw, Search } from "lucide-react";
import { Badge, Card, ConfirmModal, Field, KpiCard, Modal, PageHeader, SortTh, sortRows, toast, toggleSort, usePager } from "../../components/ui";
import type { SortState } from "../../components/ui";
import { canSetTarget, useAuth } from "../../auth/auth";
import { useStore } from "../../data/store";
import { useT } from "../../i18n/LanguageContext";
import { n_roles } from "../../i18n/n_roles";
import { apiFetch, isBackendConfigured } from "../../services/http";
import { exportExcel } from "../../utils/export";

const ACTIONS = ["Lihat", "Buat", "Ubah", "Hapus", "Setujui", "Bayar", "Ekspor"] as const;
type RoleAction = (typeof ACTIONS)[number];

const MODULES = [
  "Proyek",
  "Drydock",
  "Inventori",
  "Equipment",
  "Subkontraktor",
  "QC & Safety",
  "CRM",
  "Procurement",
  "Keuangan",
  "SDM",
  "Kapal",
  "Dokumen",
  "Analytics",
  "Notifikasi",
  "Absensi",
  "Payroll",
  "Laporan",
  "Monitoring",
  "Pengaturan",
];

const ROLES = [
  "Direktur",
  "Project Manager",
  "Foreman/Tim",
  "QC Inspector",
  "QC/HSE Manager",
  "Warehouse",
  "Procurement",
  "Finance",
  "HR",
  "Sales",
  "Client (eks)",
  "Admin",
];

/** Matriks RBAC display: sel yang tidak tercantum = tanpa akses. Read-only tanpa backend. */
const ROLE_MATRIX: Record<string, Record<string, RoleAction[]>> = {
  Direktur: {
    Proyek: ["Lihat", "Buat", "Ubah", "Setujui", "Ekspor"],
    Drydock: ["Lihat", "Setujui", "Ekspor"],
    Inventori: ["Lihat", "Ekspor"],
    Equipment: ["Lihat", "Ekspor"],
    Subkontraktor: ["Lihat", "Buat", "Ubah", "Setujui", "Ekspor"],
    "QC & Safety": ["Lihat", "Ekspor"],
    CRM: ["Lihat", "Buat", "Ubah", "Setujui", "Ekspor"],
    Procurement: ["Lihat", "Setujui", "Ekspor"],
    Keuangan: ["Lihat", "Setujui", "Bayar", "Ekspor"],
    SDM: ["Lihat", "Setujui", "Ekspor"],
    Kapal: ["Lihat", "Ekspor"],
    Dokumen: ["Lihat", "Ekspor"],
    Analytics: ["Lihat", "Ekspor"],
    Notifikasi: ["Lihat"],
    Absensi: ["Lihat", "Setujui", "Ekspor"],
    Payroll: ["Lihat", "Setujui", "Bayar", "Ekspor"],
    Laporan: ["Lihat", "Ekspor"],
    Monitoring: ["Lihat", "Ekspor"],
    Pengaturan: ["Lihat", "Ekspor"],
  },
  "Project Manager": {
    Proyek: ["Lihat", "Buat", "Ubah", "Setujui", "Ekspor"],
    Drydock: ["Lihat", "Buat", "Ubah", "Ekspor"],
    Inventori: ["Lihat", "Buat", "Ekspor"],
    Equipment: ["Lihat", "Buat", "Ubah", "Ekspor"],
    Subkontraktor: ["Lihat", "Buat", "Ubah", "Setujui", "Ekspor"],
    "QC & Safety": ["Lihat", "Buat"],
    CRM: ["Lihat"],
    Procurement: ["Lihat", "Buat", "Ekspor"],
    Keuangan: ["Lihat", "Ekspor"],
    SDM: ["Lihat", "Ekspor"],
    Kapal: ["Lihat"],
    Dokumen: ["Lihat", "Buat", "Ubah", "Ekspor"],
    Analytics: ["Lihat", "Ekspor"],
    Notifikasi: ["Lihat"],
    Absensi: ["Lihat", "Setujui", "Ekspor"],
    Payroll: ["Lihat"],
    Laporan: ["Lihat", "Buat", "Ekspor"],
    Monitoring: ["Lihat", "Buat", "Ubah", "Ekspor"],
  },
  "Foreman/Tim": {
    Proyek: ["Lihat", "Ubah"],
    Drydock: ["Lihat"],
    Inventori: ["Lihat", "Buat"],
    Equipment: ["Lihat", "Buat"],
    Subkontraktor: ["Lihat"],
    "QC & Safety": ["Lihat", "Buat"],
    Dokumen: ["Lihat"],
    Notifikasi: ["Lihat"],
    Absensi: ["Lihat", "Buat"],
    Laporan: ["Lihat"],
    Monitoring: ["Lihat", "Ubah"],
  },
  "QC Inspector": {
    Proyek: ["Lihat"],
    Monitoring: ["Lihat"],
    Inventori: ["Lihat"],
    Equipment: ["Lihat"],
    "QC & Safety": ["Lihat", "Buat", "Ubah", "Ekspor"],
    Dokumen: ["Lihat", "Buat", "Ubah", "Ekspor"],
    Notifikasi: ["Lihat"],
    Laporan: ["Lihat", "Ekspor"],
  },
  "QC/HSE Manager": {
    Proyek: ["Lihat", "Setujui"],
    Monitoring: ["Lihat"],
    Equipment: ["Lihat"],
    "QC & Safety": ["Lihat", "Buat", "Ubah", "Setujui", "Ekspor"],
    SDM: ["Lihat"],
    Dokumen: ["Lihat", "Buat", "Ubah", "Setujui", "Ekspor"],
    Notifikasi: ["Lihat"],
    Absensi: ["Lihat"],
    Laporan: ["Lihat", "Buat", "Ekspor"],
  },
  Warehouse: {
    Proyek: ["Lihat"],
    Inventori: ["Lihat", "Buat", "Ubah", "Ekspor"],
    Equipment: ["Lihat"],
    Procurement: ["Lihat", "Buat"],
    Dokumen: ["Lihat"],
    Notifikasi: ["Lihat"],
    Laporan: ["Lihat", "Ekspor"],
  },
  Procurement: {
    Proyek: ["Lihat"],
    Inventori: ["Lihat", "Buat", "Ubah", "Ekspor"],
    Subkontraktor: ["Lihat", "Buat", "Ubah"],
    Procurement: ["Lihat", "Buat", "Ubah", "Setujui", "Ekspor"],
    Keuangan: ["Lihat"],
    Dokumen: ["Lihat", "Buat", "Ekspor"],
    Notifikasi: ["Lihat"],
    Laporan: ["Lihat", "Ekspor"],
  },
  Finance: {
    Proyek: ["Lihat"],
    CRM: ["Lihat"],
    Procurement: ["Lihat"],
    Keuangan: ["Lihat", "Buat", "Ubah", "Setujui", "Bayar", "Ekspor"],
    Payroll: ["Lihat", "Buat", "Ubah", "Bayar", "Ekspor"],
    Dokumen: ["Lihat", "Ekspor"],
    Analytics: ["Lihat", "Ekspor"],
    Notifikasi: ["Lihat"],
    Laporan: ["Lihat", "Buat", "Ekspor"],
  },
  HR: {
    Proyek: ["Lihat"],
    SDM: ["Lihat", "Buat", "Ubah", "Hapus", "Setujui", "Ekspor"],
    Dokumen: ["Lihat", "Buat", "Ekspor"],
    Notifikasi: ["Lihat"],
    Absensi: ["Lihat", "Buat", "Ubah", "Setujui", "Ekspor"],
    Payroll: ["Lihat", "Buat", "Ubah", "Ekspor"],
    Laporan: ["Lihat", "Ekspor"],
  },
  Sales: {
    Proyek: ["Lihat"],
    CRM: ["Lihat", "Buat", "Ubah", "Ekspor"],
    Keuangan: ["Lihat"],
    Kapal: ["Lihat"],
    Dokumen: ["Lihat", "Buat", "Ekspor"],
    Analytics: ["Lihat"],
    Notifikasi: ["Lihat"],
    Laporan: ["Lihat", "Ekspor"],
  },
  "Client (eks)": {
    Proyek: ["Lihat"],
    Dokumen: ["Lihat"],
    Notifikasi: ["Lihat"],
    Laporan: ["Lihat"],
    Monitoring: ["Lihat"],
  },
  Admin: {
    Proyek: ["Lihat", "Buat", "Ubah", "Hapus", "Setujui", "Bayar", "Ekspor"],
    Drydock: ["Lihat", "Buat", "Ubah", "Hapus", "Setujui", "Bayar", "Ekspor"],
    Inventori: ["Lihat", "Buat", "Ubah", "Hapus", "Setujui", "Bayar", "Ekspor"],
    Equipment: ["Lihat", "Buat", "Ubah", "Hapus", "Setujui", "Bayar", "Ekspor"],
    Subkontraktor: ["Lihat", "Buat", "Ubah", "Hapus", "Setujui", "Bayar", "Ekspor"],
    "QC & Safety": ["Lihat", "Buat", "Ubah", "Hapus", "Setujui", "Bayar", "Ekspor"],
    CRM: ["Lihat", "Buat", "Ubah", "Hapus", "Setujui", "Bayar", "Ekspor"],
    Procurement: ["Lihat", "Buat", "Ubah", "Hapus", "Setujui", "Bayar", "Ekspor"],
    Keuangan: ["Lihat", "Buat", "Ubah", "Hapus", "Setujui", "Bayar", "Ekspor"],
    SDM: ["Lihat", "Buat", "Ubah", "Hapus", "Setujui", "Bayar", "Ekspor"],
    Kapal: ["Lihat", "Buat", "Ubah", "Hapus", "Setujui", "Bayar", "Ekspor"],
    Dokumen: ["Lihat", "Buat", "Ubah", "Hapus", "Setujui", "Bayar", "Ekspor"],
    Analytics: ["Lihat", "Buat", "Ubah", "Hapus", "Setujui", "Bayar", "Ekspor"],
    Notifikasi: ["Lihat", "Buat", "Ubah", "Hapus", "Setujui", "Bayar", "Ekspor"],
    Absensi: ["Lihat", "Buat", "Ubah", "Hapus", "Setujui", "Bayar", "Ekspor"],
    Payroll: ["Lihat", "Buat", "Ubah", "Hapus", "Setujui", "Bayar", "Ekspor"],
    Laporan: ["Lihat", "Buat", "Ubah", "Hapus", "Setujui", "Bayar", "Ekspor"],
    Monitoring: ["Lihat", "Buat", "Ubah", "Hapus", "Setujui", "Bayar", "Ekspor"],
    Pengaturan: ["Lihat", "Buat", "Ubah", "Hapus", "Setujui", "Bayar", "Ekspor"],
  },
};

function granted(role: string, modul: string, aksi: RoleAction): boolean {
  return ROLE_MATRIX[role]?.[modul]?.includes(aksi) ?? false;
}

interface ManagedUser {
  id: string;
  username: string;
  name: string;
  role: string;
  email: string;
  isActive: boolean;
  employeeId?: string | null;
}

interface SessionRow {
  id: string;
  user_id: string;
  username: string;
  role: string;
  login_at: string;
  last_seen_at: string;
  ip: string;
  user_agent: string;
}

interface AuditRow {
  id: string;
  actor: string;
  action: string;
  created_at: string;
}

function sessionOnline(lastSeen: string): boolean {
  const t = Date.parse(String(lastSeen ?? ""));
  if (Number.isNaN(t)) return false;
  return Date.now() - t <= 3 * 60 * 1000;
}

function relTime(v: string, S: typeof n_roles.id, now: number): string {
  const t = Date.parse(String(v ?? ""));
  if (Number.isNaN(t)) return S.neverSeen;
  const mins = Math.max(0, Math.round((now - t) / 60000));
  if (mins < 1) return S.agoNow;
  if (mins < 60) return S.agoMin.replace("{n}", String(mins));
  const h = Math.floor(mins / 60);
  if (h < 48) return S.agoHour.replace("{n}", String(h));
  return S.agoDay.replace("{n}", String(Math.floor(h / 24)));
}

function sessionDuration(loginAt: string, lastSeen: string, S: typeof n_roles.id): string {
  const a = Date.parse(String(loginAt ?? ""));
  const b = Date.parse(String(lastSeen ?? ""));
  if (Number.isNaN(a) || Number.isNaN(b)) return "-";
  const mins = Math.max(0, Math.round((b - a) / 60000));
  if (mins < 60) return S.durMin.replace("{n}", String(mins));
  const h = Math.floor(mins / 60);
  return S.durHourMin.replace("{a}", String(h)).replace("{b}", String(mins % 60));
}

function fmtDateTime(v: string): string {
  const t = Date.parse(String(v ?? ""));
  if (Number.isNaN(t)) return String(v ?? "-");
  const d = new Date(t);
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function errMsg(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : fallback;
}

export default function Peran() {
  const { locale } = useT();
  const S = n_roles[locale];
  const actionLabel: Record<RoleAction, string> = {
    Lihat: S.actView,
    Buat: S.actCreate,
    Ubah: S.actUpdate,
    Hapus: S.actDelete,
    Setujui: S.actApprove,
    Bayar: S.actPay,
    Ekspor: S.actExport,
  };
  const [role, setRole] = useState("Project Manager");
  const [sort, setSort] = useState<SortState>({ key: null, dir: "asc" });

  /* Live user management (remote only). Matrix below stays as the RBAC reference. */
  const remote = isBackendConfigured();
  const { user: session } = useAuth();
  const { data } = useStore();
  const canManage = canSetTarget(session?.role);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ username: "", name: "", role: "Manager", password: "", email: "", employeeId: "" });
  const [pwTarget, setPwTarget] = useState<ManagedUser | null>(null);
  const [pwValue, setPwValue] = useState("");
  const [confirmTarget, setConfirmTarget] = useState<ManagedUser | null>(null);
  const navigate = useNavigate();
  const [linkTarget, setLinkTarget] = useState<ManagedUser | null>(null);
  const [linkValue, setLinkValue] = useState("");
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [auditRows, setAuditRows] = useState<AuditRow[]>([]);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [sessDetail, setSessDetail] = useState<ManagedUser | null>(null);
  const [sessActQ, setSessActQ] = useState("");

  const empNameOf = (id: string | null | undefined): string => {
    if (!id) return "-";
    const e = (data.employees ?? []).find((x) => String(x.id) === String(id));
    return e ? `${String(e.name ?? id)} (${String(e.id)})` : S.empMissing.replace("{n}", id);
  };

  const loadUsers = async () => {
    if (!isBackendConfigured()) return;
    setUsersLoading(true);
    try {
      const res = await apiFetch<{ users: ManagedUser[] } | ManagedUser[]>("/api/users");
      setUsers(Array.isArray(res) ? res : (res.users ?? []));
    } catch (e) {
      toast(errMsg(e, S.failLoadUsers), "info");
    } finally {
      setUsersLoading(false);
    }
  };

  useEffect(() => {
    void loadUsers();
    void loadSessions();
    void loadAudit();
    // Polling ringan: daftar sesi + jam "x lalu" hidup tanpa reload halaman.
    const id = window.setInterval(() => {
      void loadSessions();
      setNowTick(Date.now());
    }, 30000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doCreate = async () => {
    if (!form.username.trim() || !form.name.trim() || form.password.length < 6) {
      toast(S.formIncomplete, "info");
      return;
    }
    try {
      await apiFetch("/api/users", {
        method: "POST",
        body: JSON.stringify({
          username: form.username.trim(),
          name: form.name.trim(),
          role: form.role,
          email: form.email.trim(),
          password: form.password,
          employeeId: form.employeeId || "",
        }),
      });
      toast(S.userCreated.replace("{n}", form.username.trim()));
      setShowCreate(false);
      setForm({ username: "", name: "", role: "Manager", password: "", email: "", employeeId: "" });
      await loadUsers();
    } catch (e) {
      toast(errMsg(e, S.failCreateUser), "info");
    }
  };

  const doResetPassword = async () => {
    if (!pwTarget || pwValue.length < 6) {
      toast(S.pwTooShort, "info");
      return;
    }
    try {
      await apiFetch(`/api/users/${pwTarget.id}/password`, {
        method: "POST",
        body: JSON.stringify({ newPassword: pwValue }),
      });
      toast(S.pwReset.replace("{n}", pwTarget.username));
      setPwTarget(null);
      setPwValue("");
    } catch (e) {
      toast(errMsg(e, S.failResetPw), "info");
    }
  };

  const loadSessions = async () => {
    if (!isBackendConfigured()) return;
    setSessionsLoading(true);
    try {
      const res = await apiFetch<{ sessions: SessionRow[] } | SessionRow[]>("/api/auth/sessions");
      setSessions(Array.isArray(res) ? res : (res.sessions ?? []));
    } catch (e) {
      toast(errMsg(e, S.failLoadSessions), "info");
    } finally {
      setSessionsLoading(false);
    }
  };

  // Jejak audit server untuk kolom "aktivitas terakhir" — bisa dibaca
  // walau user sudah offline (audit tersimpan permanen di BE).
  const loadAudit = async () => {
    if (!isBackendConfigured()) return;
    try {
      const res = await apiFetch<{ rows: AuditRow[] } | AuditRow[]>("/api/audit?limit=1000");
      const rows = Array.isArray(res) ? res : (res.rows ?? []);
      setAuditRows(rows);
    } catch {
      // abaikan — kolom aktivitas tampil "-"
    }
  };

  // Aktivitas terbaru per aktor (username).
  const lastActByUser = useMemo(() => {
    const map = new Map<string, AuditRow[]>();
    for (const r of auditRows) {
      const k = String(r.actor ?? "");
      if (!k) continue;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(r);
    }
    for (const list of map.values()) {
      list.sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));
    }
    return map;
  }, [auditRows]);

  const doLinkEmployee = async () => {    if (!linkTarget) return;
    try {
      await apiFetch(`/api/users/${linkTarget.id}`, {
        method: "PATCH",
        body: JSON.stringify({ employeeId: linkValue || null }),
      });
      toast(linkValue ? S.linkLinked.replace("{a}", linkTarget.username).replace("{b}", linkValue) : S.linkUnlinked.replace("{n}", linkTarget.username));
      setLinkTarget(null);
      setLinkValue("");
      await loadUsers();
    } catch (e) {
      toast(errMsg(e, S.failLinkEmployee), "info");
    }
  };

  const doToggleActive = async (u: ManagedUser) => {
    try {
      if (u.isActive) {
        await apiFetch(`/api/users/${u.id}`, { method: "DELETE" });
        toast(S.userDeactivated.replace("{n}", u.username));
      } else {
        await apiFetch(`/api/users/${u.id}`, {
          method: "PATCH",
          body: JSON.stringify({ isActive: true }),
        });
        toast(S.userReactivated.replace("{n}", u.username));
      }
      setConfirmTarget(null);
      await loadUsers();
    } catch (e) {
      toast(errMsg(e, S.failToggleUser), "info");
    }
  };

  const stats = useMemo(() => {
    const total = MODULES.length * ACTIONS.length;
    let yes = 0;
    let withAccess = 0;
    for (const m of MODULES) {
      const row = ROLE_MATRIX[role]?.[m] ?? [];
      if (row.length > 0) withAccess++;
      yes += row.length;
    }
    return { yes, total, withAccess, pct: total > 0 ? Math.round((yes / total) * 100) : 0 };
  }, [role]);

  const userPager = usePager(users.length);
  const sessPager = usePager(users.length);
  const sortedModules = useMemo(() => sortRows(MODULES, sort, (row, k) => {
    const m = String(row);
    if (k === "modul") return m;
    return granted(role, m, String(k) as RoleAction) ? "Ya" : "";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [sort, role]);
  const matrixPager = usePager(MODULES.length);
  useEffect(() => {
    matrixPager.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  const doExport = () => {
    const head = [S.thRole, S.thModule, ...ACTIONS];
    const body: string[][] = [];
    for (const r of ROLES) {
      for (const m of MODULES) {
        body.push([r, m, ...ACTIONS.map((a) => (granted(r, m, a) ? "Ya" : "-"))]);
      }
    }
    void exportExcel([head, ...body], "matriks-peran-akses", "RBAC").then(() =>
      toast(S.matrixExported)
    );
  };

  return (
    <div>
      <PageHeader
        title={S.title}
        subtitle={S.subtitle}
        icon={<KeyRound className="h-5 w-5" />}
        actions={
          <button className="btn-secondary text-xs" onClick={doExport}>
            <Download className="h-4 w-4" /> {S.exportBtn}
          </button>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard label={S.kpiCoverage} value={`${stats.pct}%`} hint={S.kpiCells.replace("{a}", String(stats.yes)).replace("{b}", String(stats.total))} chip="navy" icon={<KeyRound className="h-5 w-5" />} />
        <KpiCard label={S.kpiModules} value={`${stats.withAccess} / ${MODULES.length}`} hint={S.kpiRole.replace("{n}", role)} chip="teal" icon={<KeyRound className="h-5 w-5" />} />
        <KpiCard label={S.kpiRoles} value={String(ROLES.length)} hint={S.kpiRolesHint} chip="violet" icon={<KeyRound className="h-5 w-5" />} />
      </div>

      <Card className="mb-4 p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-bold text-navy-900">{S.mgmtUsers}</h3>
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${remote ? "bg-emerald-100 text-emerald-700" : "bg-steel-100 text-steel-600"}`}>
            {remote ? S.backendConnected : S.modeLocal}
          </span>
          {remote && (
            <span className="text-xs text-steel-400">
              {usersLoading ? S.loading : S.usersCount.replace("{n}", String(users.length))}
            </span>
          )}
          <span className="ml-auto flex gap-2">
            {remote && (
              <button className="btn-secondary text-xs" onClick={() => void loadUsers()}>
                <RefreshCw className="h-4 w-4" /> {S.reload}
              </button>
            )}
            {remote && canManage && (
              <button className="btn-primary text-xs" onClick={() => setShowCreate(true)}>
                <Plus className="h-4 w-4" /> {S.addUser}
              </button>
            )}
          </span>
        </div>
        {!remote ? (
          <p className="text-xs leading-relaxed text-steel-500">
            {S.localModeUsers}
          </p>
        ) : !canManage ? (
          <p className="text-xs leading-relaxed text-steel-500">
            {S.cannotManage.replace("{n}", String(session?.role ?? "-"))}
          </p>
        ) : users.length === 0 && !usersLoading ? (
          <p className="text-xs text-steel-500">{S.emptyUsers}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-steel-100 text-left text-xs uppercase tracking-wide text-steel-400">
                  <th className="px-3 py-2">{S.thUsername}</th>
                  <th className="px-3 py-2">{S.thName}</th>
                  <th className="px-3 py-2">{S.thRole}</th>
                  <th className="px-3 py-2">{S.thEmail}</th>
                  <th className="px-3 py-2">{S.thEmployee}</th>
                  <th className="px-3 py-2">{S.thStatus}</th>
                  <th className="px-3 py-2 text-right">{S.thAction}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-steel-50">
                {userPager.slice(users).map((u) => (
                  <tr key={u.id} className="hover:bg-surface">
                    <td className="px-3 py-2 font-semibold text-navy-900">{u.username}</td>
                    <td className="px-3 py-2">{u.name}</td>
                    <td className="px-3 py-2">{u.role}</td>
                    <td className="px-3 py-2 text-steel-500">{u.email || "-"}</td>
                    <td className="px-3 py-2 text-steel-600">{empNameOf(u.employeeId)}</td>
                    <td className="px-3 py-2">
                      {u.isActive ? <Badge tone="green">Aktif</Badge> : <Badge tone="gray">Nonaktif</Badge>}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1.5">
                        <button
                          className="btn-secondary px-2 py-1 text-xs"
                          onClick={() => { setLinkTarget(u); setLinkValue(u.employeeId ?? ""); }}
                        >
                          {S.linkBtn}
                        </button>
                        <button
                          className="btn-secondary px-2 py-1 text-xs"
                          onClick={() => { setPwTarget(u); setPwValue(""); }}
                        >
                          {S.resetPwBtn}
                        </button>
                        {u.isActive ? (
                          <button
                            className="btn-secondary px-2 py-1 text-xs text-rose-600"
                            onClick={() => setConfirmTarget(u)}
                          >
                            {S.deactivateBtn}
                          </button>
                        ) : (
                          <button
                            className="btn-secondary px-2 py-1 text-xs"
                            onClick={() => void doToggleActive(u)}
                          >
                            {S.activateBtn}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {userPager.bar}
          </div>
        )}
      </Card>

      <Card className="mb-4 p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-bold text-navy-900">{S.sessionsTitle}</h3>
          <span className="text-xs text-steel-400">
            {sessionsLoading ? S.loading : S.sessCount.replace("{a}", String(users.filter((u) => {
              const s = sessions.find((x) => String(x.user_id) === String(u.id));
              return s ? sessionOnline(s.last_seen_at) : false;
            }).length)).replace("{b}", String(users.length))}
            {" · "}{S.autoRefreshNote}
          </span>
          <span className="ml-auto">
            {remote && (
              <button className="btn-secondary text-xs" onClick={() => { void loadSessions(); void loadAudit(); setNowTick(Date.now()); }}>
                <RefreshCw className="h-4 w-4" /> {S.reload}
              </button>
            )}
          </span>
        </div>
        {!remote ? (
          <p className="text-xs leading-relaxed text-steel-500">
            {S.localModeSessions}
          </p>
        ) : users.length === 0 && !sessionsLoading ? (
          <p className="text-xs text-steel-500">{S.emptySessions}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-sm">
              <thead>
                <tr className="border-b border-steel-100 text-left text-xs uppercase tracking-wide text-steel-400">
                  <th className="px-3 py-2">{S.thUser}</th>
                  <th className="px-3 py-2">{S.thStatus}</th>
                  <th className="px-3 py-2">{S.thLastLogin}</th>
                  <th className="px-3 py-2">{S.thLastSeen}</th>
                  <th className="px-3 py-2">{S.thDuration}</th>
                  <th className="px-3 py-2">{S.thLastAct}</th>
                  <th className="px-3 py-2 text-right">{S.thLog}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-steel-50">
                {sessPager.slice(users).map((u) => {
                  const s = sessions.find((x) => String(x.user_id) === String(u.id)) ?? null;
                  const online = s ? sessionOnline(s.last_seen_at) : false;
                  const acts = lastActByUser.get(u.username) ?? [];
                  const lastAct = acts[0] ?? null;
                  const dur = s ? sessionDuration(s.login_at, online ? new Date(nowTick).toISOString() : s.last_seen_at, S) : "-";
                  return (
                    <tr key={u.id} className="hover:bg-surface">
                      <td className="px-3 py-2 font-semibold text-navy-900">
                        {u.username}
                        <p className="text-xs font-normal text-steel-500">{u.name} · {u.role}</p>
                      </td>
                      <td className="px-3 py-2">
                        {!u.isActive
                          ? <Badge tone="gray">{S.statusInactive}</Badge>
                          : <Badge tone={online ? "green" : "gray"}>{online ? "Online" : "Offline"}</Badge>}
                      </td>
                      <td className="px-3 py-2 text-steel-600">{s ? fmtDateTime(s.login_at) : S.neverSeen}</td>
                      <td className="px-3 py-2 text-steel-600">{s ? relTime(s.last_seen_at, S, nowTick) : S.neverSeen}</td>
                      <td className="px-3 py-2 text-steel-600">{s ? (online ? S.runningFor.replace("{a}", dur) : S.lastFor.replace("{a}", dur)) : "-"}</td>
                      <td className="px-3 py-2 text-xs text-steel-600">
                        {lastAct ? (
                          <span title={`${lastAct.action} · ${fmtDateTime(lastAct.created_at)}`}>
                            {lastAct.action} · {relTime(lastAct.created_at, S, nowTick)}
                          </span>
                        ) : S.noActivity}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex justify-end gap-1.5">
                          <button
                            className="btn-secondary px-2 py-1 text-xs"
                            onClick={() => setSessDetail(u)}
                          >
                            {S.thDetail}
                          </button>
                          <button
                            className="btn-secondary px-2 py-1 text-xs"
                            onClick={() => navigate(`/audit?actor=${encodeURIComponent(u.username)}`)}
                          >
                            {S.viewLog}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {sessPager.bar}
          </div>
        )}
      </Card>

      <Modal open={sessDetail !== null} onClose={() => { setSessDetail(null); setSessActQ(""); }} title={S.detailTitle} subtitle={sessDetail ? `${sessDetail.username} · ${sessDetail.name}` : ""}>
        {sessDetail && (() => {
          const s = sessions.find((x) => String(x.user_id) === String(sessDetail.id)) ?? null;
          const online = s ? sessionOnline(s.last_seen_at) : false;
          const allActs = lastActByUser.get(sessDetail.username) ?? [];
          const acts = allActs.filter((a) => {
            const needle = sessActQ.trim().toLowerCase();
            if (!needle) return true;
            return `${a.action ?? ""} ${fmtDateTime(a.created_at)}`.toLowerCase().includes(needle);
          });
          return (
            <div className="space-y-3">
              <dl className="dl-div text-sm">
                <div className="flex justify-between"><dt className="text-steel-500">{S.thStatus}</dt><dd>{!sessDetail.isActive ? <Badge tone="gray">{S.statusInactive}</Badge> : <Badge tone={online ? "green" : "gray"}>{online ? "Online" : "Offline"}</Badge>}</dd></div>
                <div className="flex justify-between"><dt className="text-steel-500">{S.thLastLogin}</dt><dd className="font-medium">{s ? fmtDateTime(s.login_at) : S.neverSeen}</dd></div>
                <div className="flex justify-between"><dt className="text-steel-500">{S.thLastSeen}</dt><dd className="font-medium">{s ? `${fmtDateTime(s.last_seen_at)} (${relTime(s.last_seen_at, S, nowTick)})` : S.neverSeen}</dd></div>
                <div className="flex justify-between"><dt className="text-steel-500">{S.thDuration}</dt><dd className="font-medium">{s ? sessionDuration(s.login_at, online ? new Date(nowTick).toISOString() : s.last_seen_at, S) : "-"}</dd></div>
                {s && <div className="flex justify-between"><dt className="text-steel-500">IP</dt><dd className="font-medium">{s.ip || "-"}</dd></div>}
                {s && <div className="flex justify-between"><dt className="text-steel-500">User Agent</dt><dd className="max-w-[60%] truncate text-right font-medium" title={String(s.user_agent ?? "")}>{String(s.user_agent ?? "-")}</dd></div>}
              </dl>
              <p className="text-xs font-semibold text-steel-500">{S.detailActs}</p>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-steel-400" />
                <input className="input pl-9 w-full text-xs" placeholder={S.cardSearchPh} aria-label={S.cardSearchPh} value={sessActQ} onChange={(e) => setSessActQ(e.target.value)} />
              </div>
              {allActs.length === 0 ? (
                <p className="text-xs text-steel-500">{S.detailNoActs}</p>
              ) : (
                <ul className="max-h-64 space-y-1 overflow-y-auto pr-1">
                  {acts.map((a) => (
                    <li key={a.id} className="flex items-start gap-1.5 text-xs" title={`${a.action} · ${fmtDateTime(a.created_at)}`}>
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-ocean-500" />
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-navy-900">{a.action}</span>
                        <span className="block truncate text-steel-500">{fmtDateTime(a.created_at)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })()}
      </Modal>

      <Card className="mb-4 p-4">
        <div className="max-w-sm">
          <Field label={S.selectRole} hint={S.selectRoleHint}>
            <select className="input" value={role} onChange={(e) => setRole(e.target.value)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </Field>
        </div>
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-steel-100 text-left text-xs uppercase tracking-wide text-steel-400">
                <SortTh label={S.thModule} sortKey="modul" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                {ACTIONS.map((a) => (
                  <SortTh key={a} label={actionLabel[a]} sortKey={a} sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-steel-50">
              {matrixPager.slice(sortedModules).map((m) => (
                <tr key={m} className="hover:bg-surface">
                  <td className="sticky left-0 bg-white px-5 py-2.5 font-semibold text-navy-900">{m}</td>
                  {ACTIONS.map((a) => {
                    const ok = granted(role, m, a);
                    return (
                      <td key={a} className="px-3 py-2.5 text-center">
                        {ok ? <Badge tone="green">✓ Siap</Badge> : <Badge tone="gray">-</Badge>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {matrixPager.bar}
        </div>
        <p className="border-t border-steel-100 px-5 py-3 text-xs text-steel-400">
          {S.matrixNote}
        </p>
      </Card>

      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title={S.addUser}
        subtitle={S.addUserSubtitle}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setShowCreate(false)}>{S.cancel}</button>
            <button className="btn-primary" onClick={() => void doCreate()}>{S.save}</button>
          </>
        }
      >
        <div className="grid gap-3">
          <Field label={S.thUsername}>
            <input className="input" value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} placeholder={S.userPh} />
          </Field>
          <Field label={S.thName}>
            <input className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder={S.namePh} />
          </Field>
          <Field label={S.thRole}>
            <select className="input" value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
              {ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </Field>
          <Field label={S.emailOptional}>
            <input type="email" className="input" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder={S.emailPh} />
          </Field>
          <Field label={S.pwInitial}>
            <input type="password" className="input" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} placeholder={S.pwMinPh} />
          </Field>
          <Field label={S.linkedEmployee} hint={S.linkedEmployeeHint}>
            <select className="input" value={form.employeeId} onChange={(e) => setForm((f) => ({ ...f, employeeId: e.target.value }))}>
              <option value="">{S.noLink}</option>
              {(data.employees ?? []).map((e) => (
                <option key={String(e.id)} value={String(e.id)}>{String(e.name ?? e.id)} ({String(e.id)})</option>
              ))}
            </select>
          </Field>
        </div>
      </Modal>

      <Modal
        open={linkTarget !== null}
        onClose={() => { setLinkTarget(null); setLinkValue(""); }}
        title={S.linkTitle.replace("{n}", linkTarget?.username ?? "")}
        subtitle={S.linkSubtitle}
        footer={
          <>
            <button className="btn-secondary" onClick={() => { setLinkTarget(null); setLinkValue(""); }}>{S.cancel}</button>
            <button className="btn-primary" onClick={() => void doLinkEmployee()}>{S.saveLink}</button>
          </>
        }
      >
        <Field label={S.thEmployee}>
          <select className="input" value={linkValue} onChange={(e) => setLinkValue(e.target.value)}>
            <option value="">{S.unlinkOption}</option>
            {(data.employees ?? []).map((e) => (
              <option key={String(e.id)} value={String(e.id)}>{String(e.name ?? e.id)} ({String(e.id)})</option>
            ))}
          </select>
        </Field>
      </Modal>

      <Modal
        open={pwTarget !== null}
        onClose={() => { setPwTarget(null); setPwValue(""); }}
        title={S.resetPwTitle.replace("{n}", pwTarget?.username ?? "")}
        subtitle={S.resetPwSubtitle}
        footer={
          <>
            <button className="btn-secondary" onClick={() => { setPwTarget(null); setPwValue(""); }}>{S.cancel}</button>
            <button className="btn-primary" onClick={() => void doResetPassword()}>{S.resetBtn}</button>
          </>
        }
      >
        <Field label={S.newPw}>
          <input
            type="password"
            className="input"
            value={pwValue}
            onChange={(e) => setPwValue(e.target.value)}
            placeholder={S.newPwPh}
          />
        </Field>
      </Modal>

      <ConfirmModal
        open={confirmTarget !== null}
        title={S.confirmTitle}
        desc={S.confirmDesc.replace("{n}", confirmTarget?.username ?? "")}
        confirmLabel={S.confirmLabel}
        danger
        onCancel={() => setConfirmTarget(null)}
        onConfirm={() => { const t = confirmTarget; if (t) void doToggleActive(t); }}
      />
    </div>
  );
}
