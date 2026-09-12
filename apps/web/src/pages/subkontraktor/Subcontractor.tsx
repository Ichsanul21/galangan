import { useState } from "react";
import { Plus, HardHat, FileSignature, Star } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Card, CardHeader, PageHeader, Badge, KpiCard, Tabs, ProgressBar, ChartTooltip } from "../../components/ui";
import { subcontractors, fmtMiliar, subcontractorScore, sparkRevenue } from "../../data";

const workOrders = [
  { id: "WO-2026-041", sub: "PT Baja Utama Steel", project: "NB-2025-012", scope: "Fabrikasi & blasting section 4-7", progress: 70, status: "Dalam Proses" },
  { id: "WO-2026-042", sub: "CV Pengecatan Marine", project: "RP-2026-003", scope: "Coating lambung & deck", progress: 55, status: "Dalam Proses" },
  { id: "WO-2026-043", sub: "PT Mesinindo Perkasa", project: "RP-2026-005", scope: "Overhaul main engine", progress: 40, status: "Dalam Proses" },
  { id: "WO-2026-044", sub: "CV Scaffold Aman", project: "NB-2025-012", scope: "Perancah hull assembly", progress: 100, status: "Selesai" },
];

const payments = [
  { id: "TRM-001", sub: "PT Baja Utama Steel", progress: "WO-041 (70%)", amount: 2100000000, pph23: "2%", retention: "5%", status: "Belum Dibayar" },
  { id: "TRM-002", sub: "PT Mesinindo Perkasa", progress: "WO-043 (40%)", amount: 1568000000, pph23: "2%", retention: "5%", status: "Disetujui" },
  { id: "TRM-003", sub: "CV Scaffold Aman", progress: "WO-044 (100%)", amount: 450000000, pph23: "2%", retention: "5%", status: "Lunas" },
];

export default function Subcontractor() {
  const [tab, setTab] = useState("Subkontraktor");
  const toneMap: Record<string, "green" | "blue" | "amber" | "red" | "gray" | "navy"> = {
    Aktif: "green",
    Kualifikasi: "amber",
    "Dalam Proses": "blue",
    Selesai: "green",
    Lunas: "green",
    Disetujui: "blue",
    "Belum Dibayar": "amber",
  };

  return (
    <div>
      <PageHeader
        title="Subkontraktor & Pihak Ketiga"
        subtitle="Kontrak, work order, termin, dan evaluasi kinerja"
        icon={<HardHat className="h-5 w-5" />}
        actions={<button className="btn-primary-gradient"><Plus className="h-4 w-4" /> Registrasi Sub</button>}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Subkontraktor Aktif" value={String(subcontractors.filter((s) => s.status === "Aktif").length)} icon={<HardHat className="h-5 w-5" />} chip="navy" spark={sparkRevenue} hint="Terdaftar & tersertifikasi" />
        <KpiCard label="Nilai Kontrak Aktif" value={fmtMiliar(subcontractors.reduce((s, x) => s + x.contract, 0))} icon={<FileSignature className="h-5 w-5" />} chip="teal" />
        <KpiCard label="Work Order Berjalan" value="3" hint="Sedang eksekusi" icon={<HardHat className="h-5 w-5" />} chip="amber" />
        <KpiCard label="Rating Rata-rata" value="86%" delta="Kinerja baik" deltaDirection="up" icon={<Star className="h-5 w-5" />} chip="violet" />
      </div>

      <div className="mt-4 card">
        <Tabs tabs={["Subkontraktor", "Work Order", "Termin & Pembayaran"]} active={tab} onChange={setTab} />
        <div className="p-4">
          {tab === "Subkontraktor" && (
            <div className="space-y-4">
              <Card>
                <CardHeader title="Evaluasi Kinerja Subkontraktor" subtitle="Skor biaya, kualitas, ketepatan kirim & keselamatan" />
                <div className="h-60 p-4 pt-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={subcontractorScore} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e9eff4" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="#8aa2b6" axisLine={false} tickLine={false} interval={0} />
                      <YAxis domain={[70, 100]} stroke="#8aa2b6" axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTooltip formatter={(v) => `${v}`} />} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="cost" name="Biaya" fill="#2e9ad4" radius={[3, 3, 0, 0]} barSize={14} />
                      <Bar dataKey="quality" name="Kualitas" fill="#0b3a63" radius={[3, 3, 0, 0]} barSize={14} />
                      <Bar dataKey="delivery" name="Ketepatan" fill="#0d9488" radius={[3, 3, 0, 0]} barSize={14} />
                      <Bar dataKey="safety" name="K3" fill="#f59e0b" radius={[3, 3, 0, 0]} barSize={14} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {subcontractors.map((s) => (
                <Card key={s.id} className="p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-semibold text-navy-900">{s.name}</p>
                      <p className="text-xs text-steel-500">{s.services}</p>
                    </div>
                    <Badge tone={s.status === "Aktif" ? "green" : "amber"}>{s.status}</Badge>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-lg bg-surface p-2.5">
                      <p className="text-xs text-steel-500">Rating</p>
                      <p className="font-semibold text-navy-900">{s.rating}%</p>
                    </div>
                    <div className="rounded-lg bg-surface p-2.5">
                      <p className="text-xs text-steel-500">K3</p>
                      <p className="font-semibold text-navy-900">{s.k3}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex justify-between text-xs text-steel-500">
                    <span>Kontrak {fmtMiliar(s.contract)}</span>
                    <span>{s.active} WO aktif</span>
                  </div>
                </Card>
              ))}
              </div>
            </div>
          )}

          {tab === "Work Order" && (
            <div className="space-y-3">
              {workOrders.map((w) => (
                <Card key={w.id} className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="font-mono text-sm font-semibold text-navy-900">{w.id}</div>
                      <div className="text-sm text-steel-600">
                        {w.sub} · {w.project}
                        <p className="text-xs text-steel-500">{w.scope}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <ProgressBar value={w.progress} className="w-24" tone={w.status === "Selesai" ? "green" : "navy"} />
                        <span className="text-xs font-medium">{w.progress}%</span>
                      </div>
                      <Badge tone={toneMap[w.status] ?? "gray"}>{w.status}</Badge>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {tab === "Termin & Pembayaran" && (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-surface">
                  <tr><th className="th">Termin</th><th className="th">Subkontraktor</th><th className="th">Progress</th><th className="th">Nilai</th><th className="th">PPh 23</th><th className="th">Retention</th><th className="th">Status</th></tr>
                </thead>
                <tbody className="divide-y divide-steel-100">
                  {payments.map((p) => (
                    <tr key={p.id} className="hover:bg-surface">
                      <td className="td font-mono font-medium text-navy-900">{p.id}</td>
                      <td className="td text-steel-600">{p.sub}</td>
                      <td className="td font-mono text-xs text-steel-500">{p.progress}</td>
                      <td className="td font-semibold">{fmtMiliar(p.amount)}</td>
                      <td className="td text-steel-600">{p.pph23}</td>
                      <td className="td text-steel-600">{p.retention}</td>
                      <td className="td"><Badge tone={toneMap[p.status] ?? "gray"}>{p.status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
