import type { ReactNode } from "react";
import { motion } from "framer-motion";
import {
  ArrowDownRight,
  ArrowUpRight,
  Minus,
  ChevronRight,
} from "lucide-react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Bar,
  BarChart,
} from "recharts";

/* ============ M O T I O N   H E L P E R S ============ */

export function FadeIn({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.5, delay, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}

export function Stagger({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div
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
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`card ${className}`}>{children}</div>;
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
}: {
  children: ReactNode;
  tone?: keyof typeof toneMap;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${toneMap[tone]} ${className}`}
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
  Terkunci: "green",
  Ditutup: "gray",
  Lulus: "green",
  Terbuka: "amber",
  Telat: "red",
  Kritis: "red",
  Menipis: "amber",
  Aman: "green",
  Terlambat: "red",
};

export function StatusBadge({ status }: { status: string }) {
  const tone = statusTone[status] ?? "gray";
  return <Badge tone={tone}>{status}</Badge>;
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
  return (
    <Card className="card-hover relative overflow-hidden p-4">
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-steel-500 truncate">{label}</p>
          <p className="mt-1 text-[26px] font-bold tracking-tight text-navy-900 truncate">{value}</p>
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
      {spark && spark.length > 0 && (
        <div className="mt-2 -mb-1 h-10">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={spark} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={`spark-${label.replace(/\s/g, "")}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2e9ad4" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#2e9ad4" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="v" stroke="#2e9ad4" strokeWidth={2} fill={`url(#spark-${label.replace(/\s/g, "")})`} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

/* ============ M I N I   C H A R T S ============ */

export function Sparkline({
  data,
  color = "#2e9ad4",
  height = 40,
}: {
  data: { name: string; v: number }[];
  color?: string;
  height?: number;
}) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`sp-${color.replace('#','')}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="v" stroke={color} strokeWidth={2} fill={`url(#sp-${color.replace('#','')})`} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MiniBarChart({
  data,
  color = "#2e9ad4",
  height = 48,
  dataKey = "v",
}: {
  data: { name: string; v: number }[];
  color?: string;
  height?: number;
  dataKey?: string;
}) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
          <Bar dataKey={dataKey} fill={color} radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

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

export function StatDelta({
  value,
  direction = "up",
}: {
  value: string;
  direction?: "up" | "down" | "flat";
}) {
  const cls =
    direction === "up"
      ? "text-emerald-600"
      : direction === "down"
      ? "text-rose-600"
      : "text-steel-500";
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${cls}`}>
      {direction === "up" && <ArrowUpRight className="h-3 w-3" />}
      {direction === "down" && <ArrowDownRight className="h-3 w-3" />}
      {value}
    </span>
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
}: {
  tabs: string[];
  active: string;
  onChange: (t: string) => void;
}) {
  return (
    <div className="flex gap-1 border-b border-steel-200 overflow-x-auto">
      {tabs.map((t) => (
        <button
          key={t}
          onClick={() => onChange(t)}
          className={`relative whitespace-nowrap px-3 py-3 text-sm font-medium transition-colors ${
            active === t ? "text-navy-800" : "text-steel-500 hover:text-navy-700"
          }`}
        >
          {t}
          {active === t && (
            <motion.span
              layoutId="tab-underline"
              className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-gradient-hero"
            />
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

export function SectionLink({ to, label }: { to: string; label: string }) {
  return (
    <a href={to} className="inline-flex items-center gap-1 text-sm font-semibold text-ocean-600 hover:text-ocean-500">
      {label} <ChevronRight className="h-4 w-4" />
    </a>
  );
}

export { Tooltip };
