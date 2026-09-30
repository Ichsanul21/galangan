import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Search, Ship, Anchor, FileCheck2, Pencil, Trash2 } from "lucide-react";
import { Card, CardHeader, PageHeader, Badge, KpiCard, Modal, Field, FormGrid, toast, SortTh, toggleSort, sortRows, usePager, ConfirmModal,
  NumInput,
} from "../../components/ui";
import type { SortState } from "../../components/ui";
import { useStore } from "../../data/store";
import { findUsages } from "../../utils/usages";
import type { StoreItem } from "../../data/store";
import { fleetTrend, dockingTrend, buildTrend, certTrend } from "../../data";
import { fmtRupiah, fmtTanggal, todayISO } from "../../utils/format";
import { FilterPopover } from "../../components/FilterPopover";
import { sameName, vesselMatch } from "../../utils/names";
import { AlertBannerView, notifRowId, useModuleAlert, useNotifFlash } from "../../components/AlertBanner";
import { useT } from "../../i18n/LanguageContext";
import { n_eqp } from "../../i18n/n_eqp";

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

function validateForm(form: VesselForm, vessels: StoreItem[], excludeId: string | undefined, S: (typeof n_eqp)["id"]): string | null {
  if (!form.name.trim() || !form.owner.trim() || !form.imo.trim()) return S.vsReqBasic;
  const imo = form.imo.trim();
  // "-" = kapal tanpa IMO (tongkang) - boleh dipakai banyak kapal, tetap unik untuk IMO asli.
  if (imo !== "-" && vessels.some((v) => v.id !== excludeId && String(v.imo).toLowerCase() === imo.toLowerCase())) {
    return S.vsImoUsed.replace("{a}", imo);
  }
  if (!form.type.trim()) return S.vsTypeReq;
  const dims = { loa: Number(form.loa), beam: Number(form.beam), draft: Number(form.draft), bollard: Number(form.bollard) };
  if (Object.values(dims).some((n) => !Number.isFinite(n))) return S.vsDimsNum;
  const hasZero = Object.values(dims).some((n) => n <= 0);
  if (form.status !== "Dalam Pembangunan" && hasZero) return S.vsDimsPos;
  const gt = Number(form.gt);
  const bhp = Number(form.bhp);
  if (!Number.isFinite(gt) || !Number.isFinite(bhp)) return S.vsGtBhpNum;
  if (form.status !== "Dalam Pembangunan" && (gt <= 0 || bhp <= 0)) return S.vsGtBhpPos;
  const nt = form.nt.trim() === "" ? 0 : Number(form.nt);
  if (!Number.isFinite(nt) || nt < 0) return S.vsNtMin;
  if (!form.engineType.trim()) return S.vsEngineReq;
  if (form.mmsi.trim() !== "" && !/^\d{9}$/.test(form.mmsi.trim())) return S.vsMmsiFormat;
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
  const { data, add, update, remove, log } = useStore();
  const { locale } = useT();
  const S = n_eqp[locale];
  const modAlert = useModuleAlert("kapal");
  const flash = useNotifFlash();
  const notified = useMemo(() => new Set(modAlert.items.map((a) => a.rowId)), [modAlert.items]);
  const vessels = data.vessels;
  const [q, setQ] = useState("");
  const [certFilter, setCertFilter] = useState("Semua");
  const [sort, setSort] = useState<SortState>({ key: null, dir: "asc" });
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<VesselForm>(emptyForm);
  // Hapus kapal via ConfirmModal + daftar pemakai (blokir bila dipakai proyek/survei/dock/garansi).
  const [deleting, setDeleting] = useState<StoreItem | null>(null);

  const nowMonth = todayISO().slice(0, 7);
  const list = vessels.filter((v) => {
    if (certFilter !== "Semua") {
      const need = (v.certificates ?? []).some((c: { expires: string }) => certNeedsAttention(c.expires, nowMonth));
      if (certFilter === "Perlu Perhatian" && !need) return false;
      if (certFilter === "Aman" && need) return false;
    }
    return `${v.name} ${v.imo}`.toLowerCase().includes(q.toLowerCase());
  });
  const cardPager = usePager(list.length);
  const surveySorted = useMemo(() => sortRows(data.surveys, sort, (s: StoreItem, k) => String((s as unknown as Record<string, unknown>)[k] ?? "")), [data.surveys, sort]);
  const surveyPager = usePager(data.surveys.length);
  const pickNotif = (rowId: string) => {
    const key = String(rowId);
    const idx = list.findIndex((v) => String(v.id) === key);
    if (idx >= 0) { flash.pick(key, idx, cardPager.go, cardPager.size); return; }
    const sIdx = surveySorted.findIndex((s) => String(s.id) === key);
    if (sIdx >= 0) { flash.pick(key, sIdx, surveyPager.go, surveyPager.size); return; }
    flash.pick(key, -1, () => {}, 100);
  };
  useEffect(() => {
    cardPager.reset();
    surveyPager.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, certFilter]);
  const expiring = vessels.filter((v) =>
    (v.certificates ?? []).some((c: { expires: string }) => certNeedsAttention(c.expires, nowMonth))
  ).length;

  const slotCountFor = (name: string) => data.dockSlots.filter((s) => vesselMatch(s.vessel, name)).length;

  const save = async () => {
    try {
    const err = validateForm(form, vessels, undefined, S);
    if (err) { toast(err, "info"); return; }
    const dimsZero = [form.loa, form.beam, form.draft, form.bollard].some((n) => Number(n) <= 0);
    const warnZero = form.status === "Dalam Pembangunan" && dimsZero;
    const created = await add("vessels", {
      ...formToPayload(form),
      built: new Date().getFullYear(),
      certificates: [],
      history: [{ date: todayISO(), event: "Kapal didaftarkan", type: "Registrasi" }],
    }, { action: "mendaftarkan kapal", module: "Kapal" });
    toast(warnZero ? S.vsRegisteredZero.replace("{a}", created.id) : S.vsRegistered.replace("{a}", created.id));
    setShowAdd(false);
    setForm(emptyForm);
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const openEdit = (v: StoreItem) => {
    setEditingId(v.id);
    setEditForm(vesselToForm(v));
  };

  const saveEdit = async () => {
    try {
    if (!editingId) return;
    const err = validateForm(editForm, vessels, editingId, S);
    if (err) { toast(err, "info"); return; }
    const prev = vessels.find((v) => v.id === editingId);
    const oldName = String(prev?.name ?? "");
    const newName = editForm.name.trim();
    await update("vessels", editingId, formToPayload(editForm));
    // CASCADE RENAME: nama kapal → projects/surveys/dockSlots/warranties (trim-case-insensitive).
    if (!sameName(oldName, newName)) {
      let n = 0;
      for (const p of data.projects.filter((x) => sameName(x.vessel, oldName))) {
        await update("projects", p.id, { vessel: newName });
        n += 1;
      }
      for (const s of data.surveys.filter((x) => sameName(x.vessel, oldName))) {
        await update("surveys", s.id, { vessel: newName });
        n += 1;
      }
      for (const s of data.dockSlots.filter((x) => sameName(x.vessel, oldName))) {
        await update("dockSlots", s.id, { vessel: newName });
        n += 1;
      }
      for (const w of (data.warranties ?? []).filter((x: StoreItem) => sameName(x.vessel, oldName))) {
        await update("warranties", w.id, { vessel: newName });
        n += 1;
      }
      log("rename kapal", `${oldName} → ${newName} · ${n} referensi ikut berubah`, "Kapal");
      toast(`${S.vsUpdated} · ${n} referensi ikut berubah`);
    } else {
      toast(S.vsUpdated);
    }
    setEditingId(null);
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const renderFormFields = (f: VesselForm, setF: (v: VesselForm) => void) => (
    <div className="space-y-3">
      <FormGrid>
        <Field label={S.vsNameField}><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={S.vsNamePh} /></Field>
        <Field label={S.vsImoField}><input className="input font-mono" value={f.imo} onChange={(e) => setF({ ...f, imo: e.target.value })} placeholder={S.vsImoPh} /></Field>
        <Field label={S.vsMmsiField}><input className="input font-mono" value={f.mmsi} onChange={(e) => setF({ ...f, mmsi: e.target.value })} placeholder={S.vsMmsiPh} /></Field>
        <Field label={S.typeLabel}><input className="input" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} placeholder={S.vsTypePh} /></Field>
        <Field label={S.vsOwnerField}><input className="input" value={f.owner} onChange={(e) => setF({ ...f, owner: e.target.value })} placeholder={S.vsOwnerPh} /></Field>
        <Field label={S.vsEngineField}><input className="input" value={f.engineType} onChange={(e) => setF({ ...f, engineType: e.target.value })} placeholder={S.vsEnginePh} /></Field>
        <Field label={S.vsLoaField}><NumInput min={0} step={0.1} className="input" value={f.loa} onChange={(e) => setF({ ...f, loa: e.target.value })} placeholder={S.vsLoaPh} /></Field>
        <Field label={S.vsBeamField}><NumInput min={0} step={0.1} className="input" value={f.beam} onChange={(e) => setF({ ...f, beam: e.target.value })} placeholder={S.vsBeamPh} /></Field>
        <Field label={S.vsDraftField}><NumInput min={0} step={0.1} className="input" value={f.draft} onChange={(e) => setF({ ...f, draft: e.target.value })} placeholder={S.vsDraftPh} /></Field>
        <Field label={S.vsBollardField}><NumInput min={0} step={0.1} className="input" value={f.bollard} onChange={(e) => setF({ ...f, bollard: e.target.value })} placeholder={S.vsBollardPh} /></Field>
        <Field label={S.vsGtField}><NumInput min={0} step={1} className="input" value={f.gt} onChange={(e) => setF({ ...f, gt: e.target.value })} placeholder={S.vsGtPh} /></Field>
        <Field label={S.vsNtField}><NumInput min={0} step={1} className="input" value={f.nt} onChange={(e) => setF({ ...f, nt: e.target.value })} placeholder={S.vsNtPh} /></Field>
        <Field label={S.vsBhpField}><NumInput min={0} step={1} className="input" value={f.bhp} onChange={(e) => setF({ ...f, bhp: e.target.value })} placeholder={S.vsBhpPh} /></Field>
        <Field label={S.vsClassField}>
          <select className="input" value={f.class} onChange={(e) => setF({ ...f, class: e.target.value })}>
            {CLASS_OPTIONS.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label={S.vsFlagField}>
          <select className="input" value={f.flag} onChange={(e) => setF({ ...f, flag: e.target.value })}>
            {FLAG_OPTIONS.map((fl) => <option key={fl}>{fl}</option>)}
          </select>
        </Field>
      </FormGrid>
      <Field label={S.thStatus} hint={S.vsStatusHint}>
        <select className="input" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
          {["Dalam Operasi", "Dalam Docking", "Dalam Pembangunan", "Menganggur"].map((s) => <option key={s}>{s}</option>)}
        </select>
      </Field>
    </div>
  );

  return (
    <div>
      <PageHeader
        title={S.vsTitle}
        subtitle={S.vsSubtitle}
        icon={<Ship className="h-5 w-5" />}
        actions={<button className="btn-primary-gradient" onClick={() => setShowAdd(true)}><Plus className="h-4 w-4" /> {S.vsAdd}</button>}
      />

      {modAlert.active && <AlertBannerView items={modAlert.items} onPick={pickNotif} />}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label={S.vsKpiTotal} value={String(vessels.length)} icon={<Ship className="h-5 w-5" />} chip="navy" spark={fleetTrend} hint={S.vsKpiTotalHint} />
        <KpiCard label={S.vsKpiDocking} value={String(vessels.filter((v) => v.status === "Dalam Docking").length)} icon={<Anchor className="h-5 w-5" />} chip="teal" spark={dockingTrend} />
        <KpiCard label={S.vsKpiBuild} value={String(vessels.filter((v) => v.status === "Dalam Pembangunan").length)} icon={<Anchor className="h-5 w-5" />} chip="violet" spark={buildTrend} />
        <KpiCard label={S.vsKpiCert} value={String(expiring)} delta={S.vsKpiCertDelta} deltaDirection="down" icon={<FileCheck2 className="h-5 w-5" />} chip="rose" spark={certTrend} />
      </div>

      <div className="mt-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-steel-400" />
            <input className="input pl-9 w-full sm:w-64" placeholder={S.vsSearchPh} aria-label={S.vsSearchAria} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <FilterPopover
            activeCount={[certFilter !== "Semua"].filter(Boolean).length}
            initial={{ status: certFilter }}
            onReset={() => { setQ(""); setCertFilter("Semua"); }}
            onApply={(d) => { setCertFilter(d.status); }}
          >
            {(draft, setDraft) => (
              <div className="space-y-3">
                <Field label={S.vsCertStatusField}>
                  <select className="input w-full" value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
                    {["Semua", "Perlu Perhatian", "Aman"].map((s) => <option key={s} value={s}>{s === "Semua" ? S.vsAllStatus : s}</option>)}
                  </select>
                </Field>
              </div>
            )}
          </FilterPopover>
          {(q.trim() !== "" || certFilter !== "Semua") && (
            <span className="text-xs text-steel-400">
              {S.vsFilterActive.replace("{n}", String(list.length))}
            </span>
          )}
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {cardPager.slice(list).map((v) => {
            const comp = complianceSummary(v);
            return (
              <Card key={v.id} id={notifRowId(String(v.id))} className={`p-5 hover:shadow-md transition-shadow ${flash.flashId === String(v.id) ? "notif-hl notif-flash" : (notified.has(String(v.id)) ? "notif-hl" : "")}`}>
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
                    <div className="flex items-center gap-1">
                    <button
                      className="rounded-lg border border-steel-200 p-1.5 text-steel-500 hover:border-ocean-400 hover:text-ocean-600"
                      aria-label={S.vsEditAria.replace("{a}", v.name)}
                      onClick={(e) => { e.preventDefault(); openEdit(v); }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      className="rounded-lg border border-steel-200 p-1.5 text-steel-500 hover:border-rose-400 hover:text-rose-600"
                      aria-label={`${S.delBtn} ${v.name}`}
                      onClick={(e) => { e.preventDefault(); setDeleting(v); }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                    </div>
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
                    {comp.state === "ok" ? S.vsComplyOk : comp.state === "issue" ? S.vsComplyIssue.replace("{a}", String(comp.valid)).replace("{b}", String(comp.total)) : S.vsComplyEmpty}
                  </Badge>
                  {(() => {
                    const ins = v.insurance as { polis?: string; premi?: number; expiry?: string } | undefined;
                    if (!ins?.expiry) return <Badge tone="gray">{S.vsNoInsurance}</Badge>;
                    const left = daysUntil(ins.expiry);
                    if (left === null) return <Badge tone="gray">{S.vsInsPolicy.replace("{a}", ins.polis ?? "")}</Badge>;
                    if (left < 0) return <Badge tone="red">{S.vsInsExpired}</Badge>;
                    if (left <= 30) return <Badge tone="amber">{S.vsInsSoon.replace("{a}", String(left))}</Badge>;
                    return <Badge tone="green">{S.vsInsValid}</Badge>;
                  })()}
                  {(Array.isArray(v.plan5) && v.plan5.length > 0) ? (
                    <Badge tone="navy">{S.vsPlan5.replace("{a}", String(v.plan5.length))}</Badge>
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
                  <div><p className="text-sm font-bold text-navy-900">{v.gt ?? "-"}</p><p className="text-[10px] text-steel-500">GT</p></div>
                  <div><p className="text-sm font-bold text-navy-900">{v.bhp ? `${v.bhp}` : "-"}</p><p className="text-[10px] text-steel-500">BHP</p></div>
                  <div><p className="text-sm font-bold text-navy-900">{slotCountFor(String(v.name))}</p><p className="text-[10px] text-steel-500">Slot Dock</p></div>
                </div>
                {(v.certificates ?? []).length > 0 && (
                  <p className="mt-2 text-[11px] text-steel-400">{S.vsCertSurveyCount.replace("{a}", String((v.certificates ?? []).length)).replace("{b}", String(data.surveys.filter((s) => sameName(s.vessel, v.name)).length))}</p>
                )}
              </Card>
            );
          })}
        </div>
        {cardPager.bar}
        {list.length === 0 && <p className="py-8 text-center text-sm text-steel-400">{S.vsNoMatch}</p>}

        <Card className="mt-5">
          <CardHeader title={S.vsSurveyTitle} subtitle={S.vsSurveySub} />
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="sticky top-0 z-10 bg-surface">
                <tr><SortTh label={S.thVessel} sortKey="vessel" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.thSurveyType} sortKey="type" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.thSurveyor} sortKey="classSurveyor" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.dateLabel} sortKey="date" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.thStatus} sortKey="status" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /></tr>
              </thead>
              <tbody className="divide-y divide-steel-100">
                {surveyPager.slice(surveySorted).map((s) => (
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
            {surveyPager.bar}
          </div>
        </Card>
      </div>

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title={S.vsAddTitle}
        wide footer={<><button className="btn-secondary" onClick={() => setShowAdd(false)}>{S.cancelBtn}</button><button className="btn-primary" onClick={save}>{S.vsAddBtn}</button></>}>
        {renderFormFields(form, setForm)}
      </Modal>

      <Modal open={editingId !== null} onClose={() => setEditingId(null)} title={S.vsEditTitle}
        wide footer={<><button className="btn-secondary" onClick={() => setEditingId(null)}>{S.cancelBtn}</button><button className="btn-primary" onClick={saveEdit}>{S.saveBtn}</button></>}>
        {renderFormFields(editForm, setEditForm)}
      </Modal>

      <ConfirmModal
        open={deleting !== null}
        title={deleting ? (locale === "en" ? `Delete vessel ${deleting.name}?` : `Hapus kapal ${deleting.name}?`) : ""}
        desc={(() => {
          if (!deleting) return "";
          const used = findUsages(data, "vessels", String(deleting.id));
          const base = locale === "en"
            ? `Vessel ${deleting.name} (${deleting.id}) will be permanently deleted.`
            : `Kapal ${deleting.name} (${deleting.id}) akan dihapus permanen.`;
          return used.length > 0
            ? (locale === "en" ? `${base} Used in: ${used.join(", ")}. Deletion blocked.` : `${base} Dipakai di: ${used.join(", ")}. Penghapusan diblokir.`)
            : base;
        })()}
        confirmLabel={deleting && findUsages(data, "vessels", String(deleting.id)).length > 0
          ? (locale === "en" ? "Blocked - still in use" : "Diblokir - masih dipakai")
          : S.delBtn}
        danger
        confirmDisabled={deleting ? findUsages(data, "vessels", String(deleting.id)).length > 0 : false}
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          const usedBy = findUsages(data, "vessels", String(deleting.id));
          if (usedBy.length > 0) { toast(locale === "en" ? `Delete blocked - used in: ${usedBy.join(", ")}` : `Hapus diblokir - dipakai di: ${usedBy.join(", ")}`, "info"); return; }
          try {
            await remove("vessels", String(deleting.id));
            log("menghapus kapal", `${deleting.id} · ${deleting.name}`, "Kapal");
            toast(locale === "en" ? `Vessel ${deleting.id} deleted` : `Kapal ${deleting.id} dihapus`);
          } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
          setDeleting(null);
        }}
      />
    </div>
  );
}
