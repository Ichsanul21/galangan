import type { ReactNode, InputHTMLAttributes, ButtonHTMLAttributes, KeyboardEvent as ReactKeyboardEvent } from "react";
import { useCallback, useEffect, useId, useMemo, useRef, useState, Component, type ErrorInfo } from "react";
import { useT } from "../i18n/LanguageContext";
import { statusLabel } from "../i18n/status";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowDownRight,
  ArrowUpRight,
  Minus,
  ChevronRight,
  X,
  CheckCircle2,
  Info,
  Loader2,
  Search,
  Upload as UploadIcon,
} from "lucide-react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from "recharts";

/* ============ M O T I O N   H E L P E R S ============ */

export function Stagger({
  children,
  className = "",
  id,
  animate: withMotion = true,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
  /* false = div biasa tanpa framer-motion. Dipakai saat elemen ini jadi
     target export PDF: motion.div menyimpan inline transform/opacity
     hasil animasi, dan html2canvas memotret apa adanya - transform sisa
     membuat konten bergeser atau transparan di dalam PDF. */
  animate?: boolean;
}) {
  if (!withMotion) return <div id={id} className={className}>{children}</div>;
  return (
    <motion.div
      id={id}
      className={className}
      initial="hidden"
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.07 } } }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      variants={{
        hidden: { opacity: 0, y: 18 },
        show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: "easeOut" } },
      }}
    >
      {children}
    </motion.div>
  );
}

/* ============ C A R D / L A Y O U T ============ */

export function Card({
  children,
  className = "",
  id,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return <div id={id} className={`card ${className}`}>{children}</div>;
}

export function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between px-5 pt-5 pb-4">
      <div>
        <h3 className="text-[15px] font-semibold text-navy-900 tracking-tight">{title}</h3>
        {subtitle && <p className="text-xs text-steel-500 mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function GlowCard({
  children,
  gradient = "gradient-hero",
  className = "",
}: {
  children: ReactNode;
  gradient?: string;
  className?: string;
}) {
  return (
    <div className={`relative overflow-hidden rounded-2xl ${gradient} text-white shadow-soft ${className}`}>
      <div className="absolute inset-0 shimmer-line" />
      <div className="relative p-5">{children}</div>
    </div>
  );
}

/* ============ B A D G E / P I L L ============ */

const toneMap: Record<string, string> = {
  green: "bg-emerald-50 text-emerald-700 border-emerald-200",
  amber: "bg-amber-50 text-amber-700 border-amber-200",
  red: "bg-rose-50 text-rose-600 border-rose-200",
  blue: "bg-blue-50 text-blue-700 border-blue-200",
  gray: "bg-steel-100 text-steel-600 border-steel-200",
  navy: "bg-navy-50 text-navy-700 border-navy-200",
  violet: "bg-violet-50 text-violet-700 border-violet-200",
  cyan: "bg-cyan-50 text-cyan-700 border-cyan-200",
  teal: "bg-teal-50 text-teal-500 border-teal-100",
};

export function Badge({
  children,
  tone = "gray",
  className = "",
  title,
}: {
  children: ReactNode;
  tone?: keyof typeof toneMap;
  className?: string;
  /** Tooltip native. Dipakai badge status yang butuh penjelasan (mis. why this item is low). */
  title?: string;
}) {
  /* Fallback ke abu-abu untuk nada yang tidak dikenal.
     Nilai nada sering datang dari data (`a.tone as never` untuk aktivitas, atau
     kolom enum di store) sehingga tipe bisa lolos ke compile tapi tidak ada
     di toneMap. Tanpa fallback, toneMap[tone] bernilai undefined dan
     className jadi "bg-... undefined" - kelas rusak yang tetap lolos ke DOM
     tanpa error apa pun. */
  const toneClass = toneMap[tone] ?? toneMap.gray;
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${toneClass} ${className}`}
    >
      {children}
    </span>
  );
}

const statusTone: Record<string, keyof typeof toneMap> = {
  Aktif: "teal",
  "Sedang Berjalan": "blue",
  "Dalam Proses": "blue",
  Selesai: "green",
  Disetujui: "green",
  Lunas: "green",
  Berlaku: "green",
  Diterima: "green",
  Terkirim: "green",
  Terkunci: "green",
  Ditutup: "gray",
  Lulus: "green",
  Terbuka: "amber",
  Telat: "red",
  Terlambat: "red",
  Kritis: "red",
  Menipis: "amber",
  Aman: "green",
  Draft: "gray",
  Draf: "gray",
  Diajukan: "amber",
  "Menunggu Approval": "amber",
  "Menunggu Persetujuan": "amber",
  "Belum Dibayar": "amber",
  Ditolak: "red",
  Rejected: "red",
  Pending: "amber",
  Menunggu: "amber",
  Approved: "green",
  Completed: "green",
  "Dalam Pengiriman": "blue",
  Dikirim: "blue",
  "Diterima Sebagian": "cyan",
  Kualifikasi: "violet",
  Blacklist: "red",
  Batal: "gray",
  Kalah: "gray",
  Terkonversi: "teal",
  Menang: "green",
  Negosiasi: "violet",
  Penawaran: "amber",
  Lead: "cyan",
  Maintenance: "amber",
  Terpakai: "blue",
  Tersedia: "green",
  Terjadwal: "gray",
  Dijadwalkan: "gray",
  Sedang: "blue",
  Tertunda: "amber",
  Tertutup: "gray",
  "Dalam Perbaikan": "blue",
  Kedaluwarsa: "red",
  Expired: "red",
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const tone = statusTone[status] ?? "gray";
  return <Badge tone={tone}>{label ?? <StatusText value={status} />}</Badge>;
}

/** Teks status sesuai locale aktif (nilai data tidak diubah). */
function StatusText({ value }: { value: string }) {
  const { locale } = useT();
  return <>{statusLabel(value, locale)}</>;
}

/* ============ K P I   C A R D   ( P R E M I U M ) ============ */

const gradientChip: Record<string, string> = {
  navy: "bg-gradient-hero",
  teal: "bg-gradient-teal",
  rose: "bg-gradient-rose",
  violet: "bg-gradient-violet",
  amber: "bg-gradient-amber",
  ocean: "bg-gradient-hero",
};

const sparkChipColor: Record<string, string> = {
  navy: "#0b3a63",
  teal: "#0d9488",
  rose: "#e11d48",
  violet: "#8b5cf6",
  amber: "#d97706",
  ocean: "#2e9ad4",
};

export function KpiCard({
  label,
  value,
  delta,
  deltaDirection = "up",
  icon,
  hint,
  spark,
  chip = "navy",
}: {
  label: string;
  value: string;
  delta?: string;
  deltaDirection?: "up" | "down" | "flat";
  icon?: ReactNode;
  hint?: string;
  spark?: { name: string; v: number }[];
  chip?: keyof typeof gradientChip;
}) {
  const gid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const color = sparkChipColor[chip] ?? "#2e9ad4";
  const showSpark = !!spark && spark.length > 1;
  return (
    <Card className="card-hover relative overflow-hidden p-4">
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-steel-500 truncate" title={label}>{label}</p>
          <p className="mt-1 text-[26px] font-bold tracking-tight text-navy-900 break-words" title={value}>{value}</p>
          {delta ? (
            <p
              className={`mt-1 flex items-center gap-1 text-xs font-semibold ${
                deltaDirection === "up"
                  ? "text-emerald-600"
                  : deltaDirection === "down"
                  ? "text-rose-600"
                  : "text-steel-500"
              }`}
            >
              {deltaDirection === "up" && <ArrowUpRight className="h-3.5 w-3.5" />}
              {deltaDirection === "down" && <ArrowDownRight className="h-3.5 w-3.5" />}
              {deltaDirection === "flat" && <Minus className="h-3.5 w-3.5" />}
              {delta}
            </p>
          ) : (
            hint && <p className="mt-1 text-[11px] text-steel-400 truncate">{hint}</p>
          )}
        </div>
        {icon && (
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-soft ${gradientChip[chip]}`}>
            {icon}
          </div>
        )}
      </div>
      {showSpark && (
        <div className="mt-2 -mb-1 h-10">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={spark} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={`spark-${gid}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="v" stroke={color} strokeWidth={2} fill={`url(#spark-${gid})`} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

/* ============ M I N I   C H A R T S ============ */

export function Donut({
  data,
  colors = ["#0b3a63", "#2e9ad4", "#8cc9e8", "#d97706", "#1f9d55"],
  size = 140,
  thickness = 18,
  centerLabel,
  centerValue,
}: {
  data: { name: string; value: number }[];
  colors?: string[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string;
}) {
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" innerRadius={size / 2 - thickness} outerRadius={size / 2} paddingAngle={3} strokeWidth={0}>
            {data.map((_, i) => (
              <Cell key={i} fill={colors[i % colors.length]} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      {(centerLabel || centerValue) && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          {centerValue && <span className="text-2xl font-bold text-navy-900">{centerValue}</span>}
          {centerLabel && <span className="text-[11px] text-steel-500">{centerLabel}</span>}
        </div>
      )}
    </div>
  );
}

export function RadialGauge({
  value,
  label,
  max = 100,
  color = "#2e9ad4",
  size = 120,
}: {
  value: number;
  label?: string;
  max?: number;
  color?: string;
  size?: number;
}) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const radius = size / 2 - 8;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (pct / 100) * circ;
  return (
    <div className="flex flex-col items-center" style={{ width: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#e9eff4" strokeWidth={10} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={10}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.8s ease" }}
        />
      </svg>
      <div className="absolute flex flex-col items-center justify-center" style={{ width: size, height: size }}>
        <span className="text-xl font-bold text-navy-900">{value}%</span>
        {label && <span className="text-[10px] text-steel-500">{label}</span>}
      </div>
    </div>
  );
}

export function ChartTooltip({
  active,
  payload,
  label,
  formatter,
  labelFormatter,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number | string; color?: string; payload?: Record<string, unknown> }[];
  label?: string;
  formatter?: (value: number | string, name: string) => string;
  labelFormatter?: (label: string) => string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-xl border border-steel-200 bg-white/95 px-3 py-2 shadow-lift backdrop-blur">
      {label && (
        <p className="mb-1 text-xs font-semibold text-navy-900">
          {labelFormatter ? labelFormatter(label) : label}
        </p>
      )}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 text-xs text-steel-600">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span>{p.name}</span>
          <span className="ml-auto pl-3 font-semibold text-navy-900">
            {formatter ? formatter(p.value as number, p.name ?? "") : p.value}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ============ A V A T A R / P I L L ============ */

export function Avatar({
  name,
  className = "",
}: {
  name: string;
  className?: string;
}) {
  const init = name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const palette = ["bg-navy-700", "bg-ocean-500", "bg-teal-500", "bg-violet-500", "bg-rose-500", "bg-steel-600"];
  const idx = name.length % palette.length;
  return (
    <div className={`flex items-center justify-center rounded-full text-xs font-bold text-white ${palette[idx]} ${className}`}>
      {init}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
  icon,
  gradient = false,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  icon?: ReactNode;
  gradient?: boolean;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        {icon && (
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-hero text-white shadow-soft">
            {icon}
          </div>
        )}
        <div>
          <h1 className={`text-[26px] font-bold tracking-tight ${gradient ? "text-gradient-navy" : "text-navy-900"}`}>
            {title}
          </h1>
          {subtitle && <p className="text-sm text-steel-500 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function ProgressBar({
  value,
  tone = "navy",
  className = "",
  showLabel,
}: {
  value: number;
  tone?: "navy" | "green" | "amber" | "red" | "ocean" | "teal";
  className?: string;
  showLabel?: boolean;
}) {
  const map = {
    navy: "bg-gradient-hero",
    green: "bg-emerald-500",
    amber: "bg-amber-500",
    red: "bg-rose-500",
    ocean: "bg-ocean-500",
    teal: "bg-gradient-teal",
  };
  return (
    <div className={`w-full ${className}`}>
      <div className="h-2 w-full rounded-full bg-steel-100">
        <div
          className={`h-2 rounded-full ${map[tone]}`}
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
      {showLabel && (
        <p className="mt-1 text-right text-[11px] font-medium text-steel-500">{Math.round(value)}%</p>
      )}
    </div>
  );
}

export function Tabs({
  tabs,
  active,
  onChange,
  labels,
}: {
  tabs: string[];
  active: string;
  onChange: (t: string) => void;
  /** Label tampil per tab id - id logika tidak berubah (aman untuk state). */
  labels?: Record<string, string>;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-tab="${active}"]`);
    el?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }, [active]);
  return (
    <div ref={listRef} className="flex gap-1 border-b border-steel-200 overflow-x-auto" role="tablist" aria-label="Navigasi tab">
      {tabs.map((t) => (
        <button
          key={t}
          data-tab={t}
          role="tab"
          aria-selected={active === t}
          onClick={() => onChange(t)}
          className={`relative whitespace-nowrap px-3 py-3 text-sm font-medium transition-colors ${
            active === t ? "text-navy-800" : "text-steel-500 hover:text-navy-700"
          }`}
        >
          {labels?.[t] ?? t}
          {active === t && (
            <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-gradient-hero" />
          )}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  subtitle,
}: {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {icon && <div className="mb-3 text-steel-300">{icon}</div>}
      <h3 className="text-sm font-semibold text-steel-600">{title}</h3>
      {subtitle && <p className="mt-1 text-sm text-steel-400">{subtitle}</p>}
    </div>
  );
}

/* ============ E R R O R   B O U N D A R Y   &   S K E L E T O N ============ */

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<
  {
    children: ReactNode;
    title?: string;
    backLabel?: string;
    onBack?: () => void;
    /** Nilai yang, kalau berubah, ME-RESET error yang tersimpan. */
    resetKey?: string;
  },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ISMS ErrorBoundary:", error, info);
  }

  /**
   * Reset error saat `resetKey` berubah.
   *
   * BUG YANG DIPERBAIKI: tanpa ini, satu galat mengunci SELURUH pola rute
   * berikutnya. React Router memakai instance React yang SAMA untuk
   * /proyek/A dan /proyek/B (elemen `<Route path="/proyek/:id">` cuma berubah
   * param), jadi boundary-nya tidak pernah di-unmount dan `state.error`
   * tetap tidak null. Hasilnya proyek kedua yang benar-benar sehat ikut
   * menampilkan layar galat - persis gejala "satu modul rusak, modul lain
   * ikut crash". Tombol "Coba lagi" ada, tapi pengguna seharusnya perlu
   * menemukannya.
   *
   * `componentDidUpdate` (bukan render) dipakai supaya tidak memanggil
   * setState saat render.
   */
  componentDidUpdate(prev: { resetKey?: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error !== null) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-steel-200 bg-white p-10 text-center">
          <p className="text-sm font-semibold text-navy-900">{this.props.title ?? "Bagian ini gagal dimuat"}</p>
          <p className="mt-1 max-w-md text-xs text-steel-500">
            Terjadi galat saat merender bagian ini. Data modul lain tidak
            terpengaruh - coba lagi atau pindah modul.
          </p>
          {this.state.error.message && (
            <p className="mt-2 max-w-md break-words font-mono text-[11px] text-steel-400">
              {this.state.error.message}
            </p>
          )}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            {/* Coba lagi dulu tanpa memuat ulang seluruh aplikasi. Dulu satu-satunya
                jalan keluar adalah window.location.reload() yang membuang seluruh
                state in-memory: filter tab, posisi scroll, dan antrean sync. */}
            {this.props.onBack && (
              <button className="btn-primary text-xs" onClick={this.props.onBack}>
                {this.props.backLabel ?? "Kembali"}
              </button>
            )}
            <button
              className="btn-secondary text-xs"
              onClick={() => this.setState({ error: null })}
            >
              Coba lagi
            </button>
            <button className="btn-secondary text-xs" onClick={() => window.location.reload()}>
              Muat ulang halaman
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-steel-100 ${className}`} aria-hidden="true" />;
}

export { Tooltip };

/* ============ M O D A L / P O P U P ============ */

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const prevActive = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onCloseRef.current(); return; }
      if (e.key !== "Tab") return;
      const root = dialogRef.current;
      if (!root) return;
      const focusables = Array.from(
        root.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
      ).filter((el) => !el.hasAttribute("disabled") && el.offsetParent !== null);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    const t = window.setTimeout(() => {
      const root = dialogRef.current;
      if (!root) return;
      if (root.contains(document.activeElement) && document.activeElement !== root) return;
      const target =
        root.querySelector<HTMLElement>("input, select, textarea") ??
        root.querySelector<HTMLElement>("button");
      (target ?? root)?.focus();
    }, 30);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(t);
      document.body.style.overflow = "";
      prevActive?.focus?.();
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6">
          <motion.div
            className="absolute inset-0 bg-navy-900/50 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            tabIndex={-1}
            className={`relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-lift sm:rounded-2xl ${
              wide ? "sm:max-w-3xl" : "sm:max-w-lg"
            }`}
            initial={{ opacity: 0, y: 32, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.98 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
          >
            <div className="flex items-start justify-between gap-3 border-b border-steel-100 px-5 py-4">
              <div>
                <h3 className="text-base font-bold text-navy-900">{title}</h3>
                {subtitle && <p className="mt-0.5 text-xs text-steel-500">{subtitle}</p>}
              </div>
              <button
                onClick={onClose}
                aria-label="Tutup"
                className="rounded-lg p-1.5 text-steel-400 hover:bg-steel-100 hover:text-steel-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="overflow-y-auto px-5 py-4">{children}</div>
            {footer && (
              <div className="flex items-center justify-end gap-2 border-t border-steel-100 bg-surface px-5 py-3">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export function ConfirmModal({
  open,
  title,
  desc,
  confirmLabel = "Ya, lanjutkan",
  danger = false,
  confirmDisabled = false,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  desc: string;
  confirmLabel?: string;
  danger?: boolean;
  confirmDisabled?: boolean;
  onCancel: () => void;
  onConfirm: () => Promise<unknown> | unknown;
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <>
          <button className="btn-secondary" onClick={onCancel}>
            Batal
          </button>
          <AsyncButton
            className={danger ? "btn-danger" : "btn-primary"}
            disabled={confirmDisabled}
            title={confirmDisabled ? "Diblokir - masih dipakai" : undefined}
            onAction={onConfirm}
          >
            {confirmLabel}
          </AsyncButton>
        </>
      }
    >
      <p className="text-sm text-steel-600">{desc}</p>
    </Modal>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-steel-400">{hint}</span>}
    </label>
  );
}

export function FormGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>;
}

/* ============ PENCARIAN DAFTAR ============ */

/**
 * Poin tebakan: seluruh kata harus cocok, di field yang DIMINTAKAN.
 * Sebagian lama memakai `includes` pada satu field gabungan, jadi "INV 001"
 * tidak pernah menemukan "INV-001" dan nomor dokumen tidak bisa dicari sama
 * sekali - search-nya ada tapi tidak berguna.
 */
export function rowMatches<T extends Record<string, unknown>>(
  row: T,
  query: string,
  fields: readonly (keyof T & string)[],
): boolean {
  const q = query.trim().toLowerCase();
  if (q === "") return true;
  return q
    .split(/\s+/)
    .every((term) =>
      fields.some((f) => {
        const v = row[f];
        return v !== null && v !== undefined && String(v).toLowerCase().includes(term);
      }),
    );
}

export function useListSearch(delay = 200) {
  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query, delay);
  return {
    query,
    debounced,
    setQuery,
    clear: useCallback(() => setQuery(""), []),
    active: debounced.trim() !== "",
  };
}

export function SearchBox({
  value,
  onChange,
  placeholder,
  ariaLabel,
  className = "",
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  id?: string;
}) {
  const { t } = useT();
  return (
    <div className={`relative ${className}`}>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-steel-400"
      />
      <input
        id={id}
        type="search"
        className="input w-full pl-9"
        placeholder={placeholder ?? t.common.listSearchPh}
        aria-label={ariaLabel ?? t.common.listSearchAria}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value !== "" && (
        <button
          type="button"
          aria-label={t.common.reset}
          onClick={() => {
            onChange("");
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-steel-400 hover:bg-steel-100 hover:text-navy-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-ocean-400"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

/* ============ PEMILIH ENTITAS (COMBOBOX) ============ */

export interface PickerOption {
  value: string;
  label: string;
  hint?: string;
}

export function EntityPicker({
  value,
  onChange,
  options,
  placeholder,
  ariaLabel,
  emptyText,
  className = "",
  disabled = false,
  allowCustom = false,
  required = false,
  invalid = false,
}: {
  value: string;
  onChange: (v: string) => void;
  options: readonly PickerOption[];
  placeholder?: string;
  ariaLabel?: string;
  emptyText?: string;
  className?: string;
  disabled?: boolean;
  allowCustom?: boolean;
  required?: boolean;
  invalid?: boolean;
}) {
  const { t } = useT();
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === "") return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        o.value.toLowerCase().includes(q) ||
        (o.hint ?? "").toLowerCase().includes(q),
    );
  }, [options, query]);

  const selected = useMemo(() => options.find((o) => o.value === value), [options, value]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const commit = (v: string) => {
    onChange(v);
    setOpen(false);
    setQuery("");
    setActive(0);
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        setActive(0);
        return;
      }
      setActive((i) => (filtered.length === 0 ? 0 : Math.min(i + 1, filtered.length - 1)));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === "Enter") {
      const pick = open ? filtered[active] : undefined;
      if (pick) {
        e.preventDefault();
        commit(pick.value);
        return;
      }
      if (allowCustom && query.trim() !== "") {
        e.preventDefault();
        commit(query.trim());
      }
      return;
    }
    if (e.key === "Escape") {
      if (open) {
        e.stopPropagation();
        setOpen(false);
        setQuery("");
      }
      return;
    }
    if (open) setActive(0);
  };

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <input
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && filtered[active] ? `${listId}-${active}` : undefined}
        aria-label={ariaLabel}
        aria-required={required || undefined}
        aria-invalid={invalid || undefined}
        autoComplete="off"
        disabled={disabled}
        className={`input w-full ${open ? "pr-8" : ""} ${invalid ? "border-rose-300" : ""}`}
        placeholder={placeholder}
        value={open ? query : selected ? selected.label : value}
        onFocus={() => {
          setOpen(true);
          setActive(0);
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          if (!open) setOpen(true);
        }}
        onKeyDown={onKeyDown}
      />
      {value !== "" && !disabled && (
        <button
          type="button"
          aria-label={t.common.reset}
          onClick={() => {
            setQuery("");
            commit("");
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-steel-400 hover:bg-steel-100 hover:text-navy-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-ocean-400"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-steel-200 bg-white py-1 shadow-lift"
        >
          {filtered.length === 0 && (
            <li className="px-3 py-2 text-xs text-steel-400">{emptyText ?? t.common.listSearchEmpty}</li>
          )}
          {filtered.map((o, i) => (
            <li
              key={o.value}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={o.value === value}
              onMouseDown={(e) => {
                e.preventDefault();
                commit(o.value);
              }}
              onMouseEnter={() => setActive(i)}
              className={`cursor-pointer px-3 py-2 text-sm ${
                i === active ? "bg-ocean-50 text-navy-900" : "text-steel-700"
              }`}
            >
              <span className="block truncate">{o.label}</span>
              {o.hint !== undefined && o.hint !== "" && (
                <span className="block truncate text-[11px] text-steel-400">{o.hint}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ============ SORTABLE TABLE ============ */

export type SortDir = "asc" | "desc";
export interface SortState { key: string | null; dir: SortDir }

export function toggleSort(prev: SortState, key: string): SortState {
  if (prev.key === key) return { key, dir: prev.dir === "asc" ? "desc" : "asc" };
  return { key, dir: "asc" };
}

function cmpVal(a: string | number | null | undefined, b: string | number | null | undefined): number {
  const an = typeof a === "number" ? a : Number(a);
  const bn = typeof b === "number" ? b : Number(b);
  const aNum = a !== "" && a !== null && a !== undefined && Number.isFinite(an);
  const bNum = b !== "" && b !== null && b !== undefined && Number.isFinite(bn);
  if (aNum && bNum) return an - bn;
  return String(a ?? "").localeCompare(String(b ?? ""), "id-ID");
}

export function sortRows<T>(rows: T[], sort: SortState, get: (row: T, key: string) => string | number | null | undefined): T[] {
  if (!sort.key) return rows;
  const dir = sort.dir === "asc" ? 1 : -1;
  return [...rows].sort((ra, rb) => cmpVal(get(ra, sort.key as string), get(rb, sort.key as string)) * dir);
}

export function SortTh({
  label,
  sortKey,
  sort,
  onSort,
  title,
  rowSpan,
  colSpan,
}: {
  label: string;
  sortKey: string;
  sort: SortState;
  onSort: (key: string) => void;
  title?: string;
  rowSpan?: number;
  colSpan?: number;
}) {
  const active = sort.key === sortKey;
  return (
    <th className="th" title={title ?? `Urutkan: ${label}`} rowSpan={rowSpan} colSpan={colSpan}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
        className={`inline-flex items-center gap-1 font-semibold hover:text-navy-900 ${active ? "text-navy-900" : ""}`}
      >
        {label}
        <span className={`text-[10px] ${active ? "text-ocean-600" : "text-steel-300"}`} aria-hidden>
          {active ? (sort.dir === "asc" ? "▲" : "▼") : "⇅"}
        </span>
      </button>
    </th>
  );
}

/* ============ ACCORDION ============ */

export function Accordion({
  title,
  subtitle,
  count,
  defaultOpen = false,
  children,
}: {
  title: string;
  subtitle?: string;
  count?: number;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="overflow-hidden rounded-xl border border-steel-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface"
      >
        <ChevronRight className={`h-4 w-4 shrink-0 text-steel-400 transition-transform ${open ? "rotate-90" : ""}`} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-navy-900">
            {title}
            {typeof count === "number" && <span className="ml-2 rounded-full bg-surface border border-steel-200 px-1.5 py-0.5 text-[11px] font-bold text-steel-600">{count}</span>}
          </span>
          {subtitle && <span className="block truncate text-xs text-steel-400">{subtitle}</span>}
        </span>
        <span className="shrink-0 text-xs font-medium text-ocean-600">{open ? "Tutup" : "Buka"}</span>
      </button>
      {open && <div className="border-t border-steel-100">{children}</div>}
    </div>
  );
}

/* ============ B U S Y   M A P ============ */

/** Guard proses berat: cegah double-submit + disable tombol saat aksi berjalan.
 *  Pola: `const busy = useBusy();` lalu
 *  `onClick={() => void busy.run("saveBig", saveBig)}` + `disabled={busy.isBusy("saveBig")}`. */
export function useBusy(): {
  isBusy: (k: string) => boolean;
  run: <T>(key: string, fn: () => Promise<T> | T) => Promise<T | void>;
} {
  const [busyMap, setBusyMap] = useState<Record<string, boolean>>({});
  /* Guard ref sinkron: dua klik cepat pada tick yang sama membaca state lama
     (false) sehingga guard state saja tetap meloloskan double-submit. */
  const busyRef = useRef<Set<string>>(new Set());
  const run = async <T,>(key: string, fn: () => Promise<T> | T): Promise<T | void> => {
    if (busyRef.current.has(key)) return;
    busyRef.current.add(key);
    setBusyMap((m) => ({ ...m, [key]: true }));
    try {
      return await fn();
    } finally {
      busyRef.current.delete(key);
      setBusyMap((m) => ({ ...m, [key]: false }));
    }
  };
  return { isBusy: (k: string) => !!busyMap[k], run };
}

/* ============ A S Y N C   A C T I O N ============ */

/** Guard satu aksi async: status pending otomatis (loading/disabled) dan
 *  spam click diabaikan. Untuk banyak aksi ber-key dalam satu halaman tetap
 *  pakai useBusy; untuk satu tombol/aksi pakai ini (atau AsyncButton). */
export function useAsyncAction(): {
  pending: boolean;
  run: <T>(fn: () => Promise<T> | T) => Promise<T | undefined>;
} {
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const run = useCallback(async <T,>(fn: () => Promise<T> | T): Promise<T | undefined> => {
    if (pendingRef.current) return undefined;
    pendingRef.current = true;
    setPending(true);
    try {
      return await fn();
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }, []);
  return { pending, run };
}

/** Tombol yang otomatis disabled + spinner selama aksi async berjalan.
 *  Pakai: `<AsyncButton className="btn-primary" onAction={save}>Simpan</AsyncButton>` */
export function AsyncButton({
  onAction,
  className = "btn-secondary",
  disabled = false,
  onError,
  children,
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "disabled"> & {
  onAction: () => Promise<unknown> | unknown;
  disabled?: boolean;
  /** Handler error opsional. Tanpa ini, penolakan onAction akan muncul
   *  sebagai unhandled rejection karena pemanggil memakai `void run(...)`. */
  onError?: (err: unknown) => void;
}) {
  const { pending, run } = useAsyncAction();
  const { locale } = useT();
  return (
    <button
      type="button"
      className={className}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      onClick={() => {
        void run(onAction).catch((err: unknown) => {
          if (onError) {
            onError(err);
            return;
          }
          /* Default: laporkan ke pengguna. Menelan error di sini berarti
             tombol terlihat berhasil padahal aksinya gagal. */
          const msg =
            err instanceof Error && err.message
              ? err.message
              : locale === "en"
                ? "Action failed"
                : "Aksi gagal";
          toast(msg, "info");
          if (!(err instanceof Error)) console.error("[async-button]", err);
        });
      }}
      {...rest}
    >
      {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

/* ============ P A G E R ============ */

export function usePager(total: number, defaultSize = 100): {
  page: number;
  size: number;
  pages: number;
  slice: <T>(rows: T[]) => T[];
  reset: () => void;
  go: (p: number) => void;
  bar: ReactNode;
} {
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(defaultSize);
  const pages = Math.max(1, Math.ceil(total / size));
  const safe = Math.min(page, pages);
  const slice = <T,>(rows: T[]): T[] => rows.slice((safe - 1) * size, safe * size);
  const reset = () => setPage(1);
  const go = (p: number) => setPage(Math.min(Math.max(1, p), pages));
  const bar = (
    <div className="flex flex-wrap items-center gap-2 py-2 text-xs text-steel-500">
      <span>
        {total === 0 ? "0 dari 0" : `${(safe - 1) * size + 1}-${Math.min(safe * size, total)} dari ${total}`}
      </span>
      <span className="ml-auto flex items-center gap-1">
        <button className="btn-secondary px-2 py-1" disabled={safe <= 1} onClick={() => go(1)}>«</button>
        <button className="btn-secondary px-2 py-1" disabled={safe <= 1} onClick={() => go(safe - 1)}>‹</button>
        <span className="px-1 font-semibold text-navy-900">{safe} / {pages}</span>
        <button className="btn-secondary px-2 py-1" disabled={safe >= pages} onClick={() => go(safe + 1)}>›</button>
        <button className="btn-secondary px-2 py-1" disabled={safe >= pages} onClick={() => go(pages)}>»</button>
        <select
          className="input ml-1 !w-auto px-1.5 py-1 text-xs"
          value={size}
          aria-label="Baris per halaman"
          onChange={(e) => { setSize(Number(e.target.value)); setPage(1); }}
        >
          {[10, 25, 50, 100, 200].map((n) => (
            <option key={n} value={n}>{n}/hal</option>
          ))}
        </select>
      </span>
    </div>
  );
  return { page: safe, size, pages, slice, reset, go, bar };
}

/* ============ S E R V E R   P A G E R ============ */

/** Satu halaman data dari backend (lihat repositories.listPaged). */
export interface ServerPage<T> {
  rows: T[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

/** Pager server-side dengan tampilan bilah yang sama seperti usePager.
 *  `load(page, size)` menutup filter saat ini (boleh closure biasa - hook
 *  memanggilnya lewat ref sehingga identitas closure tak memicu fetch ulang).
 *  `filterKey` (mis. JSON.stringify(filter)) me-reset ke halaman 1 + fetch
 *  ulang; `enabled=false` mematikan fetch (untuk mode ganda lokal/server).
 *  Request basi diabaikan via token monotonik + flag cancel. */
export function useServerPager<T>(
  load: (page: number, size: number) => Promise<ServerPage<T>>,
  filterKey: string,
  defaultSize = 25,
  enabled = true,
): {
  page: number;
  size: number;
  pages: number;
  total: number;
  rows: T[];
  loading: boolean;
  go: (p: number) => void;
  bar: ReactNode;
} {
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(defaultSize);
  const [total, setTotal] = useState(0);
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const reqRef = useRef(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  /* Filter berubah → kembali ke halaman 1 sebelum fetch berikutnya. */
  const [fk, setFk] = useState(filterKey);
  if (enabled && fk !== filterKey) {
    setFk(filterKey);
    if (page !== 1) setPage(1);
  }

  const pages = Math.max(1, Math.ceil(total / size));
  const safe = Math.min(Math.max(1, page), pages);

  useEffect(() => {
    if (!enabled) {
      setRows([]);
      setTotal(0);
      setLoading(false);
      return;
    }
    let cancelled = false;
    const id = ++reqRef.current;
    setLoading(true);
    void loadRef.current(safe, size)
      .then((res) => {
        if (!cancelled && id === reqRef.current) {
          setRows(Array.isArray(res.rows) ? res.rows : []);
          setTotal(typeof res.total === "number" ? res.total : 0);
        }
      })
      .catch(() => {
        if (!cancelled && id === reqRef.current) {
          setRows([]);
          toast("Gagal memuat data dari server", "info");
        }
      })
      .finally(() => {
        if (!cancelled && id === reqRef.current) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, safe, size, filterKey]);

  const go = (p: number) => setPage(Math.min(Math.max(1, p), pages));
  const bar = (
    <div className="flex flex-wrap items-center gap-2 py-2 text-xs text-steel-500">
      <span>
        {loading
          ? "Memuat…"
          : total === 0
            ? "0 dari 0"
            : `${(safe - 1) * size + 1}-${Math.min(safe * size, total)} dari ${total}`}
      </span>
      {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-ocean-500" aria-hidden />}
      <span className="ml-auto flex items-center gap-1">
        <button className="btn-secondary px-2 py-1" disabled={loading || safe <= 1} onClick={() => go(1)}>«</button>
        <button className="btn-secondary px-2 py-1" disabled={loading || safe <= 1} onClick={() => go(safe - 1)}>‹</button>
        <span className="px-1 font-semibold text-navy-900">{safe} / {pages}</span>
        <button className="btn-secondary px-2 py-1" disabled={loading || safe >= pages} onClick={() => go(safe + 1)}>›</button>
        <button className="btn-secondary px-2 py-1" disabled={loading || safe >= pages} onClick={() => go(pages)}>»</button>
        <select
          className="input ml-1 !w-auto px-1.5 py-1 text-xs"
          value={size}
          aria-label="Baris per halaman"
          disabled={loading}
          onChange={(e) => { setSize(Number(e.target.value)); setPage(1); }}
        >
          {[10, 25, 50, 100, 200].map((n) => (
            <option key={n} value={n}>{n}/hal</option>
          ))}
        </select>
      </span>
    </div>
  );
  return { page: safe, size, pages, total, rows, loading, go, bar };
}

/* ============ N U M I N P U T ============ */

/** Buang nol di depan agar tidak nyangkut: "0" → "" (user ketik ulang bersih),
 *  "007" → "7". Desimal ("0.5") tetap utuh. */
function stripLeadingZero(v: string): string {
  if (!v) return v;
  if (v === "0") return "";
  if (v.includes(".")) return v;
  return v.replace(/^0+(?=\d)/, "");
}

/** Input angka terkunci: blokir e/E/+/- di keyboard (+ titik/koma bila integer).
 * Nol di depan dibersihkan otomatis. Validasi Number() di handler tetap jaring kedua. */
export function NumInput({ integer = false, allowNegative = false, onKeyDown, onChange, inputMode, ...rest }: InputHTMLAttributes<HTMLInputElement> & { integer?: boolean; allowNegative?: boolean }) {
  const block = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (["e", "E", "+", "-"].includes(e.key) && !(e.key === "-" && allowNegative)) {
      e.preventDefault();
      return;
    }
    if (integer && (e.key === "." || e.key === ",")) {
      e.preventDefault();
      return;
    }
    onKeyDown?.(e);
  };
  const clean = (e: React.ChangeEvent<HTMLInputElement>) => {
    const el = e.currentTarget;
    const next = stripLeadingZero(el.value);
    if (next !== el.value) el.value = next;
    onChange?.(e);
  };
  return (
    <input
      type="number"
      inputMode={inputMode ?? (integer ? "numeric" : "decimal")}
      onKeyDown={block}
      onChange={clean}
      {...rest}
    />
  );
}

/* ============ F I L E U P L O A D B U T T O N ============ */

import { uploadFile } from "../services/upload";
import { BASE, getJwt } from "../services/http";
import { toAbsoluteUrl } from "../services/files";

/** Normalisasi URL lama relatif (/files/...) → absolut terhadap BASE backend.
 *  URL absolut / blob: / object-URL dikembalikan apa adanya. */
export function absUrl(url: unknown): string {
  return toAbsoluteUrl(url);
}

/** Gambar dengan inisial bila tanpa foto + loader JWT (fetch blob → object URL).
 *  Cocok untuk foto yang dilindungi auth backend; URL lama relatif dinormalisasi. */
export function SecureImg({
  src,
  alt,
  name,
  className = "",
}: {
  src?: unknown;
  alt: string;
  name?: string;
  className?: string;
}) {
  const raw = absUrl(src);
  const [obj, setObj] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
    setObj(null);
    if (!raw || /^(blob:|data:)/i.test(raw)) return;
    // URL absolut same-origin / backend ber-JWT → ambil via fetch blob.
    let revoke = "";
    let cancelled = false;
    const needsJwt = !/^https?:/i.test(raw) || (BASE && raw.startsWith(BASE));
    if (!needsJwt) return;
    void (async () => {
      try {
        const jwt = getJwt();
        const res = await fetch(raw, { headers: jwt ? { Authorization: `Bearer ${jwt}` } : {} });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        if (cancelled) return;
        revoke = URL.createObjectURL(blob);
        setObj(revoke);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [raw]);
  if (!raw) {
    return <Avatar name={name ?? alt} className={className} />;
  }
  if (failed) {
    /* Tanpa tautan tab-baru: pratinjau/unduh file lewat DocumentPreviewCell
       di lokasi pemakaian; thumb dekoratif cukup beri status gagal. */
    return (
      <span title={raw} className={`inline-flex items-center justify-center rounded-xl border border-steel-200 bg-surface px-2 py-1 text-xs font-medium text-steel-400 ${className}`}>
        File tak dapat dimuat
      </span>
    );
  }
  const shown = obj ?? (/^(blob:|data:|https?:)/i.test(raw) ? raw : raw);
  if (!obj && (BASE && raw.startsWith(BASE))) {
    return (
      <span className={`inline-flex items-center justify-center rounded-xl bg-steel-100 text-steel-400 ${className}`} aria-label={`Memuat ${alt}`}>
        <Loader2 className="h-5 w-5 animate-spin" />
      </span>
    );
  }
  return <img src={shown} alt={alt} className={className} loading="lazy" onError={() => setFailed(true)} />;
}

/** Strip alur status generik: langkah selesai / aktif / berikutnya.
 *
 *  Tanpa `onSelect` strip ini murni dekoratif (legenda warna). Dengan
 *  `onSelect` tiap langkah jadi tombol filter sungguhan.
 *
 *  `current` boleh string kosong: itu berarti "tidak ada langkah yang
 *  aktif". Pemakai lama selalu mengoper salah satu langkah sehingga
 *  legenda ikut menyala padahal tidak ada filter yang aktif - pakai `""`
 *  supaya tampilan jujur soal keadaan sebenarnya. */
export function FlowStrip({
  steps,
  current,
  onSelect,
  ariaLabel,
}: {
  steps: string[];
  current: string;
  onSelect?: (step: string) => void;
  ariaLabel?: string;
}) {
  const idx = steps.indexOf(current);
  const interactive = typeof onSelect === "function";
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={ariaLabel ?? "Alur status"}>
      {steps.map((s, i) => {
        const done = idx >= 0 && i < idx;
        const on = s === current;
        const tone = on
          ? "bg-navy-700 text-white"
          : done
            ? "bg-emerald-100 text-emerald-700"
            : "bg-steel-100 text-steel-500";
        return (
          <span key={s} className="flex items-center gap-1.5">
            {interactive ? (
              <button
                type="button"
                onClick={() => onSelect(s)}
                aria-pressed={on}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-navy-400 ${tone} ${on ? "cursor-default" : "hover:bg-steel-200"}`}
              >
                {i + 1}. {s}
              </button>
            ) : (
              <span className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${tone}`} aria-current={on ? "step" : undefined}>
                {i + 1}. {s}
              </span>
            )}
            {i < steps.length - 1 && (
              <span aria-hidden className="text-steel-300">→</span>
            )}
          </span>
        );
      })}
      {idx < 0 && (
        <span className="text-xs text-steel-400">Status “{current}” di luar alur baku</span>
      )}
    </div>
  );
}

/** Tombol upload file generik: spinner saat unggah, toast pesan backend,
 * mode lokal biarkan input URL manual (fallback di luar komponen ini). */
export function FileUploadButton({ accept, onUploaded, label, disabled }: {
  accept?: string;
  onUploaded: (url: string) => void;
  label: ReactNode;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={accept ?? ".png,.jpg,.jpeg,.pdf,.xlsx,.xls,.csv,.txt"}
        className="hidden"
        aria-hidden
        tabIndex={-1}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          void (async () => {
            setBusy(true);
            try {
              onUploaded(await uploadFile(f));
            } catch (err) {
              toast(err instanceof Error ? err.message : "Upload gagal", "info");
            } finally {
              setBusy(false);
            }
          })();
        }}
      />
      <button
        type="button"
        className="btn-secondary text-xs"
        disabled={disabled || busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UploadIcon className="h-3.5 w-3.5" />}
        {label}
      </button>
    </>
  );
}

/* ============ T O A S T ============ */

export function useDebouncedValue<T>(value: T, delay = 200): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setV(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);
  return v;
}

export function toast(message: string, tone: "success" | "info" = "success") {
  window.dispatchEvent(new CustomEvent("isms:toast", { detail: { message, tone } }));
}

interface ToastItem {
  id: number;
  message: string;
  tone: "success" | "info";
}

let toastSeq = 0;

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    const onToast = (e: Event) => {
      const detail = (e as CustomEvent).detail as { message: string; tone: "success" | "info" };
      const id = ++toastSeq;
      setItems((prev) => [...prev.slice(-2), { id, message: detail.message, tone: detail.tone }]);
      window.setTimeout(() => {
        setItems((prev) => prev.filter((t) => t.id !== id));
      }, 3000);
    };
    window.addEventListener("isms:toast", onToast);
    return () => window.removeEventListener("isms:toast", onToast);
  }, []);

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[60] flex w-80 flex-col gap-2">
      <AnimatePresence>
        {items.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 40 }}
            className="pointer-events-auto flex items-start gap-2.5 rounded-xl border border-steel-200 bg-white px-4 py-3 shadow-lift"
          >
            {t.tone === "success" ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
            ) : (
              <Info className="mt-0.5 h-5 w-5 shrink-0 text-ocean-500" />
            )}
            <p className="text-sm font-medium text-navy-900">{t.message}</p>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
