import { useState } from "react";
import {
  Wallet,
  ArrowDownToLine,
  FileText,
  Receipt,
  TrendingUp,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Card,
  CardHeader,
  PageHeader,
  KpiCard,
  Tabs,
  StatusBadge,
  ChartTooltip,
  Donut,
  Modal,
  Field,
  FormGrid,
  toast,
} from "../../components/ui";
import { useStore, type StoreItem } from "../../data/store";
import {
  fmtRupiah,
  fmtMiliar,
  cashflowSeries,
  agingBuckets,
  plSummary,
  sparkRevenue,
} from "../../data";

const INV_STATUS = ["Draft", "Belum Dibayar", "Terlambat", "Lunas"];

export default function Finance() {
  const { data, add, update } = useStore();
  const invoices = data.invoices;
  const payables = data.payables;
  const [tab, setTab] = useState("Piutang (AR)");

  const [showInv, setShowInv] = useState(false);
  const [invForm, setInvForm] = useState({ project: "", amount: "", due: "", paymentTerm: "Termin 1" });
  const [payTarget, setPayTarget] = useState<StoreItem | null>(null);
  const [showAp, setShowAp] = useState(false);
  const [apForm, setApForm] = useState({ v: "", po: "", amt: "", due: "" });

  const arTotal = invoices
    .filter((i) => i.status !== "Lunas" && i.status !== "Draft")
    .reduce((s, i) => s + Number(i.amount || 0), 0);
  const apTotal = payables.filter((a) => a.st !== "Lunas").reduce((s, a) => s + Number(a.amt || 0), 0);
  const lateCount = invoices.filter((i) => i.status === "Terlambat").length;

  const setInv = (k: string, v: string) => setInvForm((f) => ({ ...f, [k]: v }));

  const saveInvoice = () => {
    const proj = data.projects.find((p) => p.id === invForm.project);
    if (!proj) { toast("Pilih proyek dulu", "info"); return; }
    const amount = Number(invForm.amount);
    if (!amount || amount <= 0) { toast("Nominal tidak valid", "info"); return; }
    const created = add("invoices", {
      client: proj.client, project: proj.id, amount, due: invForm.due || "-", status: "Draft", paymentTerm: invForm.paymentTerm,
    }, { action: "menerbitkan invoice", module: "Keuangan" });
    toast(`Invoice ${created.id} dibuat (Draft)`);
    setShowInv(false);
    setInvForm({ project: "", amount: "", due: "", paymentTerm: "Termin 1" });
  };

  return (
    <div>
      <PageHeader
        title="Keuangan & Billing"
        subtitle="Piutang, hutang, invoice, dan profitabilitas proyek"
        icon={<Wallet className="h-5 w-5" />}
        actions={<button className="btn-primary-gradient" onClick={() => setShowInv(true)}><FileText className="h-4 w-4" /> Buat Invoice</button>}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total Piutang (AR)" value={fmtMiliar(arTotal)} delta={`${lateCount} telat`} deltaDirection="down" icon={<Wallet className="h-5 w-5" />} chip="rose" spark={sparkRevenue} />
        <KpiCard label="Total Hutang (AP)" value={fmtMiliar(apTotal)} hint="Kepada vendor" icon={<Wallet className="h-5 w-5" />} chip="navy" />
        <KpiCard label="Cashflow Masuk (Ags)" value="Rp 10,1 M" delta="+11% vs bulan lalu" deltaDirection="up" icon={<ArrowDownToLine className="h-5 w-5" />} chip="teal" />
        <KpiCard label="EBITDA Kuartalan" value="Rp 13,0 M" delta="+22% QoQ" deltaDirection="up" icon={<TrendingUp className="h-5 w-5" />} chip="violet" />
      </div>

      <div className="mt-4 card">
        <Tabs tabs={["Piutang (AR)", "Hutang (AP)", "Invoice", "Project P&L"]} active={tab} onChange={setTab} />
        <div className="p-4">
          {tab === "Piutang (AR)" && (
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <CardHeader title="Daftar Invoice" subtitle="Klik status untuk update · terhubung ke proyek" />
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-surface">
                      <tr><th className="th">Invoice</th><th className="th">Proyek</th><th className="th">Nilai</th><th className="th">Jatuh Tempo</th><th className="th">Status</th><th className="th">Aksi</th></tr>
                    </thead>
                    <tbody className="divide-y divide-steel-100">
                      {invoices.map((inv) => (
                        <tr key={inv.id} className="hover:bg-surface">
                          <td className="td">
                            <p className="font-medium text-navy-900 font-mono">{inv.id}</p>
                            <p className="text-xs text-steel-500">{inv.client}</p>
                          </td>
                          <td className="td text-steel-600 font-mono text-xs">{inv.project}</td>
                          <td className="td font-semibold text-navy-900">{fmtRupiah(inv.amount)}</td>
                          <td className="td text-steel-600">{inv.due}</td>
                          <td className="td"><StatusBadge status={inv.status} /></td>
                          <td className="td">
                            <select
                              className="input w-auto py-1 text-xs"
                              value={inv.status}
                              onChange={(e) => { update("invoices", inv.id, { status: e.target.value }); toast(`${inv.id} → ${e.target.value}`); }}
                            >
                              {INV_STATUS.map((s) => <option key={s}>{s}</option>)}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="space-y-5">
                <div>
                  <CardHeader title="Aging Piutang" subtitle="Nilai dalam milyar Rupiah" />
                  <div className="flex items-center gap-4 p-1">
                    <Donut
                      data={agingBuckets}
                      colors={agingBuckets.map((a) => a.color)}
                      size={140}
                      thickness={18}
                      centerValue="19.3"
                      centerLabel="M"
                    />
                    <div className="flex-1 space-y-2">
                      {agingBuckets.map((a) => (
                        <div key={a.name} className="flex items-center gap-2 text-sm">
                          <span className="h-3 w-3 rounded-sm" style={{ background: a.color }} />
                          <span className="text-steel-600">{a.name}</span>
                          <span className="ml-auto font-semibold text-navy-900">{a.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <p className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  <Receipt className="h-3.5 w-3.5" /> {lateCount} invoice terlambat ·
                  <button className="font-semibold underline" onClick={() => setPayTarget(invoices.find((i) => i.status === "Terlambat") ?? null)}>
                    tandai lunas
                  </button>
                </p>
              </div>
            </div>
          )}

          {tab === "Hutang (AP)" && (
            <div className="space-y-5">
              <div className="flex justify-end">
                <button className="btn-secondary text-xs" onClick={() => setShowAp(true)}>+ Catat Hutang</button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-surface">
                    <tr><th className="th">Vendor</th><th className="th">PO</th><th className="th">Nilai</th><th className="th">Jatuh Tempo</th><th className="th">PPh 23</th><th className="th">Status</th><th className="th">Aksi</th></tr>
                  </thead>
                  <tbody className="divide-y divide-steel-100">
                    {payables.map((a) => (
                      <tr key={a.id} className="hover:bg-surface">
                        <td className="td font-medium text-navy-900">{a.v}</td>
                        <td className="td font-mono text-xs text-steel-600">{a.po}</td>
                        <td className="td font-semibold">{fmtRupiah(a.amt)}</td>
                        <td className="td text-steel-600">{a.due}</td>
                        <td className="td text-steel-600">{a.pph}</td>
                        <td className="td"><StatusBadge status={a.st} /></td>
                        <td className="td">
                          {a.st !== "Lunas" && (
                            <button className="btn-secondary text-xs" onClick={() => { update("payables", a.id, { st: "Lunas" }); toast(`${a.po} dilunasi`); }}>
                              Bayar
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Card>
                <CardHeader title="Arus Kas Bulanan" subtitle="Masuk vs keluar (milyar Rupiah)" />
                <div className="h-56 p-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={cashflowSeries} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                      <defs>
                        <linearGradient id="cp" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#0d9488" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#0d9488" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e9eff4" vertical={false} />
                      <XAxis dataKey="month" stroke="#8aa2b6" axisLine={false} tickLine={false} />
                      <YAxis stroke="#8aa2b6" axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTooltip formatter={(v) => `Rp ${v} M`} />} />
                      <Area type="monotone" dataKey="masuk" name="Masuk" stroke="#0d9488" strokeWidth={2.5} fill="url(#cp)" />
                      <Area type="monotone" dataKey="keluar" name="Keluar" stroke="#e11d48" strokeWidth={2} fill="transparent" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </div>
          )}

          {tab === "Invoice" && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <Card className="p-5 lg:col-span-2">
                <CardHeader title="Pergerakan Invoice" subtitle="Penerbitan & status koleksi" />
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={cashflowSeries} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e9eff4" />
                      <XAxis dataKey="month" stroke="#8aa2b6" axisLine={false} tickLine={false} />
                      <YAxis stroke="#8aa2b6" axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTooltip formatter={(v) => `Rp ${v} M`} />} />
                      <Area type="monotone" dataKey="masuk" name="Diterbitkan" stroke="#0b3a63" strokeWidth={2.5} fill="#8cc9e8" fillOpacity={0.3} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </Card>
              <Card className="p-5">
                <CardHeader title="Dokumen Invoice" />
                <p className="text-sm text-steel-600">
                  Dokumen invoice per proyek & termin — preview PDF, tanda tangan digital, dan pengiriman otomatis ke klien melalui email.
                </p>
                <button className="btn-secondary mt-4 w-full justify-center" onClick={() => toast("Template invoice dibuka (demo)", "info")}>Lihat Template</button>
                <button className="btn-primary mt-2 w-full justify-center" onClick={() => setShowInv(true)}>Buat Invoice</button>
              </Card>
            </div>
          )}

          {tab === "Project P&L" && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                {data.projects.slice(0, 6).map((p) => {
                  const rev = data.invoices.filter((i) => i.project === p.id).reduce((s, i) => s + Number(i.amount || 0), 0);
                  const margin = rev - Number(p.actual || 0);
                  return (
                    <Card key={p.id} className="card-hover p-4">
                      <p className="text-xs text-steel-500 font-mono">{p.id} · {p.vessel}</p>
                      <p className="mt-1 text-sm font-semibold text-navy-900">Margin {fmtMiliar(margin)}</p>
                      <div className="mt-2 text-xs text-steel-500">
                        <p>Tertagih {fmtMiliar(rev)} · Cost {fmtMiliar(p.actual)}</p>
                        <p className={`mt-1 font-medium ${margin >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                          Margin {rev ? Math.round((margin / rev) * 100) : 0}%
                        </p>
                      </div>
                    </Card>
                  );
                })}
              </div>
              <Card>
                <CardHeader title="Rekap Kuartalan" subtitle="Revenue, biaya, laba kotor & EBITDA (milyar Rupiah)" />
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-surface">
                      <tr><th className="th">Periode</th><th className="th">Revenue</th><th className="th">Biaya</th><th className="th">Gross</th><th className="th">EBITDA</th><th className="th">Margin</th></tr>
                    </thead>
                    <tbody className="divide-y divide-steel-100">
                      {plSummary.map((p) => (
                        <tr key={p.month} className="hover:bg-surface">
                          <td className="td font-medium text-navy-900">{p.month}</td>
                          <td className="td">{fmtMiliar(p.revenue)}</td>
                          <td className="td text-steel-600">{fmtMiliar(p.cost)}</td>
                          <td className="td font-semibold text-emerald-600">{fmtMiliar(p.gross)}</td>
                          <td className="td font-semibold">{fmtMiliar(p.ebitda)}</td>
                          <td className="td"><span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">{Math.round((p.gross / p.revenue) * 100)}%</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          )}
        </div>
      </div>

      {/* Modal buat invoice */}
      <Modal open={showInv} onClose={() => setShowInv(false)} title="Buat Invoice" subtitle="Klien & termin mengikuti proyek terpilih"
        footer={<><button className="btn-secondary" onClick={() => setShowInv(false)}>Batal</button><button className="btn-primary" onClick={saveInvoice}>Terbitkan (Draft)</button></>}>
        <div className="space-y-3">
          <Field label="Proyek">
            <select className="input" value={invForm.project} onChange={(e) => setInv("project", e.target.value)}>
              <option value="">Pilih proyek…</option>
              {data.projects.map((p) => <option key={p.id} value={p.id}>{p.id} · {p.vessel} · {p.client}</option>)}
            </select>
          </Field>
          <FormGrid>
            <Field label="Nilai (Rp)"><input type="number" min={0} className="input" value={invForm.amount} onChange={(e) => setInv("amount", e.target.value)} /></Field>
            <Field label="Jatuh tempo"><input type="date" className="input" value={invForm.due} onChange={(e) => setInv("due", e.target.value)} /></Field>
          </FormGrid>
          <Field label="Termin">
            <select className="input" value={invForm.paymentTerm} onChange={(e) => setInv("paymentTerm", e.target.value)}>
              {["Termin 1", "Termin 2", "Termin 3", "Milestone 1", "Milestone 2", "Milestone 3", "Progress", "Final"].map((t) => <option key={t}>{t}</option>)}
            </select>
          </Field>
        </div>
      </Modal>

      {/* Modal tandai lunas */}
      <Modal open={payTarget !== null} onClose={() => setPayTarget(null)} title={`Tandai lunas ${payTarget?.id}?`} subtitle={`${payTarget?.client} · ${fmtRupiah(payTarget?.amount ?? 0)}`}
        footer={<><button className="btn-secondary" onClick={() => setPayTarget(null)}>Batal</button><button className="btn-primary" onClick={() => { if (payTarget) { update("invoices", payTarget.id, { status: "Lunas" }); toast(`${payTarget.id} lunas — terima kasih!`); } setPayTarget(null); }}>Ya, sudah dibayar</button></>}>
        <p className="text-sm text-steel-600">Pembayaran tercatat dan piutang berkurang otomatis di dasbor.</p>
      </Modal>

      {/* Modal hutang */}
      <Modal open={showAp} onClose={() => setShowAp(false)} title="Catat Hutang Vendor"
        footer={<><button className="btn-secondary" onClick={() => setShowAp(false)}>Batal</button><button className="btn-primary" onClick={() => {
          if (!apForm.v.trim() || !apForm.amt) { toast("Vendor & nominal wajib diisi", "info"); return; }
          const created = add("payables", { v: apForm.v.trim(), po: apForm.po.trim() || "-", amt: Number(apForm.amt) || 0, due: apForm.due || "-", pph: "2%", st: "Belum Dibayar" },
            { action: "mencatat hutang", module: "Keuangan" });
          toast(`Hutang ${created.id} dicatat`); setShowAp(false); setApForm({ v: "", po: "", amt: "", due: "" });
        }}>Simpan</button></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label="Vendor"><input className="input" value={apForm.v} onChange={(e) => setApForm({ ...apForm, v: e.target.value })} /></Field>
            <Field label="Referensi PO"><input className="input font-mono" value={apForm.po} onChange={(e) => setApForm({ ...apForm, po: e.target.value })} /></Field>
            <Field label="Nilai (Rp)"><input type="number" className="input" value={apForm.amt} onChange={(e) => setApForm({ ...apForm, amt: e.target.value })} /></Field>
            <Field label="Jatuh tempo"><input type="date" className="input" value={apForm.due} onChange={(e) => setApForm({ ...apForm, due: e.target.value })} /></Field>
          </FormGrid>
        </div>
      </Modal>
    </div>
  );
}
