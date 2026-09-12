import { useState } from "react";
import { Plus, Search, ScrollText, FileText, Eye, Pencil, Trash2 } from "lucide-react";
import { Card, PageHeader, Badge, KpiCard, Modal, Field, FormGrid, ConfirmModal, toast } from "../../components/ui";
import { useStore, type StoreItem } from "../../data/store";

const types = ["Semua", "Kontrak", "Drawing", "Prosedur", "Sertifikat", "Laporan", "Invoice", "NCR", "Penawaran"];

const statusTone: Record<string, "green" | "blue" | "amber" | "red" | "gray" | "navy"> = {
  Berlaku: "green",
  Disetujui: "green",
  Terkirim: "blue",
  Draft: "gray",
  Negosiasi: "amber",
  "Menunggu Approval": "amber",
  "Dalam Proses": "blue",
  Kedaluwarsa: "red",
};

const emptyForm = { title: "", type: "Laporan", project: "", vessel: "", version: "v1.0", status: "Draft", owner: "" };

export default function Documents() {
  const { data, add, update, remove } = useStore();
  const [q, setQ] = useState("");
  const [type, setType] = useState("Semua");
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<StoreItem | null>(null);
  const [detail, setDetail] = useState<StoreItem | null>(null);
  const [deleting, setDeleting] = useState<StoreItem | null>(null);
  const [form, setForm] = useState(emptyForm);

  const list = data.documents.filter((d) => {
    const matchQ = `${d.title} ${d.id} ${d.project} ${d.vessel}`.toLowerCase().includes(q.toLowerCase());
    const matchT = type === "Semua" || d.type === type;
    return matchQ && matchT;
  });

  const openAdd = () => { setForm(emptyForm); setShowAdd(true); };
  const openEdit = (d: StoreItem) => {
    setEditing(d);
    setForm({ title: d.title, type: d.type, project: d.project, vessel: d.vessel, version: d.version, status: d.status, owner: d.owner });
  };

  const save = () => {
    if (!form.title.trim()) { toast("Judul dokumen wajib diisi", "info"); return; }
    if (editing) {
      update("documents", editing.id, { ...form });
      toast(`Dokumen ${editing.id} diperbarui`);
      setEditing(null);
    } else {
      const created = add("documents", { ...form, updated: new Date().toISOString().slice(0, 10) },
        { action: "mengarsipkan dokumen", module: "Dokumen" });
      toast(`Dokumen ${created.id} ditambahkan`);
      setShowAdd(false);
    }
  };

  const setF = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div>
      <PageHeader
        title="Aset & Dokumen"
        subtitle="Register dokumen terpusat — kontrak, drawing, sertifikat, laporan"
        icon={<ScrollText className="h-5 w-5" />}
        actions={<button className="btn-primary-gradient" onClick={openAdd}><Plus className="h-4 w-4" /> Arsipkan Dokumen</button>}
      />

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total Dokumen" value={String(data.documents.length)} icon={<ScrollText className="h-5 w-5" />} chip="navy" hint="Seluruh register" />
        <KpiCard label="Berlaku / Disetujui" value={String(data.documents.filter((d) => d.status === "Berlaku" || d.status === "Disetujui").length)} icon={<FileText className="h-5 w-5" />} chip="teal" hint="Dokumen aktif" />
        <KpiCard label="Menunggu Approval" value={String(data.documents.filter((d) => d.status === "Menunggu Approval" || d.status === "Draft").length)} icon={<FileText className="h-5 w-5" />} chip="amber" hint="Perlu tindakan" />
        <KpiCard label="Kedaluwarsa" value={String(data.documents.filter((d) => d.status === "Kedaluwarsa").length)} icon={<FileText className="h-5 w-5" />} chip="rose" hint="Perlu perpanjangan" />
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-3 p-4">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-steel-400" />
            <input className="input pl-9 w-64" placeholder="Cari judul / ID / proyek..." value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="flex gap-1 overflow-x-auto">
            {types.map((t) => (
              <button key={t} onClick={() => setType(t)}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm ${type === t ? "bg-navy-700 text-white" : "border border-steel-200 text-steel-600 hover:bg-steel-100"}`}>
                {t}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-surface">
              <tr><th className="th">Dokumen</th><th className="th">Tipe</th><th className="th">Proyek / Kapal</th><th className="th">Versi</th><th className="th">Status</th><th className="th">Diperbarui</th><th className="th">Aksi</th></tr>
            </thead>
            <tbody className="divide-y divide-steel-100">
              {list.map((d) => (
                <tr key={d.id} className="hover:bg-surface">
                  <td className="td">
                    <p className="font-medium text-navy-900">{d.title}</p>
                    <p className="font-mono text-xs text-steel-500">{d.id} · {d.owner}</p>
                  </td>
                  <td className="td"><Badge tone="navy">{d.type}</Badge></td>
                  <td className="td text-steel-600 text-xs font-mono">{d.project} · {d.vessel}</td>
                  <td className="td text-steel-600">{d.version}</td>
                  <td className="td"><Badge tone={statusTone[d.status] ?? "gray"}>{d.status}</Badge></td>
                  <td className="td text-steel-600">{d.updated}</td>
                  <td className="td">
                    <div className="flex gap-1">
                      <button className="rounded-lg p-1.5 text-steel-500 hover:bg-steel-100" title="Detail" onClick={() => setDetail(d)}><Eye className="h-4 w-4" /></button>
                      <button className="rounded-lg p-1.5 text-steel-500 hover:bg-steel-100" title="Ubah" onClick={() => openEdit(d)}><Pencil className="h-4 w-4" /></button>
                      <button className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50" title="Hapus" onClick={() => setDeleting(d)}><Trash2 className="h-4 w-4" /></button>
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
        subtitle="Dokumen tersimpan di sesi browser & terhubung ke proyek/kapal"
        wide
        footer={
          <>
            <button className="btn-secondary" onClick={() => { setShowAdd(false); setEditing(null); }}>Batal</button>
            <button className="btn-primary" onClick={save}>Simpan Dokumen</button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Judul dokumen">
            <input className="input" placeholder="cth: Docking Report RP-2026-005" value={form.title} onChange={(e) => setF("title", e.target.value)} />
          </Field>
          <FormGrid>
            <Field label="Tipe">
              <select className="input" value={form.type} onChange={(e) => setF("type", e.target.value)}>
                {types.slice(1).map((t) => <option key={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Status">
              <select className="input" value={form.status} onChange={(e) => setF("status", e.target.value)}>
                {["Draft", "Menunggu Approval", "Berlaku", "Disetujui", "Terkirim", "Dalam Proses", "Negosiasi", "Kedaluwarsa"].map((s) => <option key={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Proyek terkait">
              <select className="input" value={form.project} onChange={(e) => setF("project", e.target.value)}>
                <option value="">—</option>
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
            <Field label="Versi">
              <input className="input" value={form.version} onChange={(e) => setF("version", e.target.value)} />
            </Field>
            <Field label="Penanggung jawab">
              <input className="input" placeholder="cth: Sari Wulandari" value={form.owner} onChange={(e) => setF("owner", e.target.value)} />
            </Field>
          </FormGrid>
        </div>
      </Modal>

      {/* Modal detail */}
      <Modal open={detail !== null} onClose={() => setDetail(null)} title={detail?.title ?? ""} subtitle={detail ? `${detail.id} · ${detail.type}` : ""}>
        {detail && (
          <dl className="space-y-2.5 text-sm">
            {[
              ["Proyek", detail.project],
              ["Kapal", detail.vessel],
              ["Versi", detail.version],
              ["Diperbarui", detail.updated],
              ["Penanggung jawab", detail.owner],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4"><dt className="text-steel-500">{k}</dt><dd className="font-medium text-navy-900">{v}</dd></div>
            ))}
            <div className="flex justify-between gap-4"><dt className="text-steel-500">Status</dt><dd><Badge tone={statusTone[detail.status] ?? "gray"}>{detail.status}</Badge></dd></div>
          </dl>
        )}
      </Modal>

      <ConfirmModal
        open={deleting !== null}
        title={`Hapus ${deleting?.id}?`}
        desc="Dokumen akan dihapus dari register sesi ini."
        confirmLabel="Ya, hapus"
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={() => { if (deleting) { remove("documents", deleting.id); toast(`${deleting.id} dihapus`, "info"); } setDeleting(null); }}
      />
    </div>
  );
}
