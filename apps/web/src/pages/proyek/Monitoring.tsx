import { useState } from "react";
import { Link } from "react-router-dom";
import { Activity, AlertTriangle, FileDown, Search } from "lucide-react";
import {
  Badge,
  Card,
  PageHeader,
  ProgressBar,
  StatusBadge,
  toast,
} from "../../components/ui";
import { useStore } from "../../data/store";
import type { StoreItem } from "../../data/store";
import { fmtBulan, fmtMiliar, fmtRupiah, todayISO } from "../../utils/format";
import { exportExcel } from "../../utils/export";
import { TAHAP, tahapOf } from "./Projects";
import { canonPrioritas } from "../../utils/scope";

const prioritasTone: Record<string, "gray" | "blue" | "amber" | "red"> = {
  Rendah: "gray",
  Sedang: "blue",
  Tinggi: "amber",
};

interface AttentionItem {
  group: string;
  title: string;
  desc: string;
  pid: string;
}

function endInDays(end: string): number | null {
  const m = String(end ?? "").match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
  if (!m) return null;
  const day = m[3]
    ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    : new Date(Number(m[1]), Number(m[2]), 0);
  const today = new Date(`${todayISO()}T00:00:00`);
  return Math.round((day.getTime() - today.getTime()) / 86400000);
}

export default function Monitoring() {
  const { data, wbsFor, inBranch } = useStore();
  const projects = data.projects;
  const [branchFilter, setBranchFilter] = useState("Semua");
  const [q, setQ] = useState("");
  const [mode, setMode] = useState<"Semua" | "Perhatian">("Semua");

  const branchCities = data.branches.length > 0
    ? data.branches.map((b) => String(b.city))
    : [...new Set(projects.map((p) => String(p.branch)))];

  const filtered = inBranch(projects).filter((p) => {
    const matchBranch = branchFilter === "Semua" || p.branch === branchFilter;
    const matchQ = `${p.vessel} ${p.id} ${p.client}`.toLowerCase().includes(q.toLowerCase());
    return matchBranch && matchQ;
  });

  const openNcr = (pid: string): StoreItem[] =>
    data.ncr.filter((n) => n.project === pid && n.status !== "Tertutup");
  const diajukanCo = (pid: string): StoreItem[] =>
    data.changeOrders.filter((c) => c.project === pid && c.status === "Diajukan");

  const attention: AttentionItem[] = [];
  for (const p of filtered) {
    if (p.status === "Terlambat") {
      attention.push({ group: "Terlambat", title: `${p.id} · ${p.vessel}`, desc: `Status Terlambat · progres ${p.progress}%`, pid: p.id });
    }
    if (Number(p.actual) > Number(p.budget)) {
      attention.push({ group: "Over-budget", title: `${p.id} · ${p.vessel}`, desc: `Realisasi ${fmtRupiah(Number(p.actual))} melebihi anggaran ${fmtRupiah(Number(p.budget))}`, pid: p.id });
    }
    const critical = openNcr(p.id).filter((n) => n.severity === "Critical");
    for (const n of critical) {
      attention.push({ group: "NCR Critical", title: `${n.id} · ${p.vessel}`, desc: String(n.issue ?? "NCR critical terbuka"), pid: p.id });
    }
    for (const c of diajukanCo(p.id)) {
      attention.push({ group: "CO Diajukan", title: `${c.id} · ${p.vessel}`, desc: `${String(c.title)} (${fmtRupiah(Number(c.impact))})`, pid: p.id });
    }
    // Hanya WBS nyata — template fallback tidak boleh jadi perhatian.
    if (!data.wbsByProject?.[p.id]?.length) continue;
    for (const w of wbsFor(p.id)) {
      const d = endInDays(w.end);
      if (Number(w.progress) === 0 && d !== null && d >= 0 && d < 30) {
        attention.push({ group: "Milestone dekat", title: `${p.id} · ${w.task}`, desc: `Belum mulai (0%) · berakhir ${fmtBulan(w.end)}`, pid: p.id });
      }
    }
  }

  const attentionPids = new Set(attention.map((a) => a.pid));
  const pipeline = mode === "Semua" ? filtered : filtered.filter((p) => attentionPids.has(p.id));

  const delayDaysOf = (p: StoreItem): number | null => {
    if (p.status !== "Terlambat") return null;
    const d = endInDays(String(p.end ?? ""));
    if (d === null) return null;
    return Math.max(0, -d);
  };

  const exportRekap = () => {
    const rows: unknown[][] = [
      ["Kode", "Kapal", "Tipe", "Cabang", "Tahap", "Prioritas", "Status", "Progres %", "Budget (Rp)", "Actual (Rp)", "NCR Terbuka", "CO Diajukan"],
      ...filtered.map((p) => [
        p.id, p.vessel, p.type, p.branch, tahapOf(p), p.prioritas ?? "Sedang", p.status,
        Number(p.progress || 0), Number(p.budget || 0), Number(p.actual || 0),
        openNcr(p.id).length, diajukanCo(p.id).length,
      ]),
    ];
    void exportExcel(rows, "monitoring-proyek", "Monitoring").then(() => toast("Rekap monitoring diekspor ke Excel"));
  };

  return (
    <div>
      <PageHeader
        title="Monitoring End-to-End"
        subtitle="Pipeline tahap Inquiry hingga Handover lintas proyek"
        icon={<Activity className="h-5 w-5" />}
        actions={<button className="btn-secondary" onClick={exportRekap}><FileDown className="h-4 w-4" /> Export Excel</button>}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-steel-400" />
          <input
            className="input pl-9 w-full sm:w-64"
            placeholder="Cari kapal / kode proyek..."
            aria-label="Cari proyek"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <select className="input w-auto py-1.5 text-sm" aria-label="Filter cabang" value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
          <option value="Semua">Semua cabang</option>
          {branchCities.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
        <div className="flex gap-1" role="group" aria-label="Mode tampilan pipeline">
          {(["Semua", "Perhatian"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                mode === m ? "bg-navy-700 text-white" : "bg-white border border-steel-200 text-steel-600 hover:bg-steel-100"
              }`}
            >
              {m === "Semua" ? "Semua" : "Hanya Perhatian"}
            </button>
          ))}
        </div>
        <p className="ml-auto text-xs text-steel-500">{pipeline.length} proyek · {attention.length} perlu perhatian</p>
      </div>

      <Card className="mb-4 p-5">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-navy-900">
          <AlertTriangle className="h-4 w-4 text-amber-500" /> Perlu Perhatian ({attention.length})
        </h3>
        {attention.length === 0 && <p className="text-sm text-steel-400">Tidak ada item perhatian.</p>}
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          {attention.map((a, i) => (
            <Link
              key={`${a.group}-${a.title}-${i}`}
              to={`/proyek/${a.pid}`}
              className="flex items-center gap-3 rounded-xl border border-steel-100 p-2.5 text-sm transition-colors hover:border-ocean-400 hover:bg-surface"
            >
              <Badge tone={a.group === "NCR Critical" || a.group === "Terlambat" || a.group === "Over-budget" ? "red" : "amber"}>{a.group}</Badge>
              <div className="min-w-0">
                <p className="truncate font-medium text-navy-900">{a.title}</p>
                <p className="truncate text-xs text-steel-500">{a.desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </Card>

      <div className="flex gap-4 overflow-x-auto pb-2">
        {TAHAP.map((t) => {
          const cols = pipeline.filter((p) => tahapOf(p) === t);
          return (
            <div key={t} className="w-64 shrink-0 rounded-2xl border border-steel-200 bg-surface p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-semibold text-navy-900">{t}</p>
                <Badge tone="navy">{cols.length}</Badge>
              </div>
              <div className="space-y-2">
                {cols.map((p) => {
                  const pct = Number(p.budget) > 0 ? (Number(p.actual) / Number(p.budget)) * 100 : 0;
                  const delay = delayDaysOf(p);
                  return (
                    <Link
                      key={p.id}
                      to={`/proyek/${p.id}`}
                      className="block rounded-xl border border-steel-200 bg-white p-3 transition-colors hover:border-ocean-400"
                    >
                      <p className="font-mono text-xs text-steel-500">{p.id}</p>
                      <p className="truncate text-sm font-semibold text-navy-900">{p.vessel}</p>
                      <div className="mt-1 flex items-center gap-2">
                        <Badge tone={prioritasTone[canonPrioritas(p.prioritas)] ?? "blue"}>{canonPrioritas(p.prioritas)}</Badge>
                        <StatusBadge status={p.status} />
                      </div>
                      {delay !== null && (
                        <p className={`mt-1.5 text-[11px] font-semibold ${delay > 0 ? "text-rose-600" : "text-amber-600"}`}>
                          {delay > 0 ? `Terlambat ${delay} hari dari rencana selesai` : "Status Terlambat — cek jadwal"}
                        </p>
                      )}
                      <div className="mt-2 flex items-center gap-2">
                        <ProgressBar value={Number(p.progress || 0)} className="flex-1" tone={p.status === "Terlambat" ? "red" : "navy"} />
                        <span className="text-xs font-medium text-steel-600">{p.progress}%</span>
                      </div>
                      <p className="mt-1.5 text-[11px] text-steel-500">{fmtMiliar(Number(p.actual))} / {fmtMiliar(Number(p.budget))}</p>
                      <ProgressBar value={pct} tone={pct > 100 ? "red" : "ocean"} />
                      <p className="mt-1.5 text-[11px] text-steel-500">NCR terbuka: <span className={`font-semibold ${openNcr(p.id).length > 0 ? "text-rose-600" : "text-steel-500"}`}>{openNcr(p.id).length}{openNcr(p.id).some((n) => n.severity === "Critical") ? " · Critical" : ""}</span></p>
                    </Link>
                  );
                })}
                {cols.length === 0 && <p className="py-4 text-center text-xs text-steel-400">Kosong</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
