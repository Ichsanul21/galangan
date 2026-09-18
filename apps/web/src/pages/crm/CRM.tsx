import { useState } from "react";
import { Plus, Send, Users2, Star, Handshake, ArrowRight } from "lucide-react";
import { Card, CardHeader, PageHeader, Badge, KpiCard, Tabs, ProgressBar, Donut, Modal, Field, FormGrid, ConfirmModal, toast } from "../../components/ui";
import { useStore, type StoreItem } from "../../data/store";
import { fmtMiliar, fmtTanggal, todayISO } from "../../utils/format";
import { clientTrend, pipelineTrend, winRateTrend, wonTrend } from "../../data";

const FLOW = ["Lead", "Penawaran", "Negosiasi", "Menang"];
const TERMINAL = ["Terkonversi", "Batal", "Kalah"];
const STAGES = [...FLOW, ...TERMINAL];

const STAGE_COLORS: Record<string, string> = {
  Lead: "#2e9ad4",
  Penawaran: "#f59e0b",
  Negosiasi: "#8b5cf6",
  Menang: "#22c55e",
  Terkonversi: "#0d9488",
  Batal: "#94a3b8",
  Kalah: "#f43f5e",
};

const STAGE_TONE: Record<string, "gray" | "amber" | "violet" | "green" | "teal" | "red"> = {
  Lead: "gray",
  Penawaran: "amber",
  Negosiasi: "violet",
  Menang: "green",
  Terkonversi: "teal",
  Batal: "gray",
  Kalah: "red",
};

const isTerminal = (stage: string) => TERMINAL.includes(stage);

export default function CRM() {
  const { data, add, update, log } = useStore();
  const quotations = data.quotations;
  const clients = data.clients;
  const [tab, setTab] = useState("Pipeline");

  const [showQ, setShowQ] = useState(false);
  const [qForm, setQForm] = useState({ client: "", vessel: "", type: "New Build", value: "", stage: "Lead", date: todayISO() });
  const [showClient, setShowClient] = useState(false);
  const [cForm, setCForm] = useState({ name: "", fleet: "1", rating: "80" });
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [convertTarget, setConvertTarget] = useState<StoreItem | null>(null);
  const [sendTarget, setSendTarget] = useState<StoreItem | null>(null);
  const [sendEmail, setSendEmail] = useState("");
  const [sendMsg, setSendMsg] = useState("");

  const activeQuotes = quotations.filter((q) => !isTerminal(q.stage));
  const pipelineTotal = activeQuotes.reduce((s, q) => s + Number(q.value || 0), 0);
  const wonQuotes = quotations.filter((q) => q.stage === "Menang" || q.stage === "Terkonversi");
  const wonValue = wonQuotes.reduce((s, q) => s + Number(q.value || 0), 0);
  const totalQuotes = quotations.length;
  const winRate = totalQuotes > 0 ? Math.round((wonQuotes.length / totalQuotes) * 100) : 0;
  const totalFleet = clients.reduce((s, c) => s + Number(c.fleet || 0), 0);
  const stageDist = STAGES.map((s) => ({
    name: s,
    value: quotations.filter((q) => q.stage === s).length,
    color: STAGE_COLORS[s] ?? "#94a3b8",
  }));

  const portalProject = data.projects[0];
  const portalInvoice = portalProject ? data.invoices.find((i) => i.project === portalProject.id) : undefined;

  const advance = (q: StoreItem) => {
    const idx = FLOW.indexOf(q.stage);
    if (idx < 0 || idx >= FLOW.length - 1) return;
    const next = FLOW[idx + 1];
    update("quotations", q.id, { stage: next });
    log(`memajukan quotation ke ${next}`, q.id, "CRM");
    toast(`${q.id} naik ke tahap ${next}`);
  };

  const markTerminal = (q: StoreItem, stage: "Batal" | "Kalah") => {
    if (isTerminal(q.stage)) return;
    update("quotations", q.id, { stage });
    log(`memindahkan quotation ke ${stage}`, q.id, "CRM");
    toast(`${q.id} ditandai ${stage}`, "info");
  };

  const confirmConvert = () => {
    const q = convertTarget;
    if (!q) return;
    if (q.stage === "Terkonversi" || data.projects.some((p) => p.vessel === q.vessel)) {
      toast("Konversi ditolak: quotation sudah terkonversi atau proyek kapalnya sudah ada", "info");
      setConvertTarget(null);
      return;
    }
    const created = add("projects", {
      vessel: q.vessel, type: q.type, client: q.client, status: "Dalam Proses",
      branch: "Samarinda", start: todayISO(), end: "-", progress: 0,
      budget: Number(q.value) || 0, actual: 0, manager: "Belum ditentukan", scope: [q.type],
    }, { action: "mengkonversi quotation", target: `${q.id} → proyek`, module: "CRM" });
    update("quotations", q.id, { stage: "Terkonversi" });
    log("mengunci quotation setelah konversi", q.id, "CRM");
    toast(`${q.id} menjadi proyek ${created.id}`);
    setConvertTarget(null);
  };

  const openSend = (q: StoreItem) => {
    setSendTarget(q);
    setSendEmail("");
    setSendMsg(`Yth. ${q.client},\n\nTerlampir penawaran ${q.id} untuk ${q.vessel} senilai ${fmtMiliar(Number(q.value) || 0)}. Mohon konfirmasi ketersediaan jadwal docking.\n\nHormat kami,\nTim Commercial`);
  };

  const confirmSend = () => {
    if (!sendTarget) return;
    if (!sendEmail.includes("@")) { toast("Email tujuan tidak valid", "info"); return; }
    update("quotations", sendTarget.id, { statusKirim: "Terkirim", sentAt: todayISO(), sentTo: sendEmail.trim() });
    log(`mengirim penawaran ke ${sendEmail.trim()}`, sendTarget.id, "CRM");
    toast(`${sendTarget.id} terkirim ke ${sendEmail.trim()}`);
    setSendTarget(null);
  };

  const saveQuotation = () => {
    if (!qForm.client || !qForm.vessel.trim()) { toast("Klien & kapal wajib diisi", "info"); return; }
    if (!qForm.date) { toast("Tanggal penawaran wajib diisi", "info"); return; }
    if (Number(qForm.value) <= 0) { toast("Nilai penawaran harus lebih dari 0", "info"); return; }
    const created = add("quotations", {
      client: qForm.client, vessel: qForm.vessel.trim(), type: qForm.type,
      value: Number(qForm.value), stage: qForm.stage, date: qForm.date,
    }, { action: "membuat penawaran", module: "CRM" });
    toast(`Penawaran ${created.id} dibuat`);
    setShowQ(false);
    setQForm({ client: "", vessel: "", type: "New Build", value: "", stage: "Lead", date: todayISO() });
  };

  const saveClient = () => {
    if (!cForm.name.trim()) { toast("Nama klien wajib diisi", "info"); return; }
    const created = add("clients", {
      name: cForm.name.trim(), fleet: Number(cForm.fleet) || 1, rating: Number(cForm.rating) || 80,
      since: new Date().getFullYear(),
    }, { action: "mendaftarkan klien", module: "CRM" });
    toast(`Klien ${created.id} ditambahkan`);
    setShowClient(false);
    setCForm({ name: "", fleet: "1", rating: "80" });
  };

  return (
    <div>
      <PageHeader
        title="CRM & Manajemen Klien"
        subtitle="Penawaran, pipeline penjualan, dan armada klien"
        icon={<Handshake className="h-5 w-5" />}
        actions={<button className="btn-primary-gradient" onClick={() => setShowQ(true)}><Plus className="h-4 w-4" /> Penawaran Baru</button>}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total Klien Aktif" value={String(clients.length)} icon={<Users2 className="h-5 w-5" />} chip="navy" spark={clientTrend} hint={`${String(totalFleet)} unit armada tercatat`} />
        <KpiCard label="Nilai Pipeline" value={fmtMiliar(pipelineTotal)} delta={`${String(activeQuotes.length)} penawaran aktif`} deltaDirection="up" chip="teal" hint="Di luar Batal, Kalah, Terkonversi" spark={pipelineTrend} />
        <KpiCard label="Win Rate" value={`${String(winRate)}%`} delta={`${String(wonQuotes.length)} menang dari ${String(totalQuotes)} penawaran`} deltaDirection={wonQuotes.length > 0 ? "up" : "flat"} icon={<Star className="h-5 w-5" />} chip="violet" spark={winRateTrend} />
        <KpiCard label="Nilai Kontrak Menang" value={fmtMiliar(wonValue)} delta="Menang + Terkonversi" deltaDirection="up" chip="amber" hint="Bulan berjalan" spark={wonTrend} />
      </div>

      <div className="mt-4 card">
        <Tabs tabs={["Pipeline", "Klien", "Penawaran", "Portal Klien"]} active={tab} onChange={setTab} />
        <div className="p-4">
          {tab === "Pipeline" && (
            <div className="space-y-4">
              <Card>
                <CardHeader title="Distribusi Penawaran" subtitle="Jumlah penawaran per tahap" />
                <div className="flex flex-wrap items-center gap-6 p-4 pt-0">
                  <Donut data={stageDist} colors={stageDist.map((d) => d.color)} size={150} thickness={20} centerValue={String(quotations.length)} centerLabel="QT" />
                  <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
                    {stageDist.map((d) => (
                      <div key={d.name} className="flex items-center gap-2 text-sm">
                        <span className="h-3 w-3 rounded-sm" style={{ background: d.color }} />
                        <span className="truncate text-steel-600" title={d.name}>{d.name}</span>
                        <span className="ml-auto font-semibold text-navy-900">{d.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                {STAGES.map((stage) => {
                  const items = quotations.filter((q) => q.stage === stage);
                  return (
                    <div key={stage} className="rounded-xl bg-surface p-3">
                      <div className="mb-3 flex items-center justify-between">
                        <h3 className="truncate text-sm font-semibold text-navy-900" title={stage}>{stage}</h3>
                        <Badge tone="gray">{items.length}</Badge>
                      </div>
                      <div className="space-y-2.5">
                        {items.map((q) => (
                          <Card key={q.id} className="card-hover p-3">
                            <p className="truncate text-sm font-semibold text-navy-900" title={String(q.vessel)}>{q.vessel}</p>
                            <p className="truncate text-xs text-steel-500" title={String(q.client)}>{q.client}</p>
                            <p className="mt-0.5 text-xs text-steel-500">{q.type} · {fmtTanggal(q.date)}</p>
                            <div className="mt-2 flex items-center justify-between">
                              <span className="font-semibold text-navy-800">{fmtMiliar(Number(q.value) || 0)}</span>
                              <Badge tone={STAGE_TONE[q.stage] ?? "gray"}>{q.id}</Badge>
                            </div>
                            {!isTerminal(stage) && (
                              <div className="mt-2 space-y-1.5">
                                {stage !== "Menang" ? (
                                  <button className="btn-secondary flex-1 justify-center py-1 text-xs w-full" onClick={() => advance(q)}>
                                    Maju <ArrowRight className="h-3 w-3" />
                                  </button>
                                ) : (
                                  <button className="btn-primary flex-1 justify-center py-1 text-xs w-full" onClick={() => setConvertTarget(q)}>
                                    Jadikan Proyek
                                  </button>
                                )}
                                <div className="flex gap-1.5">
                                  <button className="btn-secondary flex-1 justify-center py-1 text-xs" onClick={() => markTerminal(q, "Batal")}>Batal</button>
                                  <button className="btn-secondary flex-1 justify-center py-1 text-xs" onClick={() => markTerminal(q, "Kalah")}>Kalah</button>
                                </div>
                              </div>
                            )}
                          </Card>
                        ))}
                        {items.length === 0 && <p className="py-4 text-center text-xs text-steel-400">Kosong</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {tab === "Klien" && (
            <div>
              <div className="mb-3 flex justify-end">
                <button className="btn-secondary text-xs" onClick={() => setShowClient(true)}><Plus className="h-3.5 w-3.5" /> Tambah Klien</button>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {clients.map((c) => {
                  const cq = quotations.filter((x) => x.client === c.name);
                  const cqVal = cq.reduce((s, x) => s + Number(x.value || 0), 0);
                  return (
                    <Card key={c.id} className="p-5">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-navy-700 text-sm font-bold text-white">
                            {String(c.name).replace("PT ", "").split(" ").map((n: string) => n[0]).slice(0, 2).join("")}
                          </div>
                          <div>
                            <p className="truncate text-sm font-semibold text-navy-900" title={String(c.name)}>{c.name}</p>
                            <p className="text-xs text-steel-500">{c.id} · sejak {c.since}</p>
                          </div>
                        </div>
                        <Badge tone="green"><Star className="h-3 w-3 mr-0.5" /> {c.rating}%</Badge>
                      </div>
                      <div className="mt-4 border-t border-steel-100 pt-3">
                        <div className="flex justify-between text-sm">
                          <span className="text-steel-500">Armada kapal</span>
                          <span className="font-semibold">{c.fleet} unit</span>
                        </div>
                        <div className="mt-1 flex justify-between text-sm">
                          <span className="text-steel-500">Nilai penawaran</span>
                          <span className="font-semibold">{fmtMiliar(cqVal)}</span>
                        </div>
                        <div className="mt-1 flex justify-between text-sm">
                          <span className="text-steel-500">Proyek berjalan</span>
                          <span className="font-semibold">{data.projects.filter((p) => p.client === c.name && p.status !== "Selesai").length} proyek</span>
                        </div>
                        <div className="mt-1 flex justify-between text-sm">
                          <span className="text-steel-500">Penawaran tercatat</span>
                          <span className="font-semibold">{cq.length} penawaran</span>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {tab === "Penawaran" && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {quotations.map((q) => (
                <Card key={q.id} className="p-4">
                  <div className="flex justify-between">
                    <div>
                      <p className="truncate font-semibold text-navy-900" title={String(q.vessel)}>{q.vessel}</p>
                      <p className="text-xs text-steel-500">{q.client} · {q.type} · {fmtTanggal(q.date)}</p>
                      {q.statusKirim === "Terkirim" && (
                        <p className="mt-0.5 text-xs text-teal-600">Terkirim {fmtTanggal(q.sentAt)} ke {q.sentTo}</p>
                      )}
                    </div>
                    <Badge tone={STAGE_TONE[q.stage] ?? "gray"}>{q.stage}</Badge>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-lg font-bold text-navy-900">{fmtMiliar(Number(q.value) || 0)}</span>
                    <div className="flex gap-1.5">
                      <button className="btn-secondary text-xs" onClick={() => openSend(q)}><Send className="h-3.5 w-3.5" /> Kirim</button>
                      {!isTerminal(q.stage) && q.stage !== "Menang" && <button className="btn-secondary text-xs" onClick={() => advance(q)}>Maju</button>}
                      {!isTerminal(q.stage) && q.stage === "Menang" && <button className="btn-primary text-xs" onClick={() => setConvertTarget(q)}>Jadikan Proyek</button>}
                    </div>
                  </div>
                  {!isTerminal(q.stage) && (
                    <div className="mt-2 flex gap-1.5">
                      <button className="btn-secondary flex-1 justify-center py-1 text-xs" onClick={() => markTerminal(q, "Batal")}>Tandai Batal</button>
                      <button className="btn-secondary flex-1 justify-center py-1 text-xs" onClick={() => markTerminal(q, "Kalah")}>Tandai Kalah</button>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}

          {tab === "Portal Klien" && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <p className="mb-3 text-sm text-steel-600">Pratinjau portal — tampilan read-only berisi data proyek & invoice yang sudah tercatat. Tidak ada data contoh.</p>
                {portalProject ? (
                  <Card className="p-4">
                    <p className="truncate text-xs text-steel-500" title={`${String(portalProject.client)} — ${String(portalProject.vessel)}`}>{portalProject.client} — {portalProject.vessel}</p>
                    <div className="mt-2 flex items-center gap-4">
                      <ProgressBar value={Number(portalProject.progress) || 0} className="flex-1" />
                      <span className="text-sm font-bold text-navy-900">{portalProject.progress}%</span>
                    </div>
                    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                      {[
                        { k: "Status", v: String(portalProject.status) },
                        { k: "Serah terima", v: fmtTanggal(portalProject.end) },
                        { k: "Invoice", v: portalInvoice ? String(portalInvoice.id) : "—" },
                      ].map((x) => (
                        <div key={x.k} className="rounded-lg bg-surface p-3">
                          <p className="text-xs text-steel-500">{x.k}</p>
                          <p className="truncate text-sm font-semibold text-navy-900" title={x.v}>{x.v}</p>
                        </div>
                      ))}
                    </div>
                  </Card>
                ) : (
                  <Card className="p-4"><p className="text-sm text-steel-500">Belum ada proyek tercatat untuk pratinjau.</p></Card>
                )}
              </div>
              <Card className="p-5">
                <h3 className="mb-2 text-sm font-semibold text-navy-900">Akses Portal</h3>
                <p className="text-sm text-steel-600">Undang klien untuk melihat progres proyek secara real-time.</p>
                <button className="btn-primary mt-4 w-full justify-center" onClick={() => setShowInvite(true)}><Send className="h-4 w-4" /> Kirim Undangan</button>
              </Card>
            </div>
          )}
        </div>
      </div>

      {/* Modal penawaran */}
      <Modal open={showQ} onClose={() => setShowQ(false)} title="Penawaran Baru" subtitle="Masuk ke tahap pipeline terpilih"
        wide footer={<><button className="btn-secondary" onClick={() => setShowQ(false)}>Batal</button><button className="btn-primary" onClick={saveQuotation}>Simpan Penawaran</button></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label="Klien">
              <select className="input" value={qForm.client} onChange={(e) => setQForm({ ...qForm, client: e.target.value })}>
                <option value="">Pilih klien…</option>
                {clients.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Kapal / pekerjaan"><input className="input" value={qForm.vessel} onChange={(e) => setQForm({ ...qForm, vessel: e.target.value })} placeholder="cth: TB Baru RJ-04" /></Field>
            <Field label="Jenis">
              <select className="input" value={qForm.type} onChange={(e) => setQForm({ ...qForm, type: e.target.value })}>
                <option>New Build</option><option>Repair</option><option>Retrofit</option>
              </select>
            </Field>
            <Field label="Tahap awal">
              <select className="input" value={qForm.stage} onChange={(e) => setQForm({ ...qForm, stage: e.target.value })}>
                {FLOW.map((s) => <option key={s}>{s}</option>)}
              </select>
            </Field>
          </FormGrid>
          <FormGrid>
            <Field label="Nilai penawaran (Rp)" hint="Harus lebih dari 0"><input type="number" min={1} className="input" value={qForm.value} onChange={(e) => setQForm({ ...qForm, value: e.target.value })} /></Field>
            <Field label="Tanggal penawaran"><input type="date" className="input" value={qForm.date} onChange={(e) => setQForm({ ...qForm, date: e.target.value })} /></Field>
          </FormGrid>
        </div>
      </Modal>

      {/* Modal klien */}
      <Modal open={showClient} onClose={() => setShowClient(false)} title="Tambah Klien"
        footer={<><button className="btn-secondary" onClick={() => setShowClient(false)}>Batal</button><button className="btn-primary" onClick={saveClient}>Simpan</button></>}>
        <div className="space-y-3">
          <Field label="Nama perusahaan"><input className="input" value={cForm.name} onChange={(e) => setCForm({ ...cForm, name: e.target.value })} placeholder="cth: PT Bahari Baru" /></Field>
          <FormGrid>
            <Field label="Jumlah armada"><input type="number" className="input" value={cForm.fleet} onChange={(e) => setCForm({ ...cForm, fleet: e.target.value })} /></Field>
            <Field label="Rating (%)"><input type="number" max={100} className="input" value={cForm.rating} onChange={(e) => setCForm({ ...cForm, rating: e.target.value })} /></Field>
          </FormGrid>
        </div>
      </Modal>

      {/* Modal undangan portal */}
      <Modal open={showInvite} onClose={() => setShowInvite(false)} title="Kirim Undangan Portal"
        footer={<><button className="btn-secondary" onClick={() => setShowInvite(false)}>Batal</button><button className="btn-primary" onClick={() => {
          if (!inviteEmail.includes("@")) { toast("Email tidak valid", "info"); return; }
          toast(`Undangan terkirim ke ${inviteEmail}`); setShowInvite(false); setInviteEmail("");
        }}>Kirim</button></>}>
        <Field label="Email klien"><input type="email" className="input" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="cth: ops@samudrajaya.co.id" /></Field>
      </Modal>

      {/* Modal kirim penawaran */}
      <Modal open={sendTarget !== null} onClose={() => setSendTarget(null)} title={`Kirim ${sendTarget?.id ?? ""}`} subtitle="Pratinjau penawaran sebelum dikirim"
        wide footer={<><button className="btn-secondary" onClick={() => setSendTarget(null)}>Batal</button><button className="btn-primary" onClick={confirmSend}><Send className="h-4 w-4" /> Kirim Penawaran</button></>}>
        {sendTarget && (
          <div className="space-y-3">
            <div className="rounded-xl bg-surface p-4 text-sm">
              <p className="font-semibold text-navy-900">{sendTarget.vessel}</p>
              <p className="text-xs text-steel-500">{sendTarget.client} · {sendTarget.type}</p>
              <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1">
                <span className="text-steel-600">Nilai: <strong className="text-navy-900">{fmtMiliar(Number(sendTarget.value) || 0)}</strong></span>
                <span className="text-steel-600">Tanggal: <strong className="text-navy-900">{fmtTanggal(sendTarget.date)}</strong></span>
                <span className="text-steel-600">Tahap: <strong className="text-navy-900">{sendTarget.stage}</strong></span>
              </div>
            </div>
            <Field label="Email tujuan"><input type="email" className="input" value={sendEmail} onChange={(e) => setSendEmail(e.target.value)} placeholder="cth: purchasing@klien.co.id" /></Field>
            <Field label="Pesan pengantar"><textarea className="input" rows={5} value={sendMsg} onChange={(e) => setSendMsg(e.target.value)} /></Field>
          </div>
        )}
      </Modal>

      <ConfirmModal
        open={convertTarget !== null}
        title={`Konversi ${convertTarget?.id ?? ""} jadi proyek?`}
        desc={convertTarget && (convertTarget.stage === "Terkonversi" || data.projects.some((p) => p.vessel === convertTarget.vessel))
          ? "Quotation ini sudah terkonversi atau proyek untuk kapal ini sudah ada. Konversi ganda akan ditolak."
          : "Quotation akan dikunci ke tahap Terkonversi dan dibuat satu proyek baru. Konversi ganda tidak diizinkan."}
        confirmLabel="Ya, konversi"
        onCancel={() => setConvertTarget(null)}
        onConfirm={confirmConvert}
      />
    </div>
  );
}
