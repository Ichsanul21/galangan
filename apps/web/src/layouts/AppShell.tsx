import { useState, useMemo, useEffect, useRef, type ComponentType } from "react";
import { NavLink, Outlet, Link, useNavigate, useLocation } from "react-router-dom";
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
  FolderOpen,
  FolderKanban,
  ClipboardCheck,
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
  KeyRound,
  Settings as SettingsIcon,
  ChevronDown,
  PanelLeft,
} from "lucide-react";
import { useAuth } from "../auth/auth";
import { useStore } from "../data/store";
import { Badge, Modal, Field, Toaster, toast } from "../components/ui";
import { apiFetch } from "../services/http";
import { computeAlerts } from "../utils/alerts";
import { loadNotifRead, saveNotifRead, loadModSeen } from "../utils/notifRead";
import { buildModuleAlertItems, type ModuleAlertKey } from "../utils/moduleAlerts";
import { useT } from "../i18n/LanguageContext";
import { n_misc } from "../i18n/n_misc";
import { remoteRepository } from "../services/repositories";
import { getJwt, isBackendConfigured } from "../services/http";

export default function AppShell() {
  const { user, logout } = useAuth();
  const { t, locale, setLocale } = useT();
  const { data, reset, branch, setBranch, backendMode, backendError, pendingSync, pushPending, resync } = useStore();
  const S = n_misc[locale];
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
  // Deps user?.id: mulai ulang setelah login dalam sesi SPA yang sama
  // (sebelumnya deps [] sehingga login tanpa remount tak pernah beat).
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.username]);
  const [open, setOpen] = useState(false);
  // Sidebar minimize (desktop): rail ikon animasi, preferensi persist.
  const [minSide, setMinSide] = useState(() => {
    try {
      return localStorage.getItem("isms.minSide") === "1";
    } catch {
      return false;
    }
  });
  const toggleMinSide = () => {
    setMinSide((v) => {
      try {
        localStorage.setItem("isms.minSide", v ? "0" : "1");
      } catch {
        /* abaikan */
      }
      return !v;
    });
  };
  // Accordion grup nav: default open semua, pilihan persist.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem("isms.navGroups");
      if (raw) return JSON.parse(raw) as Record<string, boolean>;
    } catch {
      /* abaikan */
    }
    return {};
  });
  const isGroupOpen = (label: string): boolean => openGroups[label] !== false;
  const toggleGroup = (label: string) => {
    setOpenGroups((prev) => {
      const next = { ...prev, [label]: !isGroupOpen(label) };
      try {
        localStorage.setItem("isms.navGroups", JSON.stringify(next));
      } catch {
        /* abaikan */
      }
      return next;
    });
  };
  const [userOpen, setUserOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [bellExpanded, setBellExpanded] = useState(false);
  const [bellMin, setBellMin] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [q, setQ] = useState("");

  const alerts = useMemo(() => computeAlerts(data), [data]);

  /* Badge bell = item belum dibaca beneran (alert + 30 aktivitas terakhir - yang sudah dibaca). */
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

  /* Badge sidebar "tampil sekali": jumlah item kondisi yang belum seen.
     Modul dibuka (jalur mana pun) → hook useModuleAlert mencatat seen +
     event isms:modseen → hitung ulang. Tanpa cap 500 (bug lama).
     Banner + highlight di halaman tetap ikut kondisi. */
  const [seenTick, setSeenTick] = useState(0);
  useEffect(() => {
    const onSeen = () => setSeenTick((v) => v + 1);
    window.addEventListener("isms:modseen", onSeen);
    return () => window.removeEventListener("isms:modseen", onSeen);
  }, []);
  const unreadModuleCount = useMemo(() => {
    void seenTick;
    const seen = loadModSeen();
    const all = buildModuleAlertItems(data);
    const out = {} as Record<ModuleAlertKey, number>;
    (Object.keys(all) as ModuleAlertKey[]).forEach((k) => {
      const s = new Set(seen[k] ?? []);
      out[k] = all[k].filter((a) => !s.has(a.id)).length;
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, seenTick]);

  /* Urutan grup ikut alur bisnis galangan: Utama → Komersial (CRM melahirkan
     Proyek) → Operasional → SDM → Aset (master) → Analisis → Sistem. */
  const navGroups: { label: string; items: { to: string; label: string; icon: ComponentType<{ className?: string }>; alertKey?: ModuleAlertKey; child?: boolean }[] }[] = [
    {
      label: t.nav.utama,
      items: [
        { to: "/dashboard", label: t.nav.dashboard, icon: LayoutDashboard },
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
      label: t.nav.operasional,
      items: [
        { to: "/proyek", label: t.nav.proyek, icon: FolderKanban, alertKey: "proyek" },
        { to: "/proyek/monitoring", label: t.nav.monitoring, icon: Activity },
        { to: "/drydock", label: t.nav.drydock, icon: ShipWheel, alertKey: "drydock" },
        { to: "/inventori", label: t.nav.inventori, icon: Boxes, alertKey: "inventori" },
        { to: "/equipment", label: t.nav.equipment, icon: Cpu, alertKey: "equipment" },
        { to: "/subkontraktor", label: t.nav.subkontraktor, icon: HardHat, alertKey: "subkontraktor" },
        { to: "/qc-safety", label: t.nav.qc, icon: ClipboardCheck, alertKey: "qc" },
      ],
    },
    {
      label: t.nav.grupSdm,
      items: [
        { to: "/sdm", label: t.nav.sdm, icon: Users, alertKey: "sdm" },
        { to: "/absensi", label: t.nav.absensi, icon: CalendarCheck },
        { to: "/payroll", label: t.nav.payroll, icon: Banknote, alertKey: "payroll" },
      ],
    },
    {
      label: t.nav.aset,
      items: [
        { to: "/kapal", label: t.nav.kapal, icon: Ship, alertKey: "kapal" },
        { to: "/dokumen", label: t.nav.dokumen, icon: FolderOpen, alertKey: "dokumen" },
      ],
    },
    {
      label: t.nav.analisis,
      items: [
        { to: "/analytics", label: t.nav.analytics, icon: BarChart3 },
        { to: "/laporan", label: t.nav.laporan, icon: FileText },
      ],
    },
    {
      label: t.nav.sistem,
      items: [
        { to: "/notifikasi", label: t.nav.notifikasi, icon: Bell },
        { to: "/pengaturan", label: t.nav.pengaturan, icon: SettingsIcon },
        { to: "/pengaturan/peran", label: t.nav.peran, icon: KeyRound, child: true },
        { to: "/audit", label: t.nav.audit, icon: ShieldCheck },
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
      toast(S.tLocalPasswordInfo, "info");
      return;
    }
    if (newPw.length < 6) {
      toast(S.tNewPasswordMin, "info");
      return;
    }
    try {
      await apiFetch("/api/users/me/password", {
        method: "POST",
        body: JSON.stringify({ oldPassword: oldPw, newPassword: newPw }),
      });
      setOldPw("");
      setNewPw("");
      toast(S.tPasswordChanged);
    } catch (e) {
      toast(e instanceof Error ? e.message : S.tPasswordFailed, "info");
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

  /* Refetch per modul: tiap pindah route, tarik ulang dari backend bila online
     dan resync terakhir >60 dtk. Dilewati saat mengetik di pencarian global,
     saat modal/dropdown terbuka, atau tab tersembunyi - resync menimpa draft
     tabel. Throttle via ref timestamp. */
  const location = useLocation();
  const lastResyncRef = useRef(0);
  const lastPathRef = useRef("");
  const qRef = useRef(q);
  qRef.current = q;
  const modalOpenRef = useRef(false);
  modalOpenRef.current = profileOpen || notifOpen || userOpen;
  useEffect(() => {
    if (document.hidden) return;
    if (backendMode !== "remote") return;
    if (qRef.current.trim() !== "") return;
    if (modalOpenRef.current) return;
    /* Pindah modul/halaman = WAJIB data baru. Throttle 60 dtk hanya untuk
       render ulang pada path yang sama (bukan perpindahan modul). */
    const pathChanged = location.pathname !== lastPathRef.current;
    const now = Date.now();
    if (!pathChanged && now - lastResyncRef.current < 60000) return;
    lastPathRef.current = location.pathname;
    lastResyncRef.current = now;
    void resync();
  }, [location.pathname, backendMode, resync]);

  const renderSidebar = (mini: boolean) => (
    <div className="flex h-full flex-col bg-navy-900 text-white">
      <div className={`flex items-center gap-2.5 border-b border-white/10 px-5 py-4 ${mini ? "justify-center px-3" : ""}`}>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ocean-500 text-white">
          <Anchor className="h-5 w-5" />
        </div>
        {!mini && (
          <div className="min-w-0">
            <p className="truncate text-sm font-bold leading-tight">ISMS Galangan</p>
            <p className="truncate text-[10px] text-steel-300">PT Syukur Bersaudara</p>
          </div>
        )}
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {navGroups.map((group) => {
          const gOpen = mini ? true : isGroupOpen(group.label);
          return (
          <div key={group.label} className="mb-3">
            {!mini ? (
              <button
                className="mb-1 flex w-full items-center gap-1 rounded-md px-2 py-1 text-left text-[10px] font-semibold uppercase tracking-wider text-steel-300 hover:text-white"
                onClick={() => toggleGroup(group.label)}
                aria-expanded={gOpen}
              >
                <span className="truncate">{group.label}</span>
                <ChevronDown className={`ml-auto h-3.5 w-3.5 shrink-0 transition-transform duration-300 ${gOpen ? "" : "-rotate-90"}`} />
              </button>
            ) : (
              <div className="mb-1 border-b border-white/10" aria-hidden />
            )}
            <div className={`grid transition-all duration-300 ease-in-out ${gOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
              <ul className="space-y-0.5 overflow-hidden">
              {group.items.map((item) => {
                // Badge sidebar tampil-sekali; link tetap bawa ?alert= agar
                // banner modul langsung terbuka.
                const badge = item.alertKey ? (unreadModuleCount[item.alertKey] ?? 0) : 0;
                const to = item.alertKey ? `${item.to}?alert=${item.alertKey}` : item.to;
                return (
                <li key={item.to}>
                  <NavLink
                    to={to}
                    end={item.to === "/proyek" || item.to === "/pengaturan"}
                    title={mini ? item.label : undefined}
                    onClick={() => {
                      setOpen(false);
                      window.scrollTo({ top: 0 });
                    }}
                    className={({ isActive }) =>
                      `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${mini ? "justify-center" : ""} ${
                        item.child && !mini ? "ml-4 border-l-2 border-white/15 pl-3" : ""
                      }${
                        isActive
                          ? "bg-ocean-500/20 text-white font-semibold"
                          : "text-steel-300 hover:bg-white/5 hover:text-white"
                      }`
                    }
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {!mini && <span className="truncate" title={item.label}>{item.label}</span>}
                    {!mini && badge > 0 ? (
                      <span
                        className="ml-auto rounded-full bg-rose-500/90 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white"
                        title={S.shNewNotif.replace("{n}", String(badge))}
                      >
                        {badge > 99 ? "99+" : badge}
                      </span>
                    ) : null}
                  </NavLink>
                </li>
                );
              })}
              </ul>
            </div>
          </div>
          );
        })}
      </nav>
      <div className="border-t border-white/10 p-3">
        <div className={`flex items-center gap-2.5 rounded-lg bg-white/5 px-3 py-2 ${mini ? "justify-center" : ""}`}>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-hero text-xs font-bold text-white">
            {user?.initials ?? "?"}
          </div>
          {!mini && (
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold">{user?.name ?? "-"}</p>
              <p className="truncate text-[10px] text-steel-300">{user?.role ?? "-"}</p>
            </div>
          )}
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
          <div className="absolute inset-y-0 left-0 w-72 shadow-xl">{renderSidebar(false)}</div>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-30 hidden transition-all duration-300 lg:block ${minSide ? "w-20" : "w-64"}`}>{renderSidebar(minSide)}</aside>

      <div className={`transition-all duration-300 ${minSide ? "lg:pl-20" : "lg:pl-64"}`}>

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
            <button
              className="hidden rounded-lg p-1.5 text-steel-500 hover:bg-steel-100 lg:block"
              onClick={toggleMinSide}
              aria-label={minSide ? S.shExpandSide : S.shMinSide}
              title={minSide ? S.shExpandSide : S.shMinSide}
            >
              <PanelLeft className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2 text-sm text-steel-500">
              <span className="font-medium text-navy-800">{S.shGalangan}</span>
              <span>/</span>
              <span
                title={backendError ?? (backendMode === "remote" ? S.shConnectedServer : S.shRunningLocal)}
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${backendMode === "remote" && !backendError ? "bg-emerald-100 text-emerald-700" : "bg-steel-100 text-steel-500"}`}
              >
                {backendMode === "remote" && !backendError ? S.shServerBadge : S.shLocalBadge}
              </span>
              <select
                className="input w-auto border-0 bg-transparent py-1 text-sm font-medium text-navy-800 shadow-none"
                value={branch}
                aria-label={S.shPickBranchAria}
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
                aria-label={S.shNotifAria}
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
          {S.shSessionDesc}
        </div>
        <Field label={S.shResetDemoLabel}>
          <button onClick={doReset} className="btn-secondary w-full justify-center">
            <RotateCcw className="h-4 w-4" /> {S.shRestoreInitial}
          </button>
        </Field>
        <Field label={S.shChangePasswordLabel}>
          <div className="grid gap-2">
            <input
              type="password"
              className="input"
              placeholder={S.shOldPasswordPh}
              aria-label={S.shOldPasswordPh}
              value={oldPw}
              onChange={(e) => setOldPw(e.target.value)}
            />
            <input
              type="password"
              className="input"
              placeholder={S.shNewPasswordPh}
              aria-label={S.shNewPasswordPh}
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
            />
            <button onClick={() => void doChangePassword()} className="btn-secondary w-full justify-center">
              <KeyRound className="h-4 w-4" /> {S.shSaveNewPassword}
            </button>
          </div>
        </Field>
      </Modal>

      <Toaster />
    </div>
  );
}
