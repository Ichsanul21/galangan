import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Search, Ship, Anchor, FileCheck2 } from "lucide-react";
import { Card, CardHeader, PageHeader, Badge, KpiCard, StatusBadge } from "../../components/ui";
import { vessels, surveyTimeline, sparkRevenue } from "../../data";

const statusTone: Record<string, "green" | "blue" | "amber" | "red"> = {
  "Dalam Docking": "blue",
  "Dalam Pembangunan": "amber",
  "Dalam Operasi": "green",
  "Menganggur": "gray" as never,
};

export default function Vessels() {
  const [q, setQ] = useState("");
  const list = vessels.filter((v) => v.name.toLowerCase().includes(q.toLowerCase()) || v.imo.toLowerCase().includes(q.toLowerCase()));
  const expiring = vessels.filter((v) => v.certificates.some((c) => c.tone !== "green")).length;

  return (
    <div>
      <PageHeader
        title="Rekam Jejak Kapal"
        subtitle="Data teknis, riwayat survey/docking, dan sertifikat per kapal"
        icon={<Ship className="h-5 w-5" />}
        actions={<button className="btn-primary-gradient"><Plus className="h-4 w-4" /> Daftarkan Kapal</button>}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total Kapal Terdaftar" value="38" icon={<Ship className="h-5 w-5" />} chip="navy" spark={sparkRevenue} hint="Seluruh armada klien" />
        <KpiCard label="Dalam Docking" value={String(vessels.filter((v) => v.status === "Dalam Docking").length)} icon={<Anchor className="h-5 w-5" />} chip="teal" />
        <KpiCard label="Dalam Pembangunan" value={String(vessels.filter((v) => v.status === "Dalam Pembangunan").length)} icon={<Anchor className="h-5 w-5" />} chip="violet" />
        <KpiCard label="Sertifikat Perlu Perhatian" value={String(expiring)} delta="Expire <= 90 hari" deltaDirection="down" icon={<FileCheck2 className="h-5 w-5" />} chip="rose" />
      </div>

      <div className="mt-4">
        <div className="mb-3 relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-steel-400" />
          <input className="input pl-9 w-64" placeholder="Cari kapal / IMO..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.map((v) => (
            <Link to={`/kapal/${v.id}`} key={v.id}>
              <Card className="p-5 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-ocean-500/15 text-ocean-600">
                        <Ship className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-navy-900">{v.name}</p>
                        <p className="text-xs text-steel-500 font-mono">{v.imo}</p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-steel-500">{v.type}</p>
                    <p className="text-xs text-steel-500">{v.owner}</p>
                  </div>
                  <Badge tone={statusTone[v.status] ?? "gray"}>{v.status}</Badge>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 border-t border-steel-100 pt-3 text-center">
                  <div><p className="text-sm font-bold text-navy-900">{v.loa}m</p><p className="text-[10px] text-steel-500">LOA</p></div>
                  <div><p className="text-sm font-bold text-navy-900">{v.bollard}T</p><p className="text-[10px] text-steel-500">Bollard</p></div>
                  <div><p className="text-sm font-bold text-navy-900">{v.built}</p><p className="text-[10px] text-steel-500">Tahun</p></div>
                </div>
              </Card>
            </Link>
          ))}
        </div>

        <Card className="mt-5">
          <CardHeader title="Kegiatan Survey Terjadwal" subtitle="Jadwal survey class & docking" />
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-surface">
                <tr><th className="th">Kapal</th><th className="th">Tipe Survey</th><th className="th">Surveyor</th><th className="th">Tanggal</th><th className="th">Status</th></tr>
              </thead>
              <tbody className="divide-y divide-steel-100">
                {surveyTimeline.map((s) => (
                  <tr key={s.id} className="hover:bg-surface">
                    <td className="td font-medium text-navy-900">{s.vessel}</td>
                    <td className="td text-steel-600">{s.type}</td>
                    <td className="td text-steel-600">{s.classSurveyor}</td>
                    <td className="td font-mono text-xs text-steel-600">{s.date}</td>
                    <td className="td"><StatusBadge status={s.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
