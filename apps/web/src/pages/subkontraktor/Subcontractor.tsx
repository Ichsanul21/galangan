import { useState } from "react";
import { Plus, HardHat, FileSignature, Star } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Card, CardHeader, PageHeader, Badge, KpiCard, Tabs, ProgressBar, ChartTooltip, Modal, Field, FormGrid, ConfirmModal, toast } from "../../components/ui";
import { useStore, type StoreItem } from "../../data/store";
import { fmtRupiah, fmtMiliar, fmtTanggal, todayISO } from "../../utils/format";
import { subcontractorScore, subActiveTrend, subContractTrend, woTrend, ratingTrend } from "../../data";

const toneMap: Record<string, "green" | "blue" | "amber" | "red" | "gray" | "navy"> = {
  Aktif: "green",
  Kualifikasi: "amber",
  Blacklist: "red",
  "Dalam Proses": "blue",
  Selesai: "green",
  Lunas: "green",
  Disetujui: "blue",
  Diajukan: "amber",
  "Belum Dibayar": "amber",
  Draf: "gray",
  Ditolak: "red",
};

/* Alur termin + pemetaan status seed lama ("Belum Dibayar" → Diajukan). */
const TERM_NEXT: Record<string, string[]> = {
  Draf: ["Diajukan"],
  Diajukan: ["Disetujui", "Ditolak"],
  Disetujui: ["Lunas"],
  Lunas: [],
  Ditolak: [],
};

function normTerm(s: string): string {
  return s === "Belum Dibayar" ? "Diajukan" : s;
}

const termNext = (s: string): string[] => TERM_NEXT[normTerm(s)] ?? [];

/* Alur status subkontraktor. Status tak dikenal dinormalkan ke Kualifikasi. */
const SUB_NEXT: Record<string, string[]> = {
  Aktif: ["Kualifikasi", "Blacklist"],
  Kualifikasi: ["Aktif", "Blacklist"],
  Blacklist: ["Kualifikasi"],
};

function normSub(s: string): string {
  return SUB_NEXT[s] ? s : "Kualifikasi";
}

const pphOf = (p: StoreItem): number => Number(p.pphPct ?? 2);
const retOf = (p: StoreItem): number => Number(p.retPct ?? 5);
const potonganOf = (p: StoreItem): number => Number(p.amount || 0) * (pphOf(p) + retOf(p)) / 100;
const netoOf = (p: StoreItem): number => Number(p.amount || 0) - potonganOf(p);

export default function Subcontractor() {
  const { data, add, update, log } = useStore();
  const subcontractors = data.subcontractors;
  const workOrders = data.workOrders;
  const payments = data.termins;
  const [tab, setTab] = useState("Subkontraktor");

  const [showSub, setShowSub] = useState(false);
  const [subForm, setSubForm] = useState({ name: "", services: "", contract: "", k3: "A" });
  const [subConfirm, setSubConfirm] = useState<{ id: string; name: string; next: string } | null>(null);
  const [showWo, setShowWo] = useState(false);
  const [woForm, setWoForm] = useState({ sub: "", project: "", scope: "" });
  const [woProg, setWoProg] = useState<StoreItem | null>(null);
  const [progVal, setProgVal] = useState("");
  const [progNote, setProgNote] = useState("");
  const [confirmFinish, setConfirmFinish] = useState<{ id: string; v: number; note: string } | null>(null);
  const [showTerm, setShowTerm] = useState(false);
  const [termForm, setTermForm] = useState({ sub: "", wo: "", amount: "", pphPct: "2", retPct: "5" });
  const [termPay, setTermPay] = useState<StoreItem | null>(null);
  const [proof, setProof] = useState({ date: todayISO(), method: "Transfer", ref: "" });
  const [rejectTerm, setRejectTerm] = useState<StoreItem | null>(null);

  const runningWo = workOrders.filter((w) => w.status !== "Selesai").length;
  const avgRating = subcontractors.length ? Math.round(subcontractors.reduce((s, x) => s + Number(x.rating || 0), 0) / subcontractors.length) : 0;

  const termWoOptions = workOrders.filter((w) => termForm.sub && w.sub === termForm.sub);
  const termWo = workOrders.find((w) => w.id === termForm.wo) ?? null;
  const termSub = subcontractors.find((s) => s.name === termForm.sub) ?? null;
  const termCap = termSub && termWo ? Number(termSub.contract || 0) * Number(termWo.progress || 0) / 100 : 0;
  const termUsed = termForm.wo
    ? payments.filter((t) => t.woId === termForm.wo && t.status !== "Ditolak").reduce((s, t) => s + Number(t.amount || 0), 0)
    : 0;

  const saveSub = () => {
    if (!subForm.name.trim()) { toast("Nama subkontraktor wajib diisi", "info"); return; }
    const created = add("subcontractors", {
      name: subForm.name.trim(), services: subForm.services.trim() || "Umum",
      rating: 80, active: 0, contract: Number(subForm.contract) || 0, status: "Kualifikasi", k3: subForm.k3,
    }, { action: "meregistrasi subkontraktor", module: "Subkontraktor" });
    toast(`${created.id} teregistrasi (Kualifikasi)`);
    setShowSub(false);
    setSubForm({ name: "", services: "", contract: "", k3: "A" });
  };

  const saveWo = () => {
    if (!woForm.sub || !woForm.project || !woForm.scope.trim()) { toast("Sub, proyek & lingkup wajib diisi", "info"); return; }
    const created = add("workOrders", { sub: woForm.sub, project: woForm.project, scope: woForm.scope.trim(), progress: 0, status: "Dalam Proses", date: todayISO() },
      { action: "menerbitkan WO", module: "Subkontraktor" });
    toast(`WO ${created.id} diterbitkan`);
    setShowWo(false);
    setWoForm({ sub: "", project: "", scope: "" });
  };

  const applyWoProgress = (id: string, v: number, note: string) => {
    update("workOrders", id, { progress: v, status: v >= 100 ? "Selesai" : "Dalam Proses" });
    log("mengupdate progres", `${id} → ${v}%${note ? ` — ${note}` : ""}`, "Subkontraktor");
    toast(`${id} → ${v}%`);
  };

  const saveWoProgress = () => {
    if (!woProg) return;
    const v = Math.min(100, Math.max(0, Number(progVal) || 0));
    if (v < Number(woProg.progress) && !progNote.trim()) {
      toast("Progres mundur wajib disertai catatan", "info");
      return;
    }
    if (v >= 100) {
      setConfirmFinish({ id: woProg.id, v, note: progNote.trim() });
      return;
    }
    applyWoProgress(woProg.id, v, progNote.trim());
    setWoProg(null);
    setProgNote("");
  };

  const saveTerm = () => {
    if (!termForm.sub) { toast("Subkontraktor wajib dipilih", "info"); return; }
    const wo = workOrders.find((w) => w.id === termForm.wo && w.sub === termForm.sub);
    if (!wo) { toast("Pilih WO milik subkontraktor tersebut", "info"); return; }
    const amount = Number(termForm.amount);
    if (!amount || amount <= 0) { toast("Nilai termin harus lebih dari 0", "info"); return; }
    const pphPct = Number(termForm.pphPct);
    const retPct = Number(termForm.retPct);
    if (Number.isNaN(pphPct) || pphPct < 0 || pphPct > 100 || Number.isNaN(retPct) || retPct < 0 || retPct > 100) {
      toast("PPh/retensi harus 0–100%", "info");
      return;
    }
    const sub = subcontractors.find((s) => s.name === termForm.sub);
    const cap = sub ? Number(sub.contract || 0) * Number(wo.progress || 0) / 100 : 0;
    const used = payments.filter((t) => t.woId === wo.id && t.status !== "Ditolak").reduce((s, t) => s + Number(t.amount || 0), 0);
    if (used + amount > cap) {
      toast(`Termin melebihi batas WO: maks ${fmtRupiah(cap)} (kontrak ${fmtRupiah(Number(sub?.contract || 0))} × progres ${wo.progress}%), sudah diajukan ${fmtRupiah(used)}`, "info");
      return;
    }
    const created = add("termins", {
      sub: termForm.sub, woId: wo.id, progress: `${wo.id} (${wo.progress}%)`, amount,
      pphPct, retPct, status: "Draf", date: todayISO(),
    }, { action: "mengajukan termin", module: "Subkontraktor" });
    toast(`Termin ${created.id} diajukan (Draf)`);
    setShowTerm(false);
    setTermForm({ sub: "", wo: "", amount: "", pphPct: "2", retPct: "5" });
  };

  const stepTerm = (p: StoreItem, next: string) => {
    if (next === "Lunas") {
      setTermPay(p);
      setProof({ date: todayISO(), method: "Transfer", ref: "" });
      return;
    }
    if (next === "Ditolak") {
      setRejectTerm(p);
      return;
    }
    update("termins", p.id, { status: next });
    toast(`${p.id} → ${next}`);
  };

  const confirmBuktiTerm = () => {
    if (!termPay) return;
    if (!proof.date) { toast("Tanggal bayar wajib diisi", "info"); return; }
    if (!proof.ref.trim()) { toast("No. referensi wajib diisi", "info"); return; }
    update("termins", termPay.id, {
      status: "Lunas", paidAt: proof.date, paidMethod: proof.method, paidRef: proof.ref.trim(),
    });
    log("melunasi termin", `${termPay.id} via ${proof.method} ${proof.ref.trim()}`, "Subkontraktor");
    toast(`${termPay.id} lunas — bukti tersimpan`);
    setTermPay(null);
  };

  return (
    <div>
      <PageHeader
        title="Subkontraktor & Pihak Ketiga"
        subtitle="Kontrak, work order, termin, dan evaluasi kinerja"
        icon={<HardHat className="h-5 w-5" />}
        actions={<button className="btn-primary-gradient" onClick={() => setShowSub(true)}><Plus className="h-4 w-4" /> Registrasi Sub</button>}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Subkontraktor Aktif" value={String(subcontractors.filter((s) => s.status === "Aktif").length)} icon={<HardHat className="h-5 w-5" />} chip="navy" spark={subActiveTrend} hint="Terdaftar & tersertifikasi" />
        <KpiCard label="Nilai Kontrak Aktif" value={fmtMiliar(subcontractors.reduce((s, x) => s + Number(x.contract || 0), 0))} icon={<FileSignature className="h-5 w-5" />} chip="teal" spark={subContractTrend} />
        <KpiCard label="Work Order Berjalan" value={String(runningWo)} hint="Sedang eksekusi" icon={<HardHat className="h-5 w-5" />} chip="amber" spark={woTrend} />
        <KpiCard label="Rating Rata-rata" value={`${avgRating}%`} delta="Kinerja baik" deltaDirection="up" icon={<Star className="h-5 w-5" />} chip="violet" spark={ratingTrend} />
      </div>

      <div className="mt-4 card">
        <Tabs tabs={["Subkontraktor", "Work Order", "Termin & Pembayaran"]} active={tab} onChange={setTab} />
        <div className="p-4">
          {tab === "Subkontraktor" && (
            <div className="space-y-4">
              <Card>
                <CardHeader title="Evaluasi Kinerja Subkontraktor" subtitle="Skor biaya, kualitas, ketepatan kirim & keselamatan" />
                <div className="h-52 p-4 pt-0 sm:h-60">
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
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-navy-900 truncate" title={String(s.name)}>{s.name}</p>
                      <p className="text-xs text-steel-500 truncate" title={String(s.services)}>{s.services}</p>
                    </div>
                    <Badge tone={toneMap[normSub(s.status)] ?? "gray"}>{normSub(s.status)}</Badge>
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
                    <span>{workOrders.filter((w) => w.sub === s.name && w.status !== "Selesai").length} WO aktif</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5 border-t border-steel-100 pt-3">
                    {SUB_NEXT[normSub(s.status)].map((next) => (
                      <button
                        key={next}
                        className="btn-secondary text-xs"
                        aria-label={`Ubah ${s.name} menjadi ${next}`}
                        onClick={() => setSubConfirm({ id: s.id, name: s.name, next })}
                      >
                        → {next}
                      </button>
                    ))}
                  </div>
                </Card>
              ))}
              </div>
            </div>
          )}

          {tab === "Work Order" && (
            <div>
              <div className="mb-3 flex justify-end">
                <button className="btn-secondary text-xs" onClick={() => setShowWo(true)}><Plus className="h-3.5 w-3.5" /> Terbitkan WO</button>
              </div>
              <div className="space-y-3">
                {workOrders.map((w) => (
                  <Card key={w.id} className="p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="font-mono text-sm font-semibold text-navy-900 shrink-0">{w.id}</div>
                        <div className="min-w-0 text-sm text-steel-600">
                          <p className="truncate" title={`${w.sub} · ${w.project}`}>{w.sub} · {w.project}</p>
                          <p className="text-xs text-steel-500 truncate" title={String(w.scope)}>{w.scope}</p>
                          {w.date && <p className="text-xs text-steel-400">{fmtTanggal(w.date)}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <ProgressBar value={w.progress} className="w-24" tone={w.status === "Selesai" ? "green" : "navy"} />
                          <span className="text-xs font-medium">{w.progress}%</span>
                        </div>
                        <Badge tone={toneMap[w.status] ?? "gray"}>{w.status}</Badge>
                        {w.status !== "Selesai" && (
                          <button className="btn-secondary text-xs" aria-label={`Update progres ${w.id}`} onClick={() => { setWoProg(w); setProgVal(String(w.progress)); setProgNote(""); }}>Update</button>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
                {workOrders.length === 0 && <p className="py-6 text-center text-sm text-steel-400">Belum ada WO.</p>}
              </div>
            </div>
          )}

          {tab === "Termin & Pembayaran" && (
            <div>
              <div className="mb-3 flex justify-end">
                <button className="btn-secondary text-xs" onClick={() => setShowTerm(true)}><Plus className="h-3.5 w-3.5" /> Ajukan Termin</button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-surface sticky top-0 z-10">
                    <tr><th className="th">Termin</th><th className="th">Subkontraktor</th><th className="th">WO / Progres</th><th className="th">Nilai</th><th className="th">PPh 23</th><th className="th">Retensi</th><th className="th">Neto</th><th className="th">Tanggal</th><th className="th">Status</th><th className="th">Aksi</th></tr>
                  </thead>
                  <tbody className="divide-y divide-steel-100">
                    {payments.map((p) => (
                      <tr key={p.id} className="hover:bg-surface">
                        <td className="td font-mono font-medium text-navy-900">{p.id}</td>
                        <td className="td text-steel-600 truncate" title={String(p.sub)}>{p.sub}</td>
                        <td className="td font-mono text-xs text-steel-500">{p.progress}</td>
                        <td className="td font-semibold">{fmtMiliar(p.amount)}</td>
                        <td className="td text-steel-600">{fmtRupiah(Number(p.amount || 0) * pphOf(p) / 100)} <span className="text-xs text-steel-400">({pphOf(p)}%)</span></td>
                        <td className="td text-steel-600">{fmtRupiah(Number(p.amount || 0) * retOf(p) / 100)} <span className="text-xs text-steel-400">({retOf(p)}%)</span></td>
                        <td className="td font-semibold text-emerald-600">{fmtRupiah(netoOf(p))}</td>
                        <td className="td text-steel-600">{fmtTanggal(p.date)}</td>
                        <td className="td"><Badge tone={toneMap[normTerm(p.status)] ?? "gray"}>{normTerm(p.status)}</Badge></td>
                        <td className="td">
                          <div className="flex flex-wrap gap-1.5">
                            {termNext(p.status).map((next) => (
                              <button
                                key={next}
                                className={next === "Lunas" ? "btn-primary text-xs" : "btn-secondary text-xs"}
                                aria-label={`${next} ${p.id}`}
                                onClick={() => stepTerm(p, next)}
                              >
                                {next === "Lunas" ? "Bayar" : next === "Diajukan" ? "Ajukan" : next}
                              </button>
                            ))}
                            {termNext(p.status).length === 0 && <span className="text-xs text-steel-400">—</span>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal registrasi */}
      <Modal open={showSub} onClose={() => setShowSub(false)} title="Registrasi Subkontraktor" subtitle="Masuk tahap Kualifikasi terlebih dahulu"
        footer={<><button className="btn-secondary" onClick={() => setShowSub(false)}>Batal</button><button className="btn-primary" onClick={saveSub}>Registrasi</button></>}>
        <div className="space-y-3">
          <Field label="Nama perusahaan"><input className="input" value={subForm.name} onChange={(e) => setSubForm({ ...subForm, name: e.target.value })} placeholder="cth: PT Lasindo Jaya" /></Field>
          <Field label="Layanan"><input className="input" value={subForm.services} onChange={(e) => setSubForm({ ...subForm, services: e.target.value })} placeholder="cth: Fabrikasi & Blasting" /></Field>
          <FormGrid>
            <Field label="Nilai kontrak (Rp)"><input type="number" min={0} className="input" value={subForm.contract} onChange={(e) => setSubForm({ ...subForm, contract: e.target.value })} /></Field>
            <Field label="Rating K3">
              <select className="input" value={subForm.k3} onChange={(e) => setSubForm({ ...subForm, k3: e.target.value })}>
                {["A+", "A", "B+", "B", "C"].map((k) => <option key={k}>{k}</option>)}
              </select>
            </Field>
          </FormGrid>
        </div>
      </Modal>

      {/* Konfirmasi status subkontraktor */}
      <ConfirmModal
        open={subConfirm !== null}
        title={`Ubah ${subConfirm?.name ?? ""} → ${subConfirm?.next ?? ""}?`}
        desc="Perubahan status subkontraktor memengaruhi kelayakan penugasan WO baru."
        confirmLabel="Ya, ubah"
        onCancel={() => setSubConfirm(null)}
        onConfirm={() => { if (subConfirm) { update("subcontractors", subConfirm.id, { status: subConfirm.next }); toast(`${subConfirm.name} → ${subConfirm.next}`); } setSubConfirm(null); }}
      />

      {/* Modal WO */}
      <Modal open={showWo} onClose={() => setShowWo(false)} title="Terbitkan Work Order"
        footer={<><button className="btn-secondary" onClick={() => setShowWo(false)}>Batal</button><button className="btn-primary" onClick={saveWo}>Terbitkan</button></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label="Subkontraktor">
              <select className="input" value={woForm.sub} onChange={(e) => setWoForm({ ...woForm, sub: e.target.value })}>
                <option value="">Pilih…</option>
                {subcontractors.filter((s) => s.status === "Aktif").map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="Proyek">
              <select className="input" value={woForm.project} onChange={(e) => setWoForm({ ...woForm, project: e.target.value })}>
                <option value="">Pilih…</option>
                {data.projects.filter((p) => p.status !== "Selesai").map((p) => <option key={p.id} value={p.id}>{p.id} · {p.vessel}</option>)}
              </select>
            </Field>
          </FormGrid>
          <Field label="Lingkup pekerjaan"><input className="input" value={woForm.scope} onChange={(e) => setWoForm({ ...woForm, scope: e.target.value })} placeholder="cth: Fabrikasi section 8-10" /></Field>
        </div>
      </Modal>

      {/* Modal progres WO */}
      <Modal open={woProg !== null} onClose={() => setWoProg(null)} title={`Update progres ${woProg?.id ?? ""}`}
        footer={<><button className="btn-secondary" onClick={() => setWoProg(null)}>Batal</button><button className="btn-primary" onClick={saveWoProgress}>Simpan</button></>}>
        <div className="space-y-3">
          <Field label={`Progres: ${progVal}% (saat ini ${woProg?.progress ?? 0}%)`}>
            <input type="range" min={0} max={100} value={Number(progVal) || 0} onChange={(e) => setProgVal(e.target.value)} className="w-full" />
          </Field>
          <Field label="Catatan" hint="Wajib diisi jika progres dimundurkan">
            <input className="input" value={progNote} onChange={(e) => setProgNote(e.target.value)} placeholder="cth: Revisi hasil QC section 4" />
          </Field>
        </div>
      </Modal>

      {/* Konfirmasi WO selesai 100% */}
      <ConfirmModal
        open={confirmFinish !== null}
        title={`Selesaikan ${confirmFinish?.id ?? ""}?`}
        desc="Progres 100% menandai WO Selesai dan mengunci update progres berikutnya."
        confirmLabel="Ya, selesaikan"
        onCancel={() => setConfirmFinish(null)}
        onConfirm={() => { if (confirmFinish) applyWoProgress(confirmFinish.id, confirmFinish.v, confirmFinish.note); setConfirmFinish(null); setWoProg(null); setProgNote(""); }}
      />

      {/* Modal termin */}
      <Modal open={showTerm} onClose={() => setShowTerm(false)} title="Ajukan Termin Pembayaran" subtitle="WO mengikuti subkontraktor yang dipilih"
        footer={<><button className="btn-secondary" onClick={() => setShowTerm(false)}>Batal</button><button className="btn-primary" onClick={saveTerm}>Ajukan</button></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label="Subkontraktor">
              <select className="input" value={termForm.sub} onChange={(e) => setTermForm({ ...termForm, sub: e.target.value, wo: "" })}>
                <option value="">Pilih…</option>
                {subcontractors.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="Work Order">
              <select className="input" value={termForm.wo} onChange={(e) => setTermForm({ ...termForm, wo: e.target.value })} disabled={!termForm.sub}>
                <option value="">{termForm.sub ? "Pilih WO…" : "Pilih sub dulu…"}</option>
                {termWoOptions.map((w) => <option key={w.id} value={w.id}>{w.id} ({w.progress}%)</option>)}
              </select>
            </Field>
          </FormGrid>
          {termSub && termWo && (
            <p className="rounded-lg bg-surface px-3 py-2 text-xs text-steel-600">
              Batas termin WO ini {fmtRupiah(termCap)} (kontrak {fmtRupiah(Number(termSub.contract || 0))} × progres {termWo.progress}%) · sudah diajukan {fmtRupiah(termUsed)}
            </p>
          )}
          <Field label="Nilai termin (Rp)"><input type="number" min={0} className="input" value={termForm.amount} onChange={(e) => setTermForm({ ...termForm, amount: e.target.value })} /></Field>
          <FormGrid>
            <Field label="PPh 23 (%)"><input type="number" min={0} max={100} className="input" value={termForm.pphPct} onChange={(e) => setTermForm({ ...termForm, pphPct: e.target.value })} /></Field>
            <Field label="Retensi (%)"><input type="number" min={0} max={100} className="input" value={termForm.retPct} onChange={(e) => setTermForm({ ...termForm, retPct: e.target.value })} /></Field>
          </FormGrid>
        </div>
      </Modal>

      {/* Modal bukti bayar termin */}
      <Modal open={termPay !== null} onClose={() => setTermPay(null)} title={`Bayar ${termPay?.id ?? ""}?`} subtitle={`${termPay?.sub ?? ""} · neto ${fmtRupiah(termPay ? netoOf(termPay) : 0)}`}
        footer={<><button className="btn-secondary" onClick={() => setTermPay(null)}>Batal</button><button className="btn-primary" onClick={confirmBuktiTerm}>Simpan Bukti Bayar</button></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label="Tanggal bayar"><input type="date" required className="input" value={proof.date} onChange={(e) => setProof({ ...proof, date: e.target.value })} /></Field>
            <Field label="Metode">
              <select className="input" value={proof.method} onChange={(e) => setProof({ ...proof, method: e.target.value })}>
                {["Transfer", "Tunai", "Giro"].map((m) => <option key={m}>{m}</option>)}
              </select>
            </Field>
          </FormGrid>
          <Field label="No. referensi" hint="Wajib — no. bukti transfer / kuitansi">
            <input className="input font-mono" value={proof.ref} onChange={(e) => setProof({ ...proof, ref: e.target.value })} placeholder="cth: TRF-2026-0914" />
          </Field>
        </div>
      </Modal>

      {/* Konfirmasi penolakan termin */}
      <ConfirmModal
        open={rejectTerm !== null}
        title={`Tolak ${rejectTerm?.id ?? ""}?`}
        desc="Termin yang ditolak tidak dihitung dalam kumulatif batas WO."
        confirmLabel="Ya, tolak"
        onCancel={() => setRejectTerm(null)}
        onConfirm={() => { if (rejectTerm) { update("termins", rejectTerm.id, { status: "Ditolak" }); toast(`${rejectTerm.id} ditolak`); } setRejectTerm(null); }}
      />
    </div>
  );
}
