import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Ship, FileCheck2, History } from "lucide-react";
import { Card, PageHeader, Badge, KpiCard } from "../../components/ui";
import { vessels } from "../../data";

export default function VesselDetail() {
  const { id } = useParams();
  const v = vessels.find((x) => x.id === id) ?? vessels[0];

  return (
    <div>
      <Link to="/kapal" className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-ocean-600 hover:underline">
        <ArrowLeft className="h-4 w-4" /> Kembali ke Kapal
      </Link>
      <PageHeader
        title={v.name}
        subtitle={`${v.imo} · ${v.class} · ${v.flag} · Dibangun ${v.built}`}
        actions={<Badge tone="blue">{v.status}</Badge>}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="LOA" value={`${v.loa} m`} icon={<Ship className="h-5 w-5" />} />
        <KpiCard label="Beam" value={`${v.beam} m`} icon={<Ship className="h-5 w-5" />} />
        <KpiCard label="Draft" value={`${v.draft} m`} icon={<Ship className="h-5 w-5" />} />
        <KpiCard label="Bollard Pull" value={`${v.bollard} T`} icon={<Ship className="h-5 w-5" />} />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-1">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-navy-900"><FileCheck2 className="h-4 w-4" /> Sertifikat & Kepatuhan</h3>
          <div className="space-y-2.5">
            {v.certificates.map((c) => {
              const tone = c.tone as "green" | "amber" | "red";
              return (
                <div key={c.name} className="rounded-lg border border-steel-100 p-3">
                  <p className="text-sm font-medium text-navy-900">{c.name}</p>
                  <p className="text-xs text-steel-500">Terbit {c.issued} · Berakhir {c.expires}</p>
                  <Badge tone={tone} className="mt-1">
                    {tone === "green" ? "Berlaku" : tone === "amber" ? "Hampir Expire" : "Kedaluwarsa"}
                  </Badge>
                </div>
              );
            })}
            {v.certificates.length === 0 && (
              <p className="text-sm text-steel-400">Belum ada sertifikat — kapal masih dalam pembangunan.</p>
            )}
          </div>
        </Card>

        <Card className="p-5 lg:col-span-2">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-navy-900"><History className="h-4 w-4" /> Timeline Riwayat</h3>
          <div className="space-y-0">
            {v.history.map((h, i) => (
              <div key={i} className="relative flex gap-4 pb-6 last:pb-0">
                <div className="flex flex-col items-center">
                  <span className={`h-3 w-3 rounded-full ${i === 0 ? "bg-ocean-500" : "bg-steel-300"}`} />
                  {i < v.history.length - 1 && <span className="w-px flex-1 bg-steel-200" />}
                </div>
                <div className="pb-1">
                  <p className="text-sm font-semibold text-navy-900">{h.event}</p>
                  <p className="text-xs text-steel-500">{h.date} · {h.type}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="mt-5 p-5">
        <h3 className="mb-3 text-sm font-semibold text-navy-900">Spesifikasi Teknis</h3>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div className="rounded-lg bg-surface p-3"><dt className="text-xs text-steel-500">Tipe</dt><dd className="text-sm font-medium text-navy-900">{v.type}</dd></div>
          <div className="rounded-lg bg-surface p-3"><dt className="text-xs text-steel-500">Pemilik</dt><dd className="text-sm font-medium text-navy-900">{v.owner}</dd></div>
          <div className="rounded-lg bg-surface p-3"><dt className="text-xs text-steel-500">Class</dt><dd className="text-sm font-medium text-navy-900">{v.class}</dd></div>
          <div className="rounded-lg bg-surface p-3"><dt className="text-xs text-steel-500">Bendera</dt><dd className="text-sm font-medium text-navy-900">{v.flag}</dd></div>
          <div className="rounded-lg bg-surface p-3"><dt className="text-xs text-steel-500">LOA / Beam / Draft</dt><dd className="text-sm font-medium text-navy-900">{v.loa} / {v.beam} / {v.draft} m</dd></div>
          <div className="rounded-lg bg-surface p-3"><dt className="text-xs text-steel-500">Bollard Pull</dt><dd className="text-sm font-medium text-navy-900">{v.bollard} T</dd></div>
        </dl>
      </Card>
    </div>
  );
}
