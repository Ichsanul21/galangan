import { useState } from "react";
import { Plus, Cpu, Wrench, AlertTriangle, Gauge } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Card, CardHeader, PageHeader, Badge, KpiCard, Tabs, ProgressBar, ChartTooltip, RadialGauge } from "../../components/ui";
import { equipment, equipmentHours, sparkUtil } from "../../data";

export default function EquipmentPage() {
  const [tab, setTab] = useState("Register");
  const statusTone: Record<string, "green" | "blue" | "amber" | "gray"> = {
    Tersedia: "green",
    Terpakai: "blue",
    Maintenance: "amber",
  };

  const maintenance = equipment.filter((e) => e.status === "Maintenance").length;
  const avgUtil = Math.round(equipment.reduce((s, e) => s + e.util, 0) / equipment.length);

  return (
    <div>
      <PageHeader
        title="Utilisasi Equipment Galangan"
        subtitle="Asset register, alokasi, dan jadwal maintenance peralatan"
        icon={<Cpu className="h-5 w-5" />}
        actions={<button className="btn-primary-gradient"><Plus className="h-4 w-4" /> Tambah Equipment</button>}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total Equipment" value={String(equipment.length)} icon={<Cpu className="h-5 w-5" />} chip="navy" spark={sparkUtil} hint="Seluruh cabang" />
        <KpiCard label="Utilitas Rata-rata" value={`${avgUtil}%`} delta="Target 75%" deltaDirection="flat" icon={<Gauge className="h-5 w-5" />} chip="teal" />
        <KpiCard label="Dalam Maintenance" value={String(maintenance)} delta="Jadwal servis" deltaDirection="down" icon={<Wrench className="h-5 w-5" />} chip="amber" />
        <KpiCard label="Perlu Servis (30 hari)" value="2" delta="SMAW-05 & MCR-100" deltaDirection="down" icon={<AlertTriangle className="h-5 w-5" />} chip="rose" />
      </div>

      <div className="mt-4 card">
        <Tabs tabs={["Register", "Alokasi / Booking", "Maintenance", "Utilisasi"]} active={tab} onChange={setTab} />
        <div className="p-4">
          {tab === "Register" && (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-surface">
                  <tr><th className="th">Equipment</th><th className="th">Kategori</th><th className="th">Model</th><th className="th">Status</th><th className="th">Utilisasi</th><th className="th">Jam Pakai</th></tr>
                </thead>
                <tbody className="divide-y divide-steel-100">
                  {equipment.map((e) => (
                    <tr key={e.id} className="hover:bg-surface">
                      <td className="td">
                        <p className="font-medium text-navy-900">{e.name}</p>
                        <p className="text-xs text-steel-500 font-mono">{e.code}</p>
                      </td>
                      <td className="td"><Badge tone="gray">{e.category}</Badge></td>
                      <td className="td text-steel-600">{e.model}</td>
                      <td className="td"><Badge tone={statusTone[e.status] ?? "gray"}>{e.status}</Badge></td>
                      <td className="td">
                        <div className="flex items-center gap-2">
                          <ProgressBar value={e.util} className="w-20" tone={e.util > 75 ? "amber" : "navy"} />
                          <span className="text-xs font-medium">{e.util}%</span>
                        </div>
                      </td>
                      <td className="td text-steel-600 font-mono text-xs">{e.lastHours.toLocaleString()} jam</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === "Alokasi / Booking" && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card className="p-5">
                <h3 className="mb-3 text-sm font-semibold text-navy-900">Booking Berjalan</h3>
                <div className="space-y-2.5">
                  {[
                    { equip: "Mobile Crane 100T", proyek: "NB-2025-012", jam: "08:00–17:00", status: "Terpakai" },
                    { equip: "Mesin Las MIG-12", proyek: "RP-2026-003", jam: "07:00–16:00", status: "Terpakai" },
                    { equip: "Forklift 10T", proyek: "RP-2026-005", jam: "09:00–15:00", status: "Terpakai" },
                  ].map((b) => (
                    <div key={b.equip} className="flex items-center justify-between border-b border-steel-100 py-2 text-sm">
                      <div>
                        <p className="font-medium text-navy-900">{b.equip}</p>
                        <p className="text-xs text-steel-500">{b.proyek} · {b.jam}</p>
                      </div>
                      <Badge tone="blue">{b.status}</Badge>
                    </div>
                  ))}
                </div>
              </Card>
              <Card className="p-5">
                <h3 className="mb-3 text-sm font-semibold text-navy-900">Deteksi Konflik</h3>
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  <p className="font-medium">2 konflik alokasi</p>
                  <p className="mt-1 text-xs">Mesin Las MIG-12 & Mobile Crane 100T dipesan 2 proyek pada jam yang sama tanggal 2 Agu.</p>
                </div>
                <button className="btn-primary mt-3">Tinjau Jadwal Alokasi</button>
              </Card>
            </div>
          )}

          {tab === "Maintenance" && (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-surface">
                  <tr><th className="th">Equipment</th><th className="th">Jadwal Servis</th><th className="th">Tipe</th><th className="th">Status</th></tr>
                </thead>
                <tbody className="divide-y divide-steel-100">
                  {equipment.map((e) => (
                    <tr key={e.id} className="hover:bg-surface">
                      <td className="td font-medium text-navy-900">{e.name}</td>
                      <td className="td text-steel-600">{e.nextService}</td>
                      <td className="td"><Badge tone="gray">Preventive</Badge></td>
                      <td className="td"><Badge tone={e.status === "Maintenance" ? "amber" : "green"}>{e.status === "Maintenance" ? "Dalam Servis" : "Terjadwal"}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === "Utilisasi" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <Card className="p-5">
                  <CardHeader title="Utilitas Keseluruhan" />
                  <div className="flex items-center justify-center">
                    <RadialGauge value={avgUtil} label="Equipment" size={140} />
                  </div>
                  <p className="mt-2 text-center text-xs text-steel-500">Rata-rata seluruh peralatan dari target 75%</p>
                </Card>
                <Card className="lg:col-span-2">
                  <CardHeader title="Jam Pakai per Bulan" subtitle="Total jam operasional semua equipment" />
                  <div className="h-52 p-4 pt-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={equipmentHours} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
                        <defs><linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#2e9ad4" stopOpacity={0.35} /><stop offset="95%" stopColor="#2e9ad4" stopOpacity={0} /></linearGradient></defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e9eff4" vertical={false} />
                        <XAxis dataKey="month" stroke="#8aa2b6" axisLine={false} tickLine={false} />
                        <YAxis stroke="#8aa2b6" axisLine={false} tickLine={false} tickFormatter={(v) => `${Math.round(Number(v) / 1000)}rb`} />
                        <Tooltip content={<ChartTooltip formatter={(v) => `${Number(v).toLocaleString()} jam`} />} />
                        <Area type="monotone" dataKey="jam" stroke="#2e9ad4" strokeWidth={2.5} fill="url(#eqGrad)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {equipment.slice(0, 6).map((e) => (
                  <div key={e.id}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="text-steel-600">{e.name}</span>
                      <span className="font-semibold text-navy-900">{e.util}%</span>
                    </div>
                    <ProgressBar value={e.util} tone={e.util > 75 ? "red" : e.util > 60 ? "amber" : "green"} />
                  </div>
                ))}
              </div>
              <p className="text-xs text-steel-400">Forecast kebutuhan equipment & downtime prediktif tersedia di modul Analytics (Prediktif).</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
