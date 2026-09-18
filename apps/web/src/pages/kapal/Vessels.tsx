import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Search, Ship, Anchor, FileCheck2 } from "lucide-react";
import { Card, CardHeader, PageHeader, Badge, KpiCard, Modal, Field, FormGrid, toast } from "../../components/ui";
import { useStore } from "../../data/store";
import { fleetTrend, dockingTrend, buildTrend, certTrend } from "../../data";
import { fmtTanggal, todayISO } from "../../utils/format";

const statusTone: Record<string, "green" | "blue" | "amber" | "gray"> = {
  "Dalam Docking": "blue",
  "Dalam Pembangunan": "amber",
  "Dalam Operasi": "green",
  "Menganggur": "gray",
};

const CLASS_OPTIONS = ["BKI", "ABS", "DNV", "LR", "NK"];
const FLAG_OPTIONS = ["Indonesia", "Panama", "Singapura", "Malaysia"];

function monthDiff(expires: string, base: string): number | null {
  const m1 = /^(\d{4})-(\d{2})$/.exec(expires ?? "");
  const m2 = /^(\d{4})-(\d{2})$/.exec(base ?? "");
  if (!m1 || !m2) return null;
  return (Number(m1[1]) - Number(m2[1])) * 12 + (Number(m1[2]) - Number(m2[2]));
}

function certNeedsAttention(expires: string, nowMonth: string): boolean {
  const d = monthDiff(expires, nowMonth);
  return d !== null && d <= 3;
}

const emptyForm = {
  name: "", imo: "", type: "", owner: "", loa: "", beam: "", draft: "", bollard: "",
  status: "Dalam Operasi", class: "BKI", flag: "Indonesia",
};

export default function Vessels() {
  const { data, add } = useStore();
  const vessels = data.vessels;
  const [q, setQ] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const nowMonth = todayISO().slice(0, 7);
  const list = vessels.filter((v) => `${v.name} ${v.imo}`.toLowerCase().includes(q.toLowerCase()));
  const expiring = vessels.filter((v) =>
    (v.certificates ?? []).some((c: { expires: string }) => certNeedsAttention(c.expires, nowMonth))
  ).length;

  const save = () => {
    if (!form.name.trim() || !form.owner.trim() || !form.imo.trim()) { toast("Nama kapal, IMO & pemilik wajib diisi", "info"); return; }
    const imo = form.imo.trim();
    if (vessels.some((v) => String(v.imo).toLowerCase() === imo.toLowerCase())) {
      toast(`IMO ${imo} sudah terdaftar — gunakan nomor IMO yang unik`, "info");
      return;
    }
    if (!form.type.trim()) { toast("Tipe kapal wajib diisi", "info"); return; }
    const dims = { loa: Number(form.loa), beam: Number(form.beam), draft: Number(form.draft), bollard: Number(form.bollard) };
    if (Object.values(dims).some((n) => !Number.isFinite(n))) { toast("LOA, beam, draft & bollard wajib diisi angka", "info"); return; }
    const hasZero = Object.values(dims).some((n) => n <= 0);
    if (form.status !== "Dalam Pembangunan" && hasZero) {
      toast("LOA, beam, draft & bollard harus lebih dari 0", "info");
      return;
    }
    const warnZero = form.status === "Dalam Pembangunan" && hasZero;
    const created = add("vessels", {
      name: form.name.trim(), imo, type: form.type.trim(), class: form.class, flag: form.flag,
      built: new Date().getFullYear(), owner: form.owner.trim(),
      loa: dims.loa, beam: dims.beam, draft: dims.draft, bollard: dims.bollard,
      status: form.status, certificates: [],
      history: [{ date: todayISO(), event: "Kapal didaftarkan", type: "Registrasi" }],
    }, { action: "mendaftarkan kapal", module: "Kapal" });
    toast(warnZero ? `Kapal ${created.id} terdaftar — dimensi 0 diizinkan karena masih dalam pembangunan` : `Kapal ${created.id} terdaftar`);
    setShowAdd(false);
    setForm(emptyForm);
  };

  return (
    <div>
      <PageHeader
        title="Rekam Jejak Kapal"
        subtitle="Data teknis, riwayat survey/docking, dan sertifikat per kapal"
        icon={<Ship className="h-5 w-5" />}
        actions={<button className="btn-primary-gradient" onClick={() => setShowAdd(true)}><Plus className="h-4 w-4" /> Daftarkan Kapal</button>}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total Kapal Terdaftar" value={String(vessels.length)} icon={<Ship className="h-5 w-5" />} chip="navy" spark={fleetTrend} hint="Armada tercatat sistem" />
        <KpiCard label="Dalam Docking" value={String(vessels.filter((v) => v.status === "Dalam Docking").length)} icon={<Anchor className="h-5 w-5" />} chip="teal" spark={dockingTrend} />
        <KpiCard label="Dalam Pembangunan" value={String(vessels.filter((v) => v.status === "Dalam Pembangunan").length)} icon={<Anchor className="h-5 w-5" />} chip="violet" spark={buildTrend} />
        <KpiCard label="Sertifikat Perlu Perhatian" value={String(expiring)} delta="Expire ≤90 hari" deltaDirection="down" icon={<FileCheck2 className="h-5 w-5" />} chip="rose" spark={certTrend} />
      </div>

      <div className="mt-4">
        <div className="mb-3 relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-steel-400" />
          <input className="input pl-9 w-full sm:w-64" placeholder="Cari kapal / IMO..." aria-label="Cari kapal" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.map((v) => (
            <Link to={`/kapal/${v.id}`} key={v.id}>
              <Card className="p-5 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-ocean-500/15 text-ocean-600">
                        <Ship className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-navy-900">{v.name}</p>
                        <p className="text-xs text-steel-500 font-mono">{v.imo}</p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-steel-500">{v.type}</p>
                    <p className="text-xs text-steel-500">{v.owner}</p>
                  </div>
                  <Badge tone={statusTone[v.status] ?? "gray"}>{v.status}</Badge>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 border-t border-steel-100 pt-3 text-center">
                  <div><p className="text-sm font-bold text-navy-900">{v.loa}m</p><p className="text-[10px] text-steel-500">LOA</p></div>
                  <div><p className="text-sm font-bold text-navy-900">{v.bollard}T</p><p className="text-[10px] text-steel-500">Bollard</p></div>
                  <div><p className="text-sm font-bold text-navy-900">{v.built}</p><p className="text-[10px] text-steel-500">Tahun</p></div>
                </div>
                {(v.certificates ?? []).length > 0 && (
                  <p className="mt-2 text-[11px] text-steel-400">{(v.certificates ?? []).length} sertifikat · {data.surveys.filter((s) => s.vessel === v.name).length} survey terjadwal</p>
                )}
              </Card>
            </Link>
          ))}
        </div>
        {list.length === 0 && <p className="py-8 text-center text-sm text-steel-400">Tidak ada kapal yang cocok.</p>}

        <Card className="mt-5">
          <CardHeader title="Kegiatan Survey Terjadwal" subtitle="Jadwal survey class & docking" />
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="sticky top-0 z-10 bg-surface">
                <tr><th className="th">Kapal</th><th className="th">Tipe Survey</th><th className="th">Surveyor</th><th className="th">Tanggal</th><th className="th">Status</th></tr>
              </thead>
              <tbody className="divide-y divide-steel-100">
                {data.surveys.map((s) => (
                  <tr key={s.id} className="hover:bg-surface">
                    <td className="td font-medium text-navy-900">{s.vessel}</td>
                    <td className="td text-steel-600">{s.type}</td>
                    <td className="td text-steel-600">{s.classSurveyor}</td>
                    <td className="td font-mono text-xs text-steel-600">{fmtTanggal(String(s.date))}</td>
                    <td className="td"><Badge tone={s.status === "Selesai" ? "green" : s.status === "Dalam Proses" ? "blue" : "gray"}>{s.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Modal daftar kapal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Daftarkan Kapal Baru"
        wide footer={<><button className="btn-secondary" onClick={() => setShowAdd(false)}>Batal</button><button className="btn-primary" onClick={save}>Daftarkan</button></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label="Nama kapal"><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="cth: TB Samudra Jaya 08" /></Field>
            <Field label="Nomor IMO"><input className="input font-mono" value={form.imo} onChange={(e) => setForm({ ...form, imo: e.target.value })} placeholder="cth: IMO 9934567" /></Field>
            <Field label="Tipe"><input className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} placeholder="cth: Tugboat ASD 2x1600 HP" /></Field>
            <Field label="Pemilik"><input className="input" value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} placeholder="cth: PT Samudra Jaya Perkasa" /></Field>
            <Field label="LOA (m)"><input type="number" min={0} step={0.1} className="input" value={form.loa} onChange={(e) => setForm({ ...form, loa: e.target.value })} placeholder="cth: 30" /></Field>
            <Field label="Beam (m)"><input type="number" min={0} step={0.1} className="input" value={form.beam} onChange={(e) => setForm({ ...form, beam: e.target.value })} placeholder="cth: 9,5" /></Field>
            <Field label="Draft (m)"><input type="number" min={0} step={0.1} className="input" value={form.draft} onChange={(e) => setForm({ ...form, draft: e.target.value })} placeholder="cth: 4" /></Field>
            <Field label="Bollard (T)"><input type="number" min={0} step={0.1} className="input" value={form.bollard} onChange={(e) => setForm({ ...form, bollard: e.target.value })} placeholder="cth: 40" /></Field>
            <Field label="Class">
              <select className="input" value={form.class} onChange={(e) => setForm({ ...form, class: e.target.value })}>
                {CLASS_OPTIONS.map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Bendera">
              <select className="input" value={form.flag} onChange={(e) => setForm({ ...form, flag: e.target.value })}>
                {FLAG_OPTIONS.map((f) => <option key={f}>{f}</option>)}
              </select>
            </Field>
          </FormGrid>
          <Field label="Status" hint="Dimensi 0 hanya diizinkan untuk kapal dalam pembangunan">
            <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {["Dalam Operasi", "Dalam Docking", "Dalam Pembangunan", "Menganggur"].map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
        </div>
      </Modal>
    </div>
  );
}
