import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Barcode, Package, Pencil, Trash2 } from "lucide-react";
import { Card, CardHeader, PageHeader, Badge, Modal, Field, FormGrid, Tabs, EmptyState, ConfirmModal, toast, SortTh, toggleSort, sortRows,
  NumInput,
  AsyncButton, SearchBox, rowMatches,
  RowAction,
} from "../../components/ui";
import type { SortState } from "../../components/ui";
import { useT } from "../../i18n/LanguageContext";
import { n_inv } from "../../i18n/n_inv";
import { useStore, type StoreItem } from "../../data/store";
import { fmtJumlah, fmtRupiah, fmtTanggal, todayISO } from "../../utils/format";

function barcodeBits(sku: string): boolean[] {
  const s = sku || "X";
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h * 31 + s.charCodeAt(i)) >>> 0);
  const bits: boolean[] = [];
  for (let i = 0; i < 56; i++) {
    const c = s.charCodeAt(i % s.length);
    bits.push((((c >> (i % 5)) ^ (h >> (i % 7))) & 1) === 1);
  }
  return bits;
}

function reservedQty(it: StoreItem): number {
  const r = Array.isArray(it.reserved) ? (it.reserved as { qty: number }[]) : [];
  return r.reduce((s, x) => s + Number(x.qty || 0), 0);
}

function binOf(it: StoreItem): string {
  return String(it.bin ?? "").trim();
}

function qrPayloadOf(it: StoreItem): string {
  return String(it.sku ?? "").trim();
}

function rackText(it: StoreItem): string {
  const rack = it.rack ?? it.location ?? "";
  if (!rack) return String(it.warehouse ?? "-");
  if (String(rack).includes("·")) return String(rack);
  return `${it.warehouse} · ${rack}`;
}

function abcOf(all: StoreItem[], id: string): "A" | "B" | "C" {
  const rows = all
    .map((i) => ({ id: i.id, v: Number(i.stock || 0) * Number(i.cost || 0) }))
    .sort((a, b) => b.v - a.v);
  const total = rows.reduce((s, r) => s + r.v, 0);
  if (total <= 0) return "C";
  let cum = 0;
  for (const r of rows) {
    cum += r.v;
    if (r.id === id) {
      const p = cum / total;
      return p <= 0.7 ? "A" : p <= 0.9 ? "B" : "C";
    }
  }
  return "C";
}

export default function BomDetail() {

  const { locale } = useT();
  const S = n_inv[locale];
  const { id } = useParams();
  const { data, add, update, remove, log } = useStore();
  const item = data.inventory.find((i) => i.id === id) ?? null;
  const [tab, setTab] = useState("Riwayat");
  const [sort, setSort] = useState<SortState>({ key: null, dir: "asc" });
  const [showReserv, setShowReserv] = useState(false);
  const [reservProject, setReservProject] = useState("");
  const [reservQtyInput, setReservQtyInput] = useState("");
  const [showOpname, setShowOpname] = useState(false);
  const [opCount, setOpCount] = useState("");
  /* Riwayat movement di halaman ini belum punya aksi apa pun, padahal tabel
     yang sama di Inventori sudah bisa diubah/dihapus. Semuanya ikut aturan
     di sana: qty/tipe/item terkunci sehingga stok tidak perlu dihitung ulang,
     dan hapus movement = hapus catatan saja (koreksi stok lewat Opname). */
  const [moveEdit, setMoveEdit] = useState<StoreItem | null>(null);
  const [moveEditForm, setMoveEditForm] = useState({ date: "", by: "", purpose: "", supplier: "", pic: "" });
  const [delMove, setDelMove] = useState<StoreItem | null>(null);

  if (!item) {
    return (
      <div>
        <Link to="/inventori" className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-ocean-600 hover:underline">
          <ArrowLeft className="h-4 w-4" /> {S.backInv}
        </Link>
        <EmptyState title={S.notFoundT} subtitle={S.notFoundS.replace("{n}", id ?? "-")} />
      </div>
    );
  }

  const [moveQ, setMoveQ] = useState("");
  const moves = data.movements.filter((m) => m.itemId === item.id || m.item === item.name);
  const projectIds = Array.from(new Set(moves.map((m) => String(m.by ?? "")).filter((b) => /^(NB|RP|RF|PRJ)-/i.test(b))));
  const usedProjects = data.projects.filter((p) => projectIds.includes(p.id));
  const kelas = abcOf(data.inventory, item.id);
  const tersedia = Number(item.stock || 0) - reservedQty(item);

  const saveReserv = async () => {
    if (!reservProject) { toast(S.projectFirst, "info"); return; }
    const qty = Number(reservQtyInput);
    if (!qty || qty <= 0) { toast(S.reservQtyReq, "info"); return; }
    if (qty > tersedia) { toast(S.overAvail.replace("{a}", fmtJumlah(tersedia)).replace("{b}", item.unit), "info"); return; }
    const cur = (Array.isArray(item.reserved) ? item.reserved : []) as { project: string; qty: number }[];
    const same = cur.find((r) => r.project === reservProject);
    const next = same
      ? cur.map((r) => (r.project === reservProject ? { project: r.project, qty: Number(r.qty) + qty } : r))
      : [...cur, { project: reservProject, qty }];
    try {
      await update("inventory", item.id, { reserved: next });
      log("reservasi stok", `${item.name} × ${qty} untuk ${reservProject}`, "Inventori");
      toast(S.reservSaved.replace("{a}", item.name).replace("{n}", String(qty)).replace("{b}", reservProject));
      setShowReserv(false);
      setReservProject("");
      setReservQtyInput("");
    } catch (e) {
      toast(e instanceof Error ? e.message : S.saveFail, "info");
    }
  };

  const openMoveEdit = (m: StoreItem) => {
    setMoveEdit(m);
    setMoveEditForm({
      date: String(m.date ?? todayISO()),
      by: String(m.by ?? ""),
      purpose: String(m.purpose ?? ""),
      supplier: String(m.supplier ?? ""),
      pic: String(m.pic ?? ""),
    });
  };

  const saveMoveEdit = async () => {
    if (!moveEdit) return;
    if (!moveEditForm.date) { toast(locale === "en" ? "Date is required" : "Tanggal wajib diisi", "info"); return; }
    try {
      /* Sengaja TIDAK menyentuh qty/type/item: movement itu jejak audit dan
         angkanya sudah ikut memotong/menambah stok. Koreksi jumlah dilakukan
         lewat Opname supaya selisihnya tetap terlihat di riwayat. */
      await update("movements", String(moveEdit.id), {
        date: moveEditForm.date,
        by: moveEditForm.by.trim(),
        purpose: moveEditForm.purpose.trim(),
        supplier: moveEditForm.supplier.trim(),
        pic: moveEditForm.pic.trim(),
      });
      log("mengubah movement (tanpa koreksi stok)", `${String(moveEdit.id)} - ${item.name}`, "Inventori");
      toast(locale === "en" ? `Movement ${String(moveEdit.id)} updated` : `Movement ${String(moveEdit.id)} diperbarui`);
      setMoveEdit(null);
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const confirmDelMove = async () => {
    if (!delMove) return;
    const mid = String(delMove.id);
    try {
      await remove("movements", mid);
      log("menghapus movement (tanpa koreksi stok)", `${mid} - ${item.name}`, "Inventori");
      toast(locale === "en"
        ? `Movement ${mid} deleted - STOCK NOT adjusted. Use Opname if a correction is needed.`
        : `Movement ${mid} dihapus - STOK TIDAK diubah. Gunakan Opname bila perlu koreksi.`, "info");
      setDelMove(null);
    } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
  };

  const saveOpname = async () => {
    if (opCount === "" || Number.isNaN(Number(opCount)) || Number(opCount) < 0) { toast(S.opInvalid, "info"); return; }
    const selisih = Number(opCount) - Number(item.stock);
    if (selisih === 0) { toast(S.opNoDiff, "info"); return; }
    try {
      await update("inventory", item.id, { stock: Number(opCount) });
      await add("movements", {
        item: item.name, itemId: item.id, type: "Selisih Opname", qty: selisih,
        by: `Opname ${todayISO()}`, date: todayISO(), tone: selisih > 0 ? "in" : "out",
      }, { action: "stok opname", target: `${item.name}: selisih ${selisih > 0 ? "+" : ""}${selisih}`, module: "Inventori" });
      toast(S.opSavedSimple.replace("{a}", selisih > 0 ? "+" : "").replace("{b}", String(selisih)));
      setShowOpname(false);
      setOpCount("");
    } catch (e) {
      toast(e instanceof Error ? e.message : S.opFailed.replace("{n}", item.name), "info");
    }
  };

  return (
    <div>
      <Link to="/inventori" className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-ocean-600 hover:underline">
        <ArrowLeft className="h-4 w-4" /> {S.backInv}
      </Link>
      <PageHeader
        title={S.bomTitle.replace("{n}", item.name)}
        subtitle={`${item.id} · ${item.sku} · ${item.category}`}
        icon={<Package className="h-5 w-5" />}
        actions={
          <div className="flex items-center gap-2">
            <button className="btn-secondary" onClick={() => setShowReserv(true)}>{S.reservBtn}</button>
            <button className="btn-secondary" onClick={() => setShowOpname(true)}>{S.opnameBtn}</button>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <CardHeader title={S.detT} subtitle={S.detS} />
          <dl className="dl-div text-sm">
            {([
              [S.catLbl, String(item.category)],
              [S.dlWh, rackText(item)],
              [S.binLbl, binOf(item) || "-"],
              [S.dlQr, qrPayloadOf(item)],
              [S.stockLbl, `${fmtJumlah(Number(item.stock))} ${item.unit}`],
              [S.dlAvail, `${fmtJumlah(tersedia)} ${item.unit}`],
              [S.volLbl, fmtJumlah(Number(item.volume ?? 0))],
              [S.batchLbl, item.batch ? String(item.batch) : "-"],
              [S.dlCostSimple, fmtRupiah(Number(item.cost))],
              [S.dlTotal, fmtRupiah(Number(item.stock) * Number(item.cost))],
            ] as [string, string][]).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4"><dt className="text-steel-500">{k}</dt><dd className="font-medium text-navy-900 text-right">{v}</dd></div>
            ))}
          </dl>
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs text-steel-500">{S.abcLbl}</span>
            <Badge tone={kelas === "A" ? "red" : kelas === "B" ? "amber" : "gray"}>{kelas}</Badge>
          </div>
          <div className="mt-4 rounded-xl border border-steel-200 p-3 text-center">
            <p className="flex items-center justify-center gap-1.5 text-xs font-semibold text-navy-900"><Barcode className="h-4 w-4" /> {item.sku}</p>
            <div className="mt-2 flex h-10 items-stretch justify-center overflow-hidden" aria-hidden="true">
              {barcodeBits(String(item.sku)).map((b, idx) => (
                <div key={idx} style={{ width: b ? 3 : 2, background: b ? "#0b1e33" : "#ffffff" }} />
              ))}
            </div>
            <p className="mt-2 font-mono text-[11px] text-steel-500" title={S.qrTitle}>QR: {qrPayloadOf(item)}{binOf(item) ? ` · Bin ${binOf(item)}` : ""}</p>
          </div>
        </Card>

        <div className="card lg:col-span-2">
          <Tabs tabs={["Riwayat", "Kebutuhan Proyek"]} active={tab} onChange={setTab} labels={{ Riwayat: S.tabHistory, "Kebutuhan Proyek": S.tabNeeds }} />
          <div className="p-4">
{tab === "Riwayat" && (
              moves.length === 0
                ? <EmptyState title={S.emptyMovesT} subtitle={S.emptyMovesS} />
                : (
                  <>
                    {/* Search (A2): riwayat mutasi sebuah barang bisa berisi
                        ratusan baris, dan mencarinya berarti menggulir. */}
                    <div className="mb-2 flex justify-end">
                      <SearchBox value={moveQ} onChange={setMoveQ} className="w-full max-w-xs" placeholder={locale === "en" ? "Search movements..." : "Cari mutasi..."} ariaLabel={locale === "en" ? "Search movements" : "Cari mutasi"} />
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-surface sticky top-0 z-10">
                          <tr><SortTh label={S.thTx} sortKey="id" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.thType} sortKey="type" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.jumlahLbl} sortKey="qty" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.thRef} sortKey="by" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.dateLbl} sortKey="date" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><th className="th">{locale === "en" ? "Actions" : "Aksi"}</th></tr>
                        </thead>
                        <tbody className="divide-y divide-steel-100">
                          {sortRows(moves.filter((m) => rowMatches(m as unknown as Record<string, unknown>, moveQ, ["id", "type", "qty", "by", "date"])), sort, (m: StoreItem, k) => k === "qty" ? Number(m.qty) : String((m as unknown as Record<string, unknown>)[k] ?? "")).map((m) => (
                            <tr key={m.id} className="hover:bg-surface">
                              <td className="td font-mono font-medium text-navy-900">{m.id}</td>
                              <td className="td text-steel-600">{m.type}</td>
                              <td className="td font-semibold">{fmtJumlah(Number(m.qty))}</td>
                              <td className="td font-mono text-xs text-steel-600 truncate" title={String(m.by)}>{String(m.by ?? "-")}</td>
                              <td className="td text-steel-600">{fmtTanggal(m.date)}</td>
                              <td className="td">
                                <div className="flex flex-wrap gap-1.5">
                                  <RowAction icon={Pencil} tone="neutral" label={`${locale === "en" ? "Edit" : "Ubah"} ${String(m.id)}`} onClick={() => openMoveEdit(m)} />
                                  <RowAction icon={Trash2} tone="danger" label={`${locale === "en" ? "Delete" : "Hapus"} ${String(m.id)}`} onClick={() => setDelMove(m)} />
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )
            )}
            {tab === "Kebutuhan Proyek" && (
              usedProjects.length === 0
                ? <EmptyState title={S.emptyProjT} subtitle={S.emptyProjS} />
                : (
                  <div className="space-y-2">
                    {usedProjects.map((p) => (
                      <div key={p.id} className="flex items-center justify-between gap-3 rounded-xl border border-steel-200 px-3 py-2 text-sm">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-navy-900" title={`${p.id} - ${p.vessel}`}>{p.id} - {p.vessel}</p>
                          <p className="text-xs text-steel-400">{moves.filter((m) => String(m.by ?? "").includes(p.id)).length} movement item ini</p>
                        </div>
                        <Badge tone="navy">{p.status}</Badge>
                      </div>
                    ))}
                  </div>
                )
            )}
          </div>
        </div>
      </div>

      <Modal open={showReserv} onClose={() => setShowReserv(false)} title={S.reservTitle.replace("{n}", item.name)}
        subtitle={S.tersediaSub.replace("{a}", fmtJumlah(tersedia)).replace("{b}", item.unit)}
        footer={<><button className="btn-secondary" onClick={() => setShowReserv(false)}>{S.cancelBtn}</button><AsyncButton className="btn-primary" onAction={saveReserv}>{S.btnSaveReserv}</AsyncButton></>}>
        <div className="space-y-3">
          <Field label={S.proyekLbl}>
            <select className="input" value={reservProject} onChange={(e) => setReservProject(e.target.value)}>
              <option value="">{S.pickProject}</option>
              {data.projects.map((p) => <option key={p.id} value={p.id}>{p.id} - {p.vessel}</option>)}
            </select>
          </Field>
          <Field label={S.reservQtyLbl}><NumInput min={1} className="input" value={reservQtyInput} onChange={(e) => setReservQtyInput(e.target.value)} /></Field>
        </div>
      </Modal>

      <Modal open={showOpname} onClose={() => setShowOpname(false)} title={S.opnameTitle.replace("{n}", item.name)}
        subtitle={S.recordedSub.replace("{a}", fmtJumlah(Number(item.stock))).replace("{b}", item.unit)}
        footer={<><button className="btn-secondary" onClick={() => setShowOpname(false)}>{S.cancelBtn}</button><AsyncButton className="btn-primary" onAction={saveOpname}>{S.btnSaveOp}</AsyncButton></>}>
        <FormGrid>
          <Field label={S.countedLbl}><NumInput min={0} className="input" value={opCount} onChange={(e) => setOpCount(e.target.value)} /></Field>
        </FormGrid>
      </Modal>

      <Modal open={moveEdit !== null} onClose={() => setMoveEdit(null)}
        title={moveEdit ? (locale === "en" ? `Edit movement ${String(moveEdit.id)}` : `Ubah movement ${String(moveEdit.id)}`) : ""}
        subtitle={locale === "en" ? "Info only - quantity is locked and stock is NOT recalculated" : "Info saja - jumlah terkunci dan stok TIDAK dihitung ulang"}
        footer={<><button className="btn-secondary" onClick={() => setMoveEdit(null)}>{S.cancelBtn}</button><AsyncButton className="btn-primary" onAction={saveMoveEdit}>{S.saveBtn}</AsyncButton></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label={S.dateLbl}><input type="date" className="input" value={moveEditForm.date} onChange={(e) => setMoveEditForm({ ...moveEditForm, date: e.target.value })} /></Field>
            <Field label={S.thRef}><input className="input font-mono" value={moveEditForm.by} onChange={(e) => setMoveEditForm({ ...moveEditForm, by: e.target.value })} /></Field>
          </FormGrid>
          <Field label={S.purposeLbl ?? (locale === "en" ? "Purpose" : "Keperluan")}><input className="input" value={moveEditForm.purpose} onChange={(e) => setMoveEditForm({ ...moveEditForm, purpose: e.target.value })} /></Field>
          <FormGrid>
            <Field label={locale === "en" ? "Supplier" : "Pemasok"}><input className="input" value={moveEditForm.supplier} onChange={(e) => setMoveEditForm({ ...moveEditForm, supplier: e.target.value })} /></Field>
            <Field label={locale === "en" ? "PIC" : "PIC"}><input className="input" value={moveEditForm.pic} onChange={(e) => setMoveEditForm({ ...moveEditForm, pic: e.target.value })} /></Field>
          </FormGrid>
          {moveEdit && (
            <p className="text-xs text-steel-500">
              {locale === "en"
                ? `${String(moveEdit.type)} - ${fmtJumlah(Number(moveEdit.qty ?? 0))} ${item.unit} stays as recorded.`
                : `${String(moveEdit.type)} - ${fmtJumlah(Number(moveEdit.qty ?? 0))} ${item.unit} tetap seperti tercatat.`}
            </p>
          )}
        </div>
      </Modal>

      <ConfirmModal
        open={delMove !== null}
        title={delMove ? (locale === "en" ? `Delete movement ${String(delMove.id)}?` : `Hapus movement ${String(delMove.id)}?`) : ""}
        desc={delMove ? (locale === "en"
          ? `Record ${String(delMove.type)} ${fmtJumlah(Number(delMove.qty ?? 0))} ${item.unit} (${String(delMove.by)}) will be deleted. STOCK IS NOT ADJUSTED - use Opname if the count needs correcting.`
          : `Catatan ${String(delMove.type)} ${fmtJumlah(Number(delMove.qty ?? 0))} ${item.unit} (${String(delMove.by)}) akan dihapus. STOK TIDAK dikoreksi - gunakan Opname bila hitungan perlu disesuaikan.`) : ""}
        confirmLabel={locale === "en" ? "Delete without stock correction" : "Hapus tanpa koreksi stok"}
        danger
        onCancel={() => setDelMove(null)}
        onConfirm={confirmDelMove}
      />
    </div>
  );
}
