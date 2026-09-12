import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
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
  AlertTriangle,
  FileText,
} from "lucide-react";

const navGroups = [
  {
    label: "Analisis",
    items: [
      { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { to: "/analytics", label: "Analytics", icon: BarChart3 },
    ],
  },
  {
    label: "Operasional",
    items: [
      { to: "/proyek", label: "Manajemen Proyek", icon: Anchor },
      { to: "/drydock", label: "Drydock & Kapasitas", icon: ShipWheel },
      { to: "/inventori", label: "Inventori & Material", icon: Boxes, count: 4 },
      { to: "/equipment", label: "Equipment", icon: Cpu },
      { to: "/subkontraktor", label: "Subkontraktor", icon: HardHat },
      { to: "/qc-safety", label: "QC & Safety", icon: ShieldCheck, count: 3 },
    ],
  },
  {
    label: "Komersial",
    items: [
      { to: "/crm", label: "CRM & Klien", icon: Handshake },
      { to: "/procurement", label: "Procurement", icon: ShoppingCart, count: 2 },
      { to: "/keuangan", label: "Keuangan & Billing", icon: Wallet, count: 4 },
    ],
  },
  {
    label: "SDM",
    items: [
      { to: "/sdm", label: "SDM & Karyawan", icon: Users },
      { to: "/kapal", label: "Rekam Jejak Kapal", icon: Ship },
      { to: "/dokumen", label: "Aset & Dokumen", icon: ScrollText },
    ],
  },
];

export default function AppShell() {
  const [open, setOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);


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
                    <span className="truncate">{item.label}</span>
                    {item.count ? (
                      <span className="ml-auto rounded-full bg-rose-500/90 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                        {item.count}
                      </span>
                    ) : null}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
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
              <span>Cabang Utama — Batam</span>
            </div>
          </div>

          <div className="hidden max-w-md flex-1 md:block">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-steel-400" />
              <input
                placeholder="Cari proyek, vessel, dokumen, vendor…"
                className="input pl-9 py-2 text-sm"
              />
              <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border border-steel-200 bg-steel-100 px-1.5 py-0.5 text-[10px] font-medium text-steel-400">
                ⌘K
              </kbd>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button className="relative flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-steel-500 hover:bg-steel-100">
              <Bell className="h-5 w-5" />
              <span className="absolute right-0.5 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] font-bold text-white">
                6
              </span>
            </button>
            <div className="relative">
              <button
                onClick={() => setUserOpen((v) => !v)}
                className="flex items-center gap-2 rounded-lg p-1.5 hover:bg-steel-100"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-hero text-xs font-bold text-white">
                  AD
                </div>
                <div className="hidden text-left leading-tight sm:block">
                  <p className="text-xs font-semibold text-navy-900">Andi Darman</p>
                  <p className="text-[10px] text-steel-500">Direktur</p>
                </div>
                <ChevronsUpDown className="hidden h-3.5 w-3.5 text-steel-400 sm:block" />
              </button>
              {userOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setUserOpen(false)} />
                  <div className="absolute right-0 z-20 mt-2 w-60 overflow-hidden rounded-xl border border-steel-200 bg-white shadow-lift">
                    <div className="border-b border-steel-100 px-4 py-3">
                      <p className="text-sm font-semibold text-navy-900">Andi Darman</p>
                      <p className="text-xs text-steel-500">andi.darman@isgalangan.co.id</p>
                    </div>
                    <div className="p-1.5">
                      <a href="#" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-steel-700 hover:bg-steel-100">
                        <FileText className="h-4 w-4 text-steel-400" /> Profil & Tanda Tangan
                      </a>
                      <a href="#" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-steel-700 hover:bg-steel-100">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Persetujuan menunggu
                      </a>
                      <a href="#" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-steel-700 hover:bg-steel-100">
                        <Bell className="h-4 w-4 text-steel-400" /> Notifikasi
                      </a>
                      <div className="my-1.5 border-t border-steel-100" />
                      <a href="#" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-rose-600 hover:bg-rose-50">
                        <AlertTriangle className="h-4 w-4" /> Keluar
                      </a>
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
    </div>
  );
}
