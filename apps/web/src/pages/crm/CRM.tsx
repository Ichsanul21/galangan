import { useState } from "react";
import { Plus, Send, Users2, Star, Handshake } from "lucide-react";
import { Card, CardHeader, PageHeader, Badge, KpiCard, Tabs, ProgressBar, Donut } from "../../components/ui";
import { clients, quotations, fmtMiliar, fmtRupiah, quotationStageDist, sparkRevenue } from "../../data";

const stages = ["Lead", "Penawaran", "Negosiasi", "Menang"];

export default function CRM() {
  const [tab, setTab] = useState("Pipeline");

  const pipelineTotal = quotations.reduce((s, q) => s + q.value, 0);
  const won = quotations.filter((q) => q.stage === "Menang").reduce((s, q) => s + q.value, 0);

  return (
    <div>
      <PageHeader
        title="CRM & Manajemen Klien"
        subtitle="Penawaran, pipeline penjualan, dan armada klien"
        icon={<Handshake className="h-5 w-5" />}
        actions={<button className="btn-primary-gradient"><Plus className="h-4 w-4" /> Penawaran Baru</button>}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total Klien Aktif" value={String(clients.length)} icon={<Users2 className="h-5 w-5" />} chip="navy" spark={sparkRevenue} hint="Rata-rata 10 kapal/fleet" />
        <KpiCard label="Nilai Pipeline" value={fmtMiliar(pipelineTotal)} delta="14 penawaran aktif" deltaDirection="up" chip="teal" hint="Lead → Menang" />
        <KpiCard label="Win Rate" value="68%" delta="+5pt vs kuartal lalu" deltaDirection="up" icon={<Star className="h-5 w-5" />} chip="violet" />
        <KpiCard label="Nilai Kontrak Menang" value={fmtMiliar(won)} delta="QT-054 & lainnya" deltaDirection="up" chip="amber" hint="Bulan berjalan" />
      </div>

      <div className="mt-4 card">
        <Tabs tabs={["Pipeline", "Klien", "Penawaran", "Portal Klien"]} active={tab} onChange={setTab} />
        <div className="p-4">
          {tab === "Pipeline" && (
            <div className="space-y-4">
              <Card>
                <CardHeader title="Distribusi Nilai Penawaran" subtitle="Nilai pipeline per tahap (milyar Rupiah)" />
                <div className="flex flex-wrap items-center gap-6 p-4 pt-0">
                  <Donut data={quotationStageDist} colors={quotationStageDist.map((d) => d.color)} size={150} thickness={20} centerValue="34" centerLabel="M" />
                  <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
                    {quotationStageDist.map((d) => (
                      <div key={d.name} className="flex items-center gap-2 text-sm">
                        <span className="h-3 w-3 rounded-sm" style={{ background: d.color }} />
                        <span className="text-steel-600">{d.name}</span>
                        <span className="ml-auto font-semibold text-navy-900">{d.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                {stages.map((stage) => {
                  const items = quotations.filter((q) => q.stage === stage);
                  return (
                    <div key={stage} className="rounded-xl bg-surface p-3">
                      <div className="mb-3 flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-navy-900">{stage}</h3>
                        <Badge tone="gray">{items.length}</Badge>
                      </div>
                      <div className="space-y-2.5">
                        {items.map((q) => (
                          <Card key={q.id} className="card-hover p-3">
                            <p className="text-sm font-semibold text-navy-900">{q.vessel}</p>
                            <p className="text-xs text-steel-500">{q.client}</p>
                            <p className="text-xs text-steel-500 mt-0.5">{q.type}</p>
                            <div className="mt-2 flex items-center justify-between">
                              <span className="font-semibold text-navy-800">{fmtMiliar(q.value)}</span>
                              <Badge tone={stage === "Menang" ? "green" : "gray"}>{q.id}</Badge>
                            </div>
                          </Card>
                        ))}
                        {items.length === 0 && <p className="text-xs text-steel-400 text-center py-4">Kosong</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {tab === "Klien" && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {clients.map((c) => (
                <Card key={c.id} className="p-5">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-navy-700 text-sm font-bold text-white">
                        {c.name.replace("PT ", "").split(" ").map((n) => n[0]).slice(0, 2).join("")}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-navy-900">{c.name}</p>
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
                      <span className="text-steel-500">Nilai order</span>
                      <span className="font-semibold">{fmtRupiah(c.fleet * 48000000000 / 100)}</span>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {tab === "Penawaran" && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {quotations.map((q) => (
                <Card key={q.id} className="p-4">
                  <div className="flex justify-between">
                    <div>
                      <p className="font-semibold text-navy-900">{q.vessel}</p>
                      <p className="text-xs text-steel-500">{q.client} · {q.type}</p>
                    </div>
                    <Badge tone={q.stage === "Menang" ? "green" : q.stage === "Negosiasi" ? "amber" : "gray"}>{q.stage}</Badge>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-lg font-bold text-navy-900">{fmtMiliar(q.value)}</span>
                    <button className="btn-secondary text-xs"><Send className="h-3.5 w-3.5" /> Kirim</button>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {tab === "Portal Klien" && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <p className="text-sm text-steel-600 mb-3">Portal klien adalah tampilan read-only di mana pemilik kapal bisa memantau progres proyek & invoice miliknya.</p>
                <Card className="p-4">
                  <p className="text-xs text-steel-500">PT Samudra Jaya Perkasa — TB Samudra Jaya 07</p>
                  <div className="mt-2 flex items-center gap-4">
                    <ProgressBar value={62} className="flex-1" />
                    <span className="text-sm font-bold text-navy-900">62%</span>
                  </div>
                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    {[
                      { k: "Tahap", v: "Pengecatan" },
                      { k: "Delivery", v: "30 Sep 2026" },
                      { k: "Invoice", v: "INV-2607" },
                    ].map((x) => (
                      <div key={x.k} className="rounded-lg bg-surface p-3">
                        <p className="text-xs text-steel-500">{x.k}</p>
                        <p className="text-sm font-semibold text-navy-900">{x.v}</p>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
              <Card className="p-5">
                <h3 className="mb-2 text-sm font-semibold text-navy-900">Akses Portal</h3>
                <p className="text-sm text-steel-600">Undang klien untuk melihat progres proyek secara real-time.</p>
                <button className="btn-primary mt-4 w-full justify-center"><Send className="h-4 w-4" /> Kirim Undangan</button>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
