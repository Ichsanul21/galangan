import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Search, Filter, Anchor, Wallet, TrendingUp, Clock } from "lucide-react";
import {
  Card,
  PageHeader,
  StatusBadge,
  ProgressBar,
  Badge,
  KpiCard,
} from "../../components/ui";
import { projects, fmtMiliar, sparkRevenue } from "../../data";

const filters = ["Semua", "New Build", "Repair", "Retrofit"];

export default function Projects() {
  const [filter, setFilter] = useState("Semua");
  const [q, setQ] = useState("");

  const list = projects.filter((p) => {
    const matchType = filter === "Semua" || p.type === filter;
    const matchQ = p.vessel.toLowerCase().includes(q.toLowerCase()) || p.id.toLowerCase().includes(q.toLowerCase());
    return matchType && matchQ;
  });

  const totalBudget = projects.reduce((s, p) => s + p.budget, 0);
  const inProgress = projects.filter((p) => p.status !== "Selesai").length;
  const delayed = projects.filter((p) => p.status === "Terlambat").length;
  const avgProgress = Math.round(projects.reduce((s, p) => s + p.progress, 0) / projects.length);

  return (
    <div>
      <PageHeader
        title="Manajemen Proyek"
        subtitle="New Build, Repair & Maintenance, Retrofit"
        icon={<Anchor className="h-5 w-5" />}
        actions={<button className="btn-primary-gradient"><Plus className="h-4 w-4" /> Proyek Baru</button>}
      />

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total Proyek" value={String(projects.length)} hint="Seluruh portofolio" icon={<Anchor className="h-5 w-5" />} chip="navy" spark={sparkRevenue} />
        <KpiCard label="Sedang Berjalan" value={String(inProgress)} delta={`${delayed} terlambat`} deltaDirection="down" icon={<Clock className="h-5 w-5" />} chip="amber" />
        <KpiCard label="Nilai Kontrak" value={fmtMiliar(totalBudget)} delta="Portofolio total" deltaDirection="up" icon={<Wallet className="h-5 w-5" />} chip="teal" />
        <KpiCard label="Rata-rata Progres" value={`${avgProgress}%`} delta="Penyelesaian umum" deltaDirection="flat" icon={<TrendingUp className="h-5 w-5" />} chip="violet" />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-steel-400" />
          <input
            className="input pl-9 w-64"
            placeholder="Cari kapal / kode proyek..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="flex gap-1">
          {filters.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filter === f ? "bg-navy-700 text-white" : "bg-white border border-steel-200 text-steel-600 hover:bg-steel-100"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <button className="btn-secondary ml-auto">
          <Filter className="h-4 w-4" /> Filter
        </button>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-surface">
              <tr>
                <th className="th">Proyek</th>
                <th className="th">Klien</th>
                <th className="th">Jenis</th>
                <th className="th">Status</th>
                <th className="th">Progres</th>
                <th className="th">Anggaran</th>
                <th className="th">Realisasi</th>
                <th className="th">PM</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-steel-100">
              {list.map((p) => (
                <tr key={p.id} className="hover:bg-surface transition-colors">
                  <td className="td">
                    <Link to={`/proyek/${p.id}`} className="block hover:text-ocean-600">
                      <p className="font-semibold text-navy-900">{p.vessel}</p>
                      <p className="text-xs text-steel-500 font-mono">{p.id}</p>
                    </Link>
                  </td>
                  <td className="td text-steel-600">{p.client}</td>
                  <td className="td">
                    <Badge tone={p.type === "New Build" ? "navy" : p.type === "Repair" ? "cyan" : "violet"}>
                      {p.type}
                    </Badge>
                  </td>
                  <td className="td"><StatusBadge status={p.status} /></td>
                  <td className="td">
                    <div className="flex items-center gap-2">
                      <ProgressBar value={p.progress} className="w-20" tone={p.status === "Terlambat" ? "red" : "navy"} />
                      <span className="text-xs font-medium text-steel-600">{p.progress}%</span>
                    </div>
                  </td>
                  <td className="td font-medium text-navy-900">{fmtMiliar(p.budget)}</td>
                  <td className="td text-steel-600">{fmtMiliar(p.actual)}</td>
                  <td className="td text-steel-600">{p.manager}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
