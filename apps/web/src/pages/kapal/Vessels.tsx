import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Search, Ship, Anchor, FileCheck2, Pencil } from "lucide-react";
import { Card, CardHeader, PageHeader, Badge, KpiCard, Modal, Field, FormGrid, toast, SortTh, toggleSort, sortRows } from "../../components/ui";
import type { SortState } from "../../components/ui";
import { useStore } from "../../data/store";
import type { StoreItem } from "../../data/store";
import { fleetTrend, dockingTrend, buildTrend, certTrend } from "../../data";
import { fmtRupiah, fmtTanggal, todayISO } from "../../utils/format";
import { sameName, vesselMatch } from "../../utils/names";
import { AlertBannerView, notifRowId, useModuleAlert } from "../../components/AlertBanner";

const statusTone: Record<string, "green" | "blue" | "amber" | "gray"> = {
  "Dalam Docking": "blue",
  "Dalam Pembangunan": "amber",
  "Dalam Operasi": "green",
  "Menganggur": "gray",
};

const CLASS_OPTIONS = ["BKI", "ABS", "DNV", "LR", "NK"];
const FLAG_OPTIONS = ["Indonesia", "Panama", "Singapura", "Malaysia"];

export const COMPLIANCE_ITEMS = ["SOLAS", "MARPOL", "ISM Code", "Flag State", "PSC Readiness", "ISPS Code"];

interface ComplianceRow {
  name: string;
  status: string;
  date: string;
}

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

function daysUntil(iso: string | null | undefined): number | null {
  if (!iso || iso === "-") return null;
  const t = new Date(`${iso}T00:00:00`).getTime();
  if (Number.isNaN(t)) return null;
  const now = new Date();
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((t - base) / 86400000);
}

export function complianceOf(v: StoreItem): ComplianceRow[] {
  const rows = (v.compliance ?? []) as ComplianceRow[];
  return COMPLIANCE_ITEMS.map((name) => rows.find((r) => r.name === name) ?? { name, status: "", date: "" });
}

export function complianceSummary(v: StoreItem): { total: number; valid: number; state: "ok" | "issue" | "empty" } {
  const rows = (v.compliance ?? []) as ComplianceRow[];
  if (rows.length === 0) return { total: COMPLIANCE_ITEMS.length, valid: 0, state: "empty" };
  const full = complianceOf(v);
  const valid = full.filter((r) => r.status === "Berlaku").length;
  return { total: full.length, valid, state: valid === full.length ? "ok" : "issue" };
}

const emptyForm = {
  name: "", imo: "", mmsi: "", type: "", owner: "", loa: "", beam: "", draft: "", bollard: "",
  gt: "", nt: "", bhp: "", engineType: "",
  status: "Dalam Operasi", class: "BKI", flag: "Indonesia",
};

type VesselForm = typeof emptyForm;

function validateForm(form: VesselForm, vessels: StoreItem[], excludeId?: string): string | null {
  if (!form.name.trim() || !form.owner.trim() || !form.imo.trim()) return "Nama kapal, IMO & pemilik wajib diisi";
  const imo = form.imo.trim();
  // "-" = kapal tanpa IMO (tongkang) — boleh dipakai banyak kapal, tetap unik untuk IMO asli.
  if (imo !== "-" && vessels.some((v) => v.id !== excludeId && String(v.imo).toLowerCase() === imo.toLowerCase())) {
    return `IMO ${imo} sudah terdaftar — gunakan nomor IMO yang unik`;
  }
  if (!form.type.trim()) return "Tipe kapal wajib diisi";
  const dims = { loa: Number(form.loa), beam: Number(form.beam), draft: Number(form.draft), bollard: Number(form.bollard) };
  if (Object.values(dims).some((n) => !Number.isFinite(n))) return "LOA, beam, draft & bollard wajib diisi angka";
  const hasZero = Object.values(dims).some((n) => n <= 0);
  if (form.status !== "Dalam Pembangunan" && hasZero) return "LOA, beam, draft & bollard harus lebih dari 0";
  const gt = Number(form.gt);
  const bhp = Number(form.bhp);
  if (!Number.isFinite(gt) || !Number.isFinite(bhp)) return "GT & BHP mesin utama wajib diisi angka";
  if (form.status !== "Dalam Pembangunan" && (gt <= 0 || bhp <= 0)) return "GT & BHP harus lebih dari 0 (kecuali kapal dalam pembangunan)";
  const nt = form.nt.trim() === "" ? 0 : Number(form.nt);
  if (!Number.isFinite(nt) || nt < 0) return "NT harus angka 0 atau lebih";
  if (!form.engineType.trim()) return "Tipe mesin utama wajib diisi";
  if (form.mmsi.trim() !== "" && !/^\d{9}$/.test(form.mmsi.trim())) return "MMSI harus 9 digit angka (atau kosongkan)";
  return null;
}

function formToPayload(form: VesselForm) {
  return {
    name: form.name.trim(),
    imo: form.imo.trim(),
    mmsi: form.mmsi.trim(),
    type: form.type.trim(),
    class: form.class,
    flag: form.flag,
    owner: form.owner.trim(),
    loa: Number(form.loa),
    beam: Number(form.beam),
    draft: Number(form.draft),
    bollard: Number(form.bollard),
    gt: Number(form.gt),
    nt: form.nt.trim() === "" ? 0 : Number(form.nt),
    bhp: Number(form.bhp),
    engineType: form.engineType.trim(),
    status: form.status,
  };
}

function vesselToForm(v: StoreItem): VesselForm {
  return {
    name: String(v.name ?? ""),
    imo: String(v.imo ?? ""),
    mmsi: String(v.mmsi ?? ""),
    type: String(v.type ?? ""),
    owner: String(v.owner ?? ""),
    loa: String(v.loa ?? ""),
    beam: String(v.beam ?? ""),
    draft: String(v.draft ?? ""),
    bollard: String(v.bollard ?? ""),
    gt: v.gt === undefined || v.gt === null ? "" : String(v.gt),
    nt: v.nt === undefined || v.nt === null ? "" : String(v.nt),
    bhp: v.bhp === undefined || v.bhp === null ? "" : String(v.bhp),
    engineType: String(v.engineType ?? ""),
    status: String(v.status ?? "Dalam Operasi"),
    class: String(v.class ?? "BKI"),
    flag: String(v.flag ?? "Indonesia"),
  };
}

export default function Vessels() {
  const { data, add, update } = useStore();
  const modAlert = useModuleAlert("kapal");
  const vessels = data.vessels;
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortState>({ key: null, dir: "asc" });
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<VesselForm>(emptyForm);

  const nowMonth = todayISO().slice(0, 7);
  const list = vessels.filter((v) => `${v.name} ${v.imo}`.toLowerCase().includes(q.toLowerCase()));
  const expiring = vessels.filter((v) =>
    (v.certificates ?? []).some((c: { expires: string }) => certNeedsAttention(c.expires, nowMonth))
  ).length;

  const slotCountFor = (name: string) => data.dockSlots.filter((s) => vesselMatch(s.vessel, name)).length;

  const save = async () => {
    const err = validateForm(form, vessels);
    if (err) { toast(err, "info"); return; }
    const dimsZero = [form.loa, form.beam, form.draft, form.bollard].some((n) => Number(n) <= 0);
    const warnZero = form.status === "Dalam Pembangunan" && dimsZero;
    const created = await add("vessels", {
      ...formToPayload(form),
      built: new Date().getFullYear(),
      certificates: [],
      history: [{ date: todayISO(), event: "Kapal didaftarkan", type: "Registrasi" }],
    }, { action: "mendaftarkan kapal", module: "Kapal" });
    toast(warnZero ? `Kapal ${created.id} terdaftar — dimensi 0 diizinkan karena masih dalam pembangunan` : `Kapal ${created.id} terdaftar`);
    setShowAdd(false);
    setForm(emptyForm);
  };

  const openEdit = (v: StoreItem) => {
    setEditingId(v.id);
    setEditForm(vesselToForm(v));
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const err = validateForm(editForm, vessels, editingId);
    if (err) { toast(err, "info"); return; }
    await update("vessels", editingId, formToPayload(editForm));
    toast("Data kapal diperbarui");
    setEditingId(null);
  };

  const renderFormFields = (f: VesselForm, setF: (v: VesselForm) => void) => (
    <div className="space-y-3">
      <FormGrid>
        <Field label="Nama kapal"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="cth: TB Samudra Jaya 08" /></Field>
        <Field label="Nomor IMO"><input className="input font-mono" value={f.imo} onChange={(e) => setF({ ...f, imo: e.target.value })} placeholder="cth: IMO 9934567" /></Field>
        <Field label="MMSI (9 digit)"><input className="input font-mono" value={f.mmsi} onChange={(e) => setF({ ...f, mmsi: e.target.value })} placeholder="cth: 525003456" /></Field>
        <Field label="Tipe"><input className="input" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} placeholder="cth: Tugboat ASD 2x1600 HP" /></Field>
        <Field label="Pemilik"><input className="input" value={f.owner} onChange={(e) => setF({ ...f, owner: e.target.value })} placeholder="cth: PT Samudra Jaya Perkasa" /></Field>
        <Field label="Tipe mesin utama"><input className="input" value={f.engineType} onChange={(e) => setF({ ...f, engineType: e.target.value })} placeholder="cth: MAN 6L27/38" /></Field>
        <Field label="LOA (m)"><input type="number" min={0} step={0.1} className="input" value={f.loa} onChange={(e) => setF({ ...f, loa: e.target.value })} placeholder="cth: 30" /></Field>
        <Field label="Beam (m)"><input type="number" min={0} step={0.1} className="input" value={f.beam} onChange={(e) => setF({ ...f, beam: e.target.value })} placeholder="cth: 9,5" /></Field>
        <Field label="Draft (m)"><input type="number" min={0} step={0.1} className="input" value={f.draft} onChange={(e) => setF({ ...f, draft: e.target.value })} placeholder="cth: 4" /></Field>
        <Field label="Bollard (T)"><input type="number" min={0} step={0.1} className="input" value={f.bollard} onChange={(e) => setF({ ...f, bollard: e.target.value })} placeholder="cth: 40" /></Field>
        <Field label="GT"><input type="number" min={0} step={1} className="input" value={f.gt} onChange={(e) => setF({ ...f, gt: e.target.value })} placeholder="cth: 495" /></Field>
        <Field label="NT"><input type="number" min={0} step={1} className="input" value={f.nt} onChange={(e) => setF({ ...f, nt: e.target.value })} placeholder="cth: 148" /></Field>
        <Field label="BHP mesin utama"><input type="number" min={0} step={1} className="input" value={f.bhp} onChange={(e) => setF({ ...f, bhp: e.target.value })} placeholder="cth: 3200" /></Field>
        <Field label="Class">
          <select className="input" value={f.class} onChange={(e) => setF({ ...f, class: e.target.value })}>
            {CLASS_OPTIONS.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Bendera">
          <select className="input" value={f.flag} onChange={(e) => setF({ ...f, flag: e.target.value })}>
            {FLAG_OPTIONS.map((fl) => <option key={fl}>{fl}</option>)}
          </select>
        </Field>
      </FormGrid>
      <Field label="Status" hint="Dimensi/GT/BHP 0 hanya diizinkan untuk kapal dalam pembangunan">
        <select className="input" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
          {["Dalam Operasi", "Dalam Docking", "Dalam Pembangunan", "Menganggur"].map((s) => <option key={s}>{s}</option>)}
        </select>
      </Field>
    </div>
  );

  return (
    <div>
      <PageHeader
        title="Rekam Jejak Kapal"
        subtitle="Data teknis, riwayat survey/docking, dan sertifikat per kapal"
        icon={<Ship className="h-5 w-5" />}
        actions={<button className="btn-primary-gradient" onClick={() => setShowAdd(true)}><Plus className="h-4 w-4" /> Daftarkan Kapal</button>}
      />

      {modAlert.active && <AlertBannerView items={modAlert.items} onClose={modAlert.dismiss} onPick={modAlert.scrollTo} />}

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
          {list.map((v) => {
            const comp = complianceSummary(v);
            return (
              <Card key={v.id} id={notifRowId(String(v.id))} className={`p-5 hover:shadow-md transition-shadow ${modAlert.highlight.has(String(v.id)) ? "notif-hl" : ""}`}>
                <Link to={`/kapal/${v.id}`}>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-ocean-500/15 text-ocean-600">
                        <Ship className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-navy-900">{v.name}</p>
                        <p className="text-xs text-steel-500 font-mono">{v.imo}{v.mmsi ? ` · MMSI ${v.mmsi}` : ""}</p>
                      </div>
                    </div>
                    <button
                      className="rounded-lg border border-steel-200 p-1.5 text-steel-500 hover:border-ocean-400 hover:text-ocean-600"
                      aria-label={`Edit ${v.name}`}
                      onClick={(e) => { e.preventDefault(); openEdit(v); }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </Link>
                <div className="mt-3 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-steel-500">{v.type}</p>
                    <p className="text-xs text-steel-500">{v.owner}</p>
                  </div>
                  <Badge tone={statusTone[v.status] ?? "gray"}>{v.status}</Badge>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Badge tone={comp.state === "ok" ? "green" : comp.state === "issue" ? "red" : "gray"}>
                    {comp.state === "ok" ? "Patuh — semua berlaku" : comp.state === "issue" ? `Kepatuhan ${comp.valid}/${comp.total}` : "Kepatuhan belum dinilai"}
                  </Badge>
                  {(() => {
                    const ins = v.insurance as { polis?: string; premi?: number; expiry?: string } | undefined;
                    if (!ins?.expiry) return <Badge tone="gray">Tanpa asuransi</Badge>;
                    const left = daysUntil(ins.expiry);
                    if (left === null) return <Badge tone="gray">Asuransi {ins.polis ?? ""}</Badge>;
                    if (left < 0) return <Badge tone="red">Asuransi expired</Badge>;
                    if (left <= 30) return <Badge tone="amber">Asuransi H-{left}</Badge>;
                    return <Badge tone="green">Asuransi berlaku</Badge>;
                  })()}
                  {(Array.isArray(v.plan5) && v.plan5.length > 0) ? (
                    <Badge tone="navy">Rencana 5 thn: {v.plan5.length}</Badge>
                  ) : null}
                </div>
                {(() => {
                  const ins = v.insurance as { polis?: string; premi?: number; expiry?: string } | undefined;
                  if (!ins?.polis) return null;
                  return (
                    <p className="mt-1.5 text-xs text-steel-500">
                      Polis {ins.polis}{Number(ins.premi || 0) > 0 ? ` · premi ${fmtRupiah(Number(ins.premi))}` : ""}{ins.expiry ? ` · exp ${fmtTanggal(ins.expiry)}` : ""}
                    </p>
                  );
                })()}
                <div className="mt-3 grid grid-cols-3 gap-2 border-t border-steel-100 pt-3 text-center">
                  <div><p className="text-sm font-bold text-navy-900">{v.loa}m</p><p className="text-[10px] text-steel-500">LOA</p></div>
                  <div><p className="text-sm font-bold text-navy-900">{v.bollard}T</p><p className="text-[10px] text-steel-500">Bollard</p></div>
                  <div><p className="text-sm font-bold text-navy-900">{v.built}</p><p className="text-[10px] text-steel-500">Tahun</p></div>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                  <div><p className="text-sm font-bold text-navy-900">{v.gt ?? "—"}</p><p className="text-[10px] text-steel-500">GT</p></div>
                  <div><p className="text-sm font-bold text-navy-900">{v.bhp ? `${v.bhp}` : "—"}</p><p className="text-[10px] text-steel-500">BHP</p></div>
                  <div><p className="text-sm font-bold text-navy-900">{slotCountFor(String(v.name))}</p><p className="text-[10px] text-steel-500">Slot Dock</p></div>
                </div>
                {(v.certificates ?? []).length > 0 && (
                  <p className="mt-2 text-[11px] text-steel-400">{(v.certificates ?? []).length} sertifikat · {data.surveys.filter((s) => sameName(s.vessel, v.name)).length} survey terjadwal</p>
                )}
              </Card>
            );
          })}
        </div>
        {list.length === 0 && <p className="py-8 text-center text-sm text-steel-400">Tidak ada kapal yang cocok.</p>}

        <Card className="mt-5">
          <CardHeader title="Kegiatan Survey Terjadwal" subtitle="Jadwal survey class & docking" />
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="sticky top-0 z-10 bg-surface">
                <tr><SortTh label="Kapal" sortKey="vessel" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label="Tipe Survey" sortKey="type" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label="Surveyor" sortKey="classSurveyor" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label="Tanggal" sortKey="date" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label="Status" sortKey="status" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /></tr>
              </thead>
              <tbody className="divide-y divide-steel-100">
                {sortRows(data.surveys, sort, (s: StoreItem, k) => String((s as unknown as Record<string, unknown>)[k] ?? "")).map((s) => (
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

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Daftarkan Kapal Baru"
        wide footer={<><button className="btn-secondary" onClick={() => setShowAdd(false)}>Batal</button><button className="btn-primary" onClick={save}>Daftarkan</button></>}>
        {renderFormFields(form, setForm)}
      </Modal>

      <Modal open={editingId !== null} onClose={() => setEditingId(null)} title="Edit Data Kapal"
        wide footer={<><button className="btn-secondary" onClick={() => setEditingId(null)}>Batal</button><button className="btn-primary" onClick={saveEdit}>Simpan</button></>}>
        {renderFormFields(editForm, setEditForm)}
      </Modal>
    </div>
  );
}
