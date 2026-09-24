import { useEffect, useMemo, useState } from "react";
import { Download, KeyRound, Plus, RefreshCw } from "lucide-react";
import { Badge, Card, ConfirmModal, Field, KpiCard, Modal, PageHeader, SortTh, sortRows, toast, toggleSort } from "../../components/ui";
import type { SortState } from "../../components/ui";
import { canSetTarget, useAuth } from "../../auth/auth";
import { apiFetch, isBackendConfigured } from "../../services/http";
import { exportExcel } from "../../utils/export";

const ACTIONS = ["Lihat", "Buat", "Ubah", "Hapus", "Setujui", "Bayar", "Export"] as const;
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
    Proyek: ["Lihat", "Buat", "Ubah", "Setujui", "Export"],
    Drydock: ["Lihat", "Setujui", "Export"],
    Inventori: ["Lihat", "Export"],
    Equipment: ["Lihat", "Export"],
    Subkontraktor: ["Lihat", "Buat", "Ubah", "Setujui", "Export"],
    "QC & Safety": ["Lihat", "Export"],
    CRM: ["Lihat", "Buat", "Ubah", "Setujui", "Export"],
    Procurement: ["Lihat", "Setujui", "Export"],
    Keuangan: ["Lihat", "Setujui", "Bayar", "Export"],
    SDM: ["Lihat", "Setujui", "Export"],
    Kapal: ["Lihat", "Export"],
    Dokumen: ["Lihat", "Export"],
    Analytics: ["Lihat", "Export"],
    Notifikasi: ["Lihat"],
    Absensi: ["Lihat", "Setujui", "Export"],
    Payroll: ["Lihat", "Setujui", "Bayar", "Export"],
    Laporan: ["Lihat", "Export"],
    Monitoring: ["Lihat", "Export"],
    Pengaturan: ["Lihat", "Export"],
  },
  "Project Manager": {
    Proyek: ["Lihat", "Buat", "Ubah", "Setujui", "Export"],
    Drydock: ["Lihat", "Buat", "Ubah", "Export"],
    Inventori: ["Lihat", "Buat", "Export"],
    Equipment: ["Lihat", "Buat", "Ubah", "Export"],
    Subkontraktor: ["Lihat", "Buat", "Ubah", "Setujui", "Export"],
    "QC & Safety": ["Lihat", "Buat"],
    CRM: ["Lihat"],
    Procurement: ["Lihat", "Buat", "Export"],
    Keuangan: ["Lihat", "Export"],
    SDM: ["Lihat", "Export"],
    Kapal: ["Lihat"],
    Dokumen: ["Lihat", "Buat", "Ubah", "Export"],
    Analytics: ["Lihat", "Export"],
    Notifikasi: ["Lihat"],
    Absensi: ["Lihat", "Setujui", "Export"],
    Payroll: ["Lihat"],
    Laporan: ["Lihat", "Buat", "Export"],
    Monitoring: ["Lihat", "Buat", "Ubah", "Export"],
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
    "QC & Safety": ["Lihat", "Buat", "Ubah", "Export"],
    Dokumen: ["Lihat", "Buat", "Ubah", "Export"],
    Notifikasi: ["Lihat"],
    Laporan: ["Lihat", "Export"],
  },
  "QC/HSE Manager": {
    Proyek: ["Lihat", "Setujui"],
    Monitoring: ["Lihat"],
    Equipment: ["Lihat"],
    "QC & Safety": ["Lihat", "Buat", "Ubah", "Setujui", "Export"],
    SDM: ["Lihat"],
    Dokumen: ["Lihat", "Buat", "Ubah", "Setujui", "Export"],
    Notifikasi: ["Lihat"],
    Absensi: ["Lihat"],
    Laporan: ["Lihat", "Buat", "Export"],
  },
  Warehouse: {
    Proyek: ["Lihat"],
    Inventori: ["Lihat", "Buat", "Ubah", "Export"],
    Equipment: ["Lihat"],
    Procurement: ["Lihat", "Buat"],
    Dokumen: ["Lihat"],
    Notifikasi: ["Lihat"],
    Laporan: ["Lihat", "Export"],
  },
  Procurement: {
    Proyek: ["Lihat"],
    Inventori: ["Lihat", "Buat", "Ubah", "Export"],
    Subkontraktor: ["Lihat", "Buat", "Ubah"],
    Procurement: ["Lihat", "Buat", "Ubah", "Setujui", "Export"],
    Keuangan: ["Lihat"],
    Dokumen: ["Lihat", "Buat", "Export"],
    Notifikasi: ["Lihat"],
    Laporan: ["Lihat", "Export"],
  },
  Finance: {
    Proyek: ["Lihat"],
    CRM: ["Lihat"],
    Procurement: ["Lihat"],
    Keuangan: ["Lihat", "Buat", "Ubah", "Setujui", "Bayar", "Export"],
    Payroll: ["Lihat", "Buat", "Ubah", "Bayar", "Export"],
    Dokumen: ["Lihat", "Export"],
    Analytics: ["Lihat", "Export"],
    Notifikasi: ["Lihat"],
    Laporan: ["Lihat", "Buat", "Export"],
  },
  HR: {
    Proyek: ["Lihat"],
    SDM: ["Lihat", "Buat", "Ubah", "Hapus", "Setujui", "Export"],
    Dokumen: ["Lihat", "Buat", "Export"],
    Notifikasi: ["Lihat"],
    Absensi: ["Lihat", "Buat", "Ubah", "Setujui", "Export"],
    Payroll: ["Lihat", "Buat", "Ubah", "Export"],
    Laporan: ["Lihat", "Export"],
  },
  Sales: {
    Proyek: ["Lihat"],
    CRM: ["Lihat", "Buat", "Ubah", "Export"],
    Keuangan: ["Lihat"],
    Kapal: ["Lihat"],
    Dokumen: ["Lihat", "Buat", "Export"],
    Analytics: ["Lihat"],
    Notifikasi: ["Lihat"],
    Laporan: ["Lihat", "Export"],
  },
  "Client (eks)": {
    Proyek: ["Lihat"],
    Dokumen: ["Lihat"],
    Notifikasi: ["Lihat"],
    Laporan: ["Lihat"],
    Monitoring: ["Lihat"],
  },
  Admin: {
    Proyek: ["Lihat", "Buat", "Ubah", "Hapus", "Setujui", "Bayar", "Export"],
    Drydock: ["Lihat", "Buat", "Ubah", "Hapus", "Setujui", "Bayar", "Export"],
    Inventori: ["Lihat", "Buat", "Ubah", "Hapus", "Setujui", "Bayar", "Export"],
    Equipment: ["Lihat", "Buat", "Ubah", "Hapus", "Setujui", "Bayar", "Export"],
    Subkontraktor: ["Lihat", "Buat", "Ubah", "Hapus", "Setujui", "Bayar", "Export"],
    "QC & Safety": ["Lihat", "Buat", "Ubah", "Hapus", "Setujui", "Bayar", "Export"],
    CRM: ["Lihat", "Buat", "Ubah", "Hapus", "Setujui", "Bayar", "Export"],
    Procurement: ["Lihat", "Buat", "Ubah", "Hapus", "Setujui", "Bayar", "Export"],
    Keuangan: ["Lihat", "Buat", "Ubah", "Hapus", "Setujui", "Bayar", "Export"],
    SDM: ["Lihat", "Buat", "Ubah", "Hapus", "Setujui", "Bayar", "Export"],
    Kapal: ["Lihat", "Buat", "Ubah", "Hapus", "Setujui", "Bayar", "Export"],
    Dokumen: ["Lihat", "Buat", "Ubah", "Hapus", "Setujui", "Bayar", "Export"],
    Analytics: ["Lihat", "Buat", "Ubah", "Hapus", "Setujui", "Bayar", "Export"],
    Notifikasi: ["Lihat", "Buat", "Ubah", "Hapus", "Setujui", "Bayar", "Export"],
    Absensi: ["Lihat", "Buat", "Ubah", "Hapus", "Setujui", "Bayar", "Export"],
    Payroll: ["Lihat", "Buat", "Ubah", "Hapus", "Setujui", "Bayar", "Export"],
    Laporan: ["Lihat", "Buat", "Ubah", "Hapus", "Setujui", "Bayar", "Export"],
    Monitoring: ["Lihat", "Buat", "Ubah", "Hapus", "Setujui", "Bayar", "Export"],
    Pengaturan: ["Lihat", "Buat", "Ubah", "Hapus", "Setujui", "Bayar", "Export"],
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
}

function errMsg(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : fallback;
}

export default function Peran() {
  const [role, setRole] = useState("Project Manager");
  const [sort, setSort] = useState<SortState>({ key: null, dir: "asc" });

  /* Live user management (remote only). Matrix below stays as the RBAC reference. */
  const remote = isBackendConfigured();
  const { user: session } = useAuth();
  const canManage = canSetTarget(session?.role);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ username: "", name: "", role: "Manager", password: "", email: "" });
  const [pwTarget, setPwTarget] = useState<ManagedUser | null>(null);
  const [pwValue, setPwValue] = useState("");
  const [confirmTarget, setConfirmTarget] = useState<ManagedUser | null>(null);

  const loadUsers = async () => {
    if (!isBackendConfigured()) return;
    setUsersLoading(true);
    try {
      const res = await apiFetch<{ users: ManagedUser[] } | ManagedUser[]>("/api/users");
      setUsers(Array.isArray(res) ? res : (res.users ?? []));
    } catch (e) {
      toast(errMsg(e, "Gagal memuat pengguna"), "info");
    } finally {
      setUsersLoading(false);
    }
  };

  useEffect(() => {
    void loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doCreate = async () => {
    if (!form.username.trim() || !form.name.trim() || form.password.length < 6) {
      toast("Lengkapi username, nama, dan password (min. 6 karakter)", "info");
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
        }),
      });
      toast(`Pengguna ${form.username.trim()} dibuat`);
      setShowCreate(false);
      setForm({ username: "", name: "", role: "Manager", password: "", email: "" });
      await loadUsers();
    } catch (e) {
      toast(errMsg(e, "Gagal membuat pengguna"), "info");
    }
  };

  const doResetPassword = async () => {
    if (!pwTarget || pwValue.length < 6) {
      toast("Password baru min. 6 karakter", "info");
      return;
    }
    try {
      await apiFetch(`/api/users/${pwTarget.id}/password`, {
        method: "POST",
        body: JSON.stringify({ newPassword: pwValue }),
      });
      toast(`Password ${pwTarget.username} direset`);
      setPwTarget(null);
      setPwValue("");
    } catch (e) {
      toast(errMsg(e, "Gagal mereset password"), "info");
    }
  };

  const doToggleActive = async (u: ManagedUser) => {
    try {
      if (u.isActive) {
        await apiFetch(`/api/users/${u.id}`, { method: "DELETE" });
        toast(`${u.username} dinonaktifkan`);
      } else {
        await apiFetch(`/api/users/${u.id}`, {
          method: "PATCH",
          body: JSON.stringify({ isActive: true }),
        });
        toast(`${u.username} diaktifkan kembali`);
      }
      setConfirmTarget(null);
      await loadUsers();
    } catch (e) {
      toast(errMsg(e, "Gagal mengubah status pengguna"), "info");
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

  const doExport = () => {
    const head = ["Peran", "Modul", ...ACTIONS];
    const body: string[][] = [];
    for (const r of ROLES) {
      for (const m of MODULES) {
        body.push([r, m, ...ACTIONS.map((a) => (granted(r, m, a) ? "Ya" : "-"))]);
      }
    }
    void exportExcel([head, ...body], "matriks-peran-akses", "RBAC").then(() =>
      toast("Matriks peran diekspor ke Excel")
    );
  };

  return (
    <div>
      <PageHeader
        title="Peran & Akses"
        subtitle="Matriks RBAC tampilan + siap enforce — enforcement penuh di backend"
        icon={<KeyRound className="h-5 w-5" />}
        actions={
          <button className="btn-secondary text-xs" onClick={doExport}>
            <Download className="h-4 w-4" /> Export Excel
          </button>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard label="Cakupan Akses" value={`${stats.pct}%`} hint={`${stats.yes} dari ${stats.total} sel`} chip="navy" icon={<KeyRound className="h-5 w-5" />} />
        <KpiCard label="Modul Terakses" value={`${stats.withAccess} / ${MODULES.length}`} hint={`Peran ${role}`} chip="teal" icon={<KeyRound className="h-5 w-5" />} />
        <KpiCard label="Total Peran" value={String(ROLES.length)} hint="Termasuk Client eksternal" chip="violet" icon={<KeyRound className="h-5 w-5" />} />
      </div>

      <Card className="mb-4 p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-bold text-navy-900">Manajemen Pengguna</h3>
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${remote ? "bg-emerald-100 text-emerald-700" : "bg-steel-100 text-steel-600"}`}>
            {remote ? "Backend: tersambung" : "Mode lokal"}
          </span>
          {remote && (
            <span className="text-xs text-steel-400">
              {usersLoading ? "Memuat…" : `${users.length} pengguna`}
            </span>
          )}
          <span className="ml-auto flex gap-2">
            {remote && (
              <button className="btn-secondary text-xs" onClick={() => void loadUsers()}>
                <RefreshCw className="h-4 w-4" /> Muat ulang
              </button>
            )}
            {remote && canManage && (
              <button className="btn-primary text-xs" onClick={() => setShowCreate(true)}>
                <Plus className="h-4 w-4" /> Tambah pengguna
              </button>
            )}
          </span>
        </div>
        {!remote ? (
          <p className="text-xs leading-relaxed text-steel-500">
            Mode lokal — daftar pengguna live tampil setelah backend tersambung (VITE_API_URL).
            Matriks peran di bawah tetap menjadi acuan akses.
          </p>
        ) : !canManage ? (
          <p className="text-xs leading-relaxed text-steel-500">
            Peran Anda ({session?.role ?? "-"}) tidak dapat mengelola pengguna — butuh peran Direktur atau Developer.
          </p>
        ) : users.length === 0 && !usersLoading ? (
          <p className="text-xs text-steel-500">Belum ada pengguna di backend.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-steel-100 text-left text-xs uppercase tracking-wide text-steel-400">
                  <th className="px-3 py-2">Username</th>
                  <th className="px-3 py-2">Nama</th>
                  <th className="px-3 py-2">Peran</th>
                  <th className="px-3 py-2">Email</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-steel-50">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-surface">
                    <td className="px-3 py-2 font-semibold text-navy-900">{u.username}</td>
                    <td className="px-3 py-2">{u.name}</td>
                    <td className="px-3 py-2">{u.role}</td>
                    <td className="px-3 py-2 text-steel-500">{u.email || "-"}</td>
                    <td className="px-3 py-2">
                      {u.isActive ? <Badge tone="green">Aktif</Badge> : <Badge tone="gray">Nonaktif</Badge>}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1.5">
                        <button
                          className="btn-secondary px-2 py-1 text-xs"
                          onClick={() => { setPwTarget(u); setPwValue(""); }}
                        >
                          Reset password
                        </button>
                        {u.isActive ? (
                          <button
                            className="btn-secondary px-2 py-1 text-xs text-rose-600"
                            onClick={() => setConfirmTarget(u)}
                          >
                            Nonaktifkan
                          </button>
                        ) : (
                          <button
                            className="btn-secondary px-2 py-1 text-xs"
                            onClick={() => void doToggleActive(u)}
                          >
                            Aktifkan
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="mb-4 p-4">
        <div className="max-w-sm">
          <Field label="Pilih peran" hint="Read-only — perubahan peran dilakukan saat backend tersedia">
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
                <SortTh label="Modul" sortKey="modul" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                {ACTIONS.map((a) => (
                  <SortTh key={a} label={a} sortKey={a} sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-steel-50">
              {sortRows(MODULES, sort, (row, k) => {
                const m = String(row);
                if (k === "modul") return m;
                return granted(role, m, String(k) as RoleAction) ? "Ya" : "";
              }).map((m) => (
                <tr key={m} className="hover:bg-surface">
                  <td className="sticky left-0 bg-white px-5 py-2.5 font-semibold text-navy-900">{m}</td>
                  {ACTIONS.map((a) => {
                    const ok = granted(role, m, a);
                    return (
                      <td key={a} className="px-3 py-2.5 text-center">
                        {ok ? <Badge tone="green">✓ Siap</Badge> : <Badge tone="gray">—</Badge>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-steel-100 px-5 py-3 text-xs text-steel-400">
          Sel kosong berarti peran tidak memiliki akses. Matriks ini read-only dan menjadi acuan enforcement saat backend tersedia.
        </p>
      </Card>

      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="Tambah pengguna"
        subtitle="Hanya Direktur / Developer — password min. 6 karakter"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setShowCreate(false)}>Batal</button>
            <button className="btn-primary" onClick={() => void doCreate()}>Simpan</button>
          </>
        }
      >
        <div className="grid gap-3">
          <Field label="Username">
            <input className="input" value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} placeholder="nama@galangan.com" />
          </Field>
          <Field label="Nama">
            <input className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Nama lengkap" />
          </Field>
          <Field label="Peran">
            <select className="input" value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
              {ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </Field>
          <Field label="Email (opsional)">
            <input className="input" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="email@galangan.com" />
          </Field>
          <Field label="Password awal">
            <input type="password" className="input" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} placeholder="Min. 6 karakter" />
          </Field>
        </div>
      </Modal>

      <Modal
        open={pwTarget !== null}
        onClose={() => { setPwTarget(null); setPwValue(""); }}
        title={`Reset password — ${pwTarget?.username ?? ""}`}
        subtitle="Direktur / Developer dapat mereset tanpa password lama"
        footer={
          <>
            <button className="btn-secondary" onClick={() => { setPwTarget(null); setPwValue(""); }}>Batal</button>
            <button className="btn-primary" onClick={() => void doResetPassword()}>Reset</button>
          </>
        }
      >
        <Field label="Password baru (min. 6 karakter)">
          <input
            type="password"
            className="input"
            value={pwValue}
            onChange={(e) => setPwValue(e.target.value)}
            placeholder="Password baru"
          />
        </Field>
      </Modal>

      <ConfirmModal
        open={confirmTarget !== null}
        title="Nonaktifkan pengguna?"
        desc={`${confirmTarget?.username ?? ""} tidak bisa login lagi sampai diaktifkan kembali. Data pengguna tidak dihapus.`}
        confirmLabel="Ya, nonaktifkan"
        danger
        onCancel={() => setConfirmTarget(null)}
        onConfirm={() => { const t = confirmTarget; if (t) void doToggleActive(t); }}
      />
    </div>
  );
}
