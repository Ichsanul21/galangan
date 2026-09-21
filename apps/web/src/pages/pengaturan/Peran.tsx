import { useMemo, useState } from "react";
import { Download, KeyRound } from "lucide-react";
import { Badge, Card, Field, KpiCard, PageHeader, toast } from "../../components/ui";
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

export default function Peran() {
  const [role, setRole] = useState("Project Manager");

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
                <th className="sticky left-0 bg-white px-5 py-3 font-semibold">Modul</th>
                {ACTIONS.map((a) => (
                  <th key={a} className="px-3 py-3 text-center font-semibold">{a}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-steel-50">
              {MODULES.map((m) => (
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
    </div>
  );
}
