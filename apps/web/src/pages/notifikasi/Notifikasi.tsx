import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Bell, Check, CheckCheck, Download, Info, Search } from "lucide-react";
import { Badge, Card, EmptyState, KpiCard, PageHeader, Tabs, toast } from "../../components/ui";
import { useStore } from "../../data/store";
import { computeAlerts } from "../../utils/alerts";
import { dayGroup, loadNotifRead, relMinutes, saveNotifRead, type DayGroup } from "../../utils/notifRead";
import { exportExcel } from "../../utils/export";

type Tone = "red" | "amber" | "blue" | "navy" | "teal" | "violet" | "gray";

interface NotifItem {
  id: string;
  kind: "alert" | "info";
  tone: Tone;
  text: string;
  meta: string;
  detail: string;
  module: string;
  timeLabel: string;
  minAgo: number;
  to: string;
}

const FILTERS = ["Semua", "Perlu Perhatian", "Aktivitas"];
const SEVERITIES = ["Semua", "Merah", "Kuning", "Biru"] as const;
const GROUP_ORDER: DayGroup[] = ["Hari ini", "Kemarin", "Lebih lama"];

const MODULE_LINK: Record<string, string> = {
  Proyek: "/proyek",
  Monitoring: "/proyek/monitoring",
  Drydock: "/drydock",
  Inventori: "/inventori",
  Equipment: "/equipment",
  Subkontraktor: "/subkontraktor",
  QC: "/qc-safety",
  Safety: "/qc-safety",
  Procurement: "/procurement",
  CRM: "/crm",
  Keuangan: "/keuangan",
  SDM: "/sdm",
  Kapal: "/kapal",
  Dokumen: "/dokumen",
  Absensi: "/absensi",
  Payroll: "/payroll",
  Pajak: "/keuangan",
  Laporan: "/laporan",
  Pengaturan: "/pengaturan",
  Analytics: "/analytics",
  Audit: "/audit",
  Notifikasi: "/notifikasi",
  Auth: "/pengaturan/peran",
  Service: "/proyek",
  Sparepart: "/inventori",
  BoQ: "/proyek",
};

const VALID_TONES: Tone[] = ["red", "amber", "blue", "navy", "teal", "violet", "gray"];

function normTone(raw: unknown): Tone {
  const t = String(raw ?? "") === "rose" ? "red" : String(raw ?? "");
  return (VALID_TONES.includes(t as Tone) ? t : "gray") as Tone;
}

function sevOf(tone: Tone): "Merah" | "Kuning" | "Biru" {
  if (tone === "red") return "Merah";
  if (tone === "amber") return "Kuning";
  return "Biru";
}

export default function Notifikasi() {
  const { data } = useStore();
  const [filter, setFilter] = useState("Semua");
  const [sev, setSev] = useState<(typeof SEVERITIES)[number]>("Semua");
  const [mod, setMod] = useState("Semua");
  const [q, setQ] = useState("");
  const [order, setOrder] = useState<"Terbaru" | "Terlama">("Terbaru");
  const [read, setRead] = useState<Set<string>>(() => loadNotifRead());

  const alerts = useMemo(() => computeAlerts(data), [data]);

  const items: NotifItem[] = useMemo(() => {
    const fromAlerts: NotifItem[] = alerts.map((al) => ({
      id: `alert-${al.id}`,
      kind: "alert",
      tone: al.tone,
      text: al.text,
      meta: "Perlu perhatian · ambang otomatis",
      detail: `Sumber: engine ambang (budget, stok, sertifikat, invoice, milestone) · tujuan ${al.to}`,
      module: "Alert",
      timeLabel: "Sekarang",
      minAgo: 0,
      to: al.to,
    }));
    const fromActs: NotifItem[] = (data.activities ?? []).slice(0, 30).map((x) => ({
      id: `act-${String(x.id)}`,
      kind: "info",
      tone: normTone(x.tone),
      text: `${String(x.actor ?? "")} ${String(x.action ?? "")} ${String(x.target ?? "")}`.trim(),
      meta: `${String(x.module ?? "-")} · ${String(x.time ?? "-")}`,
      detail: `Aktor: ${String(x.actor ?? "-")} · aksi: ${String(x.action ?? "-")} · target: ${String(x.target ?? "-")}`,
      module: String(x.module ?? "-"),
      timeLabel: String(x.time ?? "-"),
      minAgo: relMinutes(String(x.time ?? "")),
      to: MODULE_LINK[String(x.module ?? "")] ?? "/dashboard",
    }));
    return [...fromAlerts, ...fromActs];
  }, [alerts, data.activities]);

  const modules = useMemo(
    () => ["Semua", ...Array.from(new Set(items.map((i) => i.module))).sort()],
    [items]
  );

  const persist = (next: Set<string>) => {
    setRead(next);
    saveNotifRead(next);
  };

  const markOne = (id: string) => {
    if (read.has(id)) return;
    const next = new Set(read);
    next.add(id);
    persist(next);
  };

  const markAll = () => {
    persist(new Set(items.map((i) => i.id)));
    toast("Semua notifikasi ditandai dibaca");
  };

  const markGroup = (ids: string[]) => {
    const next = new Set(read);
    ids.forEach((id) => next.add(id));
    persist(next);
    toast(`${ids.length} notifikasi ditandai dibaca`);
  };

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = items.filter((i) => {
      if (filter === "Perlu Perhatian" && i.kind !== "alert") return false;
      if (filter === "Aktivitas" && i.kind !== "info") return false;
      if (sev !== "Semua" && sevOf(i.tone) !== sev) return false;
      if (mod !== "Semua" && i.module !== mod) return false;
      if (needle && !`${i.text} ${i.detail} ${i.module}`.toLowerCase().includes(needle)) return false;
      return true;
    });
    const dir = order === "Terbaru" ? 1 : -1;
    return [...rows].sort((a, b) => (a.minAgo - b.minAgo) * dir);
  }, [items, filter, sev, mod, q, order]);

  const grouped = useMemo(() => {
    const map = new Map<DayGroup, NotifItem[]>();
    for (const i of filtered) {
      const g = dayGroup(i.minAgo);
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(i);
    }
    return GROUP_ORDER.filter((g) => (map.get(g) ?? []).length > 0).map((g) => ({ group: g, rows: map.get(g)! }));
  }, [filtered]);

  const unread = items.filter((i) => !read.has(i.id)).length;
  const alertCount = items.filter((i) => i.kind === "alert").length;
  const infoCount = items.filter((i) => i.kind === "info").length;
  const hasActiveFilter = filter !== "Semua" || sev !== "Semua" || mod !== "Semua" || q.trim() !== "";
  const resetFilters = () => { setFilter("Semua"); setSev("Semua"); setMod("Semua"); setQ(""); };

  const doExport = () => {
    const head = ["ID", "Jenis", "Isi", "Detail", "Modul", "Waktu", "Tautan", "Status"];
    const body = filtered.map((i) => [
      i.id,
      i.kind === "alert" ? "Perlu Perhatian" : "Aktivitas",
      i.text,
      i.detail,
      i.module,
      i.timeLabel,
      i.to,
      read.has(i.id) ? "Dibaca" : "Belum dibaca",
    ]);
    void exportExcel([head, ...body], "daftar-notifikasi", "Notifikasi").then(() =>
      toast("Daftar notifikasi diekspor ke Excel")
    );
  };

  return (
    <div>
      <PageHeader
        title="Notifikasi"
        subtitle="Pusat notifikasi in-app — status baca tersimpan per perangkat"
        icon={<Bell className="h-5 w-5" />}
        actions={
          <>
            <button className="btn-secondary text-xs" onClick={markAll}>
              <CheckCheck className="h-4 w-4" /> Tandai semua dibaca
            </button>
            <button className="btn-secondary text-xs" onClick={doExport}>
              <Download className="h-4 w-4" /> Export Excel
            </button>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard label="Perlu Perhatian" value={String(alertCount)} hint="Dari ambang alert aktif" chip="rose" icon={<AlertTriangle className="h-5 w-5" />} />
        <KpiCard label="Aktivitas" value={String(infoCount)} hint="30 aktivitas terakhir" chip="navy" icon={<Info className="h-5 w-5" />} />
        <KpiCard label="Belum Dibaca" value={String(unread)} hint="Tersimpan per perangkat" chip="amber" icon={<Bell className="h-5 w-5" />} />
      </div>

      <Card>
        <div className="space-y-3 px-5 pt-4">
          <Tabs tabs={FILTERS} active={filter} onChange={setFilter} />
          <div className="flex flex-wrap items-center gap-2 pb-1">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-steel-400" />
              <input
                className="input w-56 pl-9"
                placeholder="Cari isi / aktor / modul…"
                aria-label="Cari notifikasi"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <select className="input w-auto py-1.5 text-sm" aria-label="Filter severity" value={sev} onChange={(e) => setSev(e.target.value as (typeof SEVERITIES)[number])}>
              <option value="Semua">Semua severity</option>
              <option value="Merah">Merah (kritis)</option>
              <option value="Kuning">Kuning (waspada)</option>
              <option value="Biru">Biru (info)</option>
            </select>
            <select className="input w-auto py-1.5 text-sm" aria-label="Filter modul" value={mod} onChange={(e) => setMod(e.target.value)}>
              {modules.map((m) => <option key={m} value={m}>{m === "Semua" ? "Semua modul" : m}</option>)}
            </select>
            <select className="input w-auto py-1.5 text-sm" aria-label="Urutan" value={order} onChange={(e) => setOrder(e.target.value as "Terbaru" | "Terlama")}>
              <option value="Terbaru">Terbaru dulu</option>
              <option value="Terlama">Terlama dulu</option>
            </select>
            {hasActiveFilter && (
              <button className="btn-secondary py-1.5 text-xs" onClick={resetFilters}>Reset</button>
            )}
            <span className="ml-auto text-xs text-steel-400">{filtered.length} notifikasi</span>
          </div>
        </div>
        <div className="px-5 pb-4">
          {grouped.length === 0 && (
            <EmptyState
              icon={<Bell className="h-8 w-8" />}
              title="Tidak ada notifikasi"
              subtitle="Tidak ada yang cocok dengan filter — semua aman."
            />
          )}
          {grouped.map((g) => (
            <div key={g.group} className="mt-3">
              <div className="mb-1 flex items-center gap-2">
                <p className="text-xs font-bold uppercase tracking-wide text-steel-400">{g.group} ({g.rows.length})</p>
                <button
                  className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-ocean-600 hover:underline"
                  onClick={() => markGroup(g.rows.map((r) => r.id))}
                >
                  <Check className="h-3 w-3" /> Tandai grup dibaca
                </button>
              </div>
              <div className="divide-y divide-steel-50 overflow-hidden rounded-xl border border-steel-100">
                {g.rows.map((i) => {
                  const isRead = read.has(i.id);
                  return (
                    <div key={i.id} className={`flex items-start gap-3 px-3 py-3 ${isRead ? "bg-white opacity-60" : "bg-ocean-50/40"}`}>
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white ${
                          i.tone === "red" ? "bg-gradient-rose" : i.tone === "amber" ? "bg-gradient-amber" : "bg-gradient-hero"
                        }`}
                      >
                        {i.kind === "alert" ? <AlertTriangle className="h-4 w-4" /> : <Info className="h-4 w-4" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {!isRead && <span className="h-2 w-2 rounded-full bg-rose-500" aria-label="Belum dibaca" />}
                          <Badge tone={i.kind === "alert" ? i.tone : "navy"}>
                            {i.kind === "alert" ? `Perlu Perhatian · ${sevOf(i.tone)}` : "Aktivitas"}
                          </Badge>
                          <span className="text-[11px] text-steel-400">{i.meta}</span>
                        </div>
                        <p className="mt-1 text-sm font-medium text-navy-900">{i.text}</p>
                        <p className="mt-0.5 truncate text-xs text-steel-400" title={i.detail}>{i.detail}</p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <Link
                          to={i.to}
                          onClick={() => markOne(i.id)}
                          className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-ocean-600 hover:bg-ocean-50"
                        >
                          Buka
                        </Link>
                        {!isRead && (
                          <button
                            className="rounded-lg px-2.5 py-1 text-[11px] font-medium text-steel-400 hover:bg-steel-100 hover:text-navy-800"
                            onClick={() => markOne(i.id)}
                          >
                            Tandai dibaca
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
