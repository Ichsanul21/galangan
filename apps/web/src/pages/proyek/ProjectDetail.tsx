import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Calendar, MapPin } from "lucide-react";
import {
  Card,
  PageHeader,
  StatusBadge,
  ProgressBar,
  Badge,
  Tabs,
  KpiCard,
} from "../../components/ui";
import { projects, fmtMiliar } from "../../data";

const wbs = [
  { task: "Desain & Persetujuan Class", start: "2026-01", end: "2026-03", progress: 100, weight: 10 },
  { task: "Pengadaan Material", start: "2026-02", end: "2026-05", progress: 85, weight: 15 },
  { task: "Fabrikasi Baja", start: "2026-03", end: "2026-07", progress: 70, weight: 20 },
  { task: "Hull Assembly", start: "2026-05", end: "2026-08", progress: 45, weight: 20 },
  { task: "Mesin & Kelistrikan", start: "2026-07", end: "2026-09", progress: 20, weight: 20 },
  { task: "Pengecatan & Outfitting", start: "2026-08", end: "2026-09", progress: 5, weight: 8 },
  { task: "Sea Trial & Delivery", start: "2026-09", end: "2026-09", progress: 0, weight: 7 },
];

export default function ProjectDetail() {
  const { id } = useParams();
  const project = projects.find((p) => p.id === id) ?? projects[0];
  const [tab, setTab] = useState("Overview");

  return (
    <div>
      <Link to="/proyek" className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-ocean-600 hover:underline">
        <ArrowLeft className="h-4 w-4" /> Kembali ke Proyek
      </Link>
      <PageHeader
        title={project.vessel}
        subtitle={`${project.id} · ${project.type} · ${project.client}`}
        actions={<StatusBadge status={project.status} />}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Anggaran" value={fmtMiliar(project.budget)} hint="Total kontrak proyek" icon={<Calendar className="h-5 w-5" />} />
        <KpiCard label="Realisasi" value={fmtMiliar(project.actual)} delta={`${Math.round((project.actual / project.budget) * 100)}% terpakai`} deltaDirection={project.actual > project.budget ? "down" : "flat"} hint="Biaya aktual" />
        <KpiCard label="Progres" value={`${project.progress}%`} delta={project.status === "Terlambat" ? "Terlambat dari jadwal" : "Sesuai jadwal"} deltaDirection={project.status === "Terlambat" ? "down" : "up"} hint="Penyelesaian keseluruhan" />
        <KpiCard label="Periode" value={`${project.start.slice(5)} → ${project.end.slice(5)}`} hint={project.branch} icon={<MapPin className="h-5 w-5" />} />
      </div>

      <div className="mt-5 card">
        <Tabs tabs={["Overview", "WBS", "Anggaran", "Tim", "Dokumen"]} active={tab} onChange={setTab} />
        <div className="p-5">
          {tab === "Overview" && (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <h3 className="mb-2 text-sm font-semibold text-navy-900">Ruang Lingkup Pekerjaan</h3>
                <ul className="space-y-2">
                  {project.scope.map((s, i) => (
                    <li key={s} className="flex items-center gap-3">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-navy-50 text-xs font-bold text-navy-700">{i + 1}</span>
                      <span className="text-sm text-steel-700">{s}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-6">
                  <h3 className="mb-2 text-sm font-semibold text-navy-900">Progres Keseluruhan</h3>
                  <ProgressBar value={project.progress} tone={project.status === "Terlambat" ? "red" : "navy"} />
                  <p className="mt-1 text-xs text-steel-500">{project.progress}% selesai · target penyelesaian {project.end}</p>
                </div>
              </div>
              <Card className="p-5">
                <h3 className="mb-3 text-sm font-semibold text-navy-900">Informasi Proyek</h3>
                <dl className="space-y-2.5 text-sm">
                  <div className="flex justify-between"><dt className="text-steel-500">Manajer</dt><dd className="font-medium">{project.manager}</dd></div>
                  <div className="flex justify-between"><dt className="text-steel-500">Cabang</dt><dd className="font-medium">{project.branch}</dd></div>
                  <div className="flex justify-between"><dt className="text-steel-500">Mulai</dt><dd className="font-medium">{project.start}</dd></div>
                  <div className="flex justify-between"><dt className="text-steel-500">Selesai</dt><dd className="font-medium">{project.end}</dd></div>
                  <div className="flex justify-between"><dt className="text-steel-500">Status</dt><dd><StatusBadge status={project.status} /></dd></div>
                </dl>
              </Card>
            </div>
          )}

          {tab === "WBS" && (
            <div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-surface">
                    <tr><th className="th">Tahapan</th><th className="th">Mulai</th><th className="th">Selesai</th><th className="th">Bobot</th><th className="th">Progres</th></tr>
                  </thead>
                  <tbody className="divide-y divide-steel-100">
                    {wbs.map((w) => (
                      <tr key={w.task}>
                        <td className="td font-medium text-navy-900">{w.task}</td>
                        <td className="td font-mono text-xs text-steel-500">{w.start}</td>
                        <td className="td font-mono text-xs text-steel-500">{w.end}</td>
                        <td className="td">{w.weight}%</td>
                        <td className="td">
                          <div className="flex items-center gap-3">
                            <ProgressBar value={w.progress} className="w-32" tone={w.progress >= 100 ? "green" : "navy"} />
                            <span className="text-xs font-medium">{w.progress}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-xs text-steel-400">Gantt timeline tersedia pada tahap penjadwalan lanjutan (berth import dari P6/MS Project).</p>
            </div>
          )}

          {tab === "Anggaran" && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Card className="p-5">
                <h3 className="mb-2 text-sm font-semibold text-navy-900">Budget vs Actual</h3>
                <div className="flex items-end gap-2">
                  <div>
                    <p className="text-2xl font-bold text-navy-900">{fmtMiliar(project.actual)}</p>
                    <p className="text-xs text-steel-500">Realisasi dari {fmtMiliar(project.budget)}</p>
                  </div>
                  <Badge tone={project.actual > project.budget ? "red" : "green"}>
                    {Math.round((project.actual / project.budget) * 100)}%
                  </Badge>
                </div>
                <ProgressBar value={(project.actual / project.budget) * 100} tone="ocean" className="mt-3" />
              </Card>
              <Card className="p-5">
                <h3 className="mb-2 text-sm font-semibold text-navy-900">Proyeksi (EAC)</h3>
                <p className="text-sm text-steel-600">
                  Estimasi biaya akhir diproyeksikan <span className="font-semibold text-amber-600">{fmtMiliar(Math.round(project.actual / 0.62))}</span> berdasarkan CPI saat ini {Math.round((project.actual / project.budget) * 100)}% — perlu pengawasan agar tidak overrun.
                </p>
              </Card>
            </div>
          )}

          {tab === "Tim" && (
            <p className="text-sm text-steel-500">Penugasan tim proyek &amp; alokasi sumber daya ditampilkan di sini.</p>
          )}

          {tab === "Dokumen" && (
            <p className="text-sm text-steel-500">Dokumen desain, drawing, dan sertifikat proyek tersedia di sini.</p>
          )}
        </div>
      </div>
    </div>
  );
}
