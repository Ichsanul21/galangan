import { useState, useMemo } from "react";
import { NavLink, Outlet, Link, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Anchor,
  Boxes,
  Wallet,
  Users,
  Handshake,
  ShoppingCart,
  ShieldCheck,
  Ship,
  HardHat,
  ScrollText,
  Cpu,
  BarChart3,
  Menu,
  Bell,
  ShipWheel,
  Search,
  ChevronsUpDown,
  CheckCircle2,
  FileText,
  LogOut,
  User,
  RotateCcw,
  CalendarCheck,
  Banknote,
  Activity,
  History,
  KeyRound,
  Settings as SettingsIcon,
} from "lucide-react";
import { useAuth } from "../auth/auth";
import { useStore } from "../data/store";
import { Badge, Modal, Field, Toaster, toast } from "../components/ui";
import { computeAlerts } from "../utils/alerts";

export default function AppShell() {
  const { user, logout } = useAuth();
  const { data, reset, branch, setBranch } = useStore();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [q, setQ] = useState("");

  const alerts = useMemo(() => computeAlerts(data), [data]);

  const lowStockCount = (data.inventory ?? []).filter((i) => Number(i.stock) <= Number(i.minStock)).length;
  const qcCount = (data.ncr ?? []).filter((n) => n.status !== "Tertutup").length + (data.incidents ?? []).length;
  const procCount = (data.requisitions ?? []).filter((r) => String(r.status).toLowerCase().includes("menunggu") || String(r.status).toUpperCase() === "RFQ").length;
  const finCount = (data.invoices ?? []).filter((i) => i.status === "Terlambat" || i.status === "Belum Dibayar").length;

  const navGroups = [
    {
      label: "Analisis",
      items: [
        { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
        { to: "/analytics", label: "Analytics", icon: BarChart3 },
        { to: "/laporan", label: "Laporan", icon: FileText },
        { to: "/notifikasi", label: "Notifikasi", icon: Bell },
      ],
    },
    {
      label: "Operasional",
      items: [
        { to: "/proyek", label: "Manajemen Proyek", icon: Anchor },
        { to: "/proyek/monitoring", label: "Monitoring E2E", icon: Activity },
        { to: "/drydock", label: "Drydock & Kapasitas", icon: ShipWheel },
        { to: "/inventori", label: "Inventori & Material", icon: Boxes, count: lowStockCount },
        { to: "/equipment", label: "Equipment", icon: Cpu },
        { to: "/subkontraktor", label: "Subkontraktor", icon: HardHat },
        { to: "/qc-safety", label: "QC & Safety", icon: ShieldCheck, count: qcCount },
      ],
    },
    {
      label: "Komersial",
      items: [
        { to: "/crm", label: "CRM & Klien", icon: Handshake },
        { to: "/procurement", label: "Procurement", icon: ShoppingCart, count: procCount },
        { to: "/keuangan", label: "Keuangan & Billing", icon: Wallet, count: finCount },
      ],
    },
    {
      label: "SDM",
      items: [
        { to: "/sdm", label: "SDM & Karyawan", icon: Users },
        { to: "/absensi", label: "Absensi", icon: CalendarCheck },
        { to: "/payroll", label: "Payroll", icon: Banknote },
        { to: "/kapal", label: "Rekam Jejak Kapal", icon: Ship },
        { to: "/dokumen", label: "Aset & Dokumen", icon: ScrollText },
        { to: "/pengaturan", label: "Pengaturan", icon: SettingsIcon },
        { to: "/audit", label: "Audit Trail", icon: History },
        { to: "/pengaturan/peran", label: "Peran & Akses", icon: KeyRound },
      ],
    },
  ];

  const doLogout = () => {
    logout();
    navigate("/login");
  };

  const doReset = () => {
    reset();
    setProfileOpen(false);
    toast("Data demo dikembalikan ke awal", "info");
  };

  // Pencarian global terintegrasi: proyek, kapal, invoice, PO, penawaran, karyawan
  const query = q.trim().toLowerCase();
  const hits: { label: string; sub: string; to: string; kind: string }[] = query
    ? [
        ...data.projects
          .filter((p) => `${p.vessel} ${p.id} ${p.client}`.toLowerCase().includes(query))
          .slice(0, 3)
          .map((p) => ({ label: p.vessel, sub: `${p.id} · ${p.client}`, to: `/proyek/${p.id}`, kind: "Proyek" })),
        ...data.vessels
          .filter((v) => `${v.name} ${v.imo}`.toLowerCase().includes(query))
          .slice(0, 2)
          .map((v) => ({ label: v.name, sub: `${v.imo}`, to: `/kapal/${v.id}`, kind: "Kapal" })),
        ...data.invoices
          .filter((i) => `${i.id} ${i.client}`.toLowerCase().includes(query))
          .slice(0, 2)
          .map((i) => ({ label: i.id, sub: `${i.client} · ${i.project}`, to: "/keuangan", kind: "Invoice" })),
        ...data.purchaseOrders
          .filter((p) => `${p.id} ${p.item} ${p.vendor}`.toLowerCase().includes(query))
          .slice(0, 2)
          .map((p) => ({ label: p.id, sub: `${p.item} · ${p.vendor}`, to: "/procurement", kind: "PO" })),
        ...data.quotations
          .filter((x) => `${x.id} ${x.vessel} ${x.client}`.toLowerCase().includes(query))
          .slice(0, 2)
          .map((x) => ({ label: x.id, sub: `${x.vessel} · ${x.client}`, to: "/crm", kind: "Quotation" })),
        ...data.employees
          .filter((e) => `${e.name} ${e.role}`.toLowerCase().includes(query))
          .slice(0, 2)
          .map((e) => ({ label: e.name, sub: `${e.role} · ${e.dept}`, to: "/sdm", kind: "Karyawan" })),
      ]
    : [];

  const sidebar = (
    <div className="flex h-full flex-col bg-navy-900 text-white">
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-white/10">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-ocean-500 text-white">
          <Anchor className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-bold leading-tight">ISMS Galangan</p>
          <p className="text-[10px] text-steel-300">Shipyard Management System</p>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {navGroups.map((group) => (
          <div key={group.label} className="mb-4">
            <p className="px-2 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-steel-300">
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    onClick={() => setOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                        isActive
                          ? "bg-ocean-500/20 text-white font-semibold"
                          : "text-steel-300 hover:bg-white/5 hover:text-white"
                      }`
                    }
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    <span className="truncate" title={item.label}>{item.label}</span>
                    {typeof item.count === "number" && item.count > 0 ? (
                      <span className="ml-auto rounded-full bg-rose-500/90 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                        {item.count > 9 ? "9+" : item.count}
                      </span>
                    ) : null}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-2.5 rounded-lg bg-white/5 px-3 py-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-hero text-xs font-bold text-white">
            {user?.initials ?? "?"}
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold">{user?.name ?? "-"}</p>
            <p className="truncate text-[10px] text-steel-300">{user?.role ?? "-"}</p>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-surface">
      {/* Mobile sidebar */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 shadow-xl">{sidebar}</div>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">{sidebar}</aside>

      <div className="lg:pl-64">
        {/* Topbar */}
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-4 border-b border-steel-200 bg-white/85 px-4 backdrop-blur lg:px-6">
          <div className="flex items-center gap-3">
            <button
              className="text-steel-600 lg:hidden"
              onClick={() => setOpen(true)}
              aria-label="Menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2 text-sm text-steel-500">
              <span className="font-medium text-navy-800">Galangan</span>
              <span>/</span>
              <select
                className="input w-auto border-0 bg-transparent py-1 text-sm font-medium text-navy-800 shadow-none"
                value={branch}
                aria-label="Pilih cabang"
                onChange={(e) => setBranch(e.target.value)}
              >
                <option value="SEMUA">Semua Cabang</option>
                {(data.branches ?? []).map((b) => (
                  <option key={b.id} value={b.city}>{b.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="relative hidden max-w-md flex-1 md:block">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-steel-400" />
              <input
                placeholder="Cari proyek, vessel, dokumen, vendor…"
                className="input pl-9 py-2 text-sm"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border border-steel-200 bg-steel-100 px-1.5 py-0.5 text-[10px] font-medium text-steel-400">
                ⌘K
              </kbd>
            </div>
            {query && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setQ("")} />
                <div className="absolute left-0 right-0 z-20 mt-2 overflow-hidden rounded-xl border border-steel-200 bg-white shadow-lift">
                  {hits.length === 0 && (
                    <p className="px-4 py-3 text-sm text-steel-400">Tidak ada hasil untuk “{q}”.</p>
                  )}
                  {hits.map((h, i) => (
                    <Link
                      key={`${h.kind}-${i}`}
                      to={h.to}
                      onClick={() => setQ("")}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface"
                    >
                      <Badge tone="navy">{h.kind}</Badge>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-navy-900">{h.label}</span>
                        <span className="block truncate text-xs text-steel-500">{h.sub}</span>
                      </span>
                    </Link>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                onClick={() => setNotifOpen((v) => !v)}
                className="relative flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-steel-500 hover:bg-steel-100"
                aria-label="Notifikasi"
              >
                <Bell className="h-5 w-5" />
                <span className="absolute right-0.5 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] font-bold text-white">
                  {Math.min(alerts.length + data.activities.length, 9)}
                </span>
              </button>
              {notifOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setNotifOpen(false)} />
                  <div className="absolute right-0 z-20 mt-2 max-h-96 w-80 overflow-y-auto rounded-xl border border-steel-200 bg-white shadow-lift">
                    {alerts.length > 0 && (
                      <>
                        <p className="border-b border-steel-100 px-4 py-2.5 text-sm font-semibold text-navy-900">
                          Perlu Perhatian ({alerts.length})
                        </p>
                        {alerts.slice(0, 6).map((al) => (
                          <Link
                            key={al.id}
                            to={al.to}
                            onClick={() => setNotifOpen(false)}
                            className={`flex items-center gap-2 border-b border-steel-50 px-4 py-2.5 text-xs font-medium last:border-0 hover:bg-surface ${
                              al.tone === "red" ? "text-rose-700" : al.tone === "amber" ? "text-amber-700" : "text-ocean-600"
                            }`}
                          >
                            <span className={`h-2 w-2 shrink-0 rounded-full ${al.tone === "red" ? "bg-rose-500" : al.tone === "amber" ? "bg-amber-500" : "bg-ocean-500"}`} />
                            {al.text}
                          </Link>
                        ))}
                      </>
                    )}
                    <p className="border-b border-steel-100 px-4 py-2.5 text-sm font-semibold text-navy-900">
                      Aktivitas Terkini
                    </p>
                    {data.activities.slice(0, 8).map((a) => (
                      <div key={a.id} className="border-b border-steel-50 px-4 py-2.5 last:border-0">
                        <p className="text-xs text-steel-700">
                          <span className="font-semibold text-navy-900">{a.actor}</span> {a.action}{" "}
                          <span className="font-medium">{a.target}</span>
                        </p>
                        <p className="mt-0.5 text-[10px] text-steel-400">{a.module} · {a.time}</p>
                      </div>
                    ))}
                    <Link
                      to="/notifikasi"
                      onClick={() => setNotifOpen(false)}
                      className="block px-4 py-2.5 text-center text-xs font-semibold text-ocean-600 hover:bg-surface"
                    >
                      Lihat semua →
                    </Link>
                  </div>
                </>
              )}
            </div>
            <div className="relative">
              <button
                onClick={() => setUserOpen((v) => !v)}
                className="flex items-center gap-2 rounded-lg p-1.5 hover:bg-steel-100"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-hero text-xs font-bold text-white">
                  {user?.initials ?? "?"}
                </div>
                <div className="hidden text-left leading-tight sm:block">
                  <p className="text-xs font-semibold text-navy-900">{user?.name ?? "-"}</p>
                  <p className="text-[10px] text-steel-500">{user?.role ?? "-"}</p>
                </div>
                <ChevronsUpDown className="hidden h-3.5 w-3.5 text-steel-400 sm:block" />
              </button>
              {userOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setUserOpen(false)} />
                  <div className="absolute right-0 z-20 mt-2 w-60 overflow-hidden rounded-xl border border-steel-200 bg-white shadow-lift">
                    <div className="border-b border-steel-100 px-4 py-3">
                      <p className="text-sm font-semibold text-navy-900">{user?.name}</p>
                      <p className="text-xs text-steel-500">{user?.email}</p>
                    </div>
                    <div className="p-1.5">
                      <button
                        onClick={() => { setUserOpen(false); setProfileOpen(true); }}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-steel-700 hover:bg-steel-100"
                      >
                        <User className="h-4 w-4 text-steel-400" /> Profil Saya
                      </button>
                      <button
                        onClick={() => { setUserOpen(false); setNotifOpen(true); }}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-steel-700 hover:bg-steel-100"
                      >
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Aktivitas Saya
                      </button>
                      <button
                        onClick={() => { setUserOpen(false); navigate("/dokumen"); }}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-steel-700 hover:bg-steel-100"
                      >
                        <FileText className="h-4 w-4 text-steel-400" /> Dokumen Saya
                      </button>
                      <div className="my-1.5 border-t border-steel-100" />
                      <button
                        onClick={doLogout}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-rose-600 hover:bg-rose-50"
                      >
                        <LogOut className="h-4 w-4" /> Keluar
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        <main className="p-4 lg:p-6">
          <Outlet />
        </main>
      </div>

      {/* Modal profil */}
      <Modal open={profileOpen} onClose={() => setProfileOpen(false)} title="Profil Saya" subtitle="Sesi demo — tersimpan di browser">
        <div className="flex items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-hero text-lg font-bold text-white">
            {user?.initials}
          </div>
          <div>
            <p className="font-bold text-navy-900">{user?.name}</p>
            <p className="text-sm text-steel-500">{user?.role}</p>
            <p className="text-xs text-steel-400">{user?.email}</p>
          </div>
        </div>
        <div className="mt-4 rounded-xl bg-surface p-3 text-xs leading-relaxed text-steel-600">
          Semua perubahan data yang Anda buat di semua modul tersimpan otomatis di sesi browser ini (sessionStorage).
          Menutup tab akan menghapus sesi login; data demo dapat dikembalikan kapan saja.
        </div>
        <Field label="Reset data demo">
          <button onClick={doReset} className="btn-secondary w-full justify-center">
            <RotateCcw className="h-4 w-4" /> Kembalikan data ke awal
          </button>
        </Field>
      </Modal>

      <Toaster />
    </div>
  );
}
