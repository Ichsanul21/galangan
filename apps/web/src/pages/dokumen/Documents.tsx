import { useState } from "react";
import { Plus, Search, ScrollText, FileText, Eye, Pencil, Trash2, Archive, RotateCcw, Download } from "lucide-react";
import { Card, PageHeader, Badge, KpiCard, Modal, Field, FormGrid, ConfirmModal, SortTh, toggleSort, sortRows, toast, StatusBadge } from "../../components/ui";
import type { SortState } from "../../components/ui";
import { useStore, type StoreItem } from "../../data/store";
import { fmtTanggal, todayISO } from "../../utils/format";
import { sbDsNumber, sbSjNumber, maxSeq, parseSjSeq } from "../../utils/sb";
import { exportExcel } from "../../utils/export";

const TYPES = ["Kontrak", "Drawing", "Prosedur", "Sertifikat", "Laporan", "Invoice", "NCR", "Penawaran", "Dock Space", "Surat Jalan", "Tanda Terima"];
const FILTERS = ["Semua", ...TYPES, "Arsip"];
const EXPIRY_WINDOW = 30;

const DOC_MONTHS = ["Sep", "Okt", "Nov", "Des", "Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Ags"];
const DOC_MNUM = ["09", "10", "11", "12", "01", "02", "03", "04", "05", "06", "07", "08"];

const FLOW_NEXT: Record<string, string[]> = {
  Draft: ["Diajukan"],
  Diajukan: ["Disetujui", "Ditolak"],
  Disetujui: ["Berlaku"],
  Ditolak: [],
  Berlaku: ["Kedaluwarsa"],
  Kedaluwarsa: [],
};

const PREFIX: Record<string, string> = {
  Kontrak: "CTR", Drawing: "DRW", Prosedur: "SOP", Sertifikat: "SRT",
  Laporan: "LAP", Invoice: "INV", NCR: "NCR", Penawaran: "QTN",
  "Dock Space": "DS-SB", "Surat Jalan": "SJ-SMD", "Tanda Terima": "TT-SMD",
};

const RETENSI: Record<string, number | null> = {
  Kontrak: 10, Sertifikat: 5, Laporan: 5, Invoice: 10, NCR: 5,
  Drawing: null, Prosedur: 5, Penawaran: 3,
  "Dock Space": 5, "Surat Jalan": 5, "Tanda Terima": 5,
};

function nextDocId(type: string, docs: StoreItem[]): string {
  const prefix = PREFIX[type] ?? "DOC";
  const year = todayISO().slice(0, 4);
  const re = new RegExp(`^${prefix}-${year}-(\\d+)$`);
  let max = 0;
  for (const d of docs) {
    const m = re.exec(String(d.id ?? ""));
    if (m) max = Math.max(max, Number(m[1]) || 0);
    const m2 = new RegExp(`^${prefix}-(\\d+)$`).exec(String(d.id ?? ""));
    if (m2) max = Math.max(max, 0);
  }
  return `${prefix}-${year}-${String(max + 1).padStart(3, "0")}`;
}

function lewatRetensi(d: StoreItem): boolean {
  const tahun = RETENSI[String(d.type)];
  if (tahun === null || tahun === undefined) return false;
  const upd = String(d.updated ?? "");
  const t = new Date(`${upd.length === 7 ? `${upd}-01` : upd}T00:00:00`).getTime();
  if (Number.isNaN(t)) return false;
  const years = (Date.now() - t) / (365.25 * 86400000);
  return years > tahun;
}

const LEGACY_MAP: Record<string, string> = {
  "Menunggu Approval": "Diajukan",
};

function canonStatus(s: string): string {
  if (LEGACY_MAP[s]) return LEGACY_MAP[s];
  return FLOW_NEXT[s] !== undefined ? s : "";
}

function nextVersion(v: string): string {
  const m = /^v(\d+)\.(\d+)$/.exec(String(v).trim());
  if (m) return `v${m[1]}.${Number(m[2]) + 1}`;
  const m2 = /^v(\d+)$/.exec(String(v).trim());
  if (m2) return `v${m2[1]}.1`;
  return "v1.1";
}

function daysUntil(iso: string | null | undefined): number | null {
  if (!iso || iso === "-") return null;
  const raw = String(iso).length === 7 ? `${iso}-01` : String(iso);
  const t = new Date(`${raw}T00:00:00`).getTime();
  if (Number.isNaN(t)) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((t - today) / 86400000);
}

const emptyForm = { title: "", type: "Laporan", project: "", vessel: "", owner: "", berlakuHingga: "", revNote: "" };

export default function Documents() {
  const { data, add, update, remove, log } = useStore();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortState>({ key: null, dir: "asc" });
  const [type, setType] = useState("Semua");
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<StoreItem | null>(null);
  const [detail, setDetail] = useState<StoreItem | null>(null);
  const [archiving, setArchiving] = useState<StoreItem | null>(null);
  const [deleting, setDeleting] = useState<StoreItem | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [relSel, setRelSel] = useState<string[]>([]);

  const docPreview = nextDocId(form.type, data.documents);

  const active = data.documents.filter((d) => !d.archived);
  const archived = data.documents.filter((d) => d.archived);

  const list = (type === "Arsip" ? archived : active.filter((d) => type === "Semua" || d.type === type)).filter((d) => {
    return `${d.title} ${d.id} ${d.project} ${d.vessel}`.toLowerCase().includes(q.toLowerCase());
  });

  const expiring = active
    .map((d) => ({ doc: d, days: daysUntil(d.berlakuHingga) }))
    .filter((x) => x.days !== null && (x.days as number) <= EXPIRY_WINDOW)
    .sort((a, b) => (a.days as number) - (b.days as number));

  const openAdd = () => { setForm(emptyForm); setRelSel([]); setShowAdd(true); };
  const openEdit = (d: StoreItem) => {
    setEditing(d);
    setRelSel(Array.isArray(d.related) ? d.related.map(String) : []);
    setForm({ title: d.title, type: d.type, project: d.project, vessel: d.vessel ?? "", owner: d.owner, berlakuHingga: d.berlakuHingga ?? "", revNote: "" });
  };

  const validForm = (): boolean => {
    if (!form.title.trim()) { toast("Judul dokumen wajib diisi", "info"); return false; }
    if (!form.type) { toast("Tipe dokumen wajib diisi", "info"); return false; }
    if (!form.project) { toast("Proyek terkait wajib diisi (pilih - untuk umum)", "info"); return false; }
    if (!form.owner.trim()) { toast("Penanggung jawab wajib diisi", "info"); return false; }
    if (!data.employees.some((e) => String(e.name).toLowerCase() === form.owner.trim().toLowerCase())) {
      toast("Penanggung jawab harus karyawan terdaftar", "info");
      return false;
    }
    if (form.type === "Sertifikat" && !form.berlakuHingga) { toast("Sertifikat wajib isi berlaku hingga", "info"); return false; }
    if (editing && !form.revNote.trim()) { toast("Catatan revisi wajib diisi", "info"); return false; }
    return true;
  };

  const save = () => {
    if (!validForm()) return;
    if (editing) {
      const dupe = data.documents.some((d) => d.id !== editing.id && d.type === form.type && String(d.title).toLowerCase() === form.title.trim().toLowerCase());
      if (dupe) { toast("Judul sudah dipakai untuk tipe dokumen ini", "info"); return; }
      const version = nextVersion(String(editing.version ?? "v1.0"));
      const revisions = [...(editing.revisions ?? []), { version, at: todayISO(), by: form.owner.trim(), note: form.revNote.trim() }];
      update("documents", editing.id, {
        title: form.title.trim(), type: form.type, project: form.project, vessel: form.vessel,
        owner: form.owner.trim(), berlakuHingga: form.berlakuHingga || undefined,
        version, revisions, updated: todayISO(), related: [...relSel],
      });
      log(`merevisi dokumen ke ${version}`, editing.id, "Dokumen");
      toast(`Dokumen ${editing.id} naik ke ${version}`);
      setEditing(null);
    } else {
      const dupe = data.documents.some((d) => d.type === form.type && String(d.title).toLowerCase() === form.title.trim().toLowerCase());
      if (dupe) { toast("Judul sudah dipakai untuk tipe dokumen ini", "info"); return; }
      if (data.documents.some((d) => d.id === docPreview)) { toast("Nomor dokumen sudah dipakai, coba lagi", "info"); return; }
      const created = add("documents", {
        id: docPreview,
        title: form.title.trim(), type: form.type, project: form.project, vessel: form.vessel,
        owner: form.owner.trim(), berlakuHingga: form.berlakuHingga || undefined,
        version: "v1.0", status: "Draft", updated: todayISO(), archived: false, docCopy: "Terkendali",
        related: [...relSel],
        // Ref format SB untuk arsip operasional (cth DS: 001/DS-SB/SMD/I/2024).
        sbRef: form.type === "Dock Space" ? sbDsNumber(sbSeq("Dock Space"))
          : form.type === "Surat Jalan" ? sbSjNumber(sbSeq("Surat Jalan"))
          : "",
        revisions: [{ version: "v1.0", at: todayISO(), by: form.owner.trim(), note: "Dokumen dibuat" }],
      }, { action: "mengarsipkan dokumen", module: "Dokumen" });
      toast(`Dokumen ${created.id} ditambahkan`);
      setShowAdd(false);
    }
  };

  const toggleCopy = (d: StoreItem) => {
    const next = String(d.docCopy ?? "Terkendali") === "Salinan" ? "Terkendali" : "Salinan";
    update("documents", d.id, { docCopy: next, updated: todayISO() });
    log(`menandai dokumen sebagai ${next}`, d.id, "Dokumen");
    toast(`${d.id} ditandai ${next}`);
    setDetail((cur) => (cur && cur.id === d.id ? { ...cur, docCopy: next, updated: todayISO() } : cur));
  };

  const flowTo = (d: StoreItem, next: string) => {
    const ok = window.confirm(`Ubah status ${d.id} ke ${next}? Tercatat di riwayat revisi.`);
    if (!ok) return;
    const revisions = [...(d.revisions ?? []), { version: String(d.version ?? "v1.0"), at: todayISO(), by: String(d.owner ?? ""), note: `Status → ${next}` }];
    update("documents", d.id, { status: next, updated: todayISO(), revisions });
    log(`mengubah status dokumen ke ${next}`, d.id, "Dokumen");
    toast(`${d.id} → ${next}`);
    setDetail((cur) => (cur && cur.id === d.id ? { ...cur, status: next, updated: todayISO(), revisions } : cur));
  };

  const confirmArchive = () => {
    if (!archiving) return;
    update("documents", archiving.id, { archived: true });
    log("mengarsipkan dokumen", archiving.id, "Dokumen");
    toast(`${archiving.id} diarsipkan`, "info");
    setArchiving(null);
  };

  const confirmDelete = () => {
    if (!deleting) return;
    remove("documents", deleting.id);
    log("menghapus permanen dokumen", deleting.id, "Dokumen");
    toast(`${deleting.id} dihapus permanen`, "info");
    setDeleting(null);
  };

  const doExport = () => {
    const rows = list.map((d) => [d.id, d.title, d.type, d.project, d.version, d.status, d.owner, d.updated, d.berlakuHingga ?? "", Array.isArray(d.related) ? d.related.length : 0]);
    exportExcel([["ID", "Judul", "Tipe", "Proyek", "Versi", "Status", "Owner", "Updated", "Berlaku Hingga", "Jml Terkait"], ...rows], `register-dokumen-${todayISO()}`);
    toast(`${String(rows.length)} baris diekspor ke Excel`);
  };

  const sbSeq = (tipe: string): number => {
    const rows = data.documents.filter((d) => d.type === tipe);
    if (tipe === "Surat Jalan") {
      // Dash format SJ-SMD-YYYY-nnn: scan trailing digits di sbRef + id.
      const nums = rows.flatMap((d) => [parseSjSeq(d.sbRef), parseSjSeq(d.id)]);
      return Math.max(0, ...nums) + 1;
    }
    const nums = rows
      .filter((d) => typeof d.sbRef === "string")
      .map((d) => String(d.sbRef));
    return maxSeq(nums, /^(\d+)\//) + 1;
  };

  const setF = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const trendOf = (pred: (d: StoreItem) => boolean) =>
    DOC_MONTHS.map((name, i) => ({ name, v: active.filter((d) => pred(d) && String(d.updated ?? "").slice(5, 7) === DOC_MNUM[i]).length }));

  return (
    <div>
      <PageHeader
        title="Aset & Dokumen"
        subtitle="Register dokumen terpusat — kontrak, drawing, sertifikat, laporan"
        icon={<ScrollText className="h-5 w-5" />}
        actions={
          <>
            <button className="btn-secondary" onClick={doExport}><Download className="h-4 w-4" /> Export Excel</button>
            <button className="btn-primary-gradient" onClick={openAdd}><Plus className="h-4 w-4" /> Arsipkan Dokumen</button>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total Dokumen" value={String(active.length)} icon={<ScrollText className="h-5 w-5" />} chip="navy" hint="Register aktif" spark={trendOf(() => true)} />
        <KpiCard label="Berlaku / Disetujui" value={String(active.filter((d) => d.status === "Berlaku" || d.status === "Disetujui").length)} icon={<FileText className="h-5 w-5" />} chip="teal" hint="Dokumen aktif" spark={trendOf((d) => d.status === "Berlaku" || d.status === "Disetujui")} />
        <KpiCard label="Menunggu Approval" value={String(active.filter((d) => canonStatus(d.status) === "Diajukan" || d.status === "Draft").length)} icon={<FileText className="h-5 w-5" />} chip="amber" hint="Perlu tindakan" spark={trendOf((d) => canonStatus(d.status) === "Diajukan" || d.status === "Draft")} />
        <KpiCard label="Kedaluwarsa" value={String(active.filter((d) => d.status === "Kedaluwarsa").length)} icon={<FileText className="h-5 w-5" />} chip="rose" hint="Perlu perpanjangan" spark={trendOf((d) => d.status === "Kedaluwarsa")} />
      </div>

      {expiring.length > 0 && type !== "Arsip" && (
        <Card className="mb-4 p-4">
          <h3 className="text-sm font-semibold text-navy-900">Segera expire — dalam {String(EXPIRY_WINDOW)} hari</h3>
          <div className="mt-2 space-y-1.5 text-sm">
            {expiring.slice(0, 6).map((x) => (
              <div key={x.doc.id} className="flex items-center justify-between gap-2">
                <span className="truncate text-steel-600" title={`${String(x.doc.title)} · berlaku hingga ${fmtTanggal(x.doc.berlakuHingga)}`}>{x.doc.title}</span>
                <Badge tone={(x.days as number) < 0 ? "red" : "amber"}>
                  {(x.days as number) < 0 ? `Lewat ${String(Math.abs(x.days as number))} hari` : `${fmtTanggal(x.doc.berlakuHingga)} · sisa ${String(x.days)} hari`}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <div className="flex flex-wrap items-center gap-3 p-4">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-steel-400" />
            <input className="input pl-9 w-full sm:w-64" placeholder="Cari judul / ID / proyek..." value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="flex gap-1 overflow-x-auto">
            {FILTERS.map((t) => (
              <button key={t} onClick={() => setType(t)}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm ${type === t ? "bg-navy-700 text-white" : "border border-steel-200 text-steel-600 hover:bg-steel-100"}`}>
                {t}{t === "Arsip" ? ` (${String(archived.length)})` : ""}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-surface sticky top-0 z-10">
              <tr><SortTh label="Dokumen" sortKey="dokumen" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label="Tipe" sortKey="tipe" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label="Proyek / Kapal" sortKey="proyek" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label="Versi" sortKey="versi" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label="Status" sortKey="status" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label="Diperbarui" sortKey="diperbarui" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><th className="th">Aksi</th></tr>
            </thead>
            <tbody className="divide-y divide-steel-100">
              {sortRows(list, sort, (d, key) =>
                key === "dokumen" ? String(d.title ?? "") : key === "tipe" ? String(d.type ?? "") : key === "proyek" ? String(d.project ?? "") : key === "versi" ? String(d.version ?? "") : key === "status" ? String(d.status ?? "") : String(d.updated ?? "")
              ).map((d) => (
                <tr key={d.id} className="hover:bg-surface">
                  <td className="td max-w-[260px]">
                    <p className="truncate font-medium text-navy-900" title={String(d.title)}>{d.title}</p>
                    <p className="font-mono text-xs text-steel-500">{d.id} · {d.owner}{d.berlakuHingga ? ` · hingga ${fmtTanggal(d.berlakuHingga)}` : ""}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <Badge tone={String(d.docCopy ?? "Terkendali") === "Salinan" ? "amber" : "teal"}>{String(d.docCopy ?? "Terkendali")}</Badge>
                      {lewatRetensi(d) && <Badge tone="red">Melewati Retensi</Badge>}
                    </div>
                  </td>
                  <td className="td"><Badge tone="navy">{d.type}</Badge></td>
                  <td className="td text-steel-600 text-xs font-mono max-w-[180px] truncate" title={`${String(d.project)} · ${String(d.vessel)}`}>{d.project} · {d.vessel}</td>
                  <td className="td text-steel-600">{d.version}</td>
                  <td className="td"><StatusBadge status={d.status} /></td>
                  <td className="td text-steel-600">{fmtTanggal(d.updated)}</td>
                  <td className="td">
                    <div className="flex gap-1">
                      <button className="rounded-lg p-1.5 text-steel-500 hover:bg-steel-100" title="Detail" aria-label={`Detail ${d.id}`} onClick={() => setDetail(d)}><Eye className="h-4 w-4" /></button>
                      {type === "Arsip" ? (
                        <>
                          <button className="rounded-lg p-1.5 text-teal-600 hover:bg-teal-50" title="Pulihkan" aria-label={`Pulihkan ${d.id}`} onClick={() => { update("documents", d.id, { archived: false }); log("memulihkan dokumen dari arsip", d.id, "Dokumen"); toast(`${d.id} dipulihkan`); }}><RotateCcw className="h-4 w-4" /></button>
                          <button className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50" title="Hapus permanen" aria-label={`Hapus permanen ${d.id}`} onClick={() => setDeleting(d)}><Trash2 className="h-4 w-4" /></button>
                        </>
                      ) : (
                        <>
                          <button className="rounded-lg p-1.5 text-steel-500 hover:bg-steel-100" title="Ubah" aria-label={`Ubah ${d.id}`} onClick={() => openEdit(d)}><Pencil className="h-4 w-4" /></button>
                          <button className="rounded-lg p-1.5 text-steel-500 hover:bg-steel-100" title="Arsipkan" aria-label={`Arsipkan ${d.id}`} onClick={() => setArchiving(d)}><Archive className="h-4 w-4" /></button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {list.length === 0 && <p className="py-8 text-center text-sm text-steel-400">Tidak ada dokumen yang cocok.</p>}
        </div>
      </Card>

      {/* Modal tambah/ubah */}
      <Modal
        open={showAdd || editing !== null}
        onClose={() => { setShowAdd(false); setEditing(null); }}
        title={editing ? `Ubah Dokumen ${editing.id}` : "Arsipkan Dokumen Baru"}
        subtitle={editing ? `Versi otomatis naik ke ${nextVersion(String(editing.version ?? "v1.0"))}` : "Versi awal otomatis v1.0, status awal Draft"}
        wide
        footer={
          <>
            <button className="btn-secondary" onClick={() => { setShowAdd(false); setEditing(null); }}>Batal</button>
            <button className="btn-primary" onClick={save}>Simpan Dokumen</button>
          </>
        }
      >
        <div className="space-y-3">
          {!editing && (
            <p className="rounded-xl bg-surface p-3 text-sm text-steel-600">
              Nomor otomatis (preview): <span className="font-mono font-bold text-navy-900">{docPreview}</span>
              <span className="block text-xs text-steel-400">{PREFIX[form.type] ?? "DOC"} + tahun berjalan + urutan, disimpan sebagai ID.</span>
            </p>
          )}
          <Field label="Judul dokumen">
            <input className="input" placeholder="cth: Docking Report RP-2026-005" value={form.title} onChange={(e) => setF("title", e.target.value)} />
          </Field>
          <FormGrid>
            <Field label="Tipe">
              <select className="input" value={form.type} onChange={(e) => setF("type", e.target.value)}>
                {TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Proyek terkait">
              <select className="input" value={form.project} onChange={(e) => setF("project", e.target.value)}>
                <option value="">Pilih proyek…</option>
                <option value="-">Umum (non-proyek)</option>
                {data.projects.map((p) => <option key={p.id} value={p.id}>{p.id} · {p.vessel}</option>)}
              </select>
            </Field>
            <Field label="Kapal terkait">
              <select className="input" value={form.vessel} onChange={(e) => setF("vessel", e.target.value)}>
                <option value="">—</option>
                <option value="-">Umum</option>
                {data.vessels.map((v) => <option key={v.id} value={v.name}>{v.name}</option>)}
              </select>
            </Field>
            <Field label="Penanggung jawab">
              <input className="input" placeholder="cth: Sari Wulandari" value={form.owner} onChange={(e) => setF("owner", e.target.value)} />
            </Field>
            <Field label="Berlaku hingga (opsional)">
              <input type="date" className="input" value={form.berlakuHingga} onChange={(e) => setF("berlakuHingga", e.target.value)} />
            </Field>
            {editing && (
              <Field label="Catatan revisi">
                <input className="input" placeholder="cth: Perbarui hasil docking" value={form.revNote} onChange={(e) => setF("revNote", e.target.value)} />
              </Field>
            )}
          </FormGrid>
          <Field label="Dokumen terkait (boleh banyak)" hint="Tahan Ctrl/Cmd untuk pilih lebih dari satu">
            <select
              multiple
              className="input min-h-[96px]"
              value={relSel}
              onChange={(e) => setRelSel([...e.target.selectedOptions].map((o) => o.value))}
            >
              {data.documents.filter((d) => !editing || d.id !== editing.id).map((d) => (
                <option key={d.id} value={d.id}>{d.id} · {String(d.title)}</option>
              ))}
            </select>
          </Field>
        </div>
      </Modal>

      {/* Modal detail */}
      <Modal open={detail !== null} onClose={() => setDetail(null)} title={detail ? String(detail.title) : ""} subtitle={detail ? `${detail.id} · ${detail.type}` : ""} wide>
        {detail && (
          <div>
            <dl className="space-y-2.5 text-sm">
              {[
                ["Proyek", detail.project],
                ["Kapal", detail.vessel],
                ["Versi", detail.version],
                ["Berlaku hingga", fmtTanggal(detail.berlakuHingga)],
                ["Diperbarui", fmtTanggal(detail.updated)],
                ["Penanggung jawab", detail.owner],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4"><dt className="text-steel-500">{k}</dt><dd className="font-medium text-navy-900">{v}</dd></div>
              ))}
              <div className="flex justify-between gap-4"><dt className="text-steel-500">Status</dt><dd><StatusBadge status={detail.status} /></dd></div>
              <div className="flex justify-between gap-4">
                <dt className="text-steel-500">Retensi</dt>
                <dd className="flex items-center gap-1.5">
                  <span className="font-medium text-navy-900">{RETENSI[String(detail.type)] === null || RETENSI[String(detail.type)] === undefined ? "Permanen" : `${String(RETENSI[String(detail.type)])} tahun`}</span>
                  {lewatRetensi(detail) && <Badge tone="red">Melewati Retensi</Badge>}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-steel-500">Salinan</dt>
                <dd><Badge tone={String(detail.docCopy ?? "Terkendali") === "Salinan" ? "amber" : "teal"}>{String(detail.docCopy ?? "Terkendali")}</Badge></dd>
              </div>
            </dl>
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="btn-secondary text-xs" onClick={() => toggleCopy(detail)}>
                {String(detail.docCopy ?? "Terkendali") === "Salinan" ? "Jadikan Terkendali" : "Tandai Salinan"}
              </button>
            </div>
            {canonStatus(detail.status) && FLOW_NEXT[canonStatus(detail.status)].length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {FLOW_NEXT[canonStatus(detail.status)].map((n) => (
                  <button key={n} className="btn-secondary text-xs" onClick={() => flowTo(detail, n)}>{n}</button>
                ))}
              </div>
            ) : !canonStatus(detail.status) ? (
              <p className="mt-3 text-xs text-steel-400">Status warisan — read-only, tanpa aksi alur.</p>
            ) : null}
            <h4 className="mb-2 mt-4 text-sm font-semibold text-navy-900">Dokumen terkait</h4>
            <div className="space-y-1.5 text-sm">
              {((Array.isArray(detail.related) ? detail.related : []) as unknown[]).map((rel, i) => {
                const rid = String(rel);
                const found = data.documents.find((d) => d.id === rid);
                return (
                  <div key={`${rid}-${i}`} className="flex items-center justify-between gap-2 rounded-lg bg-surface px-3 py-2">
                    <span className="truncate font-mono text-xs font-semibold text-navy-900" title={found ? String(found.title) : rid}>{rid}{found ? ` · ${String(found.title)}` : ""}</span>
                    {found && <button className="btn-secondary px-2 py-1 text-xs" onClick={() => setDetail(found)}>Buka</button>}
                  </div>
                );
              })}
              {(!Array.isArray(detail.related) || detail.related.length === 0) && <p className="text-xs text-steel-400">Belum ada dokumen terkait.</p>}
            </div>
            <h4 className="mb-2 mt-4 text-sm font-semibold text-navy-900">Riwayat revisi</h4>
            <div className="space-y-1.5 text-sm">
              {((detail.revisions ?? []) as { version: string; at: string; by: string; note: string }[]).map((r) => (
                <div key={r.version} className="flex items-center justify-between gap-2 rounded-lg bg-surface px-3 py-2">
                  <span className="font-mono font-semibold text-navy-900">{r.version}</span>
                  <span className="truncate text-xs text-steel-500" title={`${r.note} — ${r.by}`}>{r.note} — {r.by}</span>
                  <span className="text-xs text-steel-500 whitespace-nowrap">{fmtTanggal(r.at)}</span>
                </div>
              ))}
              {((detail.revisions ?? []) as unknown[]).length === 0 && <p className="text-xs text-steel-400">Belum ada riwayat revisi.</p>}
            </div>
          </div>
        )}
      </Modal>

      <ConfirmModal
        open={archiving !== null}
        title={`Arsipkan ${archiving?.id ?? ""}?`}
        desc="Dokumen disembunyikan dari register aktif dan pindah ke filter Arsip. Bisa dipulihkan kapan saja."
        confirmLabel="Ya, arsipkan"
        onCancel={() => setArchiving(null)}
        onConfirm={confirmArchive}
      />

      <ConfirmModal
        open={deleting !== null}
        title={`Hapus permanen ${deleting?.id ?? ""}?`}
        desc="Dokumen yang sudah diarsip akan dihapus permanen dari register sesi ini dan tidak dapat dikembalikan."
        confirmLabel="Ya, hapus permanen"
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
