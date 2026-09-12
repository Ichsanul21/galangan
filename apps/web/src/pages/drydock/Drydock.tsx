import { useState } from "react";
import { Plus, Ship, CalendarRange, AlertTriangle, GripVertical, Trash2 } from "lucide-react";
import { Card, CardHeader, PageHeader, Badge, KpiCard, ProgressBar, Modal, Field, FormGrid, ConfirmModal, toast } from "../../components/ui";
import { useStore, type StoreItem } from "../../data/store";
import { drydockLoad, sparkUtil } from "../../data";

const DAYS = 90;
const weeks = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
const SLOT_COLORS = ["bg-ocean-500", "bg-navy-700", "bg-amber-500", "bg-teal-500", "bg-violet-500", "bg-steel-400"];

export default function Drydock() {
  const { data, add, remove, log } = useStore();
  const drydocks = data.drydocks;
  const dockSlots = data.dockSlots;
  const [selected, setSelected] = useState<string | null>(null);

  const [showBook, setShowBook] = useState(false);
  const [bookForm, setBookForm] = useState({ dockId: "DD-1", project: "", from: "1", to: "30" });
  const [deleting, setDeleting] = useState<StoreItem | null>(null);

  const sel = dockSlots.find((s) => s.id === selected) ?? null;

  const util = drydocks.length ? Math.round((drydocks.filter((d) => d.status === "Terpakai").length / drydocks.length) * 100) : 0;

  const overlap = (dockId: string, from: number, to: number, ignore?: string) =>
    dockSlots.some((o) => o.dockId === dockId && o.id !== ignore && from < o.to && o.from < to);

  const conflict = dockSlots.filter((s) => {
    const sameDock = dockSlots.filter((o) => o.dockId === s.dockId && o.id !== s.id);
    return sameDock.some((o) => s.from < o.to && o.from < s.to);
  });
  const hasConflict = conflict.length > 0;

  const saveBooking = () => {
    const proj = data.projects.find((p) => p.id === bookForm.project);
    if (!proj) { toast("Pilih proyek dulu", "info"); return; }
    const from = Number(bookForm.from), to = Number(bookForm.to);
    if (!from || !to || to <= from || from < 0 || to > DAYS) { toast("Rentang hari tidak valid (1–90)", "info"); return; }
    const clash = overlap(bookForm.dockId, from, to);
    const created = add("dockSlots", {
      dockId: bookForm.dockId, project: proj.id, vessel: proj.vessel, from, to,
      color: SLOT_COLORS[dockSlots.length % SLOT_COLORS.length],
    }, { action: "membooking slot", target: `${bookForm.dockId} · ${proj.vessel}`, module: "Drydock" });
    toast(clash ? `Slot ${created.id} dibuat — PERINGATAN: tumpang tindih!` : `Slot ${created.id} dibooking`);
    setShowBook(false);
  };

  return (
    <div>
      <PageHeader
        title="Drydock & Kapasitas"
        subtitle="Penjadwalan slot docking, utilisasi, dan deteksi konflik"
        icon={<Ship className="h-5 w-5" />}
        actions={<button className="btn-primary-gradient" onClick={() => setShowBook(true)}><Plus className="h-4 w-4" /> Booking Slot</button>}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Utilitas Docking" value={`${util}%`} delta={`${drydocks.length} fasilitas`} deltaDirection="flat" icon={<Ship className="h-5 w-5" />} chip="navy" spark={sparkUtil} />
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
            <p className="font-semibold">Deteksi konflik slot ({conflict.length})</p>
            <p>Slot docking tumpang tindih pada fasilitas yang sama: {conflict.map((c) => c.vessel).join(", ")}. Tinjau ulang alokasi untuk menghindari penundaan proyek.</p>
          </div>
        </div>
      )}

      <Card>
        <CardHeader
          title="Gantt Penjadwalan Docking"
          subtitle="Klik slot untuk detail · 13 minggu ke depan"
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
                        const isConf = conflict.some((c) => c.id === s.id);
                        return (
                          <div
                            key={s.id}
                            onClick={() => setSelected(isSel ? null : s.id)}
                            className={`absolute top-1/2 -translate-y-1/2 flex h-10 items-center justify-between rounded-md ${s.color} px-2 text-xs font-medium text-white shadow cursor-pointer transition ${isSel ? "ring-2 ring-navy-900" : "hover:brightness-110"} ${isConf ? "ring-2 ring-rose-500" : ""}`}
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
                <tr><th className="th">Fasilitas</th><th className="th">Proyek</th><th className="th">Durasi</th><th className="th">Aksi</th></tr>
              </thead>
              <tbody className="divide-y divide-steel-100">
                {dockSlots.map((s) => (
                  <tr key={s.id} className="hover:bg-surface">
                    <td className="td text-steel-600">{drydocks.find((d) => d.id === s.dockId)?.name}</td>
                    <td className="td">
                      <p className="font-medium text-navy-900">{s.vessel}</p>
                      <p className="text-xs font-mono text-steel-500">{s.project}</p>
                    </td>
                    <td className="td text-steel-600">{s.from}–{s.to} hari</td>
                    <td className="td">
                      <div className="flex gap-1.5">
                        <button className="btn-secondary text-xs" onClick={() => setSelected(s.id)}>Detail</button>
                        <button className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50" title="Hapus slot" onClick={() => setDeleting(s)}><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
                {dockSlots.length === 0 && <tr><td colSpan={4} className="td text-center text-steel-400">Belum ada slot.</td></tr>}
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

      {/* Modal detail slot */}
      <Modal open={sel !== null} onClose={() => setSelected(null)} title={`Slot ${sel?.id ?? ""}`} subtitle={sel ? `${sel.vessel} · ${sel.project}` : ""}>
        {sel && (
          <dl className="space-y-2.5 text-sm">
            <div className="flex justify-between"><dt className="text-steel-500">Fasilitas</dt><dd className="font-medium">{drydocks.find((d) => d.id === sel.dockId)?.name}</dd></div>
            <div className="flex justify-between"><dt className="text-steel-500">Durasi</dt><dd className="font-medium">Hari {sel.from}–{sel.to} ({sel.to - sel.from} hari)</dd></div>
            <div className="flex justify-between"><dt className="text-steel-500">Konflik</dt><dd>{conflict.some((c) => c.id === sel.id) ? <Badge tone="red">Tumpang tindih</Badge> : <Badge tone="green">Aman</Badge>}</dd></div>
            <button className="btn-danger mt-2 w-full justify-center" onClick={() => { setDeleting(sel); setSelected(null); }}><Trash2 className="h-4 w-4" /> Hapus Slot</button>
          </dl>
        )}
      </Modal>

      {/* Modal booking */}
      <Modal open={showBook} onClose={() => setShowBook(false)} title="Booking Slot Docking" subtitle="Sistem otomatis mendeteksi tumpang tindih"
        footer={<><button className="btn-secondary" onClick={() => setShowBook(false)}>Batal</button><button className="btn-primary" onClick={saveBooking}>Simpan Booking</button></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label="Fasilitas">
              <select className="input" value={bookForm.dockId} onChange={(e) => setBookForm({ ...bookForm, dockId: e.target.value })}>
                {drydocks.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </Field>
            <Field label="Proyek">
              <select className="input" value={bookForm.project} onChange={(e) => setBookForm({ ...bookForm, project: e.target.value })}>
                <option value="">Pilih proyek…</option>
                {data.projects.filter((p) => p.status !== "Selesai").map((p) => <option key={p.id} value={p.id}>{p.id} · {p.vessel}</option>)}
              </select>
            </Field>
            <Field label="Mulai (hari ke-)"><input type="number" min={0} max={90} className="input" value={bookForm.from} onChange={(e) => setBookForm({ ...bookForm, from: e.target.value })} /></Field>
            <Field label="Selesai (hari ke-)"><input type="number" min={1} max={90} className="input" value={bookForm.to} onChange={(e) => setBookForm({ ...bookForm, to: e.target.value })} /></Field>
          </FormGrid>
          {bookForm.project && overlap(bookForm.dockId, Number(bookForm.from) || 0, Number(bookForm.to) || 0) && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">Peringatan: rentang ini tumpang tindih dengan slot lain di fasilitas yang sama.</p>
          )}
        </div>
      </Modal>

      <ConfirmModal open={deleting !== null} title={`Hapus slot ${deleting?.id}?`} desc={`${deleting?.vessel} akan dikeluarkan dari jadwal docking.`}
        confirmLabel="Ya, hapus" danger onCancel={() => setDeleting(null)}
        onConfirm={() => { if (deleting) { remove("dockSlots", deleting.id); log("menghapus slot", `${deleting.id} · ${deleting.vessel}`, "Drydock"); toast("Slot dihapus", "info"); } setDeleting(null); }} />
    </div>
  );
}
