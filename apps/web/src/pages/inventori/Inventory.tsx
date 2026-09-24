import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Plus,
  Search,
  Package,
  ArrowDownToLine,
  ArrowUpFromLine,
  AlertTriangle,
  Warehouse,
  Eye,
  Pencil,
  ClipboardCheck,
  Repeat,
  Barcode,
  BookmarkPlus,
  ListChecks,
  Printer,
  Upload,
  Download,
  Camera,
  History,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, CardHeader, PageHeader, Badge, KpiCard, Tabs, ChartTooltip, Modal, Field, FormGrid, toast, EmptyState, ProgressBar, SortTh, toggleSort, sortRows } from "../../components/ui";
import type { SortState } from "../../components/ui";
import { useStore, type StoreItem } from "../../data/store";
import { fmtJumlah, fmtRupiah, fmtMiliar, fmtTanggal, todayISO } from "../../utils/format";
import { exportExcel } from "../../utils/export";
import { sbTonasePlat, sbSjNumber, maxSeq, parseSjSeq, SB_KOP } from "../../utils/sb";
import { stockTrend, itemTrend, lowStockTrend, stockValueTrend, warehouseTrend } from "../../data";

const emptyForm = { name: "", category: "Baja", sku: "", warehouse: "Gudang Baja A", rack: "", stock: "0", minStock: "0", unit: "pcs", cost: "0", volume: "0", batch: "", uom2: "", konversi: "", minWh: "", photoUrl: "" };

/* Kebutuhan BOM TB Samudra Jaya 07 — dicocokkan ke data inventori aktual. */
const BOM_NEEDS = [
  { key: "Pelat Baja", need: 82000, unit: "kg" },
  { key: "Mesin Bantu", need: 2, unit: "unit" },
  { key: "Cat Epoxy", need: 1200, unit: "liter" },
  { key: "Pipa Schedule", need: 240, unit: "batang" },
  { key: "Kabel", need: 3500, unit: "meter" },
  { key: "Anoda", need: 86, unit: "pcs" },
];

function moveLabel(type: string): string {
  if (type === "Penerimaan") return "GR";
  if (type === "Pengeluaran") return "GI";
  if (type === "Selisih Opname") return "Opname";
  if (type === "Transfer") return "Transfer";
  if (type === "Retur") return "Retur";
  return type;
}

function moveTone(type: string, tone: string): "green" | "amber" | "blue" | "navy" | "red" | "gray" {
  if (type === "Penerimaan") return "green";
  if (type === "Pengeluaran") return "amber";
  if (type === "Selisih Opname") return "blue";
  if (type === "Transfer") return "navy";
  if (type === "Retur") return "red";
  return tone === "in" ? "green" : "gray";
}

interface Reservation { project: string; qty: number }
interface BatchRow { batch: string; qty: number; date: string }

/* Pola batang barcode CSS Dorn: bit 1 = batang hitam, bit 0 = spasi. */
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

function reservedOf(it: StoreItem): Reservation[] {
  return Array.isArray(it.reserved) ? (it.reserved as Reservation[]) : [];
}

function reservedQty(it: StoreItem): number {
  return reservedOf(it).reduce((s, r) => s + Number(r.qty || 0), 0);
}

function availOf(it: StoreItem): number {
  return Number(it.stock || 0) - reservedQty(it);
}

function batchesOf(it: StoreItem): BatchRow[] {
  return Array.isArray(it.batches) ? (it.batches as BatchRow[]) : [];
}

/* Konversi multi-UOM: konversi = isi UOM2 per 1 satuan utama (cth: 1 batang = 6 meter → konversi 6). */
function convOf(it: StoreItem): number {
  const c = Number(it.konversi);
  return c > 0 ? c : 0;
}

function uom2Of(it: StoreItem): string {
  return String(it.uom2 ?? "").trim();
}

function hasUom2(it: StoreItem): boolean {
  return uom2Of(it) !== "" && convOf(it) > 0;
}

function qtyInUom2(it: StoreItem): number {
  return Number(it.stock || 0) * convOf(it);
}

/* Biaya rata-rata: avgCost bila ada, fallback ke cost master. */
function effCost(it: StoreItem): number {
  const a = Number(it.avgCost);
  return a > 0 ? a : Number(it.cost || 0);
}

/* Minimum per gudang: minStockByWarehouse[gudang], fallback ke minStock global. */
function minWhOf(it: StoreItem, wh?: string): number {
  const w = wh ?? String(it.warehouse);
  const m = it.minStockByWarehouse as Record<string, number> | undefined;
  const v = m && typeof m === "object" ? Number(m[w]) : NaN;
  return Number.isFinite(v) ? v : Number(it.minStock || 0);
}

function rackText(it: StoreItem): string {
  const rack = it.rack ?? it.location ?? "";
  if (!rack) return it.warehouse;
  if (String(rack).includes("·")) return String(rack);
  return `${it.warehouse} · ${rack}`;
}

function abcMap(items: StoreItem[]): Record<string, "A" | "B" | "C"> {
  const rows = items
    .map((i) => ({ id: i.id, v: Number(i.stock || 0) * effCost(i) }))
    .sort((a, b) => b.v - a.v);
  const total = rows.reduce((s, r) => s + r.v, 0);
  const map: Record<string, "A" | "B" | "C"> = {};
  if (total <= 0) {
    rows.forEach((r) => { map[r.id] = "C"; });
    return map;
  }
  let cum = 0;
  rows.forEach((r) => {
    cum += r.v;
    const p = cum / total;
    map[r.id] = p <= 0.7 ? "A" : p <= 0.9 ? "B" : "C";
  });
  return map;
}

function daysSince(dateISO: string): number {
  const t = Date.parse(dateISO ?? "");
  if (Number.isNaN(t)) return 9999;
  const now = Date.parse(todayISO());
  return Math.floor((now - t) / 86400000);
}

function agingBucket(days: number): string {
  if (days <= 30) return "0–30 hari";
  if (days <= 90) return "31–90 hari";
  if (days <= 180) return "91–180 hari";
  return ">180 hari";
}

const AGING_BUCKETS = ["0–30 hari", "31–90 hari", "91–180 hari", ">180 hari", "Belum ada GR"];

export default function Inventory() {
  const { data, add, update, log } = useStore();
  const inventory = data.inventory;
  const movements = data.movements;
  const projects = data.projects;
  const requisitions = data.requisitions;
  const [tab, setTab] = useState("Katalog");
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("Semua");
  const [wh, setWh] = useState("Semua");
  const [abcF, setAbcF] = useState("Semua");
  const [sort, setSort] = useState<SortState>({ key: null, dir: "asc" });
  const [sort2, setSort2] = useState<SortState>({ key: null, dir: "asc" });
  const [sort3, setSort3] = useState<SortState>({ key: null, dir: "asc" });

  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<StoreItem | null>(null);
  const [detail, setDetail] = useState<StoreItem | null>(null);
  const [labelItem, setLabelItem] = useState<StoreItem | null>(null);
  const [moveTarget, setMoveTarget] = useState<StoreItem | null>(null);
  const [moveKind, setMoveKind] = useState<"in" | "out">("in");
  const [moveQty, setMoveQty] = useState("");
  const [moveRef, setMoveRef] = useState("");
  const [moveBatch, setMoveBatch] = useState("");
  const [moveUom, setMoveUom] = useState("base");
  const [movePrice, setMovePrice] = useState("");
  // Kolom RawData REPORT WAREHOUSE: supplier, pajak, purpose (U/TK kapal), PIC.
  const [moveSupplier, setMoveSupplier] = useState("");
  const [moveTax, setMoveTax] = useState("");
  const [movePurpose, setMovePurpose] = useState("");
  const [movePic, setMovePic] = useState("");
  const [importReport, setImportReport] = useState<string[]>([]);
  const [importMode, setImportMode] = useState<"Katalog" | "IN" | "OUT">("Katalog");

  const [showOpname, setShowOpname] = useState(false);
  const [opItem, setOpItem] = useState("");
  const [opCount, setOpCount] = useState("");
  const [showTransfer, setShowTransfer] = useState(false);
  const [trItem, setTrItem] = useState("");
  const [trQty, setTrQty] = useState("");
  const [trDest, setTrDest] = useState("");

  const [reservTarget, setReservTarget] = useState<StoreItem | null>(null);
  const [reservProject, setReservProject] = useState("");
  const [reservQtyInput, setReservQtyInput] = useState("");
  // Kalkulator tonase plat (RawData PERHITUNGAN + TABLE TONASE): P×L×T×7850.
  const [tonP, setTonP] = useState("6010");
  const [tonL, setTonL] = useState("1810");
  const [tonT, setTonT] = useState("12");
  const [tonPcs, setTonPcs] = useState("1");
  // Surat Jalan (form RawData SURAT JALAN 2024).
  const [sjTo, setSjTo] = useState("");
  const [sjVehicle, setSjVehicle] = useState("");
  const [sjPlate, setSjPlate] = useState("");
  const [sjDriver, setSjDriver] = useState("");
  const [sjDate, setSjDate] = useState(todayISO());
  const [sjItems, setSjItems] = useState<{ name: string; qty: string }[]>([{ name: "", qty: "" }]);
  const [sjReceiver, setSjReceiver] = useState("");
  const [sjGiver, setSjGiver] = useState("");
  /* SJ max+1: scan dash ids + sbRef via trailing digits (RawData SJ-SMD-YYYY-nnn). */
  const nextSjSeq = (): number => {
    const docs = (data.documents ?? []).filter((d) => d.type === "Surat Jalan");
    const nums = docs.flatMap((d) => [parseSjSeq(d.sbRef), parseSjSeq(d.id)]);
    return maxSeq(nums.map(String), /(\d+)$/) + 1;
  };
  const sjYearOf = (iso: string): number => Number(String(iso ?? "").slice(0, 4)) || new Date().getFullYear();
  const [showPick, setShowPick] = useState(false);
  const [pickProject, setPickProject] = useState("");
  const [pickSel, setPickSel] = useState<string[]>([]);

  const abc = abcMap(inventory);

  const list = inventory.filter((i) => {
    const matchQ = `${i.name} ${i.sku}`.toLowerCase().includes(q.toLowerCase());
    const matchCat = cat === "Semua" || i.category === cat;
    const matchWh = wh === "Semua" || i.warehouse === wh;
    const matchAbc = abcF === "Semua" || abc[i.id] === abcF;
    return matchQ && matchCat && matchWh && matchAbc;
  });

  const lowStock = inventory.filter((i) => i.stock <= i.minStock);
  const categories = ["Semua", ...Array.from(new Set(inventory.map((i) => i.category)))];
  const totalValue = inventory.reduce((s, i) => s + Number(i.stock || 0) * effCost(i), 0);
  const warehouses = Array.from(new Set(inventory.map((i) => i.warehouse)));

  const bomRows = BOM_NEEDS.map((b) => {
    const item = inventory.find((i) => i.name.toLowerCase().includes(b.key.toLowerCase()));
    const stock = item ? Number(item.stock) : 0;
    return { ...b, item, stock, ok: stock >= b.need };
  });

  const lastOutOf = (it: StoreItem): string | null => {
    const outs = movements
      .filter((m) => (m.itemId === it.id || m.item === it.name) && m.type === "Pengeluaran")
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return outs.length > 0 ? String(outs[0].date) : null;
  };

  const lastInOf = (it: StoreItem): string | null => {
    const ins = movements
      .filter((m) => (m.itemId === it.id || m.item === it.name) && (m.type === "Penerimaan" || m.tone === "in"))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return ins.length > 0 ? String(ins[0].date) : null;
  };

  const auditOf = (it: StoreItem) =>
    movements
      .filter((m) => m.itemId === it.id || m.item === it.name)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .slice(0, 5);

  const slowItems = inventory.filter((i) => {
    const d = lastOutOf(i);
    if (!d) return false;
    const days = daysSince(d);
    return days > 60 && days <= 180;
  });
  const deadItems = inventory.filter((i) => {
    const d = lastOutOf(i);
    if (!d) return true;
    return daysSince(d) > 180;
  });

  const agingRows = inventory.map((i) => {
    const lastIn = lastInOf(i);
    const age = lastIn ? daysSince(lastIn) : 9999;
    return { item: i, lastIn, age, bucket: lastIn ? agingBucket(age) : "Belum ada GR" };
  });

  const activeProjects = projects.filter((p) => String(p.status) !== "Selesai");
  const forecastRows = activeProjects.flatMap((p) =>
    BOM_NEEDS.map((b) => {
      const item = inventory.find((i) => i.name.toLowerCase().includes(b.key.toLowerCase()));
      const stock = item ? Number(item.stock) : 0;
      const net = Math.max(0, b.need - stock);
      return { project: p.id, vessel: String(p.vessel ?? ""), ...b, item, stock, net };
    })
  );

  const opTarget = inventory.find((i) => i.id === opItem) ?? null;
  const opSelisih = opTarget && opCount !== "" ? Number(opCount) - Number(opTarget.stock) : null;
  const trTarget = inventory.find((i) => i.id === trItem) ?? null;
  const moveBatches = moveTarget ? [...batchesOf(moveTarget)].sort((a, b) => String(a.date).localeCompare(String(b.date))) : [];
  const moveFresh = moveTarget ? (inventory.find((i) => i.id === moveTarget.id) ?? moveTarget) : null;
  const moveUseUom2 = moveFresh !== null && hasUom2(moveFresh) && moveUom === "uom2";
  const moveRawQty = Number(moveQty) || 0;
  const moveEffQty = moveUseUom2 && moveFresh ? moveRawQty / convOf(moveFresh) : moveRawQty;
  const freshDetail = detail ? (inventory.find((i) => i.id === detail.id) ?? detail) : null;

  const pickItems = pickProject
    ? inventory.filter((i) => reservedOf(i).some((r) => r.project === pickProject))
    : [];

  const setF = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const openMove = (it: StoreItem, kind: "in" | "out") => {
    setMoveTarget(it);
    setMoveKind(kind);
    setMoveQty("");
    setMoveRef("");
    setMoveBatch("");
    setMoveUom("base");
    setMovePrice("");
    setMoveSupplier("");
    setMoveTax("");
    setMovePurpose("");
    setMovePic("");
  };

  const closeMove = () => {
    setMoveTarget(null);
    setMoveQty("");
    setMoveRef("");
    setMoveBatch("");
    setMoveUom("base");
    setMovePrice("");
    setMoveSupplier("");
    setMoveTax("");
    setMovePurpose("");
    setMovePic("");
  };

  const openEdit = (i: StoreItem) => {
    setEditing(i);
    setForm({
      name: i.name, category: i.category, sku: i.sku, warehouse: i.warehouse,
      rack: String(i.rack ?? i.location ?? ""), stock: String(i.stock), minStock: String(i.minStock),
      unit: i.unit, cost: String(i.cost), volume: String(i.volume ?? 0), batch: String(i.batch ?? ""),
      uom2: uom2Of(i), konversi: convOf(i) > 0 ? String(i.konversi) : "",
      minWh: String(minWhOf(i)), photoUrl: String(i.photoUrl ?? ""),
    });
  };

  const save = () => {
    if (!form.name.trim() || !form.sku.trim()) { toast("Nama & SKU wajib diisi", "info"); return; }
    const dupe = inventory.some((i) => i.sku.toLowerCase() === form.sku.trim().toLowerCase() && i.id !== editing?.id);
    if (dupe) { toast("SKU sudah dipakai item lain", "info"); return; }
    if (!editing && form.category === "Mesin" && !form.batch.trim()) { toast("Kategori Mesin wajib isi serial/batch", "info"); return; }
    const volume = Number(form.volume);
    if (form.volume.trim() !== "" && (Number.isNaN(volume) || volume < 0)) { toast("Volume harus angka 0 atau lebih", "info"); return; }
    const uom2 = form.uom2.trim();
    const konv = form.konversi.trim() === "" ? 0 : Number(form.konversi);
    if (Number.isNaN(konv) || konv < 0) { toast("Konversi harus angka 0 atau lebih", "info"); return; }
    if (uom2 && konv <= 0) { toast("Satuan kedua butuh konversi lebih dari 0", "info"); return; }
    if (!uom2 && konv > 0) { toast("Konversi butuh nama satuan kedua", "info"); return; }
    const numStock = form.stock.trim() === "" ? 0 : Number(form.stock);
    const numMin = form.minStock.trim() === "" ? 0 : Number(form.minStock);
    const numCost = form.cost.trim() === "" ? 0 : Number(form.cost);
    if (!Number.isFinite(numStock) || numStock < 0) { toast("Stok awal harus angka 0 atau lebih", "info"); return; }
    if (!Number.isFinite(numMin) || numMin < 0) { toast("Stok minimum harus angka 0 atau lebih", "info"); return; }
    if (!Number.isFinite(numCost) || numCost < 0) { toast("Harga satuan harus angka 0 atau lebih", "info"); return; }
    if (form.minWh.trim() !== "" && (!Number.isFinite(Number(form.minWh)) || Number(form.minWh) < 0)) { toast("Min. stok gudang harus angka 0 atau lebih", "info"); return; }
    const rack = form.rack.trim();
    const prevMap = (editing?.minStockByWarehouse as Record<string, number> | undefined) ?? {};
    const minWhMap = { ...prevMap };
    if (form.minWh.trim() !== "") minWhMap[form.warehouse] = Number(form.minWh) || 0;
    if (minWhMap[form.warehouse] !== undefined && minWhMap[form.warehouse] < 0) { toast("Min. stok gudang harus angka 0 atau lebih", "info"); return; }
    if (editing) {
      /* Stok read-only di form edit — hanya field non-stok yang disimpan. */
      update("inventory", editing.id, {
        name: form.name.trim(), category: form.category, sku: form.sku.trim(), warehouse: form.warehouse,
        rack, location: rack, minStock: numMin, unit: form.unit,
        cost: numCost, volume: volume || 0, batch: form.batch.trim(),
        uom2, konversi: konv, minStockByWarehouse: minWhMap, photoUrl: form.photoUrl.trim(),
      });
      toast(`${editing.id} diperbarui`);
      setEditing(null);
    } else {
      const stock = numStock;
      const batch = form.batch.trim();
      const created = add("inventory", {
        name: form.name.trim(), category: form.category, sku: form.sku.trim(), warehouse: form.warehouse,
        rack, stock, minStock: numMin, unit: form.unit,
        cost: numCost, location: rack, volume: volume || 0, batch,
        uom2, konversi: konv, minStockByWarehouse: minWhMap, photoUrl: form.photoUrl.trim(), avgCost: 0,
        batches: batch ? [{ batch, qty: stock, date: todayISO() }] : [],
        reserved: [],
      }, { action: "mendaftarkan material", module: "Inventori" });
      toast(`Material ${created.id} ditambahkan`);
      setShowAdd(false);
    }
    setForm(emptyForm);
  };

  const consumeReserved = (it: StoreItem, qty: number): Reservation[] => {
    let sisa = qty;
    const next: Reservation[] = [];
    for (const r of reservedOf(it)) {
      if (sisa <= 0) { next.push(r); continue; }
      const pakai = Math.min(Number(r.qty || 0), sisa);
      sisa -= pakai;
      const rest = Number(r.qty || 0) - pakai;
      if (rest > 0) next.push({ project: r.project, qty: rest });
    }
    return next;
  };

  const saveMove = () => {
    if (!moveTarget) return;
    const fresh = inventory.find((i) => i.id === moveTarget.id) ?? moveTarget;
    const raw = Number(moveQty);
    if (!raw || raw <= 0) { toast("Jumlah harus lebih dari 0", "info"); return; }
    const useUom2 = hasUom2(fresh) && moveUom === "uom2";
    const qty = useUom2 ? raw / convOf(fresh) : raw;
    if (!Number.isFinite(qty) || qty <= 0) { toast("Konversi menghasilkan qty tidak valid", "info"); return; }
    if (moveKind === "out" && qty > Number(fresh.stock)) { toast(`Stok tidak cukup (tersedia ${fmtJumlah(Number(fresh.stock))})`, "info"); return; }
    if (moveKind === "out" && !movePurpose.trim()) { toast("Keperluan (U/TK kapal) wajib diisi untuk pengeluaran", "info"); return; }
    if (moveKind === "out" && !movePic.trim()) { toast("PIC wajib diisi untuk pengeluaran", "info"); return; }
    const next = moveKind === "in" ? Number(fresh.stock) + qty : Number(fresh.stock) - qty;
    const patch: Record<string, unknown> = { stock: next };
    if (moveKind === "out") {
      patch.reserved = consumeReserved(fresh, qty);
      /* FIFO: kurangi batch tertua dulu. */
      let sisa = qty;
      const nextBatches: { batch: string; qty: number; date: string }[] = [];
      for (const b of batchesOf(fresh)) {
        if (sisa <= 0) { nextBatches.push(b); continue; }
        const pakai = Math.min(Number(b.qty || 0), sisa);
        sisa -= pakai;
        const rest = Number(b.qty || 0) - pakai;
        if (rest > 0) nextBatches.push({ ...b, qty: rest });
      }
      patch.batches = nextBatches;
    }
    if (moveKind === "in") {
      const b = moveBatch.trim();
      patch.batches = b
        ? [...batchesOf(fresh), { batch: b, qty, date: todayISO() }]
        : batchesOf(fresh);
      if (b && !fresh.batch) patch.batch = b;
      /* Average cost: (nilai lama + qty × harga) / stok baru, hanya saat GR ber-harga. */
      const price = Number(movePrice);
      if (movePrice.trim() !== "" && (!price || price <= 0)) { toast("Harga GR harus lebih dari 0 bila diisi", "info"); return; }
      if (price > 0) {
        const oldStock = Number(fresh.stock);
        const oldVal = oldStock * effCost(fresh);
        patch.avgCost = Math.round(((oldVal + qty * price) / (oldStock + qty)) * 100) / 100;
      }
    }
    const refBase = moveRef.trim() || (moveKind === "in" ? "GR manual" : "GI manual");
    const refNote = useUom2 ? `${refBase} · ${fmtJumlah(raw)} ${uom2Of(fresh)}` : refBase;
    const priceExcl = Number(movePrice) || 0;
    const taxAmt = Number(moveTax) || 0;
    update("inventory", fresh.id, patch);
    if (moveKind === "out" && next < Number(fresh.minStock || 0)) {
      toast(`Peringatan: stok ${fresh.name} di bawah minimum (${fmtJumlah(Number(fresh.minStock || 0))} ${fresh.unit}) — segera buat PR`, "info");
    }
    add("movements", {
      item: fresh.name, itemId: fresh.id,
      type: moveKind === "in" ? "Penerimaan" : "Pengeluaran",
      qty,
      by: refNote,
      batch: moveBatch.trim() || fresh.batch || "",
      date: todayISO(),
      tone: moveKind,
      supplier: moveSupplier.trim(),
      priceExcl,
      tax: taxAmt,
      total: priceExcl > 0 ? Math.round(qty * priceExcl) + taxAmt : 0,
      purpose: movePurpose.trim(),
      pic: movePic.trim(),
    }, { action: moveKind === "in" ? "menerima barang" : "mengeluarkan barang", target: `${fresh.name} × ${qty}`, module: "Inventori" });
    toast(`${moveKind === "in" ? "GR" : "GI"} ${fresh.name} × ${fmtJumlah(qty)} tersimpan`);
    closeMove();
  };

  /* BOM explode → PR Draft, cegah duplikat PR terbuka untuk item sama. */
  const buatPRDraft = (itemName: string, qtyKurang: number, estAmount: number) => {
    const open = requisitions.some(
      (r) => String(r.item).toLowerCase() === itemName.toLowerCase()
        && ["Draft", "Draf", "Menunggu Approval", "RFQ", "Diajukan"].includes(String(r.status))
    );
    if (open) { toast(`PR terbuka untuk ${itemName} sudah ada`, "info"); return; }
    const created = add("requisitions", {
      item: itemName, by: "System BOM", amount: Math.max(0, Math.round(estAmount)), status: "Draft",
    }, { action: "membuat PR Draft (BOM)", target: `${itemName} × ${fmtJumlah(qtyKurang)}`, module: "Inventori" });
    toast(`PR Draft ${created.id} dibuat (${itemName} × ${fmtJumlah(qtyKurang)})`);
  };

  const downloadTemplate = () => {
    void exportExcel(
      [
        ["nama", "sku", "kategori", "gudang", "stok", "minStok", "satuan", "harga", "rak"],
        ["Pelat Baja AH36 15mm", "AH36-15", "Baja", "Gudang Baja A", 100, 20, "kg", 150000, "A1-02"],
      ],
      "Template-Inventori",
      "Template"
    );
    toast("Template Excel diunduh");
  };

  const downloadCSV = (filename: string, headers: string[], example: (string | number)[]) => {
    const esc = (v: string | number): string => {
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
    };
    const csv = [headers.map(esc).join(","), example.map(esc).join(",")].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast(`Template ${filename} diunduh`);
  };

  const downloadTemplateIN = () => {
    downloadCSV("Template-IN", ["Tanggal", "Kode", "Qty", "Supplier", "Harga-nonPPN", "Pajak", "Total", "Purpose", "PIC"],
      ["2026-08-02", "AH36-12", 100, "PT Bahana Baja", 14500, 0, 1450000, "TB BANGUNAN BARU", "Budi"]);
  };

  const downloadTemplateOUT = () => {
    downloadCSV("Template-OUT", ["Tanggal", "Purpose", "Kode", "Qty", "PIC", "Keterangan"],
      ["2026-08-03", "U/TB. TRIALFA 01", "AH36-12", 50, "Agus", "Pemakaian fabrikasi"]);
  };

  const normHeader = (h: string): string =>
    h.trim().toLowerCase().replaceAll("-", "").replaceAll("_", "").replaceAll(" ", "");

  const colIndex = (headers: string[], names: string[]): number => {
    const normed = headers.map(normHeader);
    for (const n of names) {
      const i = normed.indexOf(normHeader(n));
      if (i >= 0) return i;
    }
    return -1;
  };

  const splitCsvLine = (line: string): string[] =>
    line.split(",").map((s) => s.trim().replace(/^"|"$/g, "").trim());

  const findItemByKode = (kode: string): StoreItem | undefined => {
    const k = kode.trim().toLowerCase();
    return inventory.find((i) => String(i.sku).toLowerCase() === k || String(i.id).toLowerCase() === k);
  };

  const validDateOrToday = (v: string): string | null => {
    const t = v.trim();
    if (!t) return todayISO();
    return /^\d{4}-\d{2}-\d{2}$/.test(t) && !Number.isNaN(Date.parse(t)) ? t : null;
  };

  const handleImportINFile = (file: File) => {
    void file.text().then((text) => {
      const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== "");
      if (lines.length === 0) { setImportReport(["Berkas kosong."]); return; }
      const firstCells = splitCsvLine(lines[0]);
      const hasHeader = firstCells.some((c) => normHeader(c) === "kode" || normHeader(c) === "sku");
      const headers = hasHeader ? firstCells : [];
      const start = hasHeader ? 1 : 0;
      const idxTanggal = hasHeader ? colIndex(headers, ["tanggal", "date"]) : 0;
      const idxKode = hasHeader ? colIndex(headers, ["kode", "sku", "code"]) : 1;
      const idxQty = hasHeader ? colIndex(headers, ["qty", "jumlah", "quantity"]) : 2;
      const idxSupplier = hasHeader ? colIndex(headers, ["supplier", "vendor", "namasupplier"]) : 3;
      const idxHarga = hasHeader ? colIndex(headers, ["harganett", "harganppn", "harga", "price", "priceexcl"]) : 4;
      const idxPajak = hasHeader ? colIndex(headers, ["pajak", "tax", "ppn"]) : 5;
      const idxTotal = hasHeader ? colIndex(headers, ["total"]) : 6;
      const idxPurpose = hasHeader ? colIndex(headers, ["purpose", "untuk", "untukkapal", "keperluan", "u"]) : 7;
      const idxPic = hasHeader ? colIndex(headers, ["pic"]) : 8;
      if (idxKode < 0 || idxQty < 0) { setImportReport(["Header tidak valid — butuh kolom Kode & Qty. Unduh template IN."]); return; }
      const stockMap: Record<string, number> = Object.fromEntries(inventory.map((i) => [i.id, Number(i.stock || 0)]));
      const avgMap: Record<string, number> = Object.fromEntries(inventory.map((i) => [i.id, Number(i.avgCost) || 0]));
      const fails: string[] = [];
      let ok = 0;
      lines.slice(start).forEach((line, idx) => {
        const rowNo = idx + start + 1;
        const c = splitCsvLine(line);
        const kode = (c[idxKode] ?? "").trim();
        const item = kode ? findItemByKode(kode) : undefined;
        if (!item) { fails.push(`Baris ${rowNo}: kode ${kode || "(kosong)"} tidak dikenal.`); return; }
        const qty = Number(c[idxQty] ?? "");
        if (!Number.isFinite(qty) || qty <= 0) { fails.push(`Baris ${rowNo}: qty harus lebih dari 0.`); return; }
        const price = idxHarga >= 0 && (c[idxHarga] ?? "") !== "" ? Number(c[idxHarga]) : 0;
        if (!Number.isFinite(price) || price < 0) { fails.push(`Baris ${rowNo}: harga harus angka 0 atau lebih.`); return; }
        const tax = idxPajak >= 0 && (c[idxPajak] ?? "") !== "" ? Number(c[idxPajak]) : 0;
        if (!Number.isFinite(tax) || tax < 0) { fails.push(`Baris ${rowNo}: pajak harus angka 0 atau lebih.`); return; }
        const date = validDateOrToday(idxTanggal >= 0 ? (c[idxTanggal] ?? "") : "");
        if (!date) { fails.push(`Baris ${rowNo}: tanggal harus format YYYY-MM-DD.`); return; }
        const supplier = idxSupplier >= 0 ? (c[idxSupplier] ?? "").trim() : "";
        const rawTotal = idxTotal >= 0 ? (c[idxTotal] ?? "").trim() : "";
        const total = rawTotal !== "" ? Number(rawTotal) : Math.round(qty * price) + tax;
        if (!Number.isFinite(total) || total < 0) { fails.push(`Baris ${rowNo}: total tidak valid.`); return; }
        const purpose = idxPurpose >= 0 ? (c[idxPurpose] ?? "").trim() : "";
        const pic = idxPic >= 0 ? (c[idxPic] ?? "").trim() : "";
        const oldStock = stockMap[item.id] ?? Number(item.stock || 0);
        const newStock = oldStock + qty;
        stockMap[item.id] = newStock;
        const patch: Record<string, unknown> = { stock: newStock };
        if (price > 0) {
          const oldAvg = avgMap[item.id] > 0 ? avgMap[item.id] : Number(item.cost || 0);
          const newAvg = Math.round(((oldStock * oldAvg + qty * price) / newStock) * 100) / 100;
          avgMap[item.id] = newAvg;
          patch.avgCost = newAvg;
        }
        update("inventory", item.id, patch);
        add("movements", {
          item: item.name, itemId: item.id, type: "Penerimaan", qty,
          by: supplier ? `Impor IN ${date} · ${supplier}` : `Impor IN ${date}`,
          batch: String(item.batch ?? ""), date, tone: "in",
          supplier, priceExcl: price, tax, total, purpose, pic,
        }, { action: "mengimpor GR", target: `${item.name} × ${qty}`, module: "Inventori" });
        ok++;
      });
      setImportReport([`${ok} baris IN berhasil diimpor.`, ...fails]);
      toast(`Impor IN selesai: ${ok} berhasil, ${fails.length} gagal`);
    });
  };

  const handleImportOUTFile = (file: File) => {
    void file.text().then((text) => {
      const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== "");
      if (lines.length === 0) { setImportReport(["Berkas kosong."]); return; }
      const firstCells = splitCsvLine(lines[0]);
      const hasHeader = firstCells.some((c) => normHeader(c) === "kode" || normHeader(c) === "sku");
      const headers = hasHeader ? firstCells : [];
      const start = hasHeader ? 1 : 0;
      const idxTanggal = hasHeader ? colIndex(headers, ["tanggal", "date"]) : 0;
      const idxPurpose = hasHeader ? colIndex(headers, ["purpose", "untuk", "untukkapal", "keperluan", "u"]) : 1;
      const idxKode = hasHeader ? colIndex(headers, ["kode", "sku", "code"]) : 2;
      const idxQty = hasHeader ? colIndex(headers, ["qty", "jumlah", "quantity"]) : 3;
      const idxPic = hasHeader ? colIndex(headers, ["pic"]) : 4;
      const idxKet = hasHeader ? colIndex(headers, ["keterangan", "note", "referensi", "ref", "by"]) : 5;
      if (idxKode < 0 || idxQty < 0) { setImportReport(["Header tidak valid — butuh kolom Kode & Qty. Unduh template OUT."]); return; }
      const stockMap: Record<string, number> = Object.fromEntries(inventory.map((i) => [i.id, Number(i.stock || 0)]));
      const batchMap: Record<string, BatchRow[]> = Object.fromEntries(
        inventory.map((i) => [i.id, [...batchesOf(i)].sort((a, b) => String(a.date).localeCompare(String(b.date)))])
      );
      const reservedMap: Record<string, Reservation[]> = Object.fromEntries(
        inventory.map((i) => [i.id, [...reservedOf(i)]])
      );
      const fails: string[] = [];
      let ok = 0;
      lines.slice(start).forEach((line, idx) => {
        const rowNo = idx + start + 1;
        const c = splitCsvLine(line);
        const kode = (c[idxKode] ?? "").trim();
        const item = kode ? findItemByKode(kode) : undefined;
        if (!item) { fails.push(`Baris ${rowNo}: kode ${kode || "(kosong)"} tidak dikenal.`); return; }
        const qty = Number(c[idxQty] ?? "");
        if (!Number.isFinite(qty) || qty <= 0) { fails.push(`Baris ${rowNo}: qty harus lebih dari 0.`); return; }
        const purpose = idxPurpose >= 0 ? (c[idxPurpose] ?? "").trim() : "";
        const pic = idxPic >= 0 ? (c[idxPic] ?? "").trim() : "";
        if (!purpose) { fails.push(`Baris ${rowNo}: purpose wajib diisi untuk OUT.`); return; }
        if (!pic) { fails.push(`Baris ${rowNo}: PIC wajib diisi untuk OUT.`); return; }
        const avail = stockMap[item.id] ?? Number(item.stock || 0);
        if (qty > avail) { fails.push(`Baris ${rowNo}: stok ${kode} tidak cukup (tersedia ${avail}).`); return; }
        const date = validDateOrToday(idxTanggal >= 0 ? (c[idxTanggal] ?? "") : "");
        if (!date) { fails.push(`Baris ${rowNo}: tanggal harus format YYYY-MM-DD.`); return; }
        const ket = idxKet >= 0 ? (c[idxKet] ?? "").trim() : "";
        const newStock = avail - qty;
        stockMap[item.id] = newStock;
        let sisa = qty;
        const nextBatches: BatchRow[] = [];
        for (const b of (batchMap[item.id] ?? [])) {
          if (sisa <= 0) { nextBatches.push(b); continue; }
          const pakai = Math.min(Number(b.qty || 0), sisa);
          sisa -= pakai;
          const rest = Number(b.qty || 0) - pakai;
          if (rest > 0) nextBatches.push({ ...b, qty: rest });
        }
        batchMap[item.id] = nextBatches;
        let sisaRes = qty;
        const nextRes: Reservation[] = [];
        for (const r of (reservedMap[item.id] ?? [])) {
          if (sisaRes <= 0) { nextRes.push(r); continue; }
          const pakai = Math.min(Number(r.qty || 0), sisaRes);
          sisaRes -= pakai;
          const rest = Number(r.qty || 0) - pakai;
          if (rest > 0) nextRes.push({ project: r.project, qty: rest });
        }
        reservedMap[item.id] = nextRes;
        update("inventory", item.id, { stock: newStock, batches: nextBatches, reserved: nextRes });
        if (newStock < Number(item.minStock || 0)) {
          toast(`Peringatan: stok ${item.name} di bawah minimum — segera buat PR`, "info");
        }
        add("movements", {
          item: item.name, itemId: item.id, type: "Pengeluaran", qty,
          by: ket || `${purpose} (Impor OUT)`, batch: String(item.batch ?? ""),
          date, tone: "out", supplier: "", priceExcl: 0, tax: 0, total: 0, purpose, pic,
        }, { action: "mengimpor GI", target: `${item.name} × ${qty}`, module: "Inventori" });
        ok++;
      });
      setImportReport([`${ok} baris OUT berhasil diimpor.`, ...fails]);
      toast(`Impor OUT selesai: ${ok} berhasil, ${fails.length} gagal`);
    });
  };

  /* Impor CSV manual: parse koma, validasi SKU unik, laporan gagal per baris. */
  const handleImportFile = (file: File) => {
    void file.text().then((text) => {
      const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== "");
      if (lines.length === 0) { setImportReport(["Berkas kosong."]); return; }
      const start = /^nama\s*,/i.test(lines[0]) ? 1 : 0;
      const skuSeen = new Set(inventory.map((i) => String(i.sku).toLowerCase()));
      const fails: string[] = [];
      let ok = 0;
      lines.slice(start).forEach((line, idx) => {
        const c = line.split(",").map((s) => s.trim());
        const rowNo = idx + start + 1;
        const nama = c[0] ?? "";
        const sku = c[1] ?? "";
        if (!nama || !sku) { fails.push(`Baris ${rowNo}: nama & SKU wajib.`); return; }
        if (skuSeen.has(sku.toLowerCase())) { fails.push(`Baris ${rowNo}: SKU ${sku} duplikat.`); return; }
        if ((c[4] ?? "") !== "" && (Number.isNaN(Number(c[4])) || Number(c[4]) < 0)) { fails.push(`Baris ${rowNo}: stok harus angka 0 atau lebih.`); return; }
        if ((c[5] ?? "") !== "" && (Number.isNaN(Number(c[5])) || Number(c[5]) < 0)) { fails.push(`Baris ${rowNo}: minStok harus angka 0 atau lebih.`); return; }
        if ((c[7] ?? "") !== "" && (Number.isNaN(Number(c[7])) || Number(c[7]) < 0)) { fails.push(`Baris ${rowNo}: harga harus angka 0 atau lebih.`); return; }
        if (!c[3]) { fails.push(`Baris ${rowNo}: gudang wajib diisi.`); return; }
        skuSeen.add(sku.toLowerCase());
        add("inventory", {
          name: nama, sku, category: c[2] || "Lainnya", warehouse: c[3],
          stock: Number(c[4]) || 0, minStock: Number(c[5]) || 0, unit: c[6] || "pcs",
          cost: Number(c[7]) || 0, rack: c[8] || "", location: c[8] || "",
          volume: 0, batch: "", batches: [], reserved: [],
          uom2: "", konversi: 0, minStockByWarehouse: {}, photoUrl: "", avgCost: 0,
        }, { action: "mengimpor material", module: "Inventori" });
        ok++;
      });
      setImportReport([`${ok} baris berhasil diimpor.`, ...fails]);
      toast(`Impor selesai: ${ok} berhasil, ${fails.length} gagal`);
    });
  };

  const saveOpname = () => {
    if (!opTarget) { toast("Pilih item dulu", "info"); return; }
    if (opCount === "" || Number.isNaN(Number(opCount)) || Number(opCount) < 0) { toast("Stok hasil hitung tidak valid", "info"); return; }
    const selisih = Number(opCount) - Number(opTarget.stock);
    if (selisih === 0) { toast("Tidak ada selisih — stok sudah sama", "info"); return; }
    const base = Math.max(5, Math.abs(Number(opTarget.stock)) * 0.2);
    if (Math.abs(selisih) > base) {
      const ok = window.confirm(`Selisih besar (${selisih > 0 ? "+" : ""}${selisih} dari stok ${Number(opTarget.stock)}). Pastikan sudah Berita Acara. Lanjut simpan opname?`);
      if (!ok) return;
    }
    update("inventory", opTarget.id, { stock: Number(opCount) });
    add("movements", {
      item: opTarget.name, itemId: opTarget.id, type: "Selisih Opname", qty: selisih,
      by: `Opname ${todayISO()}`, date: todayISO(), tone: selisih > 0 ? "in" : "out",
    }, { action: "stok opname", target: `${opTarget.name}: selisih ${selisih > 0 ? "+" : ""}${selisih}`, module: "Inventori" });
    log("stok opname", `${opTarget.name}: tercatat ${Number(opCount)}, selisih ${selisih > 0 ? "+" : ""}${selisih}`, "Inventori");
    toast(`Opname ${opTarget.name} — selisih ${selisih > 0 ? "+" : ""}${selisih} tersimpan`);
    setShowOpname(false);
    setOpItem("");
    setOpCount("");
  };

  const saveTransfer = () => {
    if (!trTarget) { toast("Pilih item dulu", "info"); return; }
    const qty = Number(trQty);
    if (!qty || qty <= 0) { toast("Qty harus lebih dari 0", "info"); return; }
    if (qty > Number(trTarget.stock)) { toast(`Stok tidak cukup (tersedia ${fmtJumlah(Number(trTarget.stock))})`, "info"); return; }
    if (!trDest) { toast("Gudang tujuan wajib dipilih", "info"); return; }
    if (trDest === trTarget.warehouse) { toast("Gudang tujuan sama dengan gudang asal", "info"); return; }
    const from = trTarget.warehouse;
    const srcStock = Number(trTarget.stock);
    if (qty < srcStock) {
      /* Split: kurangi sumber, buat baris gudang tujuan dengan SKU sama + sufiks gudang. */
      update("inventory", trTarget.id, { stock: srcStock - qty });
      add("inventory", {
        name: trTarget.name, sku: `${trTarget.sku}@${trDest}`, category: trTarget.category, warehouse: trDest,
        rack: "", stock: qty, minStock: 0, unit: trTarget.unit,
        cost: trTarget.cost, location: "", volume: Number(trTarget.volume) || 0, batch: String(trTarget.batch ?? ""),
        uom2: String((trTarget as unknown as Record<string, unknown>).uom2 ?? ""), konversi: Number((trTarget as unknown as Record<string, unknown>).konversi) || 0,
        minStockByWarehouse: {}, photoUrl: String(trTarget.photoUrl ?? ""), avgCost: Number((trTarget as unknown as Record<string, unknown>).avgCost) || 0,
        batches: [], reserved: [],
      }, { action: "transfer gudang (split)", target: `${trTarget.name} × ${qty}: ${from} → ${trDest}`, module: "Inventori" });
    } else {
      update("inventory", trTarget.id, { warehouse: trDest });
    }
    add("movements", {
      item: trTarget.name, itemId: trTarget.id, type: "Transfer", qty,
      by: `${from} → ${trDest}`, date: todayISO(), tone: "in",
    }, { action: "transfer gudang", target: `${trTarget.name} × ${qty}: ${from} → ${trDest}`, module: "Inventori" });
    log("transfer gudang", `${trTarget.name} × ${qty}: ${from} → ${trDest}`, "Inventori");
    toast(`Transfer ${trTarget.name} × ${qty} ke ${trDest}`);
    setShowTransfer(false);
    setTrItem("");
    setTrQty("");
    setTrDest("");
  };

  const saveReservasi = () => {
    if (!reservTarget) return;
    const fresh = inventory.find((i) => i.id === reservTarget.id) ?? reservTarget;
    if (!reservProject) { toast("Pilih proyek dulu", "info"); return; }
    const qty = Number(reservQtyInput);
    if (!qty || qty <= 0) { toast("Qty reservasi harus lebih dari 0", "info"); return; }
    if (qty > availOf(fresh)) { toast(`Melebihi stok tersedia (${fmtJumlah(availOf(fresh))} ${fresh.unit})`, "info"); return; }
    const cur = reservedOf(fresh);
    const same = cur.find((r) => r.project === reservProject);
    const next = same
      ? cur.map((r) => (r.project === reservProject ? { project: r.project, qty: Number(r.qty) + qty } : r))
      : [...cur, { project: reservProject, qty }];
    update("inventory", fresh.id, { reserved: next });
    log("reservasi stok", `${fresh.name} × ${qty} untuk ${reservProject}`, "Inventori");
    toast(`Reservasi ${fresh.name} × ${qty} untuk ${reservProject}`);
    setReservTarget(null);
    setReservProject("");
    setReservQtyInput("");
  };

  const openPick = () => {
    const first = projects[0]?.id ?? "";
    setPickProject(first);
    setPickSel(first ? inventory.filter((i) => reservedOf(i).some((r) => r.project === first)).map((i) => i.id) : []);
    setShowPick(true);
  };

  const savePick = () => {
    if (!pickProject) { toast("Pilih proyek dulu", "info"); return; }
    if (pickSel.length === 0) { toast("Centang minimal 1 item pick list", "info"); return; }
    let ok = 0;
    for (const id of pickSel) {
      const it = inventory.find((i) => i.id === id);
      if (!it) continue;
      const res = reservedOf(it).find((r) => r.project === pickProject);
      if (!res || Number(res.qty) <= 0) continue;
      const qty = Number(res.qty);
      if (qty > Number(it.stock)) continue;
      update("inventory", it.id, {
        stock: Number(it.stock) - qty,
        reserved: reservedOf(it).filter((r) => r.project !== pickProject),
      });
      add("movements", {
        item: it.name, itemId: it.id, type: "Pengeluaran", qty,
        by: `${pickProject} (Pick List)`, date: todayISO(), tone: "out",
      }, { action: "pick list", target: `${it.name} × ${qty} (${pickProject})`, module: "Inventori" });
      ok++;
    }
    if (ok === 0) { toast("Tidak ada item yang bisa diambil", "info"); return; }
    toast(`Pick list ${pickProject}: ${ok} item dikeluarkan (GI)`);
    setShowPick(false);
    setPickSel([]);
  };

  return (
    <div>
      <PageHeader
        title="Inventori & Material"
        subtitle="Katalog, stok, BOM, dan pergerakan material"
        icon={<Warehouse className="h-5 w-5" />}
        actions={
          <div className="flex items-center gap-2">
            <button className="btn-secondary" onClick={openPick}><ListChecks className="h-4 w-4" /> Pick List</button>
            <button className="btn-primary-gradient" onClick={() => { setForm(emptyForm); setShowAdd(true); }}><Plus className="h-4 w-4" /> Material Baru</button>
          </div>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total Item Aktif" value={String(inventory.length)} icon={<Package className="h-5 w-5" />} chip="navy" spark={itemTrend} hint="Katalog keseluruhan" />
        <KpiCard label="Item Stok Menipis" value={String(lowStock.length)} delta="Perlu reorder" deltaDirection="down" icon={<AlertTriangle className="h-5 w-5" />} chip="rose" spark={lowStockTrend} />
        <KpiCard label="Nilai Stok" value={fmtMiliar(totalValue)} hint="Basis average cost total" icon={<Package className="h-5 w-5" />} chip="teal" spark={stockValueTrend} />
        <KpiCard label="Gudang" value={`${warehouses.length} lokasi`} hint={warehouses.slice(0, 3).join(", ")} chip="violet" spark={warehouseTrend} />
      </div>

      <div className="card">
        <Tabs tabs={["Katalog", "Stok per Gudang", "BOM", "Pergerakan", "Tonase & Surat Jalan", "Analisis"]} active={tab} onChange={setTab} />
        <div className="p-4">
          {tab === "Katalog" && (
            <>
              <p className="mb-3 rounded-lg bg-steel-50 px-3 py-2 text-xs text-steel-500">Metode persediaan: FIFO untuk batch/serial — batch tertua dipakai dulu saat GI. Tersedia = stok − reservasi. Nilai stok memakai harga rata-rata (average cost) bila ada.</p>
              <div className="mb-3 flex flex-wrap gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-steel-400" />
                  <input className="input pl-9 w-full sm:w-64" placeholder="Cari material / SKU..." value={q} onChange={(e) => setQ(e.target.value)} />
                </div>
                <select className="input w-auto" value={wh} onChange={(e) => setWh(e.target.value)} aria-label="Filter gudang">
                  {["Semua", ...warehouses].map((w) => <option key={w} value={w}>{w === "Semua" ? "Semua gudang" : w}</option>)}
                </select>
                <select className="input w-auto" value={abcF} onChange={(e) => setAbcF(e.target.value)} aria-label="Filter ABC">
                  {["Semua", "A", "B", "C"].map((a) => <option key={a} value={a}>{a === "Semua" ? "ABC semua" : `Kelas ${a}`}</option>)}
                </select>
                <div className="flex gap-1 overflow-x-auto">
                  {categories.map((c) => (
                    <button key={c} onClick={() => setCat(c)}
                      className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap ${cat === c ? "bg-navy-700 text-white" : "border border-steel-200 text-steel-600 hover:bg-steel-100"}`}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <select className="input w-auto py-1.5 text-xs" value={importMode} onChange={(e) => { setImportMode(e.target.value as "Katalog" | "IN" | "OUT"); setImportReport([]); }} aria-label="Mode impor">
                  <option value="Katalog">Impor: Katalog</option>
                  <option value="IN">Impor: IN (GR)</option>
                  <option value="OUT">Impor: OUT (GI)</option>
                </select>
                {importMode === "Katalog" && (
                  <button className="btn-secondary text-xs" onClick={downloadTemplate}><Download className="h-3.5 w-3.5" /> Template Excel</button>
                )}
                {importMode === "IN" && (
                  <button className="btn-secondary text-xs" onClick={downloadTemplateIN}><Download className="h-3.5 w-3.5" /> Template IN (CSV)</button>
                )}
                {importMode === "OUT" && (
                  <button className="btn-secondary text-xs" onClick={downloadTemplateOUT}><Download className="h-3.5 w-3.5" /> Template OUT (CSV)</button>
                )}
                <label className="btn-secondary cursor-pointer text-xs">
                  <Upload className="h-3.5 w-3.5" /> Impor CSV
                  <input type="file" accept=".csv" className="hidden" aria-label={importMode === "Katalog" ? "Impor CSV master item" : importMode === "IN" ? "Impor CSV penerimaan gudang" : "Impor CSV pengeluaran gudang"}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) { if (importMode === "IN") handleImportINFile(f); else if (importMode === "OUT") handleImportOUTFile(f); else handleImportFile(f); } e.target.value = ""; }} />
                </label>
                <span className="text-xs text-steel-400">
                  {importMode === "Katalog" && "Kolom: nama, sku, kategori, gudang, stok, minStok, satuan, harga, rak"}
                  {importMode === "IN" && "Kolom IN: Tanggal, Kode, Qty, Supplier, Harga-nonPPN, Pajak, Total, Purpose, PIC — kode harus terdaftar, qty>0"}
                  {importMode === "OUT" && "Kolom OUT: Tanggal, Purpose, Kode, Qty, PIC, Keterangan — kode harus terdaftar, qty>0, stok cukup, purpose+PIC wajib"}
                </span>
              </div>
              {importReport.length > 0 && (
                <div className="mb-3 rounded-lg bg-steel-50 px-3 py-2 text-xs text-steel-600">
                  {importReport.map((r, idx) => <p key={idx} className={idx === 0 ? "font-semibold text-navy-900" : ""}>{r}</p>)}
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-surface sticky top-0 z-10">
                    <tr><SortTh label="Material" sortKey="material" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label="Kategori" sortKey="kategori" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label="Quantity" sortKey="qty" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label="Volume" sortKey="volume" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label="Total Nilai" sortKey="total" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label="ABC" sortKey="abc" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label="Status" sortKey="status" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label="Rak" sortKey="rak" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><th className="th">Aksi</th></tr>
                  </thead>
                  <tbody className="divide-y divide-steel-100">
                    {sortRows(list, sort, (i, k) => {
                      if (k === "qty") return Number(i.stock || 0);
                      if (k === "volume") return Number(i.volume ?? 0);
                      if (k === "total") return Number(i.stock || 0) * effCost(i);
                      if (k === "kategori") return String(i.category ?? "");
                      if (k === "abc") return String(abc[i.id] ?? "");
                      if (k === "status") return Number(i.stock) <= Number(i.minStock) ? "Menipis" : "Aman";
                      if (k === "rak") return String(rackText(i));
                      return String(i.name ?? "");
                    }).map((i) => {
                      const low = i.stock <= i.minStock;
                      const reserved = reservedQty(i);
                      const conv = convOf(i);
                      const u2 = uom2Of(i);
                      return (
                        <tr key={i.id} className="hover:bg-surface">
                          <td className="td">
                            <p className="font-medium text-navy-900 truncate" title={String(i.name)}>{i.name}</p>
                            <p className="text-xs text-steel-500 font-mono">{i.sku}</p>
                            {reserved > 0 && <p className="text-xs text-amber-600">Reservasi {fmtJumlah(reserved)} {i.unit}</p>}
                          </td>
                          <td className="td"><Badge tone="gray">{i.category}</Badge></td>
                          <td className="td font-semibold text-navy-900">
                            {fmtJumlah(Number(i.stock))} <span className="font-normal text-steel-400">{i.unit}</span>
                            {hasUom2(i) && <p className="text-xs font-normal text-steel-400">≈ {fmtJumlah(qtyInUom2(i))} {u2} (1 {i.unit} = {fmtJumlah(conv)} {u2})</p>}
                          </td>
                          <td className="td text-steel-600">{fmtJumlah(Number(i.volume ?? 0))}</td>
                          <td className="td font-semibold text-navy-900">{fmtRupiah(Number(i.stock) * effCost(i))}</td>
                          <td className="td"><Badge tone={abc[i.id] === "A" ? "red" : abc[i.id] === "B" ? "amber" : "gray"}>{abc[i.id]}</Badge></td>
                          <td className="td">
                            <Badge tone={low ? "red" : "green"}>{low ? "Menipis" : "Aman"}</Badge>
                          </td>
                          <td className="td text-steel-600 font-mono text-xs truncate" title={rackText(i)}>{rackText(i)}</td>
                          <td className="td">
                            <div className="flex gap-1">
                              <button className="rounded-lg p-1.5 text-steel-500 hover:bg-steel-100" title="Detail" aria-label={`Detail ${i.name}`} onClick={() => setDetail(i)}><Eye className="h-4 w-4" /></button>
                              <button className="rounded-lg p-1.5 text-steel-500 hover:bg-steel-100" title="Ubah" aria-label={`Ubah ${i.name}`} onClick={() => openEdit(i)}><Pencil className="h-4 w-4" /></button>
                              <button className="rounded-lg p-1.5 text-emerald-600 hover:bg-emerald-50" title="GR/GI" aria-label={`GR atau GI ${i.name}`} onClick={() => openMove(i, moveKind)}><ArrowDownToLine className="h-4 w-4" /></button>
                              <button className="rounded-lg p-1.5 text-steel-500 hover:bg-steel-100" title="Label barcode" aria-label={`Label ${i.name}`} onClick={() => setLabelItem(i)}><Barcode className="h-4 w-4" /></button>
                              <button className="rounded-lg p-1.5 text-amber-600 hover:bg-amber-50" title="Reservasi" aria-label={`Reservasi ${i.name}`} onClick={() => { setReservTarget(i); setReservProject(""); setReservQtyInput(""); }}><BookmarkPlus className="h-4 w-4" /></button>
                              <Link to={`/inventori/bom/${i.id}`} className="rounded-lg p-1.5 text-ocean-600 hover:bg-steel-100" title="BOM" aria-label={`BOM ${i.name}`}>BOM</Link>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {list.length === 0 && <EmptyState title="Tidak ada material yang cocok" subtitle="Ubah kata kunci atau filter gudang / ABC." />}
              </div>
            </>
          )}

          {tab === "Stok per Gudang" && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {warehouses.map((w) => {
                const items = inventory.filter((i) => i.warehouse === w);
                return (
                  <Card key={w} className="p-4">
                    <h3 className="mb-2 text-sm font-semibold text-navy-900 truncate" title={w}>{w}</h3>
                    <p className="text-xs text-steel-500">{items.length} item · {fmtJumlah(items.reduce((s, i) => s + Number(i.stock || 0), 0))} unit</p>
                    <div className="mt-3 space-y-1.5">
                      {items.map((i) => {
                        const whMin = minWhOf(i, w);
                        const thin = Number(i.stock) <= whMin;
                        return (
                          <div key={i.id} className="flex items-center justify-between gap-2 text-sm">
                            <span className="text-steel-600 truncate" title={`${String(i.name)} · min gudang ${fmtJumlah(whMin)}`}>{i.name}</span>
                            <span className="flex shrink-0 items-center gap-1.5 font-medium">
                              {thin && <Badge tone="red">Menipis</Badge>}
                              {fmtJumlah(Number(i.stock))}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}

          {tab === "BOM" && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <Card className="p-5 lg:col-span-2">
                <CardHeader title="Bill of Materials — TB Samudra Jaya 07" subtitle="Kebutuhan vs stok aktual inventori" />
                <div className="mt-3 space-y-2">
                  {bomRows.map((b) => {
                    const kurang = Math.max(0, b.need - b.stock);
                    return (
                      <div key={b.key} className="flex items-center justify-between gap-3 border-b border-steel-100 py-2 text-sm">
                        <div className="min-w-0">
                          <p className="text-steel-700 truncate" title={b.item ? `${b.key} → ${b.item.name}` : b.key}>{b.key}</p>
                          <p className="text-xs text-steel-400 truncate" title={b.item ? String(b.item.name) : "Belum ada item cocok"}>
                            {b.item ? b.item.name : "Belum ada item cocok"}
                          </p>
                          {b.item && <Link to={`/inventori/bom/${b.item.id}`} className="text-xs font-semibold text-ocean-600 hover:underline">Buka BOM</Link>}
                          {!b.ok && b.item && (
                            <button className="btn-secondary mt-1.5 text-xs" onClick={() => buatPRDraft(b.item!.name, kurang, kurang * Number(b.item!.cost || 0))}>
                              Buat PR Draft (kurang {fmtJumlah(kurang)} {b.unit})
                            </button>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-medium text-navy-900">Butuh {fmtJumlah(b.need)} {b.unit} · Stok {fmtJumlah(b.stock)}</p>
                          <p className="mt-0.5 flex items-center justify-end gap-2 text-xs text-steel-500">
                            {b.item ? fmtRupiah(b.need * Number(b.item.cost || 0)) : "—"}
                            <Badge tone={b.ok ? "green" : "red"}>{b.ok ? "Cukup" : "Kurang"}</Badge>
                          </p>
                          {b.item && b.need > 0 && (
                            <ProgressBar className="mt-1.5 w-40" value={(b.stock / b.need) * 100} tone={b.ok ? "green" : "amber"} />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
              <Card className="p-5">
                <CardHeader title="Aksi Material" subtitle="Goods Receipt / Issue" />
                <div className="mt-4 space-y-3">
                  <button className="btn-primary w-full justify-center" onClick={() => { const first = lowStock[0] ?? inventory[0]; if (first) openMove(first, "in"); }}><ArrowDownToLine className="h-4 w-4" /> Terima Barang (GR)</button>
                  <button className="btn-secondary w-full justify-center" onClick={() => { const first = inventory[0]; if (first) openMove(first, "out"); }}><ArrowUpFromLine className="h-4 w-4" /> Keluar Barang (GI)</button>
                  <button className="btn-secondary w-full justify-center" onClick={() => setShowTransfer(true)}><Repeat className="h-4 w-4" /> Transfer Antar Gudang</button>
                  <button className="btn-secondary w-full justify-center" onClick={() => setShowOpname(true)}><ClipboardCheck className="h-4 w-4" /> Stok Opname</button>
                </div>
              </Card>
              <Card className="p-5 lg:col-span-3">
                <CardHeader title="Forecast Kebutuhan Proyek Aktif" subtitle="Kebutuhan bersih = kebutuhan BOM − stok · tombol PR gabung dengan explode BOM" />
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-surface sticky top-0 z-10">
                      <tr><SortTh label="Proyek" sortKey="proyek" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} /><SortTh label="Kebutuhan BOM" sortKey="kebutuhan" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} /><SortTh label="Stok" sortKey="stok" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} /><SortTh label="Bersih" sortKey="bersih" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} /><th className="th">Aksi</th></tr>
                    </thead>
                    <tbody className="divide-y divide-steel-100">
                      {sortRows(forecastRows, sort2, (f, k) => {
                        if (k === "kebutuhan") return Number(f.need || 0);
                        if (k === "stok") return Number(f.stock || 0);
                        if (k === "bersih") return Number(f.net || 0);
                        if (k === "proyek") return String(`${f.project ?? ""} ${f.vessel ?? ""}`);
                        return String(f.key ?? "");
                      }).map((f) => (
                        <tr key={`${f.project}-${f.key}`} className="hover:bg-surface">
                          <td className="td font-medium text-navy-900 truncate" title={`${f.project} — ${f.vessel}`}>{f.project} · {f.vessel}</td>
                          <td className="td text-steel-600 truncate" title={f.item ? String(f.item.name) : f.key}>{f.key} · butuh {fmtJumlah(f.need)} {f.unit}</td>
                          <td className="td text-steel-600">{fmtJumlah(f.stock)}</td>
                          <td className="td font-semibold text-navy-900">{fmtJumlah(f.net)} {f.unit}</td>
                          <td className="td">
                            {f.net > 0 && f.item
                              ? <button className="btn-secondary text-xs" onClick={() => buatPRDraft(f.item!.name, f.net, f.net * Number(f.item!.cost || 0))}>Buat PR</button>
                              : <span className="text-xs text-steel-400">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {forecastRows.length === 0 && <EmptyState title="Tidak ada proyek aktif" subtitle="Semua proyek berstatus Selesai." />}
                </div>
              </Card>
            </div>
          )}

          {tab === "Pergerakan" && (
            <div className="space-y-4">
              <Card>
                <CardHeader title="Tren Nilai Stok" subtitle="Total nilai persediaan (milyar Rupiah)" />
                <div className="h-44 p-4 pt-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={stockTrend} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
                      <defs><linearGradient id="invGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#0b3a63" stopOpacity={0.3} /><stop offset="95%" stopColor="#0b3a63" stopOpacity={0} /></linearGradient></defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e9eff4" vertical={false} />
                      <XAxis dataKey="month" stroke="#8aa2b6" axisLine={false} tickLine={false} />
                      <YAxis stroke="#8aa2b6" axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTooltip formatter={(v) => `Rp ${v} M`} />} />
                      <Area type="monotone" dataKey="nilai" stroke="#0b3a63" strokeWidth={2.5} fill="url(#invGrad)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </Card>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-surface sticky top-0 z-10">
                    <tr><SortTh label="Transaksi" sortKey="transaksi" sort={sort3} onSort={(k) => setSort3((s) => toggleSort(s, k))} /><SortTh label="Item" sortKey="item" sort={sort3} onSort={(k) => setSort3((s) => toggleSort(s, k))} /><SortTh label="Tipe" sortKey="tipe" sort={sort3} onSort={(k) => setSort3((s) => toggleSort(s, k))} /><SortTh label="Jumlah" sortKey="jumlah" sort={sort3} onSort={(k) => setSort3((s) => toggleSort(s, k))} /><SortTh label="Referensi" sortKey="referensi" sort={sort3} onSort={(k) => setSort3((s) => toggleSort(s, k))} /><SortTh label="Supplier / Purpose / PIC" sortKey="info" sort={sort3} onSort={(k) => setSort3((s) => toggleSort(s, k))} /><SortTh label="Total" sortKey="total" sort={sort3} onSort={(k) => setSort3((s) => toggleSort(s, k))} /><SortTh label="Tanggal" sortKey="tanggal" sort={sort3} onSort={(k) => setSort3((s) => toggleSort(s, k))} /></tr>
                  </thead>
                  <tbody className="divide-y divide-steel-100">
                    {sortRows(movements, sort3, (m, k) => {
                      if (k === "jumlah") return Number(m.qty || 0);
                      if (k === "total") return Number(m.total || 0);
                      if (k === "item") return String(m.item ?? "");
                      if (k === "tipe") return String(m.type ?? "");
                      if (k === "referensi") return String(m.by ?? "");
                      if (k === "info") return String(`${m.supplier ?? ""} ${m.purpose ?? ""} ${m.pic ?? ""}`);
                      if (k === "tanggal") return String(m.date ?? "");
                      return String(m.id ?? "");
                    }).map((m) => (
                      <tr key={m.id} className="hover:bg-surface">
                        <td className="td font-mono font-medium text-navy-900">{m.id}</td>
                        <td className="td text-steel-600 truncate" title={String(m.item)}>{m.item}</td>
                        <td className="td">
                          <Badge tone={moveTone(m.type, m.tone)}>
                            {moveLabel(m.type)}
                          </Badge>
                        </td>
                        <td className="td font-semibold">{fmtJumlah(Number(m.qty))}</td>
                        <td className="td font-mono text-xs text-steel-600 truncate" title={String(m.by)}>{m.by}</td>
                        <td className="td text-xs text-steel-600">
                          {m.supplier ? <p className="truncate" title={String(m.supplier)}>{m.supplier}</p> : null}
                          {m.purpose ? <p className="truncate" title={String(m.purpose)}>U: {m.purpose}</p> : null}
                          {m.pic ? <p className="truncate" title={String(m.pic)}>PIC: {m.pic}</p> : null}
                          {!m.supplier && !m.purpose && !m.pic ? "—" : null}
                        </td>
                        <td className="td text-xs font-semibold">{Number(m.total) ? fmtRupiah(Number(m.total)) : "—"}</td>
                        <td className="td text-steel-600">{fmtTanggal(m.date)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === "Tonase & Surat Jalan" && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card className="p-5">
                <CardHeader title="Kalkulator Tonase Plat" subtitle="RawData: berat = P × L × T × 7850 (mm → kg)" />
                <div className="mt-3 space-y-3">
                  <FormGrid>
                    <Field label="Panjang P (mm)" hint="cth 20' = 6010"><input type="number" min={0} className="input" value={tonP} onChange={(e) => setTonP(e.target.value)} /></Field>
                    <Field label="Lebar L (mm)" hint="cth 6' = 1810, 5' = 1510"><input type="number" min={0} className="input" value={tonL} onChange={(e) => setTonL(e.target.value)} /></Field>
                    <Field label="Tebal T (mm)"><input type="number" min={0} className="input" value={tonT} onChange={(e) => setTonT(e.target.value)} /></Field>
                    <Field label="Lembar (pcs)"><input type="number" min={1} className="input" value={tonPcs} onChange={(e) => setTonPcs(e.target.value)} /></Field>
                  </FormGrid>
                  <p className="rounded-lg bg-surface px-3 py-2 text-sm font-semibold text-navy-900">
                    Berat: {fmtJumlah(sbTonasePlat(Number(tonP) || 0, Number(tonL) || 0, Number(tonT) || 0, Number(tonPcs) || 0))} kg
                  </p>
                  <button className="btn-secondary w-full justify-center text-xs" onClick={() => {
                    const kg = sbTonasePlat(Number(tonP) || 0, Number(tonL) || 0, Number(tonT) || 0, Number(tonPcs) || 0);
                    if (kg <= 0) { toast("Isi dimensi dengan benar", "info"); return; }
                    add("inventory", {
                      name: `Plat ${tonT}mm ${tonP}x${tonL}`, category: "Baja", sku: `PLAT-${tonT}-${tonP}X${tonL}-${Date.now().toString(36).toUpperCase()}`,
                      warehouse: "Gudang Baja A", rack: "", stock: Number(tonPcs) || 0, minStock: 0, unit: "lbr",
                      cost: 0, location: "", volume: kg, batch: "", uom2: "kg", konversi: kg / Math.max(1, Number(tonPcs) || 1),
                      minStockByWarehouse: {}, photoUrl: "", avgCost: 0, batches: [], reserved: [],
                    }, { action: "mendaftarkan plat dari kalkulator tonase", module: "Inventori" });
                    toast(`Plat ${tonT}mm (${kg} kg) masuk katalog`);
                  }}>
                    Masukkan ke Katalog (Q/V/Total BOM)
                  </button>
                </div>
              </Card>
              <Card className="p-5">
                <CardHeader title="Surat Jalan" subtitle="Form RawData: kop SB + kendaraan + penerima/penyerah" />
                <div className="mt-3 space-y-3">
                  <FormGrid>
                    <Field label="Tanggal"><input type="date" className="input" value={sjDate} onChange={(e) => setSjDate(e.target.value)} /></Field>
                    <Field label="Tujuan"><input className="input" value={sjTo} onChange={(e) => setSjTo(e.target.value)} placeholder="cth: Galangan Balikpapan" /></Field>
                    <Field label="Jenis kendaraan"><input className="input" value={sjVehicle} onChange={(e) => setSjVehicle(e.target.value)} /></Field>
                    <Field label="No. polisi"><input className="input font-mono" value={sjPlate} onChange={(e) => setSjPlate(e.target.value)} /></Field>
                    <Field label="Driver"><input className="input" value={sjDriver} onChange={(e) => setSjDriver(e.target.value)} /></Field>
                    <Field label="No. Ref"><input className="input font-mono" value={sbSjNumber(nextSjSeq(), sjYearOf(sjDate))} readOnly /></Field>
                  </FormGrid>
                  {sjItems.map((it, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2">
                      <input className="input col-span-8" placeholder={`Barang ${idx + 1}`} value={it.name} onChange={(e) => setSjItems((s) => s.map((x, i) => (i === idx ? { ...x, name: e.target.value } : x)))} />
                      <input className="input col-span-3" placeholder="Jumlah" value={it.qty} onChange={(e) => setSjItems((s) => s.map((x, i) => (i === idx ? { ...x, qty: e.target.value } : x)))} />
                      <button className="btn-secondary col-span-1 text-xs" aria-label={`Hapus baris SJ ${idx + 1}`} onClick={() => setSjItems((s) => s.filter((_, i) => i !== idx))}>×</button>
                    </div>
                  ))}
                  <button className="btn-secondary text-xs" onClick={() => setSjItems((s) => [...s, { name: "", qty: "" }])}>+ Baris barang</button>
                  <FormGrid>
                    <Field label="Yang menerima"><input className="input" value={sjReceiver} onChange={(e) => setSjReceiver(e.target.value)} /></Field>
                    <Field label="Yang menyerahkan"><input className="input" value={sjGiver} onChange={(e) => setSjGiver(e.target.value)} /></Field>
                  </FormGrid>
                  <button className="btn-primary w-full justify-center" onClick={() => {
                    const items = sjItems.filter((x) => x.name.trim() && x.qty.trim());
                    if (!sjTo.trim() || items.length === 0) { toast("Tujuan + minimal 1 barang wajib diisi", "info"); return; }
                    const seq = nextSjSeq();
                    const no = sbSjNumber(seq, sjYearOf(sjDate));
                    add("documents", {
                      id: `SJ-SMD-${sjYearOf(sjDate)}-${String(seq).padStart(3, "0")}`,
                      title: `Surat Jalan ke ${sjTo.trim()}`, type: "Surat Jalan", project: "-", vessel: sjTo.trim(),
                      owner: sjGiver.trim() || "Anda", sbRef: no, sjDate, sjVehicle: sjVehicle.trim(), sjPlate: sjPlate.trim(),
                      sjDriver: sjDriver.trim(), sjItems: items, sjReceiver: sjReceiver.trim(), sjGiver: sjGiver.trim(),
                      version: "v1.0", status: "Berlaku", updated: todayISO(), archived: false, docCopy: "Terkendali",
                      related: [], revisions: [{ version: "v1.0", at: todayISO(), by: sjGiver.trim() || "Anda", note: "Surat jalan diterbitkan" }],
                    }, { action: "menerbitkan surat jalan", target: no, module: "Inventori" });
                    void exportExcel([
                      [SB_KOP.line1, SB_KOP.name], [SB_KOP.hq, `HP ${SB_KOP.hp}`], [],
                      ["SURAT JALAN", `NO REF: ${no}`], ["Tanggal", sjDate], ["Tujuan", sjTo.trim()],
                      ["Kendaraan", sjVehicle.trim()], ["No. Polisi", sjPlate.trim()], ["Driver", sjDriver.trim()], [],
                      ["No", "Nama Barang", "Jumlah"], ...items.map((x, i) => [i + 1, x.name.trim(), x.qty.trim()]), [],
                      ["Yang Menerima", "Yang Menyerahkan"], [sjReceiver.trim(), sjGiver.trim()],
                    ], `SJ-${no.replaceAll("/", "-")}`, "Surat Jalan");
                    toast(`Surat jalan ${no} diterbitkan + diekspor`);
                    setSjTo(""); setSjVehicle(""); setSjPlate(""); setSjDriver("");
                    setSjItems([{ name: "", qty: "" }]); setSjReceiver(""); setSjGiver("");
                  }}>
                    Terbitkan + Cetak (kop SB)
                  </button>
                </div>
              </Card>
            </div>
          )}

          {tab === "Analisis" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Card className="p-5">
                  <CardHeader title="Slow-moving" subtitle="Tidak ada pengeluaran lebih dari 60 hari" />
                  <div className="mt-2 space-y-2">
                    {slowItems.length === 0 && <p className="py-4 text-center text-sm text-steel-400">Tidak ada item slow-moving.</p>}
                    {slowItems.map((i) => (
                      <div key={i.id} className="flex items-center justify-between gap-3 border-b border-steel-100 py-2 text-sm">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-navy-900" title={String(i.name)}>{i.name}</p>
                          <p className="text-xs text-steel-400">Terakhir keluar {fmtTanggal(lastOutOf(i))}</p>
                        </div>
                        <Badge tone="amber">Slow</Badge>
                      </div>
                    ))}
                  </div>
                </Card>
                <Card className="p-5">
                  <CardHeader title="Dead stock" subtitle="Tidak ada pengeluaran lebih dari 180 hari" />
                  <div className="mt-2 space-y-2">
                    {deadItems.length === 0 && <p className="py-4 text-center text-sm text-steel-400">Tidak ada dead stock.</p>}
                    {deadItems.map((i) => (
                      <div key={i.id} className="flex items-center justify-between gap-3 border-b border-steel-100 py-2 text-sm">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-navy-900" title={String(i.name)}>{i.name}</p>
                          <p className="text-xs text-steel-400">Stok {fmtJumlah(Number(i.stock))} {i.unit} · {fmtRupiah(Number(i.stock) * effCost(i))}</p>
                        </div>
                        <Badge tone="red">Dead</Badge>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
              <Card className="p-5">
                <CardHeader title="Stock Aging" subtitle="Umur stok dari movement masuk (GR) terakhir per item" />
                <div className="mt-3 flex flex-wrap gap-2">
                  {AGING_BUCKETS.map((b) => (
                    <span key={b} className="rounded-lg bg-steel-50 px-3 py-1.5 text-xs font-medium text-steel-600">
                      {b}: <span className="font-bold text-navy-900">{agingRows.filter((r) => r.bucket === b).length}</span> item
                    </span>
                  ))}
                </div>
                <div className="mt-3 space-y-2">
                  {agingRows.map((r) => (
                    <div key={r.item.id} className="flex items-center justify-between gap-3 border-b border-steel-100 py-2 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-navy-900" title={String(r.item.name)}>{r.item.name}</p>
                        <p className="text-xs text-steel-400">
                          {r.lastIn ? `GR terakhir ${fmtTanggal(r.lastIn)} · ${r.age} hari lalu` : "Belum pernah ada GR"} · Stok {fmtJumlah(Number(r.item.stock))} {r.item.unit}
                        </p>
                      </div>
                      <Badge tone={r.bucket === "0–30 hari" ? "green" : r.bucket === "31–90 hari" ? "blue" : r.bucket === "91–180 hari" ? "amber" : "red"}>{r.bucket}</Badge>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}
        </div>
      </div>

      {/* Modal tambah/ubah material */}
      <Modal open={showAdd || editing !== null} onClose={() => { setShowAdd(false); setEditing(null); }}
        title={editing ? `Ubah ${editing.id}` : "Material Baru"} subtitle="Tersimpan di sesi browser"
        wide footer={<><button className="btn-secondary" onClick={() => { setShowAdd(false); setEditing(null); }}>Batal</button><button className="btn-primary" onClick={save}>Simpan</button></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label="Nama material"><input className="input" value={form.name} onChange={(e) => setF("name", e.target.value)} placeholder="cth: Pelat Baja AH36 15mm" /></Field>
            <Field label="SKU"><input className="input font-mono" value={form.sku} onChange={(e) => setF("sku", e.target.value)} placeholder="cth: AH36-15" /></Field>
            <Field label="Kategori">
              <select className="input" value={form.category} onChange={(e) => setF("category", e.target.value)}>
                {["Baja", "Mesin", "Pipa", "Listrik", "Cat", "Fastener", "Rigging", "Perlindungan", "Lainnya"].map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Gudang">
              <select className="input" value={form.warehouse} onChange={(e) => setF("warehouse", e.target.value)}>
                {["Gudang Baja A", "Gudang Mesin", "Gudang Pipa", "Gudang Listrik", "Gudang B", "Gudang Rig"].map((w) => <option key={w}>{w}</option>)}
              </select>
            </Field>
            {editing ? (
              <Field label="Stok saat ini" hint="Stok hanya berubah lewat GR/GI, opname, atau penerimaan PO">
                <input className="input bg-steel-50" value={fmtJumlah(Number(editing.stock))} disabled readOnly />
              </Field>
            ) : (
              <Field label="Stok awal"><input type="number" min={0} className="input" value={form.stock} onChange={(e) => setF("stock", e.target.value)} /></Field>
            )}
            <Field label="Stok minimum"><input type="number" min={0} className="input" value={form.minStock} onChange={(e) => setF("minStock", e.target.value)} /></Field>
            <Field label="Satuan">
              <select className="input" value={form.unit} onChange={(e) => setF("unit", e.target.value)}>
                {["pcs", "kg", "liter", "meter", "batang", "unit", "roll"].map((u) => <option key={u}>{u}</option>)}
              </select>
            </Field>
            <Field label="Harga satuan (Rp)"><input type="number" min={0} className="input" value={form.cost} onChange={(e) => setF("cost", e.target.value)} /></Field>
            <Field label="Volume per unit" hint="m³/liter per unit, default 0"><input type="number" min={0} className="input" value={form.volume} onChange={(e) => setF("volume", e.target.value)} /></Field>
            <Field label="Batch / Serial" hint={form.category === "Mesin" ? "Wajib untuk kategori Mesin" : "Opsional"}>
              <input className="input font-mono" value={form.batch} onChange={(e) => setF("batch", e.target.value)} placeholder="cth: SN-2026-001" />
            </Field>
            <Field label="Satuan kedua (UOM2)" hint="Opsional, cth: meter">
              <input className="input" value={form.uom2} onChange={(e) => setF("uom2", e.target.value)} placeholder="cth: meter" />
            </Field>
            <Field label="Konversi ke UOM2" hint={`Isi UOM2 per 1 ${form.unit || "satuan"} — cth: 1 batang = 6 meter → isi 6`}>
              <input type="number" min={0} className="input" value={form.konversi} onChange={(e) => setF("konversi", e.target.value)} placeholder="cth: 6" />
            </Field>
            <Field label="Min stok gudang ini" hint="Batas menipis khusus gudang terpilih, default ikut minimum global">
              <input type="number" min={0} className="input" value={form.minWh} onChange={(e) => setF("minWh", e.target.value)} placeholder="cth: 10" />
            </Field>
            <Field label="Foto item (URL)" hint="Tempel URL gambar, siap diganti upload backend">
              <div className="flex items-center gap-2">
                <Camera className="h-4 w-4 shrink-0 text-steel-400" />
                <input className="input font-mono" value={form.photoUrl} onChange={(e) => setF("photoUrl", e.target.value)} placeholder="https://…" />
              </div>
            </Field>
          </FormGrid>
          <Field label="Lokasi rak" hint='Format "Gudang Baja A · A1-01"'><input className="input font-mono" value={form.rack} onChange={(e) => setF("rack", e.target.value)} placeholder="cth: A1-02" /></Field>
        </div>
      </Modal>

      {/* Modal GR/GI */}
      <Modal open={moveTarget !== null} onClose={closeMove} title={`${moveKind === "in" ? "Terima Barang (GR)" : "Keluar Barang (GI)"} — ${moveTarget?.name ?? ""}`}
        subtitle={moveFresh ? `Stok: ${fmtJumlah(Number(moveFresh.stock))} · Tersedia: ${fmtJumlah(availOf(moveFresh))} ${moveFresh.unit}${hasUom2(moveFresh) ? ` (≈ ${fmtJumlah(qtyInUom2(moveFresh))} ${uom2Of(moveFresh)})` : ""}` : ""}
        footer={<><button className="btn-secondary" onClick={closeMove}>Batal</button><button className="btn-primary" onClick={saveMove}>Simpan Transaksi</button></>}>
        <div className="space-y-3">
          <Field label="Jenis transaksi">
            <div className="flex gap-2">
              {(["in", "out"] as const).map((k) => (
                <button key={k} onClick={() => setMoveKind(k)}
                  className={`flex-1 rounded-xl border px-3 py-2 text-sm font-medium ${moveKind === k ? "border-navy-700 bg-navy-700 text-white" : "border-steel-200 text-steel-600"}`}>
                  {k === "in" ? "Penerimaan (GR)" : "Pengeluaran (GI)"}
                </button>
              ))}
            </div>
          </Field>
          {moveKind === "out" && moveBatches.length > 0 && (
            <div className="rounded-lg bg-steel-50 px-3 py-2 text-xs text-steel-600">
              <p className="font-semibold text-navy-900">FIFO — batch tertua dipakai dulu:</p>
              {moveBatches.map((b) => <p key={`${b.batch}-${b.date}`} className="font-mono">{b.batch} · {fmtJumlah(Number(b.qty))} · {fmtTanggal(b.date)}</p>)}
            </div>
          )}
          <FormGrid>
            <Field label="Jumlah"><input type="number" min={1} className="input" value={moveQty} onChange={(e) => setMoveQty(e.target.value)} /></Field>
            {moveFresh && hasUom2(moveFresh) ? (
              <Field label="Satuan input" hint={`1 ${moveFresh.unit} = ${fmtJumlah(convOf(moveFresh))} ${uom2Of(moveFresh)}`}>
                <select className="input" value={moveUom} onChange={(e) => setMoveUom(e.target.value)} aria-label="Satuan input GR/GI">
                  <option value="base">{moveFresh.unit} (utama)</option>
                  <option value="uom2">{uom2Of(moveFresh)} (konversi otomatis)</option>
                </select>
              </Field>
            ) : (
              <Field label="Referensi (PO / Proyek)" hint="cth: PO-2026-120 atau NB-2025-012">
                <input className="input font-mono" value={moveRef} onChange={(e) => setMoveRef(e.target.value)} />
              </Field>
            )}
          </FormGrid>
          {moveFresh && hasUom2(moveFresh) && (
            <Field label="Referensi (PO / Proyek)" hint="cth: PO-2026-120 atau NB-2025-012">
              <input className="input font-mono" value={moveRef} onChange={(e) => setMoveRef(e.target.value)} />
            </Field>
          )}
          {moveUseUom2 && moveFresh && moveRawQty > 0 && (
            <p className="rounded-lg bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700">
              {fmtJumlah(moveRawQty)} {uom2Of(moveFresh)} ÷ {fmtJumlah(convOf(moveFresh))} = {fmtJumlah(moveEffQty)} {moveFresh.unit} (tercatat dalam satuan utama)
            </p>
          )}
          {moveKind === "in" && (
            <FormGrid>
              <Field label="Harga satuan non-PPN (Rp)" hint="Kolom HARGA REPORT WAREHOUSE — average cost dihitung ulang">
                <input type="number" min={0} className="input" value={movePrice} onChange={(e) => setMovePrice(e.target.value)} placeholder="cth: 150000" />
              </Field>
              <Field label="Pajak (Rp)" hint="Kolom PAJAK bila ada">
                <input type="number" min={0} className="input" value={moveTax} onChange={(e) => setMoveTax(e.target.value)} placeholder="0" />
              </Field>
            </FormGrid>
          )}
          {moveKind === "in" && (
            <Field label="Supplier" hint="Kolom NAMA SUPPLIER">
              <input className="input" value={moveSupplier} onChange={(e) => setMoveSupplier(e.target.value)} placeholder="cth: CV KALINDO MITRA BERSAMA" />
            </Field>
          )}
          <FormGrid>
            <Field label="Purpose / Untuk kapal" hint="cth: TB BANGUNAN BARU / U/TB. TRIALFA 01">
              <input className="input" value={movePurpose} onChange={(e) => setMovePurpose(e.target.value)} placeholder="cth: TB BANGUNAN BARU" />
            </Field>
            <Field label="PIC" hint="Penanggung jawab pengambilan">
              <input className="input" value={movePic} onChange={(e) => setMovePic(e.target.value)} placeholder="cth: ABK / nama subkon" />
            </Field>
          </FormGrid>
          <Field label="Batch / Serial" hint="Opsional — dicatat di movement & FIFO">
            <input className="input font-mono" value={moveBatch} onChange={(e) => setMoveBatch(e.target.value)} placeholder="cth: SN-2026-001" />
          </Field>
        </div>
      </Modal>

      {/* Modal opname */}
      <Modal open={showOpname} onClose={() => setShowOpname(false)} title="Stok Opname" subtitle="Hasil hitung fisik → selisih tercatat sebagai movement"
        footer={<><button className="btn-secondary" onClick={() => setShowOpname(false)}>Batal</button><button className="btn-primary" onClick={saveOpname}>Simpan Opname</button></>}>
        <div className="space-y-3">
          <Field label="Item">
            <select className="input" value={opItem} onChange={(e) => setOpItem(e.target.value)}>
              <option value="">Pilih item…</option>
              {inventory.map((i) => <option key={i.id} value={i.id}>{i.name} · stok {fmtJumlah(Number(i.stock))} {i.unit}</option>)}
            </select>
          </Field>
          <Field label="Stok hasil hitung" hint={opTarget ? `Stok tercatat: ${fmtJumlah(Number(opTarget.stock))} ${opTarget.unit}` : undefined}>
            <input type="number" min={0} className="input" value={opCount} onChange={(e) => setOpCount(e.target.value)} />
          </Field>
          {opSelisih !== null && opSelisih !== 0 && (
            <p className="rounded-lg bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700">
              Selisih {opSelisih > 0 ? "+" : ""}{fmtJumlah(opSelisih)} akan tercatat sebagai movement “Selisih Opname”.
            </p>
          )}
        </div>
      </Modal>

      {/* Modal transfer gudang */}
      <Modal open={showTransfer} onClose={() => setShowTransfer(false)} title="Transfer Antar Gudang" subtitle="Pindahkan item ke gudang lain"
        footer={<><button className="btn-secondary" onClick={() => setShowTransfer(false)}>Batal</button><button className="btn-primary" onClick={saveTransfer}>Simpan Transfer</button></>}>
        <div className="space-y-3">
          <Field label="Item">
            <select className="input" value={trItem} onChange={(e) => setTrItem(e.target.value)}>
              <option value="">Pilih item…</option>
              {inventory.map((i) => <option key={i.id} value={i.id}>{i.name} · {i.warehouse}</option>)}
            </select>
          </Field>
          <FormGrid>
            <Field label="Qty" hint={trTarget ? `Tersedia ${fmtJumlah(Number(trTarget.stock))} ${trTarget.unit}` : undefined}>
              <input type="number" min={1} className="input" value={trQty} onChange={(e) => setTrQty(e.target.value)} />
            </Field>
            <Field label="Gudang tujuan">
              <select className="input" value={trDest} onChange={(e) => setTrDest(e.target.value)}>
                <option value="">Pilih gudang…</option>
                {warehouses.map((w) => <option key={w}>{w}</option>)}
              </select>
            </Field>
          </FormGrid>
        </div>
      </Modal>

      {/* Modal reservasi */}
      <Modal open={reservTarget !== null} onClose={() => setReservTarget(null)} title={`Reservasi — ${reservTarget?.name ?? ""}`}
        subtitle={reservTarget ? `Tersedia: ${fmtJumlah(availOf(inventory.find((i) => i.id === reservTarget.id) ?? reservTarget))} ${reservTarget.unit}` : ""}
        footer={<><button className="btn-secondary" onClick={() => setReservTarget(null)}>Batal</button><button className="btn-primary" onClick={saveReservasi}>Simpan Reservasi</button></>}>
        <div className="space-y-3">
          <Field label="Proyek">
            <select className="input" value={reservProject} onChange={(e) => setReservProject(e.target.value)}>
              <option value="">Pilih proyek…</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.id} — {p.vessel}</option>)}
            </select>
          </Field>
          <Field label="Qty reservasi"><input type="number" min={1} className="input" value={reservQtyInput} onChange={(e) => setReservQtyInput(e.target.value)} /></Field>
        </div>
      </Modal>

      {/* Modal pick list */}
      <Modal open={showPick} onClose={() => setShowPick(false)} title="Pick List Proyek" subtitle="Centang item reservasi lalu keluarkan sekaligus (GI massal)"
        wide footer={<><button className="btn-secondary" onClick={() => setShowPick(false)}>Batal</button><button className="btn-primary" onClick={savePick}>Ambil Tercentang (GI)</button></>}>
        <div className="space-y-3">
          <Field label="Proyek">
            <select className="input" value={pickProject} onChange={(e) => {
              setPickProject(e.target.value);
              setPickSel(inventory.filter((i) => reservedOf(i).some((r) => r.project === e.target.value)).map((i) => i.id));
            }}>
              <option value="">Pilih proyek…</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.id} — {p.vessel}</option>)}
            </select>
          </Field>
          {pickProject && pickItems.length === 0 && <EmptyState title="Tidak ada reservasi" subtitle={`Belum ada item direservasi untuk ${pickProject}.`} />}
          {pickItems.map((i) => {
            const res = reservedOf(i).find((r) => r.project === pickProject);
            const checked = pickSel.includes(i.id);
            return (
              <label key={i.id} className="flex items-center gap-3 rounded-xl border border-steel-200 px-3 py-2 text-sm">
                <input type="checkbox" checked={checked} onChange={(e) => setPickSel((s) => (e.target.checked ? [...s, i.id] : s.filter((x) => x !== i.id)))} aria-label={`Ambil ${i.name}`} />
                <span className="min-w-0 flex-1 truncate font-medium text-navy-900" title={String(i.name)}>{i.name}</span>
                <span className="shrink-0 text-steel-500">{fmtJumlah(Number(res?.qty ?? 0))} {i.unit}</span>
              </label>
            );
          })}
        </div>
      </Modal>

      {/* Modal label barcode */}
      <Modal open={labelItem !== null} onClose={() => setLabelItem(null)} title={`Label — ${labelItem?.name ?? ""}`} subtitle={labelItem ? `${labelItem.id} · ${labelItem.sku}` : ""}
        footer={<><button className="btn-secondary" onClick={() => setLabelItem(null)}>Tutup</button><button className="btn-primary" onClick={() => window.print()}><Printer className="h-4 w-4" /> Cetak</button></>}>
        {labelItem && (
          <div id="label-print" className="rounded-xl border border-steel-200 p-4 text-center">
            <p className="text-sm font-bold text-navy-900">{labelItem.name}</p>
            <p className="font-mono text-xs text-steel-500">{labelItem.sku}</p>
            <p className="font-mono text-xs text-steel-500">{rackText(labelItem)}</p>
            <div className="mt-3 flex h-12 items-stretch justify-center gap-0 overflow-hidden" aria-hidden="true">
              {barcodeBits(String(labelItem.sku)).map((b, idx) => (
                <div key={idx} style={{ width: b ? 3 : 2, background: b ? "#0b1e33" : "#ffffff" }} />
              ))}
            </div>
            <p className="mt-2 font-mono text-xs tracking-widest text-navy-900">{labelItem.sku}</p>
          </div>
        )}
      </Modal>

      {/* Modal detail */}
      <Modal open={detail !== null} onClose={() => setDetail(null)} title={freshDetail?.name ?? ""} subtitle={freshDetail ? `${freshDetail.id} · ${freshDetail.sku}` : ""}>
        {freshDetail && (
          <dl className="space-y-2.5 text-sm">
            {freshDetail.photoUrl ? (
              <img src={String(freshDetail.photoUrl)} alt={String(freshDetail.name)} className="h-32 w-full rounded-xl border border-steel-200 object-cover" />
            ) : null}
            {([
              ["Kategori", freshDetail.category],
              ["Gudang / Rak", rackText(freshDetail)],
              ["Stok", `${fmtJumlah(Number(freshDetail.stock))} ${freshDetail.unit}${hasUom2(freshDetail) ? ` (≈ ${fmtJumlah(qtyInUom2(freshDetail))} ${uom2Of(freshDetail)})` : ""}`],
              ["Tersedia", `${fmtJumlah(availOf(freshDetail))} ${freshDetail.unit}`],
              ["Reservasi", reservedOf(freshDetail).length > 0 ? reservedOf(freshDetail).map((r) => `${r.project} × ${fmtJumlah(Number(r.qty))}`).join("; ") : "—"],
              ["Volume per unit", fmtJumlah(Number(freshDetail.volume ?? 0))],
              ["Minimum global", fmtJumlah(Number(freshDetail.minStock))],
              [`Minimum ${freshDetail.warehouse}`, fmtJumlah(minWhOf(freshDetail))],
              ["Batch / Serial", freshDetail.batch ? String(freshDetail.batch) : "—"],
              ["Kelas ABC", abc[freshDetail.id] ?? "—"],
              ["Harga satuan (master)", fmtRupiah(Number(freshDetail.cost))],
              ["Harga rata-rata (avg)", Number(freshDetail.avgCost) > 0 ? fmtRupiah(Number(freshDetail.avgCost)) : "— (pakai harga master)"],
              ["Nilai total", fmtRupiah(Number(freshDetail.stock) * effCost(freshDetail))],
            ] as [string, string][]).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4"><dt className="text-steel-500">{k}</dt><dd className="font-medium text-navy-900 text-right">{v}</dd></div>
            ))}
            <div className="rounded-xl bg-steel-50 px-3 py-2">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-navy-900"><History className="h-3.5 w-3.5" /> Riwayat item (5 terakhir)</p>
              {auditOf(freshDetail).length === 0 && <p className="mt-1 text-xs text-steel-400">Belum ada movement untuk item ini.</p>}
              {auditOf(freshDetail).map((m) => (
                <p key={m.id} className="mt-1 flex items-center justify-between gap-2 text-xs text-steel-600">
                  <span className="truncate">{fmtTanggal(m.date)} · <Badge tone={moveTone(m.type, m.tone)}>{moveLabel(m.type)}</Badge> {fmtJumlah(Number(m.qty))}</span>
                  <span className="shrink-0 font-mono">{m.by}</span>
                </p>
              ))}
            </div>
            <Link to={`/inventori/bom/${freshDetail.id}`} className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-ocean-600 hover:underline">Buka halaman BOM</Link>
          </dl>
        )}
      </Modal>
    </div>
  );
}
