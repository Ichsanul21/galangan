import { useState, useMemo } from "react";
import { useStore } from "../../data/store";
import { useT } from "../../i18n/LanguageContext";
import { n_prj } from "../../i18n/n_prj";
import { useAuth, canSetTarget } from "../../auth/auth";
import { Card, Modal, Field, FormGrid, toast, EmptyState, StatusBadge, Badge, SortTh, toggleSort, sortRows, ConfirmModal,
  NumInput, MoneyInput, AsyncButton, FlowStrip, FileUploadButton,
  useBusy, SearchBox, rowMatches, RowAction,
} from "../../components/ui";
import type { SortState } from "../../components/ui";
import { findUsages } from "../../utils/usages";
import { Plus, FileDown, Pencil, Trash2, History } from "lucide-react";
import { exportExcel, fmtRupiah } from "../../utils/export";
import { DocumentPreviewCell, InlineDocPreview, type PreviewDoc } from "../../components/DocumentPreview";
import { docAttachment, looksLikeUrl } from "../../utils/docAttachment";
import { SATUAN, STATUS_BOQ_ID } from "../../utils/format";
import { todayISO, parseRupiah } from "../../utils/format";
import { fmtTanggal } from "../../utils/format";
import { createdAtOf, lastTouchedAt } from "../../utils/timestamps";
import type { BoQItem } from "../../data";

/* Dokumen pendukung satu item BoQ, atau null bila tidak ada lampiran.
   URL-nya dibaca lewat docAttachment supaya item yang lampirannya disimpan di
   field lain (mis. `fileName`) tetap bisa dipratinjau, bukan diam-diam
   menampilkan "-" lalu dianggap tombolnya rusak. */
function boqDocOf(b: BoQExt): PreviewDoc | null {
  const att = docAttachment(b);
  if (att.url === "") return null;
  return {
    title: String(b.name ?? b.id),
    fileUrl: att.url,
    fileName: att.fileName !== "" ? att.fileName : undefined,
    subtitle: String(b.id),
  };
}

/* Alur kanonis: Draf=Draft, Diajukan=Pending, Disetujui=Approved, Selesai=Completed.
   "Rejected" (Ditolak) WAJIB punya jalan keluar — sebelumnya tidak ada entri
   sehingga item yang ditolak tidak bisa diajukan ulang, tidak bisa diubah,
   tidak bisa dihapus, dan tidak bisa maju: buntu permanen. */
const STATUS_FLOW: Record<string, string[]> = {
  Draft: ["Pending"],
  Pending: ["Approved", "Rejected"],
  Approved: ["Completed"],
  Completed: [],
  /* Ditolak -> bisa diajukan ulang (Pending) atau dibuang (Draft lalu Hapus). */
  Rejected: ["Pending", "Draft"],
};

interface PriceHist { old: number; new: number; reason: string; date: string; by: string; }
type BoQExt = BoQItem & { priceHistory?: PriceHist[]; fileUrl?: string };

/* Alur kanonis ID (nilai tersimpan EN legacy). "Rejected" dipetakan ke
   "Ditolak" supaya punya langkah yang ditebalkan di flow strip. */
const BOQ_FLOW_ID = ["Draf", "Diajukan", "Disetujui", "Selesai"];
const boqFlowId = (s: string): string =>
  s === "Draft" ? "Draf" : s === "Pending" ? "Diajukan" : s === "Approved" ? "Disetujui" : s === "Completed" ? "Selesai" : s === "Rejected" ? "Ditolak" : s;

const CATEGORIES = ["Mechanical", "Paint", "Survey", "Fabrikasi", "Electrical", "Piping", "Rigging"];

const PRESET: Record<string, { name: string; unit: string; price: number }[]> = {
  Mechanical: [
    { name: "Overhaul Pompa Sentrifugal", unit: "unit", price: 120000000 },
    { name: "Penggantian Bearing Set", unit: "set", price: 45000000 },
    { name: "Alignment Poros Propulsi", unit: "service", price: 85000000 },
  ],
  Paint: [
    { name: "Epoxy Primer", unit: "liter", price: 350000 },
    { name: "Antifouling Topcoat", unit: "liter", price: 520000 },
    { name: "Blasting Grit", unit: "kg", price: 18000 },
  ],
  Survey: [
    { name: "Inspeksi Class Tahunan", unit: "service", price: 150000000 },
    { name: "NDT Thickness Gauging", unit: "service", price: 95000000 },
    { name: "Stability Test", unit: "service", price: 75000000 },
  ],
  Fabrikasi: [
    { name: "Pelat Baja AH36", unit: "ton", price: 12000000 },
    { name: "Profil L-Bar", unit: "batang", price: 850000 },
    { name: "Elektroda Las", unit: "kg", price: 95000 },
  ],
  Electrical: [
    { name: "Kabel Marine 3x95", unit: "m", price: 780000 },
    { name: "Panel MCCB 3P", unit: "unit", price: 24000000 },
    { name: "Lampu Navigasi LED", unit: "pcs", price: 3500000 },
  ],
  Piping: [
    { name: "Pipa Galvanis 4in", unit: "batang", price: 1200000 },
    { name: "Valve Gate 4in", unit: "pcs", price: 4500000 },
    { name: "Fitting Elbow Set", unit: "set", price: 2800000 },
  ],
  Rigging: [
    { name: "Wire Rope 12mm", unit: "m", price: 185000 },
    { name: "Shackle 4.75T", unit: "pcs", price: 950000 },
    { name: "Chain Block 5T", unit: "unit", price: 12500000 },
  ],
};
interface Props {
  projectId: string;
}

export default function BoQSection({ projectId }: Props) {
  const busy = useBusy();
  const { locale } = useT();
  const S = n_prj[locale];
  const { data, update, add, remove, log } = useStore();
  const { user } = useAuth();
  const items = ((data.boq ?? []) as BoQExt[]).filter((b) => b.projectId === projectId);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", quantity: "", unit: "pcs", unitPrice: "", category: "Mechanical", status: "Draft" as BoQItem["status"], fileUrl: "" });
  const [q, setQ] = useState("");
  const [catF, setCatF] = useState("Semua");
  const [stF, setStF] = useState("Semua");
  const [sort, setSort] = useState<SortState>({ key: null, dir: "asc" });
  const [revisiFor, setRevisiFor] = useState<BoQExt | null>(null);
  const [revisiPrice, setRevisiPrice] = useState("");
  const [revisiReason, setRevisiReason] = useState("");
  const [histFor, setHistFor] = useState<BoQExt | null>(null);
  const [logFor, setLogFor] = useState<BoQExt | null>(null);
  const [presetCat, setPresetCat] = useState("Mechanical");
  const [presetIdx, setPresetIdx] = useState("0");
  // Ubah qty/harga (Draft/Pending saja) + hapus (Draft saja) via ConfirmModal.
  const [editFor, setEditFor] = useState<BoQExt | null>(null);
  const [editQty, setEditQty] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [delBoq, setDelBoq] = useState<BoQExt | null>(null);

  const filtered = useMemo(() => {
    const list = items.filter((b) => {
      /* `rowMatches` dengan field yang dinyatakan. `id` ikut searched
         duluan tidak - kata kunci "BQ-001" tidak menemukan baris
         itu, padahal nomor item BoQ justru yang paling sering dicari. */
      const matchQ = rowMatches(b as unknown as Record<string, unknown>, q, ["name", "description", "id", "category", "status"]);
      const matchCat = catF === "Semua" || b.category === catF;
      const matchSt = stF === "Semua" || b.status === stF;
      return matchQ && matchCat && matchSt;
    });
    return list;
  }, [items, q, catF, stF]);

  const totalBoq = useMemo(() => items.reduce((s, b) => s + b.totalPrice, 0), [items]);
  const totalApproved = useMemo(() => items.filter((b) => ["Approved", "Completed"].includes(b.status)).reduce((s, b) => s + b.totalPrice, 0), [items]);
  const totalCompleted = useMemo(() => items.filter((b) => b.status === "Completed").reduce((s, b) => s + b.totalPrice, 0), [items]);
  const progress = totalBoq > 0 ? Math.round((totalCompleted / totalBoq) * 100) : 0;

  /* Posisi alur terjauh item proyek ini (untuk strip alur header). */
  const furthestFlow = useMemo(() => {
    const pos = (s: string): number => (s === "Draft" ? 0 : s === "Pending" ? 1 : s === "Approved" ? 2 : s === "Completed" ? 3 : -1);
    const max = items.reduce((m, b) => Math.max(m, pos(String(b.status))), -1);
    return max >= 0 ? BOQ_FLOW_ID[max] : "";
  }, [items]);

  /* Log BoQ: bandingkan PREFIX "id" lalu " · ", bukan exact match.
     Semua caller menulis target berformat "<id> · <detail>" (revisi harga, edit
     qty, hapus) sehingga exact match tidak pernah cocok dan modal Log hanya
     menampilkan changeStatus. */
  const logOf = (id: string): { time: string; text: string; target: string }[] =>
    (data.activities ?? [])
      .filter((a) => {
        const t = String(a.target ?? "");
        return t === String(id) || t.startsWith(`${id} ·`);
      })
      .map((a) => ({ time: String(a.time ?? "-"), text: `${String(a.actor ?? "")} ${String(a.action ?? "")}`, target: String(a.target ?? "") }));

  const nextStatus = (current: string): string[] => STATUS_FLOW[current] ?? [];

  const saveBoq = async () => {
    if (!form.name.trim()) { toast(S.boqToastName, "info"); return; }
    if (!form.quantity || Number(form.quantity) <= 0) { toast(S.boqToastQty, "info"); return; }
if (!form.unitPrice || parseRupiah(form.unitPrice) <= 0) { toast(S.boqToastPrice, "info"); return; }
  const total = Number(form.quantity) * parseRupiah(form.unitPrice);
    await add("boq", {
      projectId,
      name: form.name.trim(),
      description: form.description.trim(),
      quantity: Number(form.quantity),
      unit: form.unit,
      unitPrice: parseRupiah(form.unitPrice),
      totalPrice: total,
      category: form.category,
      status: "Draft",
      requestedBy: "Anda",
      ...(form.fileUrl.trim() ? { fileUrl: form.fileUrl.trim() } : {}),
    }, { action: "menambahkan BoQ item", module: "BoQ" });
    toast(S.boqToastAdded);
    setShowAdd(false);
    setForm({ name: "", description: "", quantity: "", unit: "pcs", unitPrice: "", category: "Mechanical", status: "Draft", fileUrl: "" });
  };

  const changeStatus = async (id: string, newStatus: string) => {
    /* Approved & Completed mengubah KPI nilai & progres - wajib peran target.
       Rejected juga butuh izin karena menolak item milik tim lain. */
    if (newStatus !== "Draft" && newStatus !== "Pending" && !canSetTarget(user?.role)) {
      toast(S.boqToastRole, "info");
      return;
    }
    await update("boq", id, { status: newStatus as BoQItem["status"] });
    log(`mengubah status BoQ → ${newStatus}`, `${id}`, "BoQ");
    toast(S.boqToastStatus.replace("{a}", id).replace("{b}", newStatus));
  };

  /* Revisi harga TIDAK BOLEH membuka kunci Approved/Completed.
     Versi lama merender tombol ini tanpa syarat status & tanpa cek peran,
     sehingga pembatalan locking di openEdit/saveEditQty bisa di bypass
     lewat pintu belakang. */
  const REVISI_LOCKED: string[] = ["Approved", "Completed"];

  const saveRevisi = async () => {
    if (!revisiFor) return;
    if (REVISI_LOCKED.includes(String(revisiFor.status)) && !canSetTarget(user?.role)) {
      toast(S.boqToastRole, "info");
      return;
    }
    const next = parseRupiah(revisiPrice);
    if (!Number.isFinite(next) || next <= 0) { toast(S.boqToastNewPrice, "info"); return; }
    if (!revisiReason.trim()) { toast(S.boqToastReason, "info"); return; }
    const hist: PriceHist[] = [...(revisiFor.priceHistory ?? []), { old: revisiFor.unitPrice, new: next, reason: revisiReason.trim(), date: todayISO(), by: "Anda" }];
    await update("boq", revisiFor.id, { unitPrice: next, totalPrice: Number(revisiFor.quantity) * next, priceHistory: hist });
    log("merevisi harga BoQ", `${revisiFor.id} · ${fmtRupiah(revisiFor.unitPrice)} → ${fmtRupiah(next)} (${revisiReason.trim()})`, "BoQ");
    toast(S.boqToastRevised.replace("{a}", revisiFor.id));
    setRevisiFor(null);
    setRevisiPrice("");
    setRevisiReason("");
  };

  // Ubah qty & harga satuan (Draft/Pending saja; Approved/Completed terkunci alur).
  const openEdit = (b: BoQExt) => {
    setEditFor(b);
    setEditQty(String(b.quantity));
    setEditPrice(String(b.unitPrice));
  };

  const saveEditQty = async () => {
    if (!editFor) return;
    if (String(editFor.status) !== "Draft" && String(editFor.status) !== "Pending") {
      toast(locale === "en" ? "Only Draft/Proposed items can be edited" : "Hanya item Draf/Diajukan yang bisa diubah", "info");
      return;
    }
    const qty = Number(editQty);
    const price = parseRupiah(editPrice);
    if (!Number.isFinite(qty) || qty <= 0) { toast(S.boqToastQty, "info"); return; }
    if (!Number.isFinite(price) || price <= 0) { toast(S.boqToastPrice, "info"); return; }
    try {
      const hist: PriceHist[] = price !== Number(editFor.unitPrice)
        ? [...(editFor.priceHistory ?? []), { old: Number(editFor.unitPrice), new: price, reason: locale === "en" ? "Edit qty/price" : "Ubah qty/harga", date: todayISO(), by: "Anda" }]
        : [...(editFor.priceHistory ?? [])];
      await update("boq", editFor.id, { quantity: qty, unitPrice: price, totalPrice: qty * price, priceHistory: hist });
      log("mengubah qty/harga BoQ", `${editFor.id} · qty ${qty} · ${fmtRupiah(price)}`, "BoQ");
      toast(S.boqToastRevised.replace("{a}", editFor.id));
      setEditFor(null);
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const importPreset = async () => {
    const list = PRESET[presetCat] ?? [];
    const item = list[Number(presetIdx)];
    if (!item) { toast(S.boqToastPreset, "info"); return; }
    await add("boq", {
      projectId,
      name: item.name,
      description: `Impor preset ${presetCat}`,
      quantity: 1,
      unit: item.unit,
      unitPrice: item.price,
      totalPrice: item.price,
      category: presetCat,
      status: "Draft",
      requestedBy: "Anda",
    }, { action: "mengimpor BoQ preset", module: "BoQ" });
    toast(S.boqToastPresetAdd.replace("{a}", item.name));
  };

  const handleExport = () => {
    const rows = [["No", "Nama Item", "Deskripsi", "Qty", "Unit", "Harga Satuan", "Total", "Status"]];
    items.forEach((b, i) => rows.push([String(i + 1), b.name, b.description, String(b.quantity), b.unit, String(b.unitPrice), String(b.totalPrice), b.status]));
    rows.push(["", "TOTAL", "", "", "", "", String(totalBoq), ""]);
    exportExcel(rows, `BoQ-${projectId}`);
    toast(S.boqToastExport);
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-navy-900 flex items-center gap-2"><FileDown className="h-4 w-4" /> {S.boqTitle.replace("{n}", String(items.length))}</h3>
          <div className="flex gap-2">
            <AsyncButton className="btn-secondary text-xs" onAction={handleExport}><FileDown className="h-3.5 w-3.5" /> {S.exportExcelBtn}</AsyncButton>
            <button className="btn-primary text-xs" onClick={() => setShowAdd(true)}><Plus className="h-3.5 w-3.5" /> {S.boqAddBtn}</button>
          </div>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <SearchBox
            value={q}
            onChange={setQ}
            placeholder={S.boqSearchPh}
            ariaLabel={S.boqSearchAria}
    className="w-full sm:w-52"
  />
          <select className="input w-auto py-1.5 text-sm" aria-label={S.boqCatAria} value={catF} onChange={(e) => setCatF(e.target.value)}>
            <option value="Semua">{S.boqAllCat}</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="input w-auto py-1.5 text-sm" aria-label={S.boqStatusAria} value={stF} onChange={(e) => setStF(e.target.value)}>
            <option value="Semua">{S.prjAllStatus}</option>
            {["Draft", "Pending", "Approved", "Completed", "Rejected"].map((s) => <option key={s} value={s}>{STATUS_BOQ_ID[s] ?? s}</option>)}
          </select>
          <span className="ml-auto text-xs text-steel-500">{S.boqCount.replace("{a}", String(filtered.length)).replace("{b}", String(items.length))}</span>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl bg-surface p-2.5">
          <span className="text-xs font-semibold text-navy-900">{S.boqPresetLead}</span>
          <select className="input w-auto py-1.5 text-sm" aria-label={S.boqPresetCatAria} value={presetCat} onChange={(e) => { setPresetCat(e.target.value); setPresetIdx("0"); }}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="input w-auto max-w-64 py-1.5 text-sm" aria-label={S.boqPresetItemAria} value={presetIdx} onChange={(e) => setPresetIdx(e.target.value)}>
            {(PRESET[presetCat] ?? []).map((p, i) => <option key={p.name} value={String(i)}>{p.name} · {p.unit} · {fmtRupiah(p.price)}</option>)}
          </select>
          <AsyncButton className="btn-secondary text-xs" onAction={importPreset}><Plus className="h-3.5 w-3.5" /> {S.boqPresetAdd}</AsyncButton>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div className="rounded-lg bg-surface p-3 text-center">
            <p className="text-xs text-steel-500">{S.boqKpiTotal}</p>
            <p className="text-sm font-bold text-navy-900">{fmtRupiah(totalBoq)}</p>
          </div>
          <div className="rounded-lg bg-surface p-3 text-center">
            <p className="text-xs text-steel-500">{S.boqKpiApproved}</p>
            <p className="text-sm font-bold text-blue-600">{fmtRupiah(totalApproved)}</p>
          </div>
          <div className="rounded-lg bg-surface p-3 text-center">
            <p className="text-xs text-steel-500">{S.boqKpiDone}</p>
            <p className="text-sm font-bold text-green-600">{fmtRupiah(totalCompleted)}</p>
          </div>
          <div className="rounded-lg bg-surface p-3 text-center">
            <p className="text-xs text-steel-500">{S.boqKpiProg}</p>
            <p className="text-sm font-bold text-navy-900">{progress}%</p>
          </div>
        </div>

        {items.length === 0 ? (
          <EmptyState icon={<FileDown className="h-6 w-6" />} title={S.boqEmptyTitle} subtitle={S.boqEmptySub} />
        ) : (
        <div className="space-y-3">
          <div className="rounded-xl bg-surface p-2.5">
            <FlowStrip steps={BOQ_FLOW_ID} current={furthestFlow || BOQ_FLOW_ID[0]} ariaLabel={locale === "en" ? "BoQ status flow" : "Alur status BoQ"} />
            <p className="mt-1.5 text-[11px] text-steel-500">
              {locale === "en"
                ? "Draft → Proposed → Approved → Completed (each transition has its own button + activity log)"
                : "Draf → Diajukan → Disetujui → Selesai (tiap transisi ada tombol + tercatat di log)"}
            </p>
          </div>
        {filtered.length === 0 ? (
          <p className="py-6 text-center text-sm text-steel-400">{S.boqNoMatch}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-surface">
                <tr>
                  <SortTh label={S.colNo} sortKey="id" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                  <SortTh label={S.colItem} sortKey="name" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                  <SortTh label={S.prjScopeDesc} sortKey="description" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                  <SortTh label={S.colQty} sortKey="quantity" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                  <SortTh label={S.colUnit} sortKey="unit" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                  <SortTh label={S.colUnitPrice} sortKey="unitPrice" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                  <SortTh label={S.colTotal} sortKey="totalPrice" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                  <SortTh label={S.statusLabel} sortKey="status" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                  <SortTh label={S.colRevision} sortKey="revised" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                  <SortTh label={locale === "en" ? "Document" : "Dokumen"} sortKey="dokumen" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                <SortTh label={S.colCreated} sortKey="createdAt" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                  <SortTh label={S.colUpdated} sortKey="updatedAt" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                  <th className="th">{S.actionTh}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-steel-100">
                {sortRows(filtered, sort, (b: BoQExt, k) => k === "createdAt" ? (createdAtOf(b as unknown as Record<string, unknown>) ?? "") : k === "updatedAt" ? (lastTouchedAt(b as unknown as Record<string, unknown>) ?? "") : k === "quantity" ? Number(b.quantity) : k === "unitPrice" ? Number(b.unitPrice) : k === "totalPrice" ? Number(b.totalPrice) : k === "revised" ? Number((b.priceHistory ?? []).length) : k === "dokumen" ? docAttachment(b).url : String((b as unknown as Record<string, unknown>)[k] ?? "")).map((b) => (
                  <tr key={b.id}>
                    <td className="td font-mono text-xs">{b.id}</td>
                    <td className="td font-medium text-navy-900">{b.name}</td>
                    <td className="td text-sm text-steel-600">{b.description}</td>
                    <td className="td">{b.quantity}</td>
                    <td className="td">{b.unit}</td>
                    <td className="td font-mono text-sm">{fmtRupiah(b.unitPrice)}</td>
                    <td className="td font-mono text-sm font-semibold">{fmtRupiah(b.totalPrice)}</td>
                    <td className="td"><StatusBadge status={b.status} label={STATUS_BOQ_ID[b.status] ?? b.status} />
                      <span className="mt-1 block text-[11px] text-steel-400">
                        {BOQ_FLOW_ID.map((s) => (
                          <span key={s} className={boqFlowId(String(b.status)) === s ? "font-bold text-navy-700" : undefined}>
                            {s}{s === "Selesai" ? "" : " → "}
                          </span>
                        ))}
                      </span>
                    </td>
                    <td className="td">
                      {(b.priceHistory ?? []).length > 0 ? (
                          <button className="btn-secondary text-xs" onClick={() => setHistFor(b)}>
                          <Badge tone="amber">{(b.priceHistory ?? []).length}x</Badge> {S.boqHistoryBtn}
                        </button>
                      ) : (
                        <span className="text-xs text-steel-400">-</span>
                      )}
                    </td>
                    <td className="td">
                      {/* Klik ikon mata langsung memuat dokumennya di dalam
                          panel (autoLoad), jadi tidak ada tombol kedua
                          "tampilkan pratinjau". Baris tabel tetap memakai
                          modal karena pratinjau inline di dalam <td> bikin
                          tinggi baris melompat terus saat dipakai. */}
                      <DocumentPreviewCell
                        doc={boqDocOf(b)}
                      />
                    </td>
                    <td className="td text-xs text-steel-600">{createdAtOf(b as unknown as Record<string, unknown>) !== null ? fmtTanggal(createdAtOf(b as unknown as Record<string, unknown>)) : <span className="text-steel-400">-</span>}</td>
                    <td className="td text-xs text-steel-600">{lastTouchedAt(b as unknown as Record<string, unknown>) !== null ? fmtTanggal(lastTouchedAt(b as unknown as Record<string, unknown>)) : <span className="text-steel-400">-</span>}</td>
                    <td className="td">
                      <div className="flex flex-wrap gap-1">
                        {nextStatus(b.status).map((ns) => (
                          <button
                            key={ns}
                            aria-label={S.boqChangeAria.replace("{a}", b.name).replace("{b}", STATUS_BOQ_ID[ns] ?? ns)}
                            className={`rounded px-2 py-0.5 text-xs font-semibold transition-colors ${
                              ns === "Approved" ? "bg-green-100 text-green-700 hover:bg-green-200" :
                              ns === "Rejected" ? "bg-rose-100 text-rose-700 hover:bg-rose-200" :
                              ns === "Completed" ? "bg-blue-100 text-blue-700 hover:bg-blue-200" :
                              "bg-steel-100 text-steel-600 hover:bg-steel-200"
                            }`}
                            onClick={() => void busy.run(`boqStatus-${b.id}-${ns}`, () => changeStatus(b.id, ns))}
                            disabled={busy.isBusy(`boqStatus-${b.id}-${ns}`)}
                          >
                            {ns === "Approved" ? S.detApproveBtn : ns === "Rejected" ? S.detRejectBtn : ns === "Completed" ? S.boqComplete : S.detProposeBtn}
                          </button>
                        ))}
                        {/* Item Ditolak sebelumnya buntu: tidak bisa diajukan ulang,
                            diubah, ATAU dihapus (hanya Draft boleh Hapus).
                            Sekarang bisa_pending->Pending (Ajukan ulang) atau ->Draft. */}
                        {b.status === "Rejected" && (
                          <RowAction icon={Pencil} tone="primary" label={locale === "en" ? "Edit" : "Ubah"} ariaLabel={`${locale === "en" ? "Edit" : "Ubah"} ${b.name}`} onClick={() => openEdit(b)} />
                        )}
                        <RowAction
                          icon={History}
                          tone={REVISI_LOCKED.includes(String(b.status)) ? "neutral" : "primary"}
                          label={REVISI_LOCKED.includes(String(b.status))
                            ? (locale === "en" ? "Locked: needs approver role" : "Terkunci: butuh peran penyetuju")
                            : S.boqRevise}
                          ariaLabel={S.boqReviseAria.replace("{a}", b.name)}
                          onClick={() => { setRevisiFor(b); setRevisiPrice(String(b.unitPrice)); setRevisiReason(""); }}
                        />
                        {(b.status === "Draft" || b.status === "Pending") && (
                          <RowAction icon={Pencil} tone="primary" label={locale === "en" ? "Edit" : "Ubah"} ariaLabel={`${locale === "en" ? "Edit" : "Ubah"} ${b.name}`} onClick={() => openEdit(b)} />
                        )}
                        {b.status === "Draft" && (
                          <RowAction icon={Trash2} tone="danger" label={locale === "en" ? "Delete" : "Hapus"} ariaLabel={`${locale === "en" ? "Delete" : "Hapus"} ${b.name}`} onClick={() => setDelBoq(b)} />
                        )}
                        <button
                          className="rounded bg-steel-100 px-2 py-0.5 text-xs font-semibold text-steel-600 transition-colors hover:bg-steel-200"
                          onClick={() => setLogFor(b)}
                        >
                          Log
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        </div>
        )}
      </Card>

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title={S.boqAddTitle}
        footer={<><button className="btn-secondary" onClick={() => setShowAdd(false)}>{S.cancelBtn}</button><AsyncButton className="btn-primary" onAction={saveBoq}>{S.saveBtn}</AsyncButton></>}>
        <div className="space-y-3">
          <Field label={S.boqNameField}><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={S.boqNamePh} /></Field>
          <Field label={S.prjScopeDesc}><input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          <FormGrid>
            <Field label={S.boqQty}><NumInput className="input" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></Field>
            <Field label={S.colUnit}><select className="input" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
              {SATUAN.map((u) => <option key={u} value={u}>{u}</option>)}
            </select></Field>
          </FormGrid>
          <FormGrid>
            <Field label={S.colUnitPrice}><MoneyInput className="input" value={form.unitPrice} onChange={(v) => setForm({ ...form, unitPrice: v })} /></Field>
            <Field label={S.boqCategory}><select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select></Field>
          </FormGrid>
          <Field label={locale === "en" ? "Supporting document URL" : "URL dokumen pendukung"} hint={locale === "en" ? "Optional — RAB / drawing / quotation" : "Opsional — RAB / gambar / penawaran"}>
            <div className="flex flex-wrap items-center gap-2">
              <input className="input flex-1 font-mono" value={form.fileUrl} onChange={(e) => setForm({ ...form, fileUrl: e.target.value })} placeholder="https://…" />
              <FileUploadButton label={locale === "en" ? "Upload" : "Unggah"} onUploaded={(url) => setForm((f) => ({ ...f, fileUrl: url }))} />
            </div>
            {/* Pratinjau langsung setelah Unggah (atau saat URL diketik) - tanpa
                tombol "tampilkan pratinjau" tambahan. InlineDocPreview ambil
                berkasnya lewat fetch ber-JWT, jadi PDF/gambar terproteksi tetap
                tampil, tidak kotak kosong. */}
            {looksLikeUrl(form.fileUrl) && (
              <div className="mt-2 rounded-xl border border-steel-100 bg-surface p-2">
                <p className="mb-1 text-[11px] font-semibold text-steel-500">{locale === "en" ? "Document preview" : "Pratinjau dokumen"}</p>
                <InlineDocPreview url={form.fileUrl.trim()} height={/\.pdf(\?|$)/i.test(form.fileUrl) ? "h-56" : "h-40"} />
              </div>
            )}
          </Field>
        </div>
      </Modal>

      <Modal open={revisiFor !== null} onClose={() => setRevisiFor(null)} title={S.boqRevTitle.replace("{a}", revisiFor?.name ?? "")} subtitle={revisiFor?.id}
        footer={<><button className="btn-secondary" onClick={() => setRevisiFor(null)}>{S.cancelBtn}</button><AsyncButton className="btn-primary" onAction={saveRevisi}>{S.boqSaveRev}</AsyncButton></>}>
        <div className="space-y-3">
          <p className="text-xs text-steel-500">{S.boqRevInfo.replace("{a}", revisiFor ? fmtRupiah(revisiFor.unitPrice) : "").replace("{b}", revisiFor ? fmtRupiah(revisiFor.totalPrice) : "").replace("{c}", String(revisiFor?.quantity ?? "")).replace("{d}", String((revisiFor?.priceHistory ?? []).length))}</p>
          <Field label={S.boqNewPrice}><MoneyInput className="input" value={revisiPrice} onChange={(v) => setRevisiPrice(v)} placeholder={S.boqNewPricePh} /></Field>
          <Field label={S.boqRevReason} hint={S.boqRevHint}><textarea className="input" rows={3} value={revisiReason} onChange={(e) => setRevisiReason(e.target.value)} placeholder={S.boqRevPh} /></Field>
        </div>
      </Modal>

      <Modal open={histFor !== null} onClose={() => setHistFor(null)} title={S.boqHistTitle.replace("{a}", histFor?.name ?? "")} subtitle={histFor?.id}>
        <div className="space-y-2">
          {(histFor?.priceHistory ?? []).map((h, i) => (
            <div key={i} className="rounded-xl border border-steel-100 p-2.5 text-sm">
              <p className="font-medium text-navy-900">{fmtRupiah(h.old)} → {fmtRupiah(h.new)}</p>
              <p className="text-xs text-steel-500">{h.date} · {h.by} · {h.reason}</p>
            </div>
          ))}
          {(histFor?.priceHistory ?? []).length === 0 && <p className="text-sm text-steel-400">{S.boqNoHist}</p>}
        </div>
      </Modal>

      <Modal open={logFor !== null} onClose={() => setLogFor(null)} title={`Log — ${logFor?.name ?? ""}`} subtitle={logFor?.id}>
        <div className="space-y-2">
          {logFor && logOf(logFor.id).map((l, i) => (
            <div key={i} className="rounded-xl border border-steel-100 p-2.5 text-sm">
              <p className="font-medium text-navy-900">{l.text}</p>
              <p className="text-xs text-steel-500">{l.time}</p>
              {l.target && l.target !== String(logFor.id) && (
                <p className="mt-0.5 text-[11px] text-steel-400">{l.target}</p>
              )}
            </div>
          ))}
          {(!logFor || logOf(logFor.id).length === 0) && (
            <p className="text-sm text-steel-400">{locale === "en" ? "No activity recorded yet." : "Belum ada aktivitas tercatat."}</p>
          )}
        </div>
      </Modal>

      <Modal open={editFor !== null} onClose={() => setEditFor(null)}
        title={editFor ? `${locale === "en" ? "Edit" : "Ubah"} ${editFor.name}` : ""}
        subtitle={editFor?.id}
        footer={<><button className="btn-secondary" onClick={() => setEditFor(null)}>{S.cancelBtn}</button><AsyncButton className="btn-primary" onAction={saveEditQty}>{S.saveBtn}</AsyncButton></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label={S.colQty}><NumInput min={0} className="input" value={editQty} onChange={(e) => setEditQty(e.target.value)} /></Field>
            <Field label={S.colUnitPrice}><MoneyInput className="input" value={editPrice} onChange={(v) => setEditPrice(v)} /></Field>
          </FormGrid>
          <p className="text-xs text-steel-500">
            {locale === "en" ? "New total" : "Total baru"}: {Number(editQty) > 0 && Number(editPrice) > 0 ? fmtRupiah(Number(editQty) * Number(editPrice)) : "-"}
          </p>
        </div>
      </Modal>

      <ConfirmModal
        open={delBoq !== null}
        title={delBoq ? (locale === "en" ? `Delete BoQ item ${delBoq.id}?` : `Hapus item BoQ ${delBoq.id}?`) : ""}
        desc={(() => {
          if (!delBoq) return "";
          const used = findUsages(data, "boq", String(delBoq.id));
          const base = locale === "en"
            ? `BoQ item ${delBoq.name} (Draft) will be permanently deleted.`
            : `Item BoQ ${delBoq.name} (Draf) akan dihapus permanen.`;
          return used.length > 0
            ? (locale === "en" ? `${base} Used in: ${used.join(", ")}. Deletion blocked.` : `${base} Dipakai di: ${used.join(", ")}. Penghapusan diblokir.`)
            : base;
        })()}
        confirmLabel={delBoq && findUsages(data, "boq", String(delBoq.id)).length > 0
          ? (locale === "en" ? "Blocked - still in use" : "Diblokir - masih dipakai")
          : (locale === "en" ? "Delete" : "Hapus")}
        danger
        confirmDisabled={delBoq ? findUsages(data, "boq", String(delBoq.id)).length > 0 : false}
        onCancel={() => setDelBoq(null)}
        onConfirm={async () => {
          if (!delBoq) return;
          if (String(delBoq.status) !== "Draft") { toast(locale === "en" ? "Only Draft items can be deleted" : "Hanya item Draf yang bisa dihapus", "info"); return; }
          const usedBy = findUsages(data, "boq", String(delBoq.id));
          if (usedBy.length > 0) { toast(locale === "en" ? `Delete blocked - used in: ${usedBy.join(", ")}` : `Hapus diblokir - dipakai di: ${usedBy.join(", ")}`, "info"); return; }
          try {
            await remove("boq", String(delBoq.id));
            log("menghapus item BoQ", `${delBoq.id} · ${delBoq.name}`, "BoQ");
            toast(locale === "en" ? `BoQ item ${delBoq.id} deleted` : `Item BoQ ${delBoq.id} dihapus`);
          } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
          setDelBoq(null);
        }}
      />
    </div>
  );
}
