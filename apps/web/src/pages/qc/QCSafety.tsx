import { useState } from "react";
import { Plus, ShieldCheck, AlertTriangle, Siren, Award } from "lucide-react";
import { ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Card, CardHeader, PageHeader, Badge, KpiCard, Tabs, StatusBadge, Donut, ChartTooltip } from "../../components/ui";
import { ncrList, incidents, vessels, ncrStats, inspectionTrend, sparkUtil } from "../../data";

const inspections = [
  { id: "INS-2026-118", project: "NB-2025-012", point: "Welding seam section 4", itp: "ITP-012", status: "Lulus", date: "2026-07-20" },
  { id: "INS-2026-119", project: "RP-2026-003", point: "Ketebalan cat lambung", itp: "ITP-003", status: "NCR", date: "2026-07-22" },
  { id: "INS-2026-120", project: "RF-2026-001", point: "Anoda & hull survey", itp: "ITP-001", status: "Dalam Proses", date: "2026-07-26" },
  { id: "INS-2026-121", project: "NB-2025-014", point: "Pemeriksaan prop shaft", itp: "ITP-014", status: "Terjadwal", date: "2026-08-02" },
];

const ncrTone: Record<string, "red" | "amber" | "blue" | "green"> = {
  Terbuka: "amber",
  "Dalam Perbaikan": "blue",
  Tertutup: "green",
};

export default function QCSafety() {
  const [tab, setTab] = useState("Inspeksi");

  return (
    <div>
      <PageHeader
        title="Quality Control & Safety"
        subtitle="Inspeksi, NCR, insiden, dan kepatuhan HSE"
        icon={<ShieldCheck className="h-5 w-5" />}
        actions={<button className="btn-primary-gradient"><Plus className="h-4 w-4" /> Inspeksi Baru</button>}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="NCR Terbuka" value={String(ncrList.filter((n) => n.status !== "Tertutup").length)} delta="1 critical" deltaDirection="down" icon={<AlertTriangle className="h-5 w-5" />} chip="rose" spark={sparkUtil} />
        <KpiCard label="Inspeksi Bulan Ini" value="190" delta="3 NCR terbit" deltaDirection="flat" icon={<ShieldCheck className="h-5 w-5" />} chip="navy" />
        <KpiCard label="Insiden (YTD)" value="9" delta="2 near miss" deltaDirection="down" icon={<Siren className="h-5 w-5" />} chip="amber" />
        <KpiCard label="HSE Score" value="A" delta="Kinerja baik" deltaDirection="up" icon={<Award className="h-5 w-5" />} chip="teal" />
      </div>

      <div className="mt-4 card">
        <Tabs tabs={["Inspeksi (ITP)", "NCR", "Insiden", "Sertifikat"]} active={tab} onChange={setTab} />
        <div className="p-4">
          {tab === "Inspeksi (ITP)" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <Card>
                  <CardHeader title="Distribusi NCR" subtitle="Per kategori kejadian" />
                  <div className="flex items-center gap-4 p-4 pt-0">
                    <Donut data={ncrStats} colors={ncrStats.map((d) => d.color)} size={130} thickness={18} centerValue="31" centerLabel="NCR" />
                    <div className="flex-1 space-y-1.5">
                      {ncrStats.map((d) => (
                        <div key={d.name} className="flex items-center gap-2 text-sm">
                          <span className="h-3 w-3 rounded-sm" style={{ background: d.color }} />
                          <span className="truncate text-steel-600">{d.name}</span>
                          <span className="ml-auto font-semibold text-navy-900">{d.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </Card>
                <Card className="lg:col-span-2">
                  <CardHeader title="Inspeksi & Tingkat Kelulusan" subtitle="Total inspeksi vs yang lulus per bulan" />
                  <div className="h-44 p-4 pt-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={inspectionTrend} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e9eff4" vertical={false} />
                        <XAxis dataKey="month" stroke="#8aa2b6" axisLine={false} tickLine={false} />
                        <YAxis stroke="#8aa2b6" axisLine={false} tickLine={false} />
                        <Tooltip content={<ChartTooltip />} />
                        <Bar dataKey="inspeksi" name="Inspeksi" fill="#8cc9e8" radius={[4, 4, 0, 0]} barSize={18} />
                        <Line type="monotone" dataKey="lulus" name="Lulus" stroke="#1f9d55" strokeWidth={2.5} dot={{ r: 3 }} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-surface">
                    <tr><th className="th">Inspeksi</th><th className="th">Proyek</th><th className="th">Titik Inspeksi</th><th className="th">ITP</th><th className="th">Tanggal</th><th className="th">Hasil</th></tr>
                  </thead>
                  <tbody className="divide-y divide-steel-100">
                    {inspections.map((i) => (
                      <tr key={i.id} className="hover:bg-surface">
                        <td className="td font-mono font-medium text-navy-900">{i.id}</td>
                        <td className="td text-steel-600 font-mono text-xs">{i.project}</td>
                        <td className="td text-steel-600">{i.point}</td>
                        <td className="td text-steel-600 font-mono text-xs">{i.itp}</td>
                        <td className="td text-steel-600">{i.date}</td>
                        <td className="td"><StatusBadge status={i.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === "NCR" && (
            <div className="space-y-3">
              {ncrList.map((n) => (
                <Card key={n.id} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-navy-900 font-mono">{n.id}</p>
                        <Badge tone={n.severity === "Critical" ? "red" : n.severity === "Major" ? "amber" : "blue"}>{n.severity}</Badge>
                      </div>
                      <p className="mt-1 text-sm text-steel-700">{n.issue}</p>
                      <p className="text-xs text-steel-500 mt-0.5">{n.project} · {n.vessel} · {n.type} · {n.raised}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={ncrTone[n.status] ?? "gray"}>{n.status}</Badge>
                      <button className="btn-secondary text-xs">Detail</button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {tab === "Insiden" && (
            <div className="space-y-3">
              {incidents.map((i) => (
                <Card key={i.id} className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-navy-900 font-mono">{i.id}</p>
                        <Badge tone={i.type === "Near Miss" ? "amber" : "blue"}>{i.type}</Badge>
                      </div>
                      <p className="mt-1 text-sm text-steel-700">{i.desc}</p>
                      <p className="text-xs text-steel-500 mt-0.5">{i.date} · {i.location} · Severity {i.severity}</p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {tab === "Sertifikat" && (
            <div className="space-y-4">
              {vessels.map((v) => (
                <div key={v.id}>
                  <h3 className="mb-2 text-sm font-semibold text-navy-900">{v.name}</h3>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {v.certificates.map((c) => {
                      const tone = c.tone as "green" | "amber" | "red";
                      return (
                        <Card key={c.name} className="p-3">
                          <p className="text-sm font-medium text-navy-900">{c.name}</p>
                          <p className="text-xs text-steel-500">Exp: {c.expires}</p>
                          <Badge tone={tone} className="mt-1">{tone === "green" ? "Berlaku" : tone === "amber" ? "Hampir Expire" : "Kedaluwarsa"}</Badge>
                        </Card>
                      );
                    })}
                    {v.certificates.length === 0 && <p className="text-xs text-steel-400">Belum ada sertifikat (dalam pembangunan)</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
