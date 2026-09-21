import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Bell, CheckCheck, Download, Info } from "lucide-react";
import { Badge, Card, EmptyState, KpiCard, PageHeader, Tabs, toast } from "../../components/ui";
import { useStore } from "../../data/store";
import { computeAlerts } from "../../utils/alerts";
import { exportExcel } from "../../utils/export";

type Tone = "red" | "amber" | "blue" | "navy" | "teal" | "violet" | "gray";

interface NotifItem {
  id: string;
  kind: "alert" | "info";
  tone: Tone;
  text: string;
  meta: string;
  to: string;
}

const FILTERS = ["Semua", "Perlu Perhatian", "Aktivitas"];

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
  Service: "/proyek",
  Sparepart: "/inventori",
  BoQ: "/proyek",
};

const VALID_TONES: Tone[] = ["red", "amber", "blue", "navy", "teal", "violet", "gray"];

function normTone(raw: unknown): Tone {
  const t = String(raw ?? "") === "rose" ? "red" : String(raw ?? "");
  return (VALID_TONES.includes(t as Tone) ? t : "gray") as Tone;
}

export default function Notifikasi() {
  const { data } = useStore();
  const [filter, setFilter] = useState("Semua");
  const [read, setRead] = useState<Set<string>>(new Set());

  const alerts = useMemo(() => computeAlerts(data), [data]);

  const items: NotifItem[] = useMemo(() => {
    const fromAlerts: NotifItem[] = alerts.map((al) => ({
      id: `alert-${al.id}`,
      kind: "alert",
      tone: al.tone,
      text: al.text,
      meta: "Perlu perhatian",
      to: al.to,
    }));
    const fromActs: NotifItem[] = (data.activities ?? []).slice(0, 10).map((x) => ({
      id: `act-${String(x.id)}`,
      kind: "info",
      tone: normTone(x.tone),
      text: `${String(x.actor ?? "")} ${String(x.action ?? "")} ${String(x.target ?? "")}`.trim(),
      meta: `${String(x.module ?? "-")} · ${String(x.time ?? "-")}`,
      to: MODULE_LINK[String(x.module ?? "")] ?? "/dashboard",
    }));
    return [...fromAlerts, ...fromActs];
  }, [alerts, data.activities]);

  const filtered = items.filter((i) => {
    if (filter === "Perlu Perhatian") return i.kind === "alert";
    if (filter === "Aktivitas") return i.kind === "info";
    return true;
  });

  const unread = items.filter((i) => !read.has(i.id)).length;
  const alertCount = items.filter((i) => i.kind === "alert").length;
  const infoCount = items.filter((i) => i.kind === "info").length;

  const markOne = (id: string) => {
    setRead((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  const markAll = () => {
    setRead(new Set(items.map((i) => i.id)));
    toast("Semua notifikasi ditandai dibaca");
  };

  const doExport = () => {
    const head = ["ID", "Jenis", "Isi", "Keterangan", "Tautan", "Status"];
    const body = filtered.map((i) => [
      i.id,
      i.kind === "alert" ? "Perlu Perhatian" : "Aktivitas",
      i.text,
      i.meta,
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
        subtitle="Pusat notifikasi in-app — push/email/WA terhubung saat backend tersedia"
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
        <KpiCard label="Aktivitas" value={String(infoCount)} hint="10 aktivitas terakhir" chip="navy" icon={<Info className="h-5 w-5" />} />
        <KpiCard label="Belum Dibaca" value={String(unread)} hint="Status baca sesi ini" chip="amber" icon={<Bell className="h-5 w-5" />} />
      </div>

      <Card>
        <div className="px-5 pt-4">
          <Tabs tabs={FILTERS} active={filter} onChange={setFilter} />
        </div>
        <div className="divide-y divide-steel-50 px-5 pb-4">
          {filtered.length === 0 && (
            <EmptyState
              icon={<Bell className="h-8 w-8" />}
              title="Tidak ada notifikasi"
              subtitle="Semua aman — tidak ada yang perlu perhatian saat ini."
            />
          )}
          {filtered.map((i) => {
            const isRead = read.has(i.id);
            return (
              <div key={i.id} className={`flex items-start gap-3 py-3 ${isRead ? "opacity-60" : ""}`}>
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
                      {i.kind === "alert" ? "Perlu Perhatian" : "Aktivitas"}
                    </Badge>
                    <span className="text-[11px] text-steel-400">{i.meta}</span>
                  </div>
                  <p className="mt-1 text-sm font-medium text-navy-900">{i.text}</p>
                </div>
                <Link
                  to={i.to}
                  onClick={() => markOne(i.id)}
                  className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-ocean-600 hover:bg-ocean-50"
                >
                  Buka
                </Link>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
