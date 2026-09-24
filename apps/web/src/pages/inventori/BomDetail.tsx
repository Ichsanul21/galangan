import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Barcode, Package } from "lucide-react";
import { Card, CardHeader, PageHeader, Badge, Modal, Field, FormGrid, Tabs, EmptyState, toast, SortTh, toggleSort, sortRows } from "../../components/ui";
import type { SortState } from "../../components/ui";
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

function rackText(it: StoreItem): string {
  const rack = it.rack ?? it.location ?? "";
  if (!rack) return String(it.warehouse ?? "—");
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
  const { id } = useParams();
  const { data, add, update, log } = useStore();
  const item = data.inventory.find((i) => i.id === id) ?? null;
  const [tab, setTab] = useState("Riwayat");
  const [sort, setSort] = useState<SortState>({ key: null, dir: "asc" });
  const [showReserv, setShowReserv] = useState(false);
  const [reservProject, setReservProject] = useState("");
  const [reservQtyInput, setReservQtyInput] = useState("");
  const [showOpname, setShowOpname] = useState(false);
  const [opCount, setOpCount] = useState("");

  if (!item) {
    return (
      <div>
        <Link to="/inventori" className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-ocean-600 hover:underline">
          <ArrowLeft className="h-4 w-4" /> Kembali ke Inventori
        </Link>
        <EmptyState title="Item tidak ditemukan" subtitle={`ID ${id ?? "—"} tidak ada di katalog.`} />
      </div>
    );
  }

  const moves = data.movements.filter((m) => m.itemId === item.id || m.item === item.name);
  const projectIds = Array.from(new Set(moves.map((m) => String(m.by ?? "")).filter((b) => /^(NB|RP|RF|PRJ)-/i.test(b))));
  const usedProjects = data.projects.filter((p) => projectIds.includes(p.id));
  const kelas = abcOf(data.inventory, item.id);
  const tersedia = Number(item.stock || 0) - reservedQty(item);

  const saveReserv = () => {
    if (!reservProject) { toast("Pilih proyek dulu", "info"); return; }
    const qty = Number(reservQtyInput);
    if (!qty || qty <= 0) { toast("Qty reservasi harus lebih dari 0", "info"); return; }
    if (qty > tersedia) { toast(`Melebihi stok tersedia (${fmtJumlah(tersedia)} ${item.unit})`, "info"); return; }
    const cur = (Array.isArray(item.reserved) ? item.reserved : []) as { project: string; qty: number }[];
    const same = cur.find((r) => r.project === reservProject);
    const next = same
      ? cur.map((r) => (r.project === reservProject ? { project: r.project, qty: Number(r.qty) + qty } : r))
      : [...cur, { project: reservProject, qty }];
    update("inventory", item.id, { reserved: next });
    log("reservasi stok", `${item.name} × ${qty} untuk ${reservProject}`, "Inventori");
    toast(`Reservasi ${item.name} × ${qty} untuk ${reservProject}`);
    setShowReserv(false);
    setReservProject("");
    setReservQtyInput("");
  };

  const saveOpname = () => {
    if (opCount === "" || Number.isNaN(Number(opCount)) || Number(opCount) < 0) { toast("Stok hasil hitung tidak valid", "info"); return; }
    const selisih = Number(opCount) - Number(item.stock);
    if (selisih === 0) { toast("Tidak ada selisih — stok sudah sama", "info"); return; }
    update("inventory", item.id, { stock: Number(opCount) });
    add("movements", {
      item: item.name, itemId: item.id, type: "Selisih Opname", qty: selisih,
      by: `Opname ${todayISO()}`, date: todayISO(), tone: selisih > 0 ? "in" : "out",
    }, { action: "stok opname", target: `${item.name}: selisih ${selisih > 0 ? "+" : ""}${selisih}`, module: "Inventori" });
    toast(`Opname tersimpan — selisih ${selisih > 0 ? "+" : ""}${selisih}`);
    setShowOpname(false);
    setOpCount("");
  };

  return (
    <div>
      <Link to="/inventori" className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-ocean-600 hover:underline">
        <ArrowLeft className="h-4 w-4" /> Kembali ke Inventori
      </Link>
      <PageHeader
        title={`BOM — ${item.name}`}
        subtitle={`${item.id} · ${item.sku} · ${item.category}`}
        icon={<Package className="h-5 w-5" />}
        actions={
          <div className="flex items-center gap-2">
            <button className="btn-secondary" onClick={() => setShowReserv(true)}>Reservasi</button>
            <button className="btn-secondary" onClick={() => setShowOpname(true)}>Opname</button>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <CardHeader title="Detail Item" subtitle="Katalog + klasifikasi" />
          <dl className="space-y-2.5 text-sm">
            {([
              ["Kategori", String(item.category)],
              ["Gudang / Rak", rackText(item)],
              ["Stok", `${fmtJumlah(Number(item.stock))} ${item.unit}`],
              ["Tersedia", `${fmtJumlah(tersedia)} ${item.unit}`],
              ["Volume per unit", fmtJumlah(Number(item.volume ?? 0))],
              ["Batch / Serial", item.batch ? String(item.batch) : "—"],
              ["Harga satuan", fmtRupiah(Number(item.cost))],
              ["Nilai total", fmtRupiah(Number(item.stock) * Number(item.cost))],
            ] as [string, string][]).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4"><dt className="text-steel-500">{k}</dt><dd className="font-medium text-navy-900 text-right">{v}</dd></div>
            ))}
          </dl>
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs text-steel-500">Kelas ABC</span>
            <Badge tone={kelas === "A" ? "red" : kelas === "B" ? "amber" : "gray"}>{kelas}</Badge>
          </div>
          <div className="mt-4 rounded-xl border border-steel-200 p-3 text-center">
            <p className="flex items-center justify-center gap-1.5 text-xs font-semibold text-navy-900"><Barcode className="h-4 w-4" /> {item.sku}</p>
            <div className="mt-2 flex h-10 items-stretch justify-center overflow-hidden" aria-hidden="true">
              {barcodeBits(String(item.sku)).map((b, idx) => (
                <div key={idx} style={{ width: b ? 3 : 2, background: b ? "#0b1e33" : "#ffffff" }} />
              ))}
            </div>
          </div>
        </Card>

        <div className="card lg:col-span-2">
          <Tabs tabs={["Riwayat", "Kebutuhan Proyek"]} active={tab} onChange={setTab} />
          <div className="p-4">
            {tab === "Riwayat" && (
              moves.length === 0
                ? <EmptyState title="Belum ada movement" subtitle="GR/GI item ini akan tercatat di sini." />
                : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-surface sticky top-0 z-10">
                        <tr><SortTh label="Transaksi" sortKey="id" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label="Tipe" sortKey="type" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label="Jumlah" sortKey="qty" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label="Referensi" sortKey="by" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label="Tanggal" sortKey="date" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /></tr>
                      </thead>
                      <tbody className="divide-y divide-steel-100">
                        {sortRows(moves, sort, (m: StoreItem, k) => k === "qty" ? Number(m.qty) : String((m as unknown as Record<string, unknown>)[k] ?? "")).map((m) => (
                          <tr key={m.id} className="hover:bg-surface">
                            <td className="td font-mono font-medium text-navy-900">{m.id}</td>
                            <td className="td text-steel-600">{m.type}</td>
                            <td className="td font-semibold">{fmtJumlah(Number(m.qty))}</td>
                            <td className="td font-mono text-xs text-steel-600 truncate" title={String(m.by)}>{m.by}</td>
                            <td className="td text-steel-600">{fmtTanggal(m.date)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
            )}
            {tab === "Kebutuhan Proyek" && (
              usedProjects.length === 0
                ? <EmptyState title="Belum dipakai proyek" subtitle="Proyek yang memakai item ini via movement akan tampil di sini." />
                : (
                  <div className="space-y-2">
                    {usedProjects.map((p) => (
                      <div key={p.id} className="flex items-center justify-between gap-3 rounded-xl border border-steel-200 px-3 py-2 text-sm">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-navy-900" title={`${p.id} — ${p.vessel}`}>{p.id} — {p.vessel}</p>
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

      <Modal open={showReserv} onClose={() => setShowReserv(false)} title={`Reservasi — ${item.name}`}
        subtitle={`Tersedia: ${fmtJumlah(tersedia)} ${item.unit}`}
        footer={<><button className="btn-secondary" onClick={() => setShowReserv(false)}>Batal</button><button className="btn-primary" onClick={saveReserv}>Simpan Reservasi</button></>}>
        <div className="space-y-3">
          <Field label="Proyek">
            <select className="input" value={reservProject} onChange={(e) => setReservProject(e.target.value)}>
              <option value="">Pilih proyek…</option>
              {data.projects.map((p) => <option key={p.id} value={p.id}>{p.id} — {p.vessel}</option>)}
            </select>
          </Field>
          <Field label="Qty reservasi"><input type="number" min={1} className="input" value={reservQtyInput} onChange={(e) => setReservQtyInput(e.target.value)} /></Field>
        </div>
      </Modal>

      <Modal open={showOpname} onClose={() => setShowOpname(false)} title={`Opname — ${item.name}`}
        subtitle={`Tercatat: ${fmtJumlah(Number(item.stock))} ${item.unit}`}
        footer={<><button className="btn-secondary" onClick={() => setShowOpname(false)}>Batal</button><button className="btn-primary" onClick={saveOpname}>Simpan Opname</button></>}>
        <FormGrid>
          <Field label="Stok hasil hitung"><input type="number" min={0} className="input" value={opCount} onChange={(e) => setOpCount(e.target.value)} /></Field>
        </FormGrid>
      </Modal>
    </div>
  );
}
