// Modal tambah proyek bersama — dipakai halaman Proyek DAN Dashboard
// ("Proyek Baru" langsung buka form, tanpa pindah halaman).
// Logika + validasi pindahan utuh dari Projects.tsx (satu sumber).
//
// P10: field "Cabang" diganti "Rencana Lokasi Docking". `branch` tetap
// ditulis ke record untuk scoping RBAC (`inBranch`), tapi nilainya
// di-auto-isi dari `defaultBranch` (cabang user / cabang aktif), bukan
// dipilih user di form.
// P11: kapal, klien, dan PM memakai `EntityPicker` (searchable).
import { useState } from "react";
import { Field, FormGrid, Modal, toast,
  NumInput, AsyncButton, EntityPicker,
} from "./ui";
import type { StoreItem } from "../data/store";
import { todayISO } from "../utils/format";
import ClientModal from "./ClientModal";

const TAHAP = ["Inquiry", "Quotation", "Kontrak", "Desain", "Produksi", "Trial", "Handover"];
const PRIORITAS = ["Rendah", "Sedang", "Tinggi"];
const PREFIX_TIPE: Record<string, string> = { "New Build": "NB", Repair: "RP", Retrofit: "RF" };

const emptyForm = {
  vessel: "",
  type: "New Build",
  client: "",
  dockingPlan: "",
  start: "",
  end: "",
  budget: "",
  manager: "",
  status: "Dalam Proses",
  tahap: "Inquiry",
  prioritas: "Sedang",
  vesselLoa: "",
  vesselType: "",
  vesselImo: "",
};

type Dict = Record<string, string>;

export default function ProjectAddModal({ open, onClose, S, projects, vessels, clients, employees, add, defaultBranch = "Samarinda" }: {
  open: boolean;
  onClose: () => void;
  S: Dict;
  projects: StoreItem[];
  vessels: StoreItem[];
  clients: StoreItem[];
  employees: StoreItem[];
  add: (collection: any, item: any, meta?: any) => Promise<StoreItem>;
  /** Cabang RBAC yang ditulis ke record proyek - bukan dipilih di form (P10). */
  defaultBranch?: string;
}) {

  const [form, setForm] = useState(emptyForm);
  const [scopeRows, setScopeRows] = useState([{ service: "", lokasi: "", deskripsi: "" }]);
  const [showClientModal, setShowClientModal] = useState(false);

  const setF = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const vesselExists = vessels.some((v) => String(v.name ?? "").toLowerCase() === form.vessel.trim().toLowerCase());
  const vesselOptions = vessels.map((v) => ({
    value: String(v.name ?? ""),
    label: String(v.name ?? ""),
    hint: [String(v.type ?? ""), String(v.imo ?? "")].filter(Boolean).join(" · "),
  }));
  const clientOptions = clients.map((c) => ({
    value: String(c.name ?? ""),
    label: String(c.name ?? ""),
    hint: String(c.fleet ?? c.rating ?? ""),
  }));
  const pmOptions = employees
    .filter((e) => String(e.dept ?? "") === "Proyek" || String(e.role ?? "").includes("Manager"))
    .map((e) => ({ value: String(e.name ?? ""), label: String(e.name ?? ""), hint: [String(e.role ?? ""), String(e.dept ?? "")].filter(Boolean).join(" · ") }));

  const nextProjectCode = (type: string, start: string): string => {
    const prefix = PREFIX_TIPE[type] ?? "PRJ";
    const year = start.match(/^(\d{4})/)?.[1] ?? String(new Date().getFullYear());
    let max = 0;
    for (const p of projects) {
      const m = String(p.id).match(new RegExp(`^${prefix}-(\\d{4})-(\\d+)$`));
      if (m && m[1] === year) max = Math.max(max, Number(m[2]));
    }
    return `${prefix}-${year}-${String(max + 1).padStart(3, "0")}`;
  };

  const codePreview = nextProjectCode(form.type, form.start);

  const close = () => {
    setForm(emptyForm);
    setScopeRows([{ service: "", lokasi: "", deskripsi: "" }]);
    onClose();
  };

  const save = async () => {
    if (!form.vessel.trim() || !form.client.trim()) { toast(S.prjToastVesselClient, "info"); return; }
    const scopeItems = scopeRows
      .map((r) => ({
        service: r.service.trim(),
        ...(r.lokasi.trim() ? { lokasi: r.lokasi.trim() } : {}),
        ...(r.deskripsi.trim() ? { deskripsi: r.deskripsi.trim() } : {}),
      }))
      .filter((r) => r.service);
    if (scopeItems.length === 0) { toast(S.prjToastScopeMin, "info"); return; }
    if (!form.start || !form.end) { toast(S.prjToastDatesReq, "info"); return; }
    if (form.end < form.start) { toast(S.prjToastDateOrder, "info"); return; }
    const budget = Number(form.budget);
    if (!Number.isFinite(budget) || budget <= 0) { toast(S.prjToastBudget, "info"); return; }
    if (!form.manager) { toast(S.prjToastPm, "info"); return; }
    if (form.type === "New Build" && projects.some((p) => String(p.vessel ?? "").trim().toLowerCase() === form.vessel.trim().toLowerCase() && String(p.type) === "New Build")) {
      toast(S.prjToastDup, "info");
      return;
    }
    if (!vesselExists) {
      const loa = Number(form.vesselLoa);
      if (!Number.isFinite(loa) || loa <= 0) { toast(S.prjToastLoa, "info"); return; }
      if (!form.vesselType.trim()) { toast(S.prjToastVType, "info"); return; }
      const imoRaw = form.vesselImo.trim();
      if (!imoRaw || imoRaw === "-" || imoRaw.toUpperCase() === "IMO" || imoRaw.toUpperCase() === "IMO -") {
        toast(S.prjToastImo, "info");
        return;
      }
    }
    const code = nextProjectCode(form.type, form.start);
    try {
      const created: StoreItem = await add(
        "projects",
        {
          id: code,
          vessel: form.vessel.trim(),
          type: form.type,
          client: form.client,
          status: form.status,
          tahap: form.tahap,
          prioritas: form.prioritas,
          tahapLog: [{ from: "-", to: form.tahap, date: todayISO(), by: "Anda", reason: "Proyek dibuat" }],
          branch: defaultBranch,
          dockingPlan: form.dockingPlan.trim(),
          start: form.start,
          end: form.end,
          progress: 0,
          budget,
          actual: 0,
          manager: form.manager,
          scope: scopeItems,
        },
        { action: "membuat proyek", module: "Proyek" }
      );
      if (!vesselExists) {
        await add("vessels", {
          name: form.vessel.trim(),
          imo: form.vesselImo.trim(),
          type: form.vesselType.trim(),
          class: "BKI",
          flag: "Indonesia",
          built: new Date().getFullYear(),
          owner: form.client,
          loa: Number(form.vesselLoa), beam: 0, draft: 0, bollard: 0,
          status: form.type === "New Build" ? "Dalam Pembangunan" : "Dalam Docking",
          certificates: [],
          history: [{ date: form.start, event: "Proyek dibuat", type: "Kontrak" }],
        }, { action: "mendaftarkan kapal", target: form.vessel.trim(), module: "Kapal" });
        toast(S.prjToastCreatedVessel.replace("{a}", created.id).replace("{b}", form.vesselImo.trim()));
      } else {
        toast(S.prjToastCreated.replace("{a}", created.id));
      }
      close();
    } catch {
      toast(S.prjToastSaveFail.replace("{a}", code), "info");
    }
  };

  return (
    <>
      <Modal
        open={open}
        onClose={close}
        title={S.prjNew}
        subtitle={S.prjModalSub}
        wide
        footer={
          <>
            <button className="btn-secondary" onClick={close}>{S.cancelBtn}</button>
            <AsyncButton className="btn-primary" onAction={save}>{S.prjSave}</AsyncButton>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-steel-500">
            {S.prjCodeAuto}<span className="font-mono font-semibold text-navy-900">{codePreview}</span>
          </p>
          <FormGrid>
            <Field label={S.prjVesselName}>
              <EntityPicker
                value={form.vessel}
                onChange={(v) => setF("vessel", v)}
                options={vesselOptions}
                placeholder={S.prjPickVessel ?? S.prjVesselPh}
                ariaLabel={S.prjVesselName}
                allowCustom
              />
            </Field>
            <Field label={S.colClient}>
              <div className="flex gap-2">
                <EntityPicker
                  className="flex-1"
                  value={form.client}
                  onChange={(v) => setF("client", v)}
                  options={clientOptions}
                  placeholder={S.prjPickClient}
                  ariaLabel={S.colClient}
                  allowCustom
                />
                <button type="button" className="btn-secondary shrink-0 text-xs" onClick={() => setShowClientModal(true)}>
                  {S.prjAddClient}
                </button>
              </div>
            </Field>
            <Field label={S.prjType}>
              <select className="input" value={form.type} onChange={(e) => setF("type", e.target.value)}>
                <option>New Build</option>
                <option>Repair</option>
                <option>Retrofit</option>
              </select>
            </Field>
            <Field label={S.prjInitStage}>
              <select className="input" value={form.tahap} onChange={(e) => setF("tahap", e.target.value)}>
                {TAHAP.map((t) => <option key={t}>{t}</option>)}
              </select>
            </Field>
            <Field label={S.prjFieldPrioritas}>
              <select className="input" value={form.prioritas} onChange={(e) => setF("prioritas", e.target.value)}>
                {PRIORITAS.map((r) => <option key={r}>{r}</option>)}
              </select>
            </Field>
            {/* P10: "Cabang" diganti rencana lokasi docking. Branch RBAC
                di-auto-isi dari defaultBranch (cabang user / aktif). */}
            <Field label={S.prjDockingLabel ?? "Rencana Lokasi Docking"}>
              <input
                className="input"
                value={form.dockingPlan}
                onChange={(e) => setF("dockingPlan", e.target.value)}
                placeholder={S.prjDockingPh ?? "cth: Dock 2 Balikpapan"}
              />
            </Field>
            <Field label={S.prjFieldPm}>
              <EntityPicker
                value={form.manager}
                onChange={(v) => setF("manager", v)}
                options={pmOptions}
                placeholder={S.prjPickPm}
                ariaLabel={S.prjFieldPm}
              />
            </Field>
            <Field label={S.prjStart}><input type="date" className="input" value={form.start} onChange={(e) => setF("start", e.target.value)} /></Field>
            <Field label={S.prjEnd}><input type="date" className="input" value={form.end} onChange={(e) => setF("end", e.target.value)} /></Field>
          </FormGrid>
          {!vesselExists && form.vessel.trim() && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="mb-2 text-xs font-semibold text-amber-800">{S.prjNewVesselNote}</p>
              <FormGrid>
                <Field label={S.prjLoa}><NumInput min={0} step={0.1} className="input" value={form.vesselLoa} onChange={(e) => setF("vesselLoa", e.target.value)} placeholder={S.prjLoaPh} /></Field>
                <Field label={S.prjVesselType}><input className="input" value={form.vesselType} onChange={(e) => setF("vesselType", e.target.value)} placeholder={S.prjVesselTypePh} /></Field>
              </FormGrid>
              <div className="mt-2">
                <Field label={S.prjImo} hint={S.prjImoHint}>
                  <input className="input font-mono" value={form.vesselImo} onChange={(e) => setF("vesselImo", e.target.value)} placeholder={S.prjImoPh} />
                </Field>
              </div>
            </div>
          )}
          <Field label={S.prjBudget ?? S.prjContract}>
            <NumInput className="input" min={0} value={form.budget} onChange={(e) => setF("budget", e.target.value)} placeholder={S.prjBudgetPh} />
          </Field>
          <div className="rounded-xl border border-steel-200 p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold text-navy-900">{S.prjScope}</p>
              <button
                className="btn-secondary px-2 py-1 text-xs"
                onClick={() => setScopeRows((s) => [...s, { service: "", lokasi: "", deskripsi: "" }])}
              >
                {S.prjAddScope}
              </button>
            </div>
            <div className="space-y-2">
              {scopeRows.map((r, idx) => (
                <div key={idx} className="grid grid-cols-1 gap-2 rounded-lg bg-surface p-2 sm:grid-cols-12">
                  <div className="sm:col-span-4">
                    <Field label={S.prjScopeType}>
                      <input className="input" value={r.service} onChange={(e) => setScopeRows((s) => s.map((x, i) => (i === idx ? { ...x, service: e.target.value } : x)))} placeholder={S.prjScopeTypePh} />
                    </Field>
                  </div>
                  <div className="sm:col-span-3">
                    <Field label={S.prjScopeLoc}>
                      <input className="input" value={r.lokasi} onChange={(e) => setScopeRows((s) => s.map((x, i) => (i === idx ? { ...x, lokasi: e.target.value } : x)))} placeholder={S.prjScopeLocPh} />
                    </Field>
                  </div>
                  <div className="sm:col-span-4">
                    <Field label={S.prjScopeDesc}>
                      <input className="input" value={r.deskripsi} onChange={(e) => setScopeRows((s) => s.map((x, i) => (i === idx ? { ...x, deskripsi: e.target.value } : x)))} placeholder={S.prjScopeDescPh} />
                    </Field>
                  </div>
                  <div className="flex items-end sm:col-span-1">
                    <button
                      className="btn-secondary w-full px-2 py-2 text-xs text-rose-600"
                      aria-label={S.prjDelScopeAria.replace("{n}", String(idx + 1))}
                      disabled={scopeRows.length <= 1}
                      onClick={() => setScopeRows((s) => s.filter((_, i) => i !== idx))}
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Modal>

      <ClientModal
        open={showClientModal}
        onClose={() => setShowClientModal(false)}
        onSaved={(name) => setF("client", name)}
      />
    </>
  );
}
