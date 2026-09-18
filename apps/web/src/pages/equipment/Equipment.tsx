import { useState } from "react";
import { Plus, Cpu, Wrench, AlertTriangle, Gauge, CheckCircle2 } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Card, CardHeader, PageHeader, Badge, KpiCard, Tabs, ProgressBar, ChartTooltip, RadialGauge, Modal, Field, FormGrid, EmptyState, toast } from "../../components/ui";
import { useStore } from "../../data/store";
import type { StoreItem } from "../../data/store";
import { equipmentHours, sparkUtil, equipTotalTrend, maintTrend, serviceDueTrend } from "../../data";
import { fmtTanggal, fmtJumlah, todayISO } from "../../utils/format";

function toMinutes(t: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

function parseJam(jam: string): { mulai: string; selesai: string } | null {
  const m = /(\d{1,2}:\d{2})\s*[–—-]\s*(\d{1,2}:\d{2})/.exec(jam ?? "");
  if (!m) return null;
  return { mulai: m[1], selesai: m[2] };
}

function bookingRange(b: StoreItem): { mulai: number; selesai: number } | null {
  const rawMulai = typeof b.mulai === "string" && b.mulai ? b.mulai : parseJam(String(b.jam ?? ""))?.mulai;
  const rawSelesai = typeof b.selesai === "string" && b.selesai ? b.selesai : parseJam(String(b.jam ?? ""))?.selesai;
  if (!rawMulai || !rawSelesai) return null;
  const a = toMinutes(rawMulai);
  const c = toMinutes(rawSelesai);
  if (a === null || c === null) return null;
  return { mulai: a, selesai: c };
}

function rangesOverlap(a0: number, a1: number, b0: number, b1: number): boolean {
  return a0 < b1 && b0 < a1;
}

function durationHours(mulai: string, selesai: string): number {
  const a = toMinutes(mulai);
  const b = toMinutes(selesai);
  if (a === null || b === null || b <= a) return 0;
  return Math.round(((b - a) / 60) * 10) / 10;
}

function daysUntil(dateISO: string, today: string): number | null {
  if (!dateISO || dateISO === "-") return null;
  const ms = Date.parse(dateISO) - Date.parse(today);
  if (Number.isNaN(ms)) return null;
  return Math.floor(ms / 86400000);
}

export default function EquipmentPage() {
  const { data, add, update, log } = useStore();
  const equipment = data.equipment;
  const bookings = data.bookings;
  const [tab, setTab] = useState("Register");

  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", category: "Pengangkat", code: "", branch: "Samarinda", model: "", util: "50" });
  const [showService, setShowService] = useState(false);
  const [svcDate, setSvcDate] = useState("");
  const [svcTarget, setSvcTarget] = useState("");

  const [showBook, setShowBook] = useState(false);
  const [bookForm, setBookForm] = useState({ equip: "", proyek: "", date: todayISO(), mulai: "", selesai: "" });
  const [bookError, setBookError] = useState<string | null>(null);

  const [finishing, setFinishing] = useState<StoreItem | null>(null);
  const [finishHours, setFinishHours] = useState("");

  const [maintaining, setMaintaining] = useState<StoreItem | null>(null);
  const [maintNote, setMaintNote] = useState("");
  const [maintEta, setMaintEta] = useState("");

  const [recording, setRecording] = useState<StoreItem | null>(null);
  const [woForm, setWoForm] = useState({ tanggal: todayISO(), teknisi: "", catatan: "", hours: "", next: "" });

  const today = todayISO();

  const statusTone: Record<string, "green" | "blue" | "amber" | "gray"> = {
    Tersedia: "green",
    Terpakai: "blue",
    Maintenance: "amber",
  };

  const maintenance = equipment.filter((e) => e.status === "Maintenance").length;
  const avgUtil = equipment.length ? Math.round(equipment.reduce((s, e) => s + Number(e.util || 0), 0) / equipment.length) : 0;
  const dueSoon = equipment.filter((e) => {
    const d = daysUntil(String(e.nextService ?? ""), today);
    return d !== null && d <= 14;
  });

  const activeBookings = bookings.filter((b) => b.status !== "Selesai");
  const conflictIds = new Set<string>();
  for (let i = 0; i < activeBookings.length; i++) {
    for (let j = i + 1; j < activeBookings.length; j++) {
      const a = activeBookings[i];
      const b = activeBookings[j];
      if (a.equip !== b.equip || a.date !== b.date) continue;
      const ra = bookingRange(a);
      const rb = bookingRange(b);
      if (ra && rb && rangesOverlap(ra.mulai, ra.selesai, rb.mulai, rb.selesai)) {
        conflictIds.add(a.id);
        conflictIds.add(b.id);
      }
    }
  }
  const conflictList = activeBookings.filter((b) => conflictIds.has(b.id));

  const saveAdd = () => {
    if (!form.name.trim() || !form.code.trim()) { toast("Nama & kode wajib diisi", "info"); return; }
    const created = add("equipment", {
      name: form.name.trim(), category: form.category, code: form.code.trim().toUpperCase(), branch: form.branch,
      status: "Tersedia", util: Number(form.util) || 0, nextService: "-", lastHours: 0, model: form.model.trim() || "-",
    }, { action: "mendaftarkan equipment", module: "Equipment" });
    toast(`Equipment ${created.id} ditambahkan`);
    setShowAdd(false);
    setForm({ name: "", category: "Pengangkat", code: "", branch: "Samarinda", model: "", util: "50" });
  };

  const saveService = () => {
    if (!svcTarget || !svcDate) { toast("Pilih equipment & tanggal servis (wajib diisi)", "info"); return; }
    const target = equipment.find((e) => e.id === svcTarget);
    update("equipment", svcTarget, { nextService: svcDate });
    log("menjadwalkan servis", `${target?.name ?? svcTarget} · ${fmtTanggal(svcDate)}`, "Equipment");
    toast("Jadwal servis diperbarui");
    setShowService(false);
    setSvcDate("");
    setSvcTarget("");
  };

  const openRecord = (eq: StoreItem) => {
    setRecording(eq);
    setWoForm({ tanggal: todayISO(), teknisi: "", catatan: "", hours: String(eq.lastHours ?? 0), next: typeof eq.nextService === "string" && eq.nextService !== "-" ? eq.nextService : "" });
  };

  const saveRecord = () => {
    if (!recording) return;
    if (!woForm.tanggal || !woForm.teknisi.trim() || !woForm.hours) { toast("Tanggal, teknisi & hour-meter wajib diisi", "info"); return; }
    const hours = Number(woForm.hours);
    if (!Number.isFinite(hours) || hours < 0) { toast("Hour-meter tidak valid", "info"); return; }
    update("equipment", recording.id, {
      lastHours: hours,
      nextService: woForm.next || recording.nextService,
      status: recording.status === "Maintenance" ? "Tersedia" : recording.status,
    });
    log("mencatat servis", `${recording.name} · ${fmtTanggal(woForm.tanggal)}${woForm.catatan.trim() ? ` · ${woForm.catatan.trim()}` : ""}`, "Equipment");
    toast(`Servis ${recording.name} dicatat`);
    setRecording(null);
  };

  const startMaintenance = () => {
    if (!maintaining) return;
    if (!maintNote.trim() || !maintEta) { toast("Catatan & estimasi selesai wajib diisi", "info"); return; }
    update("equipment", maintaining.id, { status: "Maintenance", maintenanceNote: maintNote.trim(), maintenanceEta: maintEta });
    log("memasukkan maintenance", `${maintaining.name} · selesai ${fmtTanggal(maintEta)}`, "Equipment");
    toast(`${maintaining.name} masuk maintenance`);
    setMaintaining(null);
    setMaintNote("");
    setMaintEta("");
  };

  const endMaintenance = (eq: StoreItem) => {
    update("equipment", eq.id, { status: "Tersedia", maintenanceNote: "", maintenanceEta: "" });
    log("menyelesaikan maintenance", eq.name, "Equipment");
    toast(`${eq.name} kembali Tersedia`);
  };

  const saveBooking = () => {
    const { equip, proyek, date, mulai, selesai } = bookForm;
    if (!equip || !proyek || !date || !mulai || !selesai) {
      setBookError("Lengkapi equipment, proyek, tanggal, jam mulai & jam selesai.");
      return;
    }
    const a = toMinutes(mulai);
    const b = toMinutes(selesai);
    if (a === null || b === null || b <= a) {
      setBookError("Jam selesai harus lebih besar dari jam mulai (format HH:MM).");
      return;
    }
    const eq = equipment.find((e) => e.name === equip);
    if (!eq) { setBookError("Equipment tidak ditemukan."); return; }
    if (eq.status === "Maintenance") {
      const msg = `Booking ditolak: ${equip} sedang maintenance.`;
      setBookError(msg);
      toast(msg, "info");
      return;
    }
    const clash = bookings.some((o) => {
      if (o.equip !== equip || o.date !== date || o.status === "Selesai") return false;
      const r = bookingRange(o);
      return r ? rangesOverlap(a, b, r.mulai, r.selesai) : false;
    });
    if (clash) {
      const msg = `Booking ditolak: ${equip} sudah terbooking pada ${fmtTanggal(date)} di rentang jam tersebut.`;
      setBookError(msg);
      toast(msg, "info");
      return;
    }
    const created = add("bookings", { equip, proyek, jam: `${mulai}–${selesai}`, mulai, selesai, status: "Terjadwal", date },
      { action: "membooking equipment", target: `${equip}`, module: "Equipment" });
    update("equipment", eq.id, { status: "Terpakai" });
    toast(`Booking ${created.id} dibuat`);
    setShowBook(false);
    setBookError(null);
    setBookForm({ equip: "", proyek: "", date: todayISO(), mulai: "", selesai: "" });
  };

  const openFinish = (b: StoreItem) => {
    const r = bookingRange(b);
    setFinishing(b);
    setFinishHours(r ? String(durationHours(minutesToStr(r.mulai), minutesToStr(r.selesai))) : "");
  };

  const confirmFinish = () => {
    if (!finishing) return;
    const hours = Number(finishHours);
    if (!Number.isFinite(hours) || hours <= 0) { toast("Jam pakai harus lebih dari 0", "info"); return; }
    const eq = equipment.find((e) => e.name === finishing.equip);
    update("bookings", finishing.id, { status: "Selesai" });
    if (eq) {
      const stillActive = bookings.some((o) => o.id !== finishing.id && o.equip === eq.name && o.status !== "Selesai");
      update("equipment", eq.id, {
        lastHours: Number(eq.lastHours || 0) + hours,
        status: stillActive ? eq.status : "Tersedia",
      });
    }
    log("menyelesaikan booking", `${finishing.equip} · ${fmtTanggal(String(finishing.date))} · ${hours} jam`, "Equipment");
    toast(`Booking ${finishing.id} diselesaikan`);
    setFinishing(null);
    setFinishHours("");
  };

  return (
    <div>
      <PageHeader
        title="Utilisasi Equipment Galangan"
        subtitle="Asset register, alokasi, dan jadwal maintenance peralatan"
        icon={<Cpu className="h-5 w-5" />}
        actions={<button className="btn-primary-gradient" onClick={() => setShowAdd(true)}><Plus className="h-4 w-4" /> Tambah Equipment</button>}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total Equipment" value={String(equipment.length)} icon={<Cpu className="h-5 w-5" />} chip="navy" spark={equipTotalTrend} hint="Seluruh cabang" />
        <KpiCard label="Utilitas Rata-rata" value={`${avgUtil}%`} icon={<Gauge className="h-5 w-5" />} chip="teal" hint="Rata-rata seluruh peralatan" spark={sparkUtil} />
        <KpiCard label="Dalam Maintenance" value={String(maintenance)} delta="Jadwal servis" deltaDirection="down" icon={<Wrench className="h-5 w-5" />} chip="amber" spark={maintTrend} />
        <KpiCard
          label="Perlu Servis (14 hari)"
          value={String(dueSoon.length)}
          delta={dueSoon.length > 0 ? dueSoon.slice(0, 2).map((e) => e.name).join(" · ") : "Semua terjadwal aman"}
          deltaDirection={dueSoon.length > 0 ? "down" : "up"}
          icon={<AlertTriangle className="h-5 w-5" />}
          chip="rose"
          spark={serviceDueTrend}
        />
      </div>

      <div className="mt-4 card">
        <Tabs tabs={["Register", "Alokasi / Booking", "Maintenance", "Utilisasi"]} active={tab} onChange={setTab} />
        <div className="p-4">
          {tab === "Register" && (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="sticky top-0 z-10 bg-surface">
                  <tr><th className="th">Equipment</th><th className="th">Kategori</th><th className="th">Model</th><th className="th">Status</th><th className="th">Utilisasi</th><th className="th">Jam Pakai</th><th className="th">Aksi</th></tr>
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
                      <td className="td text-steel-600 font-mono text-xs">{fmtJumlah(Number(e.lastHours || 0))} jam</td>
                      <td className="td">
                        {e.status === "Tersedia" && (
                          <button className="btn-secondary text-xs" onClick={() => { setMaintaining(e); setMaintNote(""); setMaintEta(""); }}>
                            <Wrench className="h-3.5 w-3.5" /> Maintenance
                          </button>
                        )}
                        {e.status === "Maintenance" && (
                          <button className="btn-secondary text-xs" onClick={() => endMaintenance(e)}>
                            <CheckCircle2 className="h-3.5 w-3.5" /> Kembali Tersedia
                          </button>
                        )}
                        {e.status === "Terpakai" && (
                          <span className="text-xs text-steel-500">Aktif via booking — selesaikan dari tab Booking</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === "Alokasi / Booking" && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card className="p-5">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-navy-900">Booking Berjalan</h3>
                  <button className="btn-secondary text-xs" onClick={() => { setShowBook(true); setBookError(null); }}><Plus className="h-3.5 w-3.5" /> Booking</button>
                </div>
                <div className="space-y-2.5">
                  {activeBookings.map((b) => (
                    <div key={b.id} className="flex items-center justify-between gap-2 border-b border-steel-100 py-2 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-navy-900" title={b.equip}>{b.equip}</p>
                        <p className="text-xs text-steel-500">{b.proyek} · {b.jam} · {fmtTanggal(String(b.date))}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge tone={b.status === "Terpakai" ? "blue" : "gray"}>{b.status}</Badge>
                        <button className="btn-secondary text-xs" onClick={() => openFinish(b)}>
                          <CheckCircle2 className="h-3.5 w-3.5" /> Selesaikan
                        </button>
                      </div>
                    </div>
                  ))}
                  {activeBookings.length === 0 && (
                    <EmptyState title="Belum ada booking aktif" subtitle="Buat booking baru untuk mengalokasikan equipment ke proyek." />
                  )}
                </div>
              </Card>
              <Card className="p-5">
                <h3 className="mb-3 text-sm font-semibold text-navy-900">Deteksi Konflik Jadwal</h3>
                {conflictList.length === 0 ? (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                    <p className="font-medium">Tidak ada konflik</p>
                    <p className="mt-1 text-xs">Tidak ada equipment yang terbooking ganda pada tanggal & jam yang beririsan.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                      <p className="font-medium">{conflictList.length} booking bertabrakan</p>
                      <p className="mt-1 text-xs">Sesuaikan jam atau tanggal booking berikut agar tidak beririsan.</p>
                    </div>
                    {conflictList.map((b) => (
                      <div key={b.id} className="flex items-center justify-between rounded-lg border border-red-200 px-3 py-2 text-sm">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-navy-900" title={`${b.equip} · ${b.proyek}`}>{b.equip} · {b.proyek}</p>
                          <p className="text-xs text-steel-500">{b.jam} · {fmtTanggal(String(b.date))}</p>
                        </div>
                        <Badge tone="red">Bentrok</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          )}

          {tab === "Maintenance" && (
            <div>
              <div className="mb-3 flex justify-end">
                <button className="btn-secondary text-xs" onClick={() => setShowService(true)}><Wrench className="h-3.5 w-3.5" /> Jadwalkan Servis</button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="sticky top-0 z-10 bg-surface">
                    <tr><th className="th">Equipment</th><th className="th">Jadwal Servis</th><th className="th">Catatan / Estimasi</th><th className="th">Status</th><th className="th">Aksi</th></tr>
                  </thead>
                  <tbody className="divide-y divide-steel-100">
                    {equipment.map((e) => (
                      <tr key={e.id} className="hover:bg-surface">
                        <td className="td font-medium text-navy-900">{e.name}</td>
                        <td className="td text-steel-600">{fmtTanggal(typeof e.nextService === "string" ? e.nextService : "")}</td>
                        <td className="td text-xs text-steel-600">
                          {e.status === "Maintenance" && e.maintenanceNote
                            ? `${e.maintenanceNote}${e.maintenanceEta ? ` · selesai ${fmtTanggal(String(e.maintenanceEta))}` : ""}`
                            : <span className="text-steel-400">—</span>}
                        </td>
                        <td className="td"><Badge tone={e.status === "Maintenance" ? "amber" : "green"}>{e.status === "Maintenance" ? "Dalam Servis" : "Terjadwal"}</Badge></td>
                        <td className="td">
                          <button className="btn-secondary text-xs" onClick={() => openRecord(e)}>Catat Servis</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
                  <p className="mt-2 text-center text-xs text-steel-500">Rata-rata utilisasi seluruh peralatan</p>
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
                        <Tooltip content={<ChartTooltip formatter={(v) => `${fmtJumlah(Number(v))} jam`} />} />
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

      {/* Modal tambah */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Tambah Equipment"
        wide footer={<><button className="btn-secondary" onClick={() => setShowAdd(false)}>Batal</button><button className="btn-primary" onClick={saveAdd}>Simpan</button></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label="Nama equipment"><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="cth: Excavator Mini" /></Field>
            <Field label="Kode aset"><input className="input font-mono" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="cth: EXC-01" /></Field>
            <Field label="Kategori">
              <select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {["Pengangkat", "Pengelasan", "Tenaga", "Transportasi", "Pengecatan", "Lainnya"].map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Cabang">
              <select className="input" value={form.branch} onChange={(e) => setForm({ ...form, branch: e.target.value })}>
                <option>Samarinda</option>
              </select>
            </Field>
            <Field label="Model"><input className="input" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} /></Field>
            <Field label="Utilisasi awal (%)"><input type="number" className="input" value={form.util} onChange={(e) => setForm({ ...form, util: e.target.value })} /></Field>
          </FormGrid>
        </div>
      </Modal>

      {/* Modal servis */}
      <Modal open={showService} onClose={() => setShowService(false)} title="Jadwalkan Servis"
        footer={<><button className="btn-secondary" onClick={() => setShowService(false)}>Batal</button><button className="btn-primary" onClick={saveService}>Simpan</button></>}>
        <div className="space-y-3">
          <Field label="Equipment">
            <select className="input" value={svcTarget} onChange={(e) => setSvcTarget(e.target.value)}>
              <option value="">Pilih…</option>
              {equipment.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.code})</option>)}
            </select>
          </Field>
          <Field label="Tanggal servis"><input type="date" className="input" value={svcDate} onChange={(e) => setSvcDate(e.target.value)} /></Field>
        </div>
      </Modal>

      {/* Modal catat servis (WO sederhana) */}
      <Modal open={recording !== null} onClose={() => setRecording(null)} title={`Catat Servis — ${recording?.name ?? ""}`} subtitle="Work order servis sederhana"
        footer={<><button className="btn-secondary" onClick={() => setRecording(null)}>Batal</button><button className="btn-primary" onClick={saveRecord}>Simpan Servis</button></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label="Tanggal servis"><input type="date" className="input" value={woForm.tanggal} onChange={(e) => setWoForm({ ...woForm, tanggal: e.target.value })} /></Field>
            <Field label="Teknisi"><input className="input" value={woForm.teknisi} onChange={(e) => setWoForm({ ...woForm, teknisi: e.target.value })} placeholder="cth: Agus Setiawan" /></Field>
            <Field label="Hour-meter (jam)"><input type="number" min={0} className="input" value={woForm.hours} onChange={(e) => setWoForm({ ...woForm, hours: e.target.value })} /></Field>
            <Field label="Servis berikutnya"><input type="date" className="input" value={woForm.next} onChange={(e) => setWoForm({ ...woForm, next: e.target.value })} /></Field>
          </FormGrid>
          <Field label="Catatan pekerjaan"><input className="input" value={woForm.catatan} onChange={(e) => setWoForm({ ...woForm, catatan: e.target.value })} placeholder="cth: Ganti oli & filter hidrolik" /></Field>
        </div>
      </Modal>

      {/* Modal maintenance */}
      <Modal open={maintaining !== null} onClose={() => setMaintaining(null)} title={`Maintenance — ${maintaining?.name ?? ""}`}
        footer={<><button className="btn-secondary" onClick={() => setMaintaining(null)}>Batal</button><button className="btn-primary" onClick={startMaintenance}>Masuk Maintenance</button></>}>
        <div className="space-y-3">
          <Field label="Catatan kerusakan"><input className="input" value={maintNote} onChange={(e) => setMaintNote(e.target.value)} placeholder="cth: Seal hidrolik bocor" /></Field>
          <Field label="Estimasi selesai"><input type="date" className="input" value={maintEta} onChange={(e) => setMaintEta(e.target.value)} /></Field>
        </div>
      </Modal>

      {/* Modal booking */}
      <Modal open={showBook} onClose={() => { setShowBook(false); setBookError(null); }} title="Booking Equipment" subtitle="Booking yang bentrok akan ditolak otomatis"
        footer={<><button className="btn-secondary" onClick={() => { setShowBook(false); setBookError(null); }}>Batal</button><button className="btn-primary" onClick={saveBooking}>Simpan Booking</button></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label="Equipment">
              <select className="input" value={bookForm.equip} onChange={(e) => setBookForm({ ...bookForm, equip: e.target.value })}>
                <option value="">Pilih…</option>
                {equipment.filter((e) => e.status !== "Maintenance").map((e) => <option key={e.id} value={e.name}>{e.name}</option>)}
              </select>
            </Field>
            <Field label="Proyek">
              <select className="input" value={bookForm.proyek} onChange={(e) => setBookForm({ ...bookForm, proyek: e.target.value })}>
                <option value="">Pilih…</option>
                {data.projects.filter((p) => p.status !== "Selesai").map((p) => <option key={p.id} value={p.id}>{p.id} · {p.vessel}</option>)}
              </select>
            </Field>
            <Field label="Tanggal"><input type="date" className="input" value={bookForm.date} onChange={(e) => setBookForm({ ...bookForm, date: e.target.value })} /></Field>
            <Field label="Jam mulai"><input type="time" className="input" value={bookForm.mulai} onChange={(e) => setBookForm({ ...bookForm, mulai: e.target.value })} /></Field>
            <Field label="Jam selesai"><input type="time" className="input" value={bookForm.selesai} onChange={(e) => setBookForm({ ...bookForm, selesai: e.target.value })} /></Field>
          </FormGrid>
          {bookError && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">{bookError}</p>
          )}
        </div>
      </Modal>

      {/* Modal selesaikan booking */}
      <Modal open={finishing !== null} onClose={() => setFinishing(null)} title={`Selesaikan Booking — ${finishing?.equip ?? ""}`} subtitle={finishing ? `${finishing.proyek} · ${finishing.jam} · ${fmtTanggal(String(finishing.date))}` : ""}
        footer={<><button className="btn-secondary" onClick={() => setFinishing(null)}>Batal</button><button className="btn-primary" onClick={confirmFinish}>Selesaikan</button></>}>
        <div className="space-y-3">
          <Field label="Jam pakai aktual (jam)" hint="Default = durasi booking; menambah hour-meter equipment">
            <input type="number" min={0} step={0.5} className="input" value={finishHours} onChange={(e) => setFinishHours(e.target.value)} />
          </Field>
        </div>
      </Modal>
    </div>
  );
}

function minutesToStr(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
