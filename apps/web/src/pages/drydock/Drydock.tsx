import { useState } from "react";
import { Plus, Ship, CalendarRange, AlertTriangle, GripVertical } from "lucide-react";
import { Card, CardHeader, PageHeader, Badge, KpiCard, ProgressBar } from "../../components/ui";
import { drydocks, dockSlots, drydockLoad, sparkUtil } from "../../data";

const DAYS = 90;
const weeks = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

export default function Drydock() {
  const [selected, setSelected] = useState<string | null>(null);
  const util = Math.round((drydocks.filter((d) => d.status === "Terpakai").length / drydocks.length) * 100);

  const conflict = dockSlots.filter((s) => {
    const sameDock = dockSlots.filter((o) => o.dockId === s.dockId && o.id !== s.id);
    return sameDock.some((o) => s.from < o.to && o.from < s.to);
  });
  const hasConflict = conflict.length > 0;

  return (
    <div>
      <PageHeader
        title="Drydock & Kapasitas"
        subtitle="Penjadwalan slot docking, utilisasi, dan deteksi konflik"
        icon={<Ship className="h-5 w-5" />}
        actions={<button className="btn-primary-gradient"><Plus className="h-4 w-4" /> Booking Slot</button>}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Utilitas Docking" value={`${util}%`} delta="4 fasilitas" deltaDirection="flat" icon={<Ship className="h-5 w-5" />} chip="navy" spark={sparkUtil} />
        <KpiCard label="Slot Terisi" value={`${drydocks.filter((d) => d.status === "Terpakai").length}/${drydocks.length}`} hint="Saat ini aktif" icon={<CalendarRange className="h-5 w-5" />} chip="teal" />
        <KpiCard
          label="Konflik Slot"
          value={hasConflict ? String(conflict.length) : "0"}
          delta={hasConflict ? "Perlu atasi" : "Tidak ada"}
          deltaDirection={hasConflict ? "down" : "up"}
          icon={<AlertTriangle className="h-5 w-5" />}
          chip={hasConflict ? "rose" : "green"}
        />
        <KpiCard label="Kapasitas Berikutnya" value="Okt 2026" hint="Slot kosong terdekat" chip="amber" />
      </div>

      {hasConflict && (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Deteksi konflik slot</p>
            <p>Slot docking tumpang tindih pada fasilitas yang sama. Tinjau ulang alokasi untuk menghindari penundaan proyek.</p>
          </div>
        </div>
      )}

      <Card>
        <CardHeader
          title="Gantt Penjadwalan Docking"
          subtitle="Drag & drop untuk menggeser slot · 13 minggu ke depan"
          action={<Badge tone="navy">90 hari</Badge>}
        />
        <div className="overflow-x-auto p-4">
          <div className="min-w-[900px]">
            {/* Header weeks */}
            <div className="mb-2 flex items-center">
              <div className="w-52 shrink-0 pr-3" />
              <div className="flex flex-1 gap-px">
                {weeks.map((w) => (
                  <div key={w} className="flex-1 border-l border-steel-200 pl-1 text-[10px] text-steel-400">
                    W{w}
                  </div>
                ))}
              </div>
            </div>

            {drydocks.map((dock) => {
              const slots = dockSlots.filter((s) => s.dockId === dock.id);
              return (
                <div key={dock.id} className="mb-5">
                  <div className="mb-1 flex items-center justify-between">
                    <p className="text-sm font-semibold text-navy-900">{dock.name}</p>
                    <Badge tone={dock.status === "Terpakai" ? "blue" : "green"}>{dock.status}</Badge>
                  </div>
                  <div className="flex items-center gap-px">
                    <div className="w-52 shrink-0 pr-3">
                      <p className="text-xs text-steel-500">{dock.capacity}</p>
                    </div>
                    <div className="relative h-16 flex-1 rounded-lg bg-steel-50 border border-steel-100"
                      style={{
                        backgroundImage: "repeating-linear-gradient(to right, #e9eff4 0, #e9eff4 1px, transparent 1px, transparent calc(100%/13))",
                      }}
                    >
                      {slots.map((s) => {
                        const leftPct = (s.from / DAYS) * 100;
                        const widthPct = ((s.to - s.from) / DAYS) * 100;
                        const isSel = selected === s.id;
                        return (
                          <div
                            key={s.id}
                            onClick={() => setSelected(isSel ? null : s.id)}
                            className={`absolute top-1/2 -translate-y-1/2 flex h-10 items-center justify-between rounded-md ${s.color} px-2 text-xs font-medium text-white shadow cursor-pointer transition ${isSel ? "ring-2 ring-navy-900" : "hover:brightness-110"}`}
                            style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                            title={`${s.vessel} · ${s.project}`}
                          >
                            <span className="truncate min-w-0 flex-1 flex items-center gap-1">
                              <GripVertical className="h-3 w-3 shrink-0 opacity-70" />
                              {s.vessel}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Slot Docking Aktif" subtitle="Detail slot saat ini" />
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-surface">
                <tr><th className="th">Fasilitas</th><th className="th">Proyek</th><th className="th">Durasi</th><th className="th">Warna</th></tr>
              </thead>
              <tbody className="divide-y divide-steel-100">
                {dockSlots.slice(0, 4).map((s) => (
                  <tr key={s.id} className="hover:bg-surface">
                    <td className="td text-steel-600">{drydocks.find((d) => d.id === s.dockId)?.name}</td>
                    <td className="td">
                      <p className="font-medium text-navy-900">{s.vessel}</p>
                      <p className="text-xs font-mono text-steel-500">{s.project}</p>
                    </td>
                    <td className="td text-steel-600">{s.from}–{s.to} hari</td>
                    <td className="td"><span className={`inline-block h-3 w-3 rounded ${s.color}`} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="mb-3 text-sm font-semibold text-navy-900">Forecast Kapasitas</h3>
          <div className="space-y-3">
            {drydockLoad.map((d) => (
              <div key={d.dock}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="text-steel-600">{d.dock}</span>
                  <span className="font-semibold text-navy-900">{d.kapasitas}%</span>
                </div>
                <ProgressBar value={d.kapasitas} tone={d.kapasitas > 80 ? "red" : d.kapasitas > 60 ? "amber" : "green"} />
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-steel-400">Prediksi utilisasi — Drydock 1 saat ini paling padat (92%).</p>
        </Card>
      </div>
    </div>
  );
}
