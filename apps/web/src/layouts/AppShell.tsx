import { useState, useMemo, useEffect, type ComponentType } from "react";
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
import { apiFetch } from "../services/http";
import { computeAlerts } from "../utils/alerts";
import { loadNotifRead, saveNotifRead } from "../utils/notifRead";
import { type ModuleAlertKey } from "../utils/moduleAlerts";
import { useT } from "../i18n/LanguageContext";
import { remoteRepository } from "../services/repositories";
import { getJwt, isBackendConfigured } from "../services/http";

export default function AppShell() {
  const { user, logout } = useAuth();
  const { t, locale, setLocale } = useT();
  const { data, reset, branch, setBranch, backendMode, backendError, pendingSync, pushPending } = useStore();
  const navigate = useNavigate();

  useEffect(() => {
    const onExpired = () => {
      toast(t.auth.sessionExpired, "info");
      logout();
      navigate("/login");
    };
    window.addEventListener("isms:auth-expired", onExpired);
    return () => window.removeEventListener("isms:auth-expired", onExpired);
  }, [logout, navigate, t]);

  // Heartbeat sesi realtime (BE: upsert last_seen, 60 dtk, hanya bila login).
  useEffect(() => {
    if (!isBackendConfigured() || !getJwt()) return;
    let stopped = false;
    const beat = () => {
      if (stopped || !getJwt()) return;
      void apiFetch("/api/auth/heartbeat", { method: "POST" }).catch(() => undefined);
    };
    beat();
    const id = window.setInterval(beat, 60000);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, []);
  const [open, setOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [bellExpanded, setBellExpanded] = useState(false);
  const [bellMin, setBellMin] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [q, setQ] = useState("");

  const alerts = useMemo(() => computeAlerts(data), [data]);

  /* Badge bell = item belum dibaca beneran (alert + 30 aktivitas terakhir − yang sudah dibaca). */
  const notifIds = useMemo(
    () => [...alerts.map((al) => `alert-${al.id}`), ...(data.activities ?? []).slice(0, 30).map((a) => `act-${String(a.id)}`)],
    [alerts, data.activities]
  );
  const [readTick, setReadTick] = useState(0);
  const unreadCount = useMemo(() => {
    void readTick;
    const read = loadNotifRead();
    return notifIds.filter((id) => !read.has(id)).length;
  }, [notifIds, notifOpen, readTick]);
  const markNotifRead = (id: string) => {
    const read = loadNotifRead();
    if (read.has(id)) return;
    read.add(id);
    saveNotifRead(read);
    setReadTick((t) => t + 1);
  };

  /* Badge sidebar DIHAPUS — banner + highlight per halaman modul murni
     ikut kondisi (tanpa read-state). */

  const navGroups: { label: string; items: { to: string; label: string; icon: ComponentType<{ className?: string }>; alertKey?: ModuleAlertKey }[] }[] = [
    {
      label: t.nav.analisis,
      items: [
        { to: "/dashboard", label: t.nav.dashboard, icon: LayoutDashboard },
        { to: "/analytics", label: t.nav.analytics, icon: BarChart3 },
        { to: "/laporan", label: t.nav.laporan, icon: FileText },
        { to: "/notifikasi", label: t.nav.notifikasi, icon: Bell },
      ],
    },
    {
      label: t.nav.operasional,
      items: [
        { to: "/proyek", label: t.nav.proyek, icon: Anchor, alertKey: "proyek" },
        { to: "/proyek/monitoring", label: t.nav.monitoring, icon: Activity },
        { to: "/drydock", label: t.nav.drydock, icon: ShipWheel, alertKey: "drydock" },
        { to: "/inventori", label: t.nav.inventori, icon: Boxes, alertKey: "inventori" },
        { to: "/equipment", label: t.nav.equipment, icon: Cpu, alertKey: "equipment" },
        { to: "/subkontraktor", label: t.nav.subkontraktor, icon: HardHat, alertKey: "subkontraktor" },
        { to: "/qc-safety", label: t.nav.qc, icon: ShieldCheck, alertKey: "qc" },
      ],
    },
    {
      label: t.nav.komersial,
      items: [
        { to: "/crm", label: t.nav.crm, icon: Handshake, alertKey: "crm" },
        { to: "/procurement", label: t.nav.procurement, icon: ShoppingCart, alertKey: "procurement" },
        { to: "/keuangan", label: t.nav.keuangan, icon: Wallet, alertKey: "keuangan" },
      ],
    },
    {
      label: "SDM",
      items: [
        { to: "/sdm", label: t.nav.sdm, icon: Users, alertKey: "sdm" },
        { to: "/absensi", label: t.nav.absensi, icon: CalendarCheck },
        { to: "/payroll", label: t.nav.payroll, icon: Banknote, alertKey: "payroll" },
        { to: "/kapal", label: t.nav.kapal, icon: Ship, alertKey: "kapal" },
        { to: "/dokumen", label: t.nav.dokumen, icon: ScrollText, alertKey: "dokumen" },
        { to: "/pengaturan", label: t.nav.pengaturan, icon: SettingsIcon },
        { to: "/audit", label: t.nav.audit, icon: History },
        { to: "/pengaturan/peran", label: t.nav.peran, icon: KeyRound },
      ],
    },
  ];

  const doLogout = () => {
    if (isBackendConfigured() && getJwt()) {
      void apiFetch("/api/auth/logout", { method: "DELETE" }).catch(() => undefined);
    }
    logout();
    navigate("/login");
  };

  const doReset = () => {
    reset();
    setProfileOpen(false);
    toast(t.session.demoReset, "info");
  };

  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const doChangePassword = async () => {
    if (!isBackendConfigured()) {
      toast("Mode lokal — ganti password tersedia saat backend tersambung", "info");
      return;
    }
    if (newPw.length < 6) {
      toast("Password baru min. 6 karakter", "info");
      return;
    }
    try {
      await apiFetch("/api/users/me/password", {
        method: "POST",
        body: JSON.stringify({ oldPassword: oldPw, newPassword: newPw }),
      });
      setOldPw("");
      setNewPw("");
      toast("Password berhasil diganti");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Gagal ganti password", "info");
    }
  };

  // Pencarian global: lokal (fallback) + backend saat remote (q → BE).
  interface Hit { label: string; sub: string; to: string; kind: string }
  const query = q.trim().toLowerCase();
  const rawQuery = q.trim();
  const remoteSearchable = backendMode === "remote";
  const [remoteHits, setRemoteHits] = useState<Hit[] | null>(null);

  useEffect(() => {
    if (!remoteSearchable || !rawQuery || !isBackendConfigured() || !getJwt()) {
      setRemoteHits(null);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          const [prj, vsl, doc, vnd] = await Promise.all([
            remoteRepository("projects").listFiltered?.({ q: rawQuery }) ?? Promise.resolve([]),
            remoteRepository("vessels").listFiltered?.({ q: rawQuery }) ?? Promise.resolve([]),
            remoteRepository("documents").listFiltered?.({ q: rawQuery }) ?? Promise.resolve([]),
            remoteRepository("vendors").listFiltered?.({ q: rawQuery }) ?? Promise.resolve([]),
          ]);
          if (cancelled) return;
          setRemoteHits([
            ...(prj ?? []).slice(0, 3).map((p) => ({
              label: String(p.vessel ?? p.id), sub: `${p.id} · ${p.client ?? ""}`, to: `/proyek/${p.id}`, kind: "Proyek",
            })),
            ...(vsl ?? []).slice(0, 2).map((v) => ({
              label: String(v.name ?? v.id), sub: String(v.imo ?? ""), to: `/kapal/${v.id}`, kind: "Kapal",
            })),
            ...(doc ?? []).slice(0, 2).map((d) => ({
              label: String(d.title ?? d.id), sub: `${d.type ?? ""} · ${d.project ?? ""}`, to: "/dokumen", kind: "Dokumen",
            })),
            ...(vnd ?? []).slice(0, 2).map((v) => ({
              label: String(v.name ?? v.id), sub: String(v.cat ?? ""), to: "/procurement", kind: "Vendor",
            })),
          ]);
        } catch {
          if (!cancelled) setRemoteHits(null);
        }
      })();
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [rawQuery, remoteSearchable]);

  // Fallback lokal: proyek, kapal, invoice, PO, penawaran, karyawan
  const localHits: Hit[] = useMemo(() => {
    if (!query) return [];
    return [
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
    ];
  }, [query, data.projects, data.vessels, data.invoices, data.purchaseOrders, data.quotations, data.employees]);

  const hits: Hit[] = remoteSearchable && remoteHits !== null ? remoteHits : localHits;

  const sidebar = (
    <div className="flex h-full flex-col bg-navy-900 text-white">
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-white/10">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-ocean-500 text-white">
          <Anchor className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-bold leading-tight">ISMS Galangan</p>
          <p className="text-[10px] text-steel-300">PT Syukur Bersaudara</p>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {navGroups.map((group) => (
          <div key={group.label} className="mb-4">
            <p className="px-2 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-steel-300">
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                // Tanpa badge sidebar (per 2026-09-26): notif hanya banner
                // + highlight per halaman modul. Link tetap bawa ?alert= agar
                // banner modul langsung terbuka.
                const to = item.alertKey ? `${item.to}?alert=${item.alertKey}` : item.to;
                return (
                <li key={item.to}>
                  <NavLink
                    to={to}
                    end={item.to === "/proyek"}
                    onClick={() => {
                      setOpen(false);
                      window.scrollTo({ top: 0 });
                    }}
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
                  </NavLink>
                </li>
                );
              })}
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
              <span
                title={backendError ?? (backendMode === "remote" ? "Tersambung ke backend" : "Berjalan lokal (VITE_API_URL kosong / belum login)")}
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${backendMode === "remote" && !backendError ? "bg-emerald-100 text-emerald-700" : "bg-steel-100 text-steel-500"}`}
              >
                {backendMode === "remote" && !backendError ? "● Server" : "● Lokal"}
              </span>
              <select
                className="input w-auto border-0 bg-transparent py-1 text-sm font-medium text-navy-800 shadow-none"
                value={branch}
                aria-label="Pilih cabang"
                onChange={(e) => setBranch(e.target.value)}
              >
                <option value="SEMUA">{t.nav.allBranches}</option>
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
                placeholder={t.nav.searchPh}
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
                    <p className="px-4 py-3 text-sm text-steel-400">{t.nav.noResultsFor} “{q}”.</p>
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
                {unreadCount > 0 && (
                  <span className="absolute right-0.5 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] font-bold text-white">
                    {Math.min(unreadCount, 99)}
                  </span>
                )}
              </button>
              {notifOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => { setNotifOpen(false); setBellExpanded(false); setBellMin(false); }} />
                  <div className="absolute right-0 z-20 mt-2 max-h-96 w-80 overflow-y-auto rounded-xl border border-steel-200 bg-white shadow-lift">
                    <div className="flex items-center justify-between border-b border-steel-100 px-4 py-2.5">
                      <p className="text-sm font-semibold text-navy-900">
                        {t.notif.title}{unreadCount > 0 ? ` (${unreadCount} ${t.notif.unread})` : ""}
                      </p>
                      <button
                        className="rounded-lg px-2 py-1 text-[11px] font-semibold text-steel-500 hover:bg-steel-100"
                        onClick={() => setBellMin((v) => !v)}
                        aria-label={bellMin ? t.notif.expand : t.notif.minimize}
                      >
                        {bellMin ? t.notif.expand : t.notif.minimize}
                      </button>
                    </div>
                    {!bellMin && (
                      <>
                    {alerts.length > 0 && (
                      <>
                        <p className="border-b border-steel-100 px-4 py-2 text-xs font-bold uppercase tracking-wide text-steel-400">
                          {t.notif.attention} ({alerts.length})
                        </p>
                        {(bellExpanded ? alerts : alerts.slice(0, 5)).map((al) => (
                          <Link
                            key={al.id}
                            to={al.to}
                            onClick={() => { markNotifRead(`alert-${al.id}`); setNotifOpen(false); setBellExpanded(false); }}
                            className={`flex items-center gap-2 border-b border-steel-50 px-4 py-2.5 text-xs font-medium last:border-0 hover:bg-surface ${
                              al.tone === "red" ? "text-rose-700" : al.tone === "amber" ? "text-amber-700" : "text-ocean-600"
                            }`}
                          >
                            <span className={`h-2 w-2 shrink-0 rounded-full ${!loadNotifRead().has(`alert-${al.id}`) ? (al.tone === "red" ? "bg-rose-500" : al.tone === "amber" ? "bg-amber-500" : "bg-ocean-500") : "bg-steel-200"}`} />
                            {al.text}
                          </Link>
                        ))}
                        {alerts.length > 5 && (
                          <button
                            className="block w-full px-4 py-2 text-center text-[11px] font-semibold text-ocean-600 hover:bg-surface"
                            onClick={() => setBellExpanded((v) => !v)}
                          >
                            {bellExpanded ? t.notif.showLess : `${t.notif.showAll} ${alerts.length} ↓`}
                          </button>
                        )}
                      </>
                    )}
                    <p className="border-b border-steel-100 px-4 py-2 text-xs font-bold uppercase tracking-wide text-steel-400">
                      {t.notif.activities}
                    </p>
                    {data.activities.slice(0, 5).map((a) => (
                      <Link
                        key={a.id}
                        to="/notifikasi"
                        onClick={() => { markNotifRead(`act-${String(a.id)}`); setNotifOpen(false); setBellExpanded(false); }}
                        className="block border-b border-steel-50 px-4 py-2.5 last:border-0 hover:bg-surface"
                      >
                        <p className="text-xs text-steel-700">
                          <span className="font-semibold text-navy-900">{a.actor}</span> {a.action}{" "}
                          <span className="font-medium">{a.target}</span>
                        </p>
                        <p className="mt-0.5 text-[10px] text-steel-400">{a.module} · {a.time}</p>
                      </Link>
                    ))}
                      </>
                    )}
                    <Link
                      to="/notifikasi"
                      onClick={() => { setNotifOpen(false); setBellExpanded(false); setBellMin(false); }}
                      className="block px-4 py-2.5 text-center text-xs font-semibold text-ocean-600 hover:bg-surface"
                    >
                      {t.notif.seeAll}
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
                        <User className="h-4 w-4 text-steel-400" /> {t.nav.profile}
                      </button>
                      <button
                        onClick={() => { setUserOpen(false); navigate("/audit"); }}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-steel-700 hover:bg-steel-100"
                      >
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" /> {t.nav.myActivity}
                      </button>
                      <button
                        onClick={() => { setUserOpen(false); navigate("/dokumen"); }}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-steel-700 hover:bg-steel-100"
                      >
                        <FileText className="h-4 w-4 text-steel-400" /> {t.nav.myDocs}
                      </button>
                      <div className="my-1.5 border-t border-steel-100" />
                      <div className="flex items-center justify-between px-3 py-2">
                        <span className="text-xs font-semibold text-steel-500">ID | EN</span>
                        <div className="flex gap-1">
                          {(["id", "en"] as const).map((l) => (
                            <button
                              key={l}
                              onClick={() => setLocale(l)}
                              className={`rounded-lg px-2 py-1 text-xs font-bold uppercase ${locale === l ? "bg-navy-700 text-white" : "text-steel-500 hover:bg-steel-100"}`}
                            >
                              {l}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="my-1.5 border-t border-steel-100" />
                      <button
                        onClick={doLogout}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-rose-600 hover:bg-rose-50"
                      >
                        <LogOut className="h-4 w-4" /> {t.nav.logout}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {pendingSync.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800 lg:px-6">
            <span>
              {pendingSync.length} {t.session.pendingSync} ({pendingSync.join(", ")})
            </span>
            <button
              className="btn-secondary px-2 py-1 text-xs"
              onClick={() => void pushPending()}
            >
              {t.session.syncNow}
            </button>
          </div>
        )}

        <main className="p-4 lg:p-6">
          <Outlet />
        </main>
      </div>

      {/* Modal profil */}
      <Modal open={profileOpen} onClose={() => setProfileOpen(false)} title={t.nav.profile} subtitle={t.session.demoSession}>
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
        <Field label="Ganti password">
          <div className="grid gap-2">
            <input
              type="password"
              className="input"
              placeholder="Password lama"
              aria-label="Password lama"
              value={oldPw}
              onChange={(e) => setOldPw(e.target.value)}
            />
            <input
              type="password"
              className="input"
              placeholder="Password baru (min. 6 karakter)"
              aria-label="Password baru"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
            />
            <button onClick={() => void doChangePassword()} className="btn-secondary w-full justify-center">
              <KeyRound className="h-4 w-4" /> Simpan password baru
            </button>
          </div>
        </Field>
      </Modal>

      <Toaster />
    </div>
  );
}
