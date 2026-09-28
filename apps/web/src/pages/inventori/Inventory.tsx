import { useEffect, useMemo, useRef, useState } from "react";
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
import { Card, CardHeader, PageHeader, Badge, KpiCard, Tabs, ChartTooltip, Modal, Field, FormGrid, toast, EmptyState, ProgressBar, SortTh, toggleSort, sortRows, usePager, useDebouncedValue,
  NumInput,
} from "../../components/ui";
import type { SortState } from "../../components/ui";
import { useStore, type StoreItem } from "../../data/store";
import { isBackendConfigured } from "../../services/http";
import { uploadFile } from "../../services/upload";
import { fmtJumlah, fmtRupiah, fmtMiliar, fmtTanggal, todayISO } from "../../utils/format";
import { exportExcel } from "../../utils/export";
import { sbTonasePlat, sbSjNumber, sbTtNumber, maxSeq, parseSjSeq, SB_KOP } from "../../utils/sb";
import { FilterPopover } from "../../components/FilterPopover";
import { useT } from "../../i18n/LanguageContext";
import { n_inv } from "../../i18n/n_inv";
import { AlertBannerView, notifRowId, useModuleAlert, useNotifFlash } from "../../components/AlertBanner";
import { stockTrend, itemTrend, lowStockTrend, stockValueTrend, warehouseTrend } from "../../data";

const emptyForm = { name: "", category: "Baja", sku: "", warehouse: "Gudang Baja A", rack: "", bin: "", stock: "0", minStock: "0", unit: "pcs", cost: "0", volume: "0", batch: "", uom2: "", konversi: "", minWh: "", photoUrl: "" };

/* Kebutuhan BOM TB Samudra Jaya 07 - dicocokkan ke data inventori aktual. */
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

function binOf(it: StoreItem): string {
  return String(it.bin ?? "").trim();
}

/* Payload QR eksternal: SKU stabil sebagai identifier scan. */
function qrPayloadOf(it: StoreItem): string {
  return String(it.sku ?? "").trim();
}

interface DetectedBarcode {
  rawValue: string;
}

interface BarcodeDetectorInstance {
  detect(source: HTMLVideoElement): Promise<DetectedBarcode[]>;
}

type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorInstance;

function getBarcodeDetector(): BarcodeDetectorCtor | undefined {
  return (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
}

/* Modal scan kamera: getUserMedia + BarcodeDetector native, tanpa dep. */
function ScanModal({ onDetect, onClose }: { onDetect: (value: string) => void; onClose: () => void }) {
  const { locale } = useT();
  const S = n_inv[locale];
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cbRef = useRef(onDetect);
  cbRef.current = onDetect;
  const [msg, setMsg] = useState(S.scanPreparing);
  const [manual, setManual] = useState("");
  const [detectorOk, setDetectorOk] = useState(true);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer = 0;
    let stopped = false;
    const Ctor = getBarcodeDetector();
    if (!Ctor) setDetectorOk(false);
    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setMsg(S.scanNoCamera);
          return;
        }
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => undefined);
        }
        if (!Ctor) {
          setMsg(S.scanNoDetector);
          return;
        }
        const detector = new Ctor({ formats: ["qr_code", "code_128", "code_39", "ean_13", "ean_8", "upc_a"] });
        setMsg(S.scanAim);
        const tick = async () => {
          if (stopped) return;
          try {
            const v = videoRef.current;
            if (v && v.readyState >= 2) {
              const res = await detector.detect(v);
              const raw = res?.[0]?.rawValue?.trim() ?? "";
              if (raw) {
                cbRef.current(raw);
                return;
              }
            }
          } catch {
            /* abaikan error per-frame, coba lagi */
          }
          timer = window.setTimeout(() => { void tick(); }, 350);
        };
        void tick();
      } catch {
        setMsg(S.scanFail);
      }
    };
    void start();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <Modal open onClose={onClose} title={S.scanTitle} subtitle={S.scanSub}>
      <div className="space-y-3">
        <video ref={videoRef} className="h-48 w-full rounded-xl bg-navy-900 object-cover" muted playsInline aria-label={S.scanPreviewAria} />
        <p className="text-xs text-steel-500">{msg}{detectorOk ? "" : S.scanManualMode}</p>
        <Field label={S.scanManualLabel}>
          <div className="flex gap-2">
            <input className="input font-mono" value={manual} onChange={(e) => setManual(e.target.value)} placeholder={S.phSku} />
            <button className="btn-primary shrink-0" onClick={() => { if (manual.trim()) cbRef.current(manual.trim()); }}>{S.useBtn}</button>
          </div>
        </Field>
      </div>
    </Modal>
  );
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
  if (days <= 30) return "0-30 hari";
  if (days <= 90) return "31-90 hari";
  if (days <= 180) return "91-180 hari";
  return ">180 hari";
}

const AGING_BUCKETS = ["0-30 hari", "31-90 hari", "91-180 hari", ">180 hari", "Belum ada GR"];

export default function Inventory() {
  const { locale } = useT();
  const S = n_inv[locale];
  const { data, add, update, log, branch } = useStore();
  // Cabang movement: dari proyek tertaut (cocokkan teks ke id/vessel) atau fallback global.
  const moveBranch = (hay: string): string => String(
    (data.projects ?? []).find((p) => hay.includes(String(p.id)) || (p.vessel && hay.includes(String(p.vessel))))?.branch
    ?? (branch !== "SEMUA" ? branch : ""),
  );
  const inventory = data.inventory;
  const movements = data.movements;
  const projects = data.projects;
  const requisitions = data.requisitions;
  const modAlert = useModuleAlert("inventori");
  const flash = useNotifFlash();
  const [tab, setTab] = useState("Katalog");
  const [bomProject, setBomProject] = useState("Semua proyek");
  const [q, setQ] = useState("");
  const [showScan, setShowScan] = useState(false);
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
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
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
  // Tanda Terima (form RawData TANDA TERIMA: kop SB + penerima/penyerah + link SJ).
  const [ttDate, setTtDate] = useState(todayISO());
  const [ttSjId, setTtSjId] = useState("");
  const [ttItems, setTtItems] = useState<{ name: string; qty: string }[]>([{ name: "", qty: "" }]);
  const [ttReceiver, setTtReceiver] = useState("");
  const [ttGiver, setTtGiver] = useState("");
  const sjDocs = useMemo(
    () => (data.documents ?? []).filter((d) => d.type === "Surat Jalan"),
    [data.documents],
  );
  /* TT max+1: scan dash ids + sbRef via trailing digits (TT-SMD-YYYY-nnn). */
  const nextTtSeq = (): number => {
    const docs = (data.documents ?? []).filter((d) => d.type === "Tanda Terima");
    const nums = docs.flatMap((d) => [parseSjSeq(d.sbRef), parseSjSeq(d.id)]);
    return maxSeq(nums.map(String), /(\d+)$/) + 1;
  };
  const [showPick, setShowPick] = useState(false);
  const [pickProject, setPickProject] = useState("");
  const [pickSel, setPickSel] = useState<string[]>([]);

  const dq = useDebouncedValue(q);
  const abc = useMemo(() => abcMap(inventory), [inventory]);

  const list = useMemo(() => inventory.filter((i) => {
    const matchQ = `${i.name} ${i.sku} ${binOf(i)}`.toLowerCase().includes(dq.toLowerCase());
    const matchCat = cat === "Semua" || i.category === cat;
    const matchWh = wh === "Semua" || i.warehouse === wh;
    const matchAbc = abcF === "Semua" || abc[i.id] === abcF;
    return matchQ && matchCat && matchWh && matchAbc;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [inventory, dq, cat, wh, abcF, abc]);
  const sorted = useMemo(() => sortRows(list, sort, (i, k) => {
    if (k === "qty") return Number(i.stock || 0);
    if (k === "volume") return Number(i.volume ?? 0);
    if (k === "total") return Number(i.stock || 0) * effCost(i);
    if (k === "kategori") return String(i.category ?? "");
    if (k === "abc") return String(abc[i.id] ?? "");
    if (k === "status") return Number(i.stock) <= Number(i.minStock) ? "Menipis" : "Aman";
    if (k === "rak") return String(rackText(i));
    if (k === "bin") return binOf(i);
    return String(i.name ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [list, sort, abc]);
  const pager = usePager(list.length);
  const movPager = usePager(movements.length);
  const movSorted = useMemo(() => sortRows(movements, sort3, (m, k) => {
    if (k === "jumlah") return Number(m.qty || 0);
    if (k === "total") return Number(m.total || 0);
    if (k === "item") return String(m.item ?? "");
    if (k === "tipe") return String(m.type ?? "");
    if (k === "referensi") return String(m.by ?? "");
    if (k === "info") return String(`${m.supplier ?? ""} ${m.purpose ?? ""} ${m.pic ?? ""}`);
    if (k === "tanggal") return String(m.date ?? "");
    return String(m.id ?? "");
  }), [movements, sort3]);
  useEffect(() => {
    pager.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dq, cat, wh, abcF]);

  const pickNotif = (rowId: string) => {
    const idx = sorted.findIndex((r) => String(r.id) === rowId);
    if (idx >= 0) {
      if (tab === "Katalog") { flash.pick(rowId, idx, pager.go, pager.size); return; }
      setTab("Katalog");
      window.setTimeout(() => { flash.pick(rowId, idx, pager.go, pager.size); }, 250);
      return;
    }
    const mIdx = movSorted.findIndex((m) => String(m.id) === rowId);
    if (mIdx >= 0) {
      if (tab === "Pergerakan") { flash.pick(rowId, mIdx, movPager.go, movPager.size); return; }
      setTab("Pergerakan");
      window.setTimeout(() => { flash.pick(rowId, mIdx, movPager.go, movPager.size); }, 250);
      return;
    }
    flash.pick(rowId, -1, () => {}, 100);
  };

  // Indeks tanggal pergerakan per barang: 1x scan O(movements), lookup O(1).
  // Sebelumnya tiap barang memindai + sort seluruh movements tiap render.
  const moveIdx = useMemo(() => {
    const out = new Map<string, string>();
    const inn = new Map<string, string>();
    for (const m of movements) {
      const d = String(m.date ?? "");
      if (!d) continue;
      const isOut = m.type === "Pengeluaran";
      const isIn = m.type === "Penerimaan" || m.tone === "in";
      if (!isOut && !isIn) continue;
      for (const k of [String(m.itemId ?? ""), String(m.item ?? "")]) {
        if (!k) continue;
        if (isOut && (!(out.has(k)) || d > (out.get(k) as string))) out.set(k, d);
        if (isIn && (!(inn.has(k)) || d > (inn.get(k) as string))) inn.set(k, d);
      }
    }
    return { out, inn };
  }, [movements]);

  const lastOutOf = (it: StoreItem): string | null =>
    moveIdx.out.get(String(it.id)) ?? moveIdx.out.get(String(it.name)) ?? null;

  const lastInOf = (it: StoreItem): string | null =>
    moveIdx.inn.get(String(it.id)) ?? moveIdx.inn.get(String(it.name)) ?? null;

  const lowStock = useMemo(() => inventory.filter((i) => i.stock <= i.minStock), [inventory]);
  const categories = useMemo(() => ["Semua", ...Array.from(new Set(inventory.map((i) => i.category)))], [inventory]);
  const totalValue = useMemo(() => inventory.reduce((s, i) => s + Number(i.stock || 0) * effCost(i), 0), [inventory]);
  const warehouses = useMemo(() => Array.from(new Set(inventory.map((i) => i.warehouse))), [inventory]);

  const bomRows = BOM_NEEDS.map((b) => {
    const item = inventory.find((i) => i.name.toLowerCase().includes(b.key.toLowerCase()));
    const stock = item ? Number(item.stock) : 0;
    return { ...b, item, stock, ok: stock >= b.need };
  });

  const auditOf = (it: StoreItem) =>
    movements
      .filter((m) => m.itemId === it.id || m.item === it.name)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .slice(0, 5);

  const slowItems = useMemo(() => inventory.filter((i) => {
    const d = lastOutOf(i);
    if (!d) return false;
    const days = daysSince(d);
    return days > 60 && days <= 180;
  }), [inventory, moveIdx]);
  const deadItems = useMemo(() => inventory.filter((i) => {
    const d = lastOutOf(i);
    if (!d) return true;
    return daysSince(d) > 180;
  }), [inventory, moveIdx]);

  const agingRows = useMemo(() => inventory.map((i) => {
    const lastIn = lastInOf(i);
    const age = lastIn ? daysSince(lastIn) : 9999;
    return { item: i, lastIn, age, bucket: lastIn ? agingBucket(age) : "Belum ada GR" };
  }), [inventory, moveIdx]);

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

  /* Upload foto ke backend (/api/files); mode lokal tetap pakai URL manual. */
  const onPhotoFile = async (f: File | undefined) => {
    if (!f) return;
    if (!isBackendConfigured()) { toast(S.localPhotoUrl, "info"); return; }
    setUploadingPhoto(true);
    try {
      const url = await uploadFile(f);
      setF("photoUrl", url);
      toast(S.photoUploaded);
    } catch (e) {
      toast(e instanceof Error ? e.message : S.photoUploadFail, "info");
    } finally {
      setUploadingPhoto(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  };

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
      rack: String(i.rack ?? i.location ?? ""), bin: binOf(i), stock: String(i.stock), minStock: String(i.minStock),
      unit: i.unit, cost: String(i.cost), volume: String(i.volume ?? 0), batch: String(i.batch ?? ""),
      uom2: uom2Of(i), konversi: convOf(i) > 0 ? String(i.konversi) : "",
      minWh: String(minWhOf(i)), photoUrl: String(i.photoUrl ?? ""),
    });
  };

  const save = async () => {
    if (!form.name.trim() || !form.sku.trim()) { toast(S.nameSkuRequired, "info"); return; }
    const dupe = inventory.some((i) => i.sku.toLowerCase() === form.sku.trim().toLowerCase() && i.id !== editing?.id);
    if (dupe) { toast(S.skuDupe, "info"); return; }
    if (!editing && form.category === "Mesin" && !form.batch.trim()) { toast(S.mesinBatchRequired, "info"); return; }
    const volume = Number(form.volume);
    if (form.volume.trim() !== "" && (Number.isNaN(volume) || volume < 0)) { toast(S.volumeInvalid, "info"); return; }
    const uom2 = form.uom2.trim();
    const konv = form.konversi.trim() === "" ? 0 : Number(form.konversi);
    if (Number.isNaN(konv) || konv < 0) { toast(S.convInvalid, "info"); return; }
    if (uom2 && konv <= 0) { toast(S.uom2NeedConv, "info"); return; }
    if (!uom2 && konv > 0) { toast(S.convNeedUom2, "info"); return; }
    const numStock = form.stock.trim() === "" ? 0 : Number(form.stock);
    const numMin = form.minStock.trim() === "" ? 0 : Number(form.minStock);
    const numCost = form.cost.trim() === "" ? 0 : Number(form.cost);
    if (!Number.isFinite(numStock) || numStock < 0) { toast(S.stockInvalid, "info"); return; }
    if (!Number.isFinite(numMin) || numMin < 0) { toast(S.minInvalid, "info"); return; }
    if (!Number.isFinite(numCost) || numCost < 0) { toast(S.costInvalid, "info"); return; }
    if (form.minWh.trim() !== "" && (!Number.isFinite(Number(form.minWh)) || Number(form.minWh) < 0)) { toast(S.minWhInvalid, "info"); return; }
    const rack = form.rack.trim();
    const bin = form.bin.trim();
    const prevMap = (editing?.minStockByWarehouse as Record<string, number> | undefined) ?? {};
    const minWhMap = { ...prevMap };
    if (form.minWh.trim() !== "") minWhMap[form.warehouse] = Number(form.minWh) || 0;
    if (minWhMap[form.warehouse] !== undefined && minWhMap[form.warehouse] < 0) { toast(S.minWhInvalid, "info"); return; }
    if (editing) {
      /* Stok read-only di form edit - hanya field non-stok yang disimpan. */
      await update("inventory", editing.id, {
        name: form.name.trim(), category: form.category, sku: form.sku.trim(), warehouse: form.warehouse,
        rack, bin, location: rack, minStock: numMin, unit: form.unit,
        cost: numCost, volume: volume || 0, batch: form.batch.trim(),
        uom2, konversi: konv, minStockByWarehouse: minWhMap, photoUrl: form.photoUrl.trim(),
      });
      toast(S.updatedId.replace("{n}", editing.id));
      setEditing(null);
    } else {
      const stock = numStock;
      const batch = form.batch.trim();
      const created = await add("inventory", {
        name: form.name.trim(), category: form.category, sku: form.sku.trim(), warehouse: form.warehouse,
        rack, bin, stock, minStock: numMin, unit: form.unit,
        cost: numCost, location: rack, volume: volume || 0, batch,
        uom2, konversi: konv, minStockByWarehouse: minWhMap, photoUrl: form.photoUrl.trim(), avgCost: 0,
        batches: batch ? [{ batch, qty: stock, date: todayISO() }] : [],
        reserved: [],
      }, { action: "mendaftarkan material", module: "Inventori" });
      toast(S.materialAdded.replace("{n}", created.id));
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

  const saveMove = async () => {
    if (!moveTarget) return;
    const fresh = inventory.find((i) => i.id === moveTarget.id) ?? moveTarget;
    const raw = Number(moveQty);
    if (!raw || raw <= 0) { toast(S.qtyPositive, "info"); return; }
    const useUom2 = hasUom2(fresh) && moveUom === "uom2";
    const qty = useUom2 ? raw / convOf(fresh) : raw;
    if (!Number.isFinite(qty) || qty <= 0) { toast(S.convBadQty, "info"); return; }
    if (moveKind === "out" && qty > Number(fresh.stock)) { toast(S.stockShort.replace("{n}", fmtJumlah(Number(fresh.stock))), "info"); return; }
    if (moveKind === "out" && !movePurpose.trim()) { toast(S.purposeRequired, "info"); return; }
    if (moveKind === "out" && !movePic.trim()) { toast(S.picRequired, "info"); return; }
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
      if (movePrice.trim() !== "" && (!price || price <= 0)) { toast(S.grPriceInvalid, "info"); return; }
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
    try {
      await update("inventory", fresh.id, patch);
      if (moveKind === "out" && next < Number(fresh.minStock || 0)) {
        toast(S.warnBelowMin.replace("{a}", fresh.name).replace("{b}", `${fmtJumlah(Number(fresh.minStock || 0))} ${fresh.unit}`), "info");
      }
      await add("movements", {
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
        // Cabang dari proyek tertaut (cocokkan purpose/ref ke id/vessel proyek) atau fallback global.
        branch: moveBranch(`${movePurpose} ${refNote}`),
      }, { action: moveKind === "in" ? "menerima barang" : "mengeluarkan barang", target: `${fresh.name} × ${qty}`, module: "Inventori" });
      toast(S.moveSaved.replace("{a}", moveKind === "in" ? "GR" : "GI").replace("{b}", fresh.name).replace("{n}", fmtJumlah(qty)));
      closeMove();
    } catch {
      toast(S.moveFailed.replace("{n}", moveKind === "in" ? "GR" : "GI"), "info");
    }
  };

  /* BOM explode → PR Draft, cegah duplikat PR terbuka untuk item sama. */
  const buatPRDraft = async (itemName: string, qtyKurang: number, estAmount: number) => {
    const open = requisitions.some(
      (r) => String(r.item).toLowerCase() === itemName.toLowerCase()
        && ["Draft", "Draf", "Menunggu Approval", "RFQ", "Diajukan"].includes(String(r.status))
    );
    if (open) { toast(S.prOpenExists.replace("{n}", itemName), "info"); return; }
    const created = await add("requisitions", {
      item: itemName, by: "System BOM", amount: Math.max(0, Math.round(estAmount)), status: "Draft",
    }, { action: "membuat PR Draft (BOM)", target: `${itemName} × ${fmtJumlah(qtyKurang)}`, module: "Inventori" });
    toast(S.prDraftMade.replace("{a}", created.id).replace("{b}", itemName).replace("{n}", fmtJumlah(qtyKurang)));
  };

  const downloadTemplate = () => {
    void exportExcel(
      [
        ["nama", "sku", "kategori", "gudang", "stok", "minStok", "satuan", "harga", "rak", "bin"],
        ["Pelat Baja AH36 15mm", "AH36-15", "Baja", "Gudang Baja A", 100, 20, "kg", 150000, "A1-02", "B-03"],
      ],
      "Template-Inventori",
      "Template"
    );
    toast(S.tplExcelDone);
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
    toast(S.tplDone.replace("{n}", filename));
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
    void file.text().then(async (text) => {
      const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== "");
      if (lines.length === 0) { setImportReport([S.fileEmpty]); return; }
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
      if (idxKode < 0 || idxQty < 0) { setImportReport([S.badHeaderIn]); return; }
      const stockMap: Record<string, number> = Object.fromEntries(inventory.map((i) => [i.id, Number(i.stock || 0)]));
      const avgMap: Record<string, number> = Object.fromEntries(inventory.map((i) => [i.id, Number(i.avgCost) || 0]));
      const fails: string[] = [];
      let ok = 0;
      for (const [idx, line] of lines.slice(start).entries()) {
        const rowNo = idx + start + 1;
        const c = splitCsvLine(line);
        const kode = (c[idxKode] ?? "").trim();
        const item = kode ? findItemByKode(kode) : undefined;
        if (!item) { fails.push(S.rowUnknownCode.replace("{a}", String(rowNo)).replace("{b}", kode || S.emptyParen)); continue; }
        const qty = Number(c[idxQty] ?? "");
        if (!Number.isFinite(qty) || qty <= 0) { fails.push(S.rowQty.replace("{a}", String(rowNo))); continue; }
        const price = idxHarga >= 0 && (c[idxHarga] ?? "") !== "" ? Number(c[idxHarga]) : 0;
        if (!Number.isFinite(price) || price < 0) { fails.push(S.rowPrice.replace("{a}", String(rowNo))); continue; }
        const tax = idxPajak >= 0 && (c[idxPajak] ?? "") !== "" ? Number(c[idxPajak]) : 0;
        if (!Number.isFinite(tax) || tax < 0) { fails.push(S.rowTax.replace("{a}", String(rowNo))); continue; }
        const date = validDateOrToday(idxTanggal >= 0 ? (c[idxTanggal] ?? "") : "");
        if (!date) { fails.push(S.rowDate.replace("{a}", String(rowNo))); continue; }
        const supplier = idxSupplier >= 0 ? (c[idxSupplier] ?? "").trim() : "";
        const rawTotal = idxTotal >= 0 ? (c[idxTotal] ?? "").trim() : "";
        const total = rawTotal !== "" ? Number(rawTotal) : Math.round(qty * price) + tax;
        if (!Number.isFinite(total) || total < 0) { fails.push(S.rowTotal.replace("{a}", String(rowNo))); continue; }
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
        await update("inventory", item.id, patch);
        await add("movements", {
          item: item.name, itemId: item.id, type: "Penerimaan", qty,
          by: supplier ? `Impor IN ${date} · ${supplier}` : `Impor IN ${date}`,
          batch: String(item.batch ?? ""), date, tone: "in",
          supplier, priceExcl: price, tax, total, purpose, pic,
          branch: moveBranch(`${purpose} ${supplier}`),
        }, { action: "mengimpor GR", target: `${item.name} × ${qty}`, module: "Inventori" });
        ok++;
      }
      setImportReport([S.inOk.replace("{n}", String(ok)), ...fails]);
      toast(S.inDone.replace("{a}", String(ok)).replace("{b}", String(fails.length)));
    });
  };

  const handleImportOUTFile = (file: File) => {
    void file.text().then(async (text) => {
      const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== "");
      if (lines.length === 0) { setImportReport([S.fileEmpty]); return; }
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
      if (idxKode < 0 || idxQty < 0) { setImportReport([S.badHeaderOut]); return; }
      const stockMap: Record<string, number> = Object.fromEntries(inventory.map((i) => [i.id, Number(i.stock || 0)]));
      const batchMap: Record<string, BatchRow[]> = Object.fromEntries(
        inventory.map((i) => [i.id, [...batchesOf(i)].sort((a, b) => String(a.date).localeCompare(String(b.date)))])
      );
      const reservedMap: Record<string, Reservation[]> = Object.fromEntries(
        inventory.map((i) => [i.id, [...reservedOf(i)]])
      );
      const fails: string[] = [];
      let ok = 0;
      for (const [idx, line] of lines.slice(start).entries()) {
        const rowNo = idx + start + 1;
        const c = splitCsvLine(line);
        const kode = (c[idxKode] ?? "").trim();
        const item = kode ? findItemByKode(kode) : undefined;
        if (!item) { fails.push(S.rowUnknownCode.replace("{a}", String(rowNo)).replace("{b}", kode || S.emptyParen)); continue; }
        const qty = Number(c[idxQty] ?? "");
        if (!Number.isFinite(qty) || qty <= 0) { fails.push(S.rowQty.replace("{a}", String(rowNo))); continue; }
        const purpose = idxPurpose >= 0 ? (c[idxPurpose] ?? "").trim() : "";
        const pic = idxPic >= 0 ? (c[idxPic] ?? "").trim() : "";
        if (!purpose) { fails.push(S.rowPurpose.replace("{a}", String(rowNo))); continue; }
        if (!pic) { fails.push(S.rowPic.replace("{a}", String(rowNo))); continue; }
        const avail = stockMap[item.id] ?? Number(item.stock || 0);
        if (qty > avail) { fails.push(S.rowShort.replace("{a}", String(rowNo)).replace("{b}", kode).replace("{n}", String(avail))); continue; }
        const date = validDateOrToday(idxTanggal >= 0 ? (c[idxTanggal] ?? "") : "");
        if (!date) { fails.push(S.rowDate.replace("{a}", String(rowNo))); continue; }
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
        await update("inventory", item.id, { stock: newStock, batches: nextBatches, reserved: nextRes });
        if (newStock < Number(item.minStock || 0)) {
          toast(S.warnBelowMinSimple.replace("{n}", item.name), "info");
        }
        await add("movements", {
          item: item.name, itemId: item.id, type: "Pengeluaran", qty,
          by: ket || `${purpose} (Impor OUT)`, batch: String(item.batch ?? ""),
          date, tone: "out", supplier: "", priceExcl: 0, tax: 0, total: 0, purpose, pic,
          branch: moveBranch(`${purpose} ${ket}`),
        }, { action: "mengimpor GI", target: `${item.name} × ${qty}`, module: "Inventori" });
        ok++;
      }
      setImportReport([S.outOk.replace("{n}", String(ok)), ...fails]);
      toast(S.outDone.replace("{a}", String(ok)).replace("{b}", String(fails.length)));
    });
  };

  /* Impor CSV manual: parse koma, validasi SKU unik, laporan gagal per baris. */
  const handleImportFile = (file: File) => {
    void file.text().then(async (text) => {
      const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== "");
      if (lines.length === 0) { setImportReport([S.fileEmpty]); return; }
      const start = /^nama\s*,/i.test(lines[0]) ? 1 : 0;
      const skuSeen = new Set(inventory.map((i) => String(i.sku).toLowerCase()));
      const fails: string[] = [];
      let ok = 0;
      for (const [idx, line] of lines.slice(start).entries()) {
        const c = line.split(",").map((s) => s.trim());
        const rowNo = idx + start + 1;
        const nama = c[0] ?? "";
        const sku = c[1] ?? "";
        if (!nama || !sku) { fails.push(S.rowNameSku.replace("{a}", String(rowNo))); continue; }
        if (skuSeen.has(sku.toLowerCase())) { fails.push(S.rowSkuDupe.replace("{a}", String(rowNo)).replace("{b}", sku)); continue; }
        if ((c[4] ?? "") !== "" && (Number.isNaN(Number(c[4])) || Number(c[4]) < 0)) { fails.push(S.rowStock.replace("{a}", String(rowNo))); continue; }
        if ((c[5] ?? "") !== "" && (Number.isNaN(Number(c[5])) || Number(c[5]) < 0)) { fails.push(S.rowMin.replace("{a}", String(rowNo))); continue; }
        if ((c[7] ?? "") !== "" && (Number.isNaN(Number(c[7])) || Number(c[7]) < 0)) { fails.push(S.rowPrice.replace("{a}", String(rowNo))); continue; }
        if (!c[3]) { fails.push(S.rowWh.replace("{a}", String(rowNo))); continue; }
        skuSeen.add(sku.toLowerCase());
        await add("inventory", {
          name: nama, sku, category: c[2] || "Lainnya", warehouse: c[3],
          stock: Number(c[4]) || 0, minStock: Number(c[5]) || 0, unit: c[6] || "pcs",
          cost: Number(c[7]) || 0, rack: c[8] || "", bin: (c[9] ?? "").trim(), location: c[8] || "",
          volume: 0, batch: "", batches: [], reserved: [],
          uom2: "", konversi: 0, minStockByWarehouse: {}, photoUrl: "", avgCost: 0,
        }, { action: "mengimpor material", module: "Inventori" });
        ok++;
      }
      setImportReport([S.importOk.replace("{n}", String(ok)), ...fails]);
      toast(S.importDone.replace("{a}", String(ok)).replace("{b}", String(fails.length)));
    });
  };

  const saveOpname = async () => {
    if (!opTarget) { toast(S.pickItemFirst, "info"); return; }
    if (opCount === "" || Number.isNaN(Number(opCount)) || Number(opCount) < 0) { toast(S.opInvalid, "info"); return; }
    const selisih = Number(opCount) - Number(opTarget.stock);
    if (selisih === 0) { toast(S.opNoDiff, "info"); return; }
    const base = Math.max(5, Math.abs(Number(opTarget.stock)) * 0.2);
    if (Math.abs(selisih) > base) {
      const ok = window.confirm(S.opConfirmBig.replace("{a}", selisih > 0 ? "+" : "").replace("{b}", String(selisih)).replace("{n}", String(Number(opTarget.stock))));
      if (!ok) return;
    }
    try {
      await update("inventory", opTarget.id, { stock: Number(opCount) });
      await add("movements", {
        item: opTarget.name, itemId: opTarget.id, type: "Selisih Opname", qty: selisih,
        by: `Opname ${todayISO()}`, date: todayISO(), tone: selisih > 0 ? "in" : "out",
      }, { action: "stok opname", target: `${opTarget.name}: selisih ${selisih > 0 ? "+" : ""}${selisih}`, module: "Inventori" });
      log("stok opname", `${opTarget.name}: tercatat ${Number(opCount)}, selisih ${selisih > 0 ? "+" : ""}${selisih}`, "Inventori");
      toast(S.opSaved.replace("{a}", opTarget.name).replace("{b}", `${selisih > 0 ? "+" : ""}${selisih}`));
      setShowOpname(false);
      setOpItem("");
      setOpCount("");
    } catch {
      toast(S.opFailed.replace("{n}", opTarget.name), "info");
    }
  };

  const saveTransfer = async () => {
    if (!trTarget) { toast(S.pickItemFirst, "info"); return; }
    const qty = Number(trQty);
    if (!qty || qty <= 0) { toast(S.qtyGtZero, "info"); return; }
    if (qty > Number(trTarget.stock)) { toast(S.stockShort.replace("{n}", fmtJumlah(Number(trTarget.stock))), "info"); return; }
    if (!trDest) { toast(S.destRequired, "info"); return; }
    if (trDest === trTarget.warehouse) { toast(S.destSame, "info"); return; }
    const from = trTarget.warehouse;
    const srcStock = Number(trTarget.stock);
    try {
      if (qty < srcStock) {
        /* Split: kurangi sumber, buat baris gudang tujuan dengan SKU sama + sufiks gudang. */
        await update("inventory", trTarget.id, { stock: srcStock - qty });
        await add("inventory", {
          name: trTarget.name, sku: `${trTarget.sku}@${trDest}`, category: trTarget.category, warehouse: trDest,
          rack: "", bin: "", stock: qty, minStock: 0, unit: trTarget.unit,
          cost: trTarget.cost, location: "", volume: Number(trTarget.volume) || 0, batch: String(trTarget.batch ?? ""),
          uom2: String((trTarget as unknown as Record<string, unknown>).uom2 ?? ""), konversi: Number((trTarget as unknown as Record<string, unknown>).konversi) || 0,
          minStockByWarehouse: {}, photoUrl: String(trTarget.photoUrl ?? ""), avgCost: Number((trTarget as unknown as Record<string, unknown>).avgCost) || 0,
          batches: [], reserved: [],
        }, { action: "transfer gudang (split)", target: `${trTarget.name} × ${qty}: ${from} → ${trDest}`, module: "Inventori" });
      } else {
        await update("inventory", trTarget.id, { warehouse: trDest });
      }
      await add("movements", {
        item: trTarget.name, itemId: trTarget.id, type: "Transfer", qty,
        by: `${from} → ${trDest}`, date: todayISO(), tone: "in",
      }, { action: "transfer gudang", target: `${trTarget.name} × ${qty}: ${from} → ${trDest}`, module: "Inventori" });
      log("transfer gudang", `${trTarget.name} × ${qty}: ${from} → ${trDest}`, "Inventori");
      toast(S.transferDone.replace("{a}", trTarget.name).replace("{n}", String(qty)).replace("{b}", trDest));
      setShowTransfer(false);
      setTrItem("");
      setTrQty("");
      setTrDest("");
    } catch {
      toast(S.transferFailed.replace("{n}", trTarget.name), "info");
    }
  };

  const saveReservasi = async () => {
    if (!reservTarget) return;
    const fresh = inventory.find((i) => i.id === reservTarget.id) ?? reservTarget;
    if (!reservProject) { toast(S.projectFirst, "info"); return; }
    const qty = Number(reservQtyInput);
    if (!qty || qty <= 0) { toast(S.reservQtyReq, "info"); return; }
    if (qty > availOf(fresh)) { toast(S.overAvail.replace("{a}", fmtJumlah(availOf(fresh))).replace("{b}", fresh.unit), "info"); return; }
    const cur = reservedOf(fresh);
    const same = cur.find((r) => r.project === reservProject);
    const next = same
      ? cur.map((r) => (r.project === reservProject ? { project: r.project, qty: Number(r.qty) + qty } : r))
      : [...cur, { project: reservProject, qty }];
    await update("inventory", fresh.id, { reserved: next });
    log("reservasi stok", `${fresh.name} × ${qty} untuk ${reservProject}`, "Inventori");
    toast(S.reservSaved.replace("{a}", fresh.name).replace("{n}", String(qty)).replace("{b}", reservProject));
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

  const savePick = async () => {
    if (!pickProject) { toast(S.projectFirst, "info"); return; }
    if (pickSel.length === 0) { toast(S.pickCheckOne, "info"); return; }
    let ok = 0;
    let fail = 0;
    for (const id of pickSel) {
      const it = inventory.find((i) => i.id === id);
      if (!it) continue;
      const res = reservedOf(it).find((r) => r.project === pickProject);
      if (!res || Number(res.qty) <= 0) continue;
      const qty = Number(res.qty);
      if (qty > Number(it.stock)) continue;
      try {
        await update("inventory", it.id, {
          stock: Number(it.stock) - qty,
          reserved: reservedOf(it).filter((r) => r.project !== pickProject),
        });
        await add("movements", {
          item: it.name, itemId: it.id, type: "Pengeluaran", qty,
          by: `${pickProject} (Pick List)`, date: todayISO(), tone: "out",
          branch: moveBranch(String(pickProject)),
        }, { action: "pick list", target: `${it.name} × ${qty} (${pickProject})`, module: "Inventori" });
        ok++;
      } catch {
        fail++;
      }
    }
    if (ok === 0) { toast(S.pickNothing, "info"); return; }
    toast(S.pickDone.replace("{a}", pickProject).replace("{n}", String(ok)).replace("{b}", fail > 0 ? S.pickFailSuffix.replace("{n}", String(fail)) : ""));
    setShowPick(false);
    setPickSel([]);
  };

  return (
    <div>
      <PageHeader
        title={S.pageTitle}
        subtitle={S.pageSub}
        icon={<Warehouse className="h-5 w-5" />}
        actions={
          <div className="flex items-center gap-2">
            <button className="btn-secondary" onClick={openPick}><ListChecks className="h-4 w-4" /> Pick List</button>
            <button className="btn-primary-gradient" onClick={() => { setForm(emptyForm); setShowAdd(true); }}><Plus className="h-4 w-4" /> {S.btnNew}</button>
          </div>
        }
      />

      {modAlert.active && <AlertBannerView items={modAlert.items} onPick={pickNotif} />}

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label={S.kpiItems} value={String(inventory.length)} icon={<Package className="h-5 w-5" />} chip="navy" spark={itemTrend} hint={S.kpiItemsHint} />        <KpiCard label={S.kpiLow} value={String(lowStock.length)} delta={S.kpiLowDelta} deltaDirection="down" icon={<AlertTriangle className="h-5 w-5" />} chip="rose" spark={lowStockTrend} />
        <KpiCard label={S.kpiValue} value={fmtMiliar(totalValue)} hint={S.kpiValueHint} icon={<Package className="h-5 w-5" />} chip="teal" spark={stockValueTrend} />
        <KpiCard label={S.whLbl} value={S.whCount.replace("{n}", String(warehouses.length))} hint={warehouses.slice(0, 3).join(", ")} chip="violet" spark={warehouseTrend} />
      </div>

      <div className="card">
        <Tabs tabs={["Katalog", "Stok per Gudang", "BOM", "Pergerakan", "Tonase & Surat Jalan", "Analisis"]} active={tab} onChange={setTab} labels={{ Katalog: S.tabKatalog, "Stok per Gudang": S.tabWh, BOM: S.tabBom, Pergerakan: S.tabMoves, "Tonase & Surat Jalan": S.tabTonase, Analisis: S.tabAnalisis }} />
        <div className="p-4">
          {tab === "Katalog" && (
            <>
              <p className="mb-3 rounded-lg bg-steel-50 px-3 py-2 text-xs text-steel-500">{S.fifoInfo}</p>
              <div className="mb-3 flex flex-wrap gap-3">
                <div className="relative min-w-52 flex-1 sm:max-w-xs">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-steel-400" />
                  <input className="input pl-9 w-full" placeholder={S.searchPh} aria-label={S.searchAria} value={q} onChange={(e) => setQ(e.target.value)} />
                </div>
                <FilterPopover
                  activeCount={[cat !== "Semua", wh !== "Semua", abcF !== "Semua"].filter(Boolean).length}
                  initial={{ cat, wh, abc: abcF }}
                  onReset={() => { setCat("Semua"); setWh("Semua"); setAbcF("Semua"); }}
                  onApply={(d) => { setCat(d.cat); setWh(d.wh); setAbcF(d.abc); }}
                >
                  {(draft, setDraft) => (
                    <div className="space-y-3">
                      <Field label={S.whLbl}>
                        <select className="input w-full" value={draft.wh} onChange={(e) => setDraft({ ...draft, wh: e.target.value })} aria-label={S.whAria}>
                          {["Semua", ...warehouses].map((w) => <option key={w} value={w}>{w === "Semua" ? S.allWh : w}</option>)}
                        </select>
                      </Field>
                      <Field label={S.abcLbl}>
                        <select className="input w-full" value={draft.abc} onChange={(e) => setDraft({ ...draft, abc: e.target.value })} aria-label={S.abcAria}>
                          {["Semua", "A", "B", "C"].map((a) => <option key={a} value={a}>{a === "Semua" ? S.abcAll : S.kelasAbc.replace("{n}", a)}</option>)}
                        </select>
                      </Field>
                      <div>
                        <p className="mb-1.5 block text-xs font-medium text-steel-600">{S.catLbl}</p>
                        <div className="flex flex-wrap gap-1">
                          {["Semua", ...categories].map((c) => (
                            <button key={c} onClick={() => setDraft({ ...draft, cat: c })}
                              className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap ${draft.cat === c ? "bg-navy-700 text-white" : "border border-steel-200 text-steel-600 hover:bg-steel-100"}`}>
                              {c}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </FilterPopover>
                <button className="btn-secondary" onClick={() => setShowScan(true)} title={S.scanBtnTitle} aria-label={S.scanBtnAria}>
                  <Camera className="h-4 w-4" /> {S.scanBtn}
                </button>
              </div>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <select className="input w-auto py-1.5 text-xs" value={importMode} onChange={(e) => { setImportMode(e.target.value as "Katalog" | "IN" | "OUT"); setImportReport([]); }} aria-label={S.impModeAria}>
                  <option value="Katalog">{S.impKatalog}</option>
                  <option value="IN">{S.impIn}</option>
                  <option value="OUT">{S.impOut}</option>
                </select>
                {importMode === "Katalog" && (
                  <button className="btn-secondary text-xs" onClick={downloadTemplate}><Download className="h-3.5 w-3.5" /> {S.btnTpl}</button>
                )}
                {importMode === "IN" && (
                  <button className="btn-secondary text-xs" onClick={downloadTemplateIN}><Download className="h-3.5 w-3.5" /> {S.btnTplIn}</button>
                )}
                {importMode === "OUT" && (
                  <button className="btn-secondary text-xs" onClick={downloadTemplateOUT}><Download className="h-3.5 w-3.5" /> {S.btnTplOut}</button>
                )}
                <label className="btn-secondary cursor-pointer text-xs">
                  <Upload className="h-3.5 w-3.5" /> {S.btnImport}
                  <input type="file" accept=".csv" className="hidden" aria-label={importMode === "Katalog" ? S.impAriaKatalog : importMode === "IN" ? S.impAriaIn : S.impAriaOut}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) { if (importMode === "IN") handleImportINFile(f); else if (importMode === "OUT") handleImportOUTFile(f); else handleImportFile(f); } e.target.value = ""; }} />
                </label>
                <span className="text-xs text-steel-400">
                  {importMode === "Katalog" && S.hintCols}
                  {importMode === "IN" && S.hintColsIn}
                  {importMode === "OUT" && S.hintColsOut}
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
                    <tr><SortTh label={S.thMaterial} sortKey="material" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.catLbl} sortKey="kategori" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.thQty} sortKey="qty" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.thVolume} sortKey="volume" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.thTotal} sortKey="total" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.thAbc} sortKey="abc" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.thStatus} sortKey="status" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.thRak} sortKey="rak" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.binLbl} sortKey="bin" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><th className="th">{S.thAksi}</th></tr>
                  </thead>
                  <tbody className="divide-y divide-steel-100">
                    {pager.slice(sorted).map((i) => {
                      const low = i.stock <= i.minStock;
                      const reserved = reservedQty(i);
                      const conv = convOf(i);
                      const u2 = uom2Of(i);
                      return (
                        <tr key={i.id} id={notifRowId(String(i.id))} className={flash.flashId === String(i.id) ? "notif-hl notif-flash hover:bg-surface" : "notif-hl hover:bg-surface"}>
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
                          <td className="td text-steel-600 font-mono text-xs truncate" title={binOf(i) || "-"}>{binOf(i) || "-"}</td>
                          <td className="td">
                            <div className="flex gap-1">
                              <button className="rounded-lg p-1.5 text-steel-500 hover:bg-steel-100" title={S.actDetail} aria-label={S.actDetailAria.replace("{n}", i.name)} onClick={() => setDetail(i)}><Eye className="h-4 w-4" /></button>
                              <button className="rounded-lg p-1.5 text-steel-500 hover:bg-steel-100" title={S.actEdit} aria-label={S.actEditAria.replace("{n}", i.name)} onClick={() => openEdit(i)}><Pencil className="h-4 w-4" /></button>
                              <button className="rounded-lg p-1.5 text-emerald-600 hover:bg-emerald-50" title={S.actGrgi} aria-label={S.actGrgiAria.replace("{n}", i.name)} onClick={() => openMove(i, moveKind)}><ArrowDownToLine className="h-4 w-4" /></button>
                              <button className="rounded-lg p-1.5 text-steel-500 hover:bg-steel-100" title={S.actLabel} aria-label={S.actLabelAria.replace("{n}", i.name)} onClick={() => setLabelItem(i)}><Barcode className="h-4 w-4" /></button>
                              <button className="rounded-lg p-1.5 text-amber-600 hover:bg-amber-50" title={S.reservBtn} aria-label={S.actReservAria.replace("{n}", i.name)} onClick={() => { setReservTarget(i); setReservProject(""); setReservQtyInput(""); }}><BookmarkPlus className="h-4 w-4" /></button>
                              <Link to={`/inventori/bom/${i.id}`} className="rounded-lg p-1.5 text-ocean-600 hover:bg-steel-100" title="BOM" aria-label={S.actBomAria.replace("{n}", i.name)}>BOM</Link>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {list.length === 0 && <EmptyState title={S.emptyNoMatchT} subtitle={S.emptyNoMatchS} />}
                {pager.bar}
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
                    <div className="mt-3 max-h-44 space-y-1.5 overflow-y-auto pr-1">
                      {items.map((i) => {
                        const whMin = minWhOf(i, w);
                        const thin = Number(i.stock) <= whMin;
                        return (
                          <div key={i.id} className="flex items-center justify-between gap-2 text-sm">
                            <span className="text-steel-600 truncate" title={`${String(i.name)} · rak ${rackText(i)} · bin ${binOf(i) || "-"} · min gudang ${fmtJumlah(whMin)}`}>{i.name}{binOf(i) ? <span className="font-mono text-xs text-steel-400"> · {binOf(i)}</span> : null}</span>
                            <span className="flex shrink-0 items-center gap-1.5 font-medium">
                              {thin && <Badge tone="red">Menipis</Badge>}
                              {fmtJumlah(Number(i.stock))}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    {items.length > 5 && (
                      <p className="mt-2 text-[11px] text-steel-400">Menampilkan 5 dari {items.length} - scroll untuk sisanya</p>
                    )}
                  </Card>
                );
              })}
            </div>
          )}

          {tab === "BOM" && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-xs font-medium text-steel-600" htmlFor="bom-project">Proyek</label>
                <select id="bom-project" className="input w-auto py-1.5 text-xs" value={bomProject} onChange={(e) => setBomProject(e.target.value)} aria-label="Filter BOM per proyek">
                  <option value="Semua proyek">Semua proyek</option>
                  {activeProjects.map((p) => <option key={p.id} value={p.id}>{p.id} - {p.vessel}</option>)}
                </select>
                {bomProject !== "Semua proyek" && (
                  <p className="text-xs text-steel-500">Kebutuhan BOM bersifat generik (global) - tabel forecast difilter ke {bomProject}.</p>
                )}
              </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <Card className="p-5 lg:col-span-2">
                <CardHeader title={S.bomCardT} subtitle={S.bomCardS} />
                <div className="mt-3 max-h-56 space-y-2 overflow-y-auto pr-1">
                  {bomRows.map((b) => {
                    const kurang = Math.max(0, b.need - b.stock);
                    return (
                      <div key={b.key} className="flex items-center justify-between gap-3 border-b border-steel-100 py-2 text-sm">
                        <div className="min-w-0">
                          <p className="text-steel-700 truncate" title={b.item ? `${b.key} → ${b.item.name}` : b.key}>{b.key}</p>
                          <p className="text-xs text-steel-400 truncate" title={b.item ? String(b.item.name) : "Belum ada item cocok"}>
                            {b.item ? b.item.name : "Belum ada item cocok"}
                          </p>
                          {b.item && <Link to={`/inventori/bom/${b.item.id}`} className="text-xs font-semibold text-ocean-600 hover:underline">{S.openBom}</Link>}
                          {!b.ok && b.item && (
                            <button className="btn-secondary mt-1.5 text-xs" onClick={() => buatPRDraft(b.item!.name, kurang, kurang * Number(b.item!.cost || 0))}>
                              {S.btnPrDraft.replace("{a}", fmtJumlah(kurang)).replace("{b}", b.unit)}
                            </button>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-medium text-navy-900">Butuh {fmtJumlah(b.need)} {b.unit} · Stok {fmtJumlah(b.stock)}</p>
                          <p className="mt-0.5 flex items-center justify-end gap-2 text-xs text-steel-500">
                            {b.item ? fmtRupiah(b.need * Number(b.item.cost || 0)) : "-"}
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
                {bomRows.length > 3 && (
                  <p className="mt-2 text-[11px] text-steel-400">Menampilkan 3 dari {bomRows.length} - scroll untuk sisanya{bomProject !== "Semua proyek" ? " · kebutuhan global, tidak difilter proyek" : ""}</p>
                )}
              </Card>
              <Card className="p-5">
                <CardHeader title={S.aksiMatT} subtitle={S.aksiMatS} />
                <div className="mt-4 space-y-3">
                  <button className="btn-primary w-full justify-center whitespace-nowrap py-5 text-base" onClick={() => { const first = lowStock[0] ?? inventory[0]; if (first) openMove(first, "in"); }}><ArrowDownToLine className="h-4 w-4" /> {S.btnGr}</button>
                  <button className="btn-secondary w-full justify-center" onClick={() => { const first = inventory[0]; if (first) openMove(first, "out"); }}><ArrowUpFromLine className="h-4 w-4" /> {S.btnGi}</button>
                  <button className="btn-secondary w-full justify-center" onClick={() => setShowTransfer(true)}><Repeat className="h-4 w-4" /> {S.btnTransfer}</button>
                  <button className="btn-secondary w-full justify-center" onClick={() => setShowOpname(true)}><ClipboardCheck className="h-4 w-4" /> {S.opnameT}</button>
                </div>
              </Card>
              <Card className="p-5 lg:col-span-3">
                <CardHeader title={S.fcT} subtitle={S.fcS} />
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-surface sticky top-0 z-10">
                      <tr><SortTh label={S.thProyek} sortKey="proyek" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} /><SortTh label={S.thNeed} sortKey="kebutuhan" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} /><SortTh label={S.stockLbl} sortKey="stok" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} /><SortTh label={S.thNet} sortKey="bersih" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} /><th className="th">{S.thAksi}</th></tr>
                    </thead>
                    <tbody className="divide-y divide-steel-100">
                      {sortRows(forecastRows.filter((f) => bomProject === "Semua proyek" || f.project === bomProject), sort2, (f, k) => {
                        if (k === "kebutuhan") return Number(f.need || 0);
                        if (k === "stok") return Number(f.stock || 0);
                        if (k === "bersih") return Number(f.net || 0);
                        if (k === "proyek") return String(`${f.project ?? ""} ${f.vessel ?? ""}`);
                        return String(f.key ?? "");
                      }).map((f) => (
                        <tr key={`${f.project}-${f.key}`} className="hover:bg-surface">
                          <td className="td font-medium text-navy-900 truncate" title={`${f.project} - ${f.vessel}`}>{f.project} · {f.vessel}</td>
                          <td className="td text-steel-600 truncate" title={f.item ? String(f.item.name) : f.key}>{f.key} · butuh {fmtJumlah(f.need)} {f.unit}</td>
                          <td className="td text-steel-600">{fmtJumlah(f.stock)}</td>
                          <td className="td font-semibold text-navy-900">{fmtJumlah(f.net)} {f.unit}</td>
                          <td className="td">
                            {f.net > 0 && f.item
                              ? <button className="btn-secondary text-xs" onClick={() => buatPRDraft(f.item!.name, f.net, f.net * Number(f.item!.cost || 0))}>{S.btnBuatPr}</button>
                              : <span className="text-xs text-steel-400">-</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {forecastRows.filter((f) => bomProject === "Semua proyek" || f.project === bomProject).length === 0 && <EmptyState title={S.emptyNoProjT} subtitle={S.emptyNoProjS} />}
                </div>
              </Card>
            </div>
            </div>
          )}

          {tab === "Pergerakan" && (
            <div className="space-y-4">
              <Card>
                <CardHeader title={S.trendT} subtitle={S.trendS} />
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
                    <tr><SortTh label={S.thTx} sortKey="transaksi" sort={sort3} onSort={(k) => setSort3((s) => toggleSort(s, k))} /><SortTh label={S.itemLbl} sortKey="item" sort={sort3} onSort={(k) => setSort3((s) => toggleSort(s, k))} /><SortTh label={S.thType} sortKey="tipe" sort={sort3} onSort={(k) => setSort3((s) => toggleSort(s, k))} /><SortTh label={S.jumlahLbl} sortKey="jumlah" sort={sort3} onSort={(k) => setSort3((s) => toggleSort(s, k))} /><SortTh label={S.thRef} sortKey="referensi" sort={sort3} onSort={(k) => setSort3((s) => toggleSort(s, k))} /><SortTh label={S.thInfo} sortKey="info" sort={sort3} onSort={(k) => setSort3((s) => toggleSort(s, k))} /><SortTh label={S.thTotalCol} sortKey="total" sort={sort3} onSort={(k) => setSort3((s) => toggleSort(s, k))} /><SortTh label={S.dateLbl} sortKey="tanggal" sort={sort3} onSort={(k) => setSort3((s) => toggleSort(s, k))} /></tr>
                  </thead>
                  <tbody className="divide-y divide-steel-100">
                    {movPager.slice(movSorted).map((m) => (
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
                          {!m.supplier && !m.purpose && !m.pic ? "-" : null}
                        </td>
                        <td className="td text-xs font-semibold">{Number(m.total) ? fmtRupiah(Number(m.total)) : "-"}</td>
                        <td className="td text-steel-600">{fmtTanggal(m.date)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {movPager.bar}
              </div>
            </div>
          )}

          {tab === "Tonase & Surat Jalan" && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card className="p-5">
                <CardHeader title={S.tonT} subtitle={S.tonS} />
                <div className="mt-3 space-y-3">
                  <FormGrid>
                    <Field label={S.tonP} hint={S.tonPHint}><NumInput min={0} className="input" value={tonP} onChange={(e) => setTonP(e.target.value)} /></Field>
                    <Field label={S.tonL} hint={S.tonLHint}><NumInput min={0} className="input" value={tonL} onChange={(e) => setTonL(e.target.value)} /></Field>
                    <Field label={S.thickLbl}><NumInput min={0} className="input" value={tonT} onChange={(e) => setTonT(e.target.value)} /></Field>
                    <Field label={S.sheetsLbl}><NumInput min={1} className="input" value={tonPcs} onChange={(e) => setTonPcs(e.target.value)} /></Field>
                  </FormGrid>
                  <p className="rounded-lg bg-surface px-3 py-2 text-sm font-semibold text-navy-900">
                    Berat: {fmtJumlah(sbTonasePlat(Number(tonP) || 0, Number(tonL) || 0, Number(tonT) || 0, Number(tonPcs) || 0))} kg
                  </p>
                  <button className="btn-secondary w-full justify-center text-xs" onClick={async () => {
                    const kg = sbTonasePlat(Number(tonP) || 0, Number(tonL) || 0, Number(tonT) || 0, Number(tonPcs) || 0);
                    if (kg <= 0) { toast(S.dimsInvalid, "info"); return; }
                    await add("inventory", {
                      name: `Plat ${tonT}mm ${tonP}x${tonL}`, category: "Baja", sku: `PLAT-${tonT}-${tonP}X${tonL}-${Date.now().toString(36).toUpperCase()}`,
                      warehouse: "Gudang Baja A", rack: "", bin: "", stock: Number(tonPcs) || 0, minStock: 0, unit: "lbr",
                      cost: 0, location: "", volume: kg, batch: "", uom2: "kg", konversi: kg / Math.max(1, Number(tonPcs) || 1),
                      minStockByWarehouse: {}, photoUrl: "", avgCost: 0, batches: [], reserved: [],
                    }, { action: "mendaftarkan plat dari kalkulator tonase", module: "Inventori" });
                    toast(S.plateAdded.replace("{a}", tonT).replace("{b}", String(kg)));
                  }}>
                    {S.btnToCatalog}
                  </button>
                </div>
              </Card>
              <Card className="p-5">
                <CardHeader title={S.sjT} subtitle={S.sjS} />
                <div className="mt-3 space-y-3">
                  <FormGrid>
                    <Field label={S.dateLbl}><input type="date" className="input" value={sjDate} onChange={(e) => setSjDate(e.target.value)} /></Field>
                    <Field label={S.fDest}><input className="input" value={sjTo} onChange={(e) => setSjTo(e.target.value)} placeholder={S.phDest} /></Field>
                    <Field label={S.vehicleLbl}><input className="input" value={sjVehicle} onChange={(e) => setSjVehicle(e.target.value)} /></Field>
                    <Field label={S.plateLbl}><input className="input font-mono" value={sjPlate} onChange={(e) => setSjPlate(e.target.value)} /></Field>
                    <Field label={S.driverLbl}><input className="input" value={sjDriver} onChange={(e) => setSjDriver(e.target.value)} /></Field>
                    <Field label={S.refNoLbl}><input className="input font-mono" value={sbSjNumber(nextSjSeq(), sjYearOf(sjDate))} readOnly /></Field>
                  </FormGrid>
                  {sjItems.map((it, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2">
                      <input className="input col-span-8" placeholder={S.itemPh.replace("{n}", String(idx + 1))} value={it.name} onChange={(e) => setSjItems((s) => s.map((x, i) => (i === idx ? { ...x, name: e.target.value } : x)))} />
                      <input className="input col-span-3" placeholder={S.jumlahLbl} value={it.qty} onChange={(e) => setSjItems((s) => s.map((x, i) => (i === idx ? { ...x, qty: e.target.value } : x)))} />
                      <button className="btn-secondary col-span-1 text-xs" aria-label={S.delSjRow.replace("{n}", String(idx + 1))} onClick={() => setSjItems((s) => s.filter((_, i) => i !== idx))}>×</button>
                    </div>
                  ))}
                  <button className="btn-secondary text-xs" onClick={() => setSjItems((s) => [...s, { name: "", qty: "" }])}>{S.addRow}</button>
                  <FormGrid>
                    <Field label={S.receiverLbl}><input className="input" value={sjReceiver} onChange={(e) => setSjReceiver(e.target.value)} /></Field>
                    <Field label={S.giverLbl}><input className="input" value={sjGiver} onChange={(e) => setSjGiver(e.target.value)} /></Field>
                  </FormGrid>
                  <button className="btn-primary w-full justify-center" onClick={async () => {
                    const items = sjItems.filter((x) => x.name.trim() && x.qty.trim());
                    if (!sjTo.trim() || items.length === 0) { toast(S.sjNeedDest, "info"); return; }
                    const seq = nextSjSeq();
                    const no = sbSjNumber(seq, sjYearOf(sjDate));
                    await add("documents", {
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
                    toast(S.sjIssued.replace("{n}", no));
                    setSjTo(""); setSjVehicle(""); setSjPlate(""); setSjDriver("");
                    setSjItems([{ name: "", qty: "" }]); setSjReceiver(""); setSjGiver("");
                  }}>
                    {S.issueBtn}
                  </button>
                </div>
              </Card>
              <Card className="p-5">
                <CardHeader title={S.ttT} subtitle={S.ttS} />
                <div className="mt-3 space-y-3">
                  <FormGrid>
                    <Field label={S.dateLbl}><input type="date" className="input" value={ttDate} onChange={(e) => setTtDate(e.target.value)} /></Field>
                    <Field label={S.linkedSjLbl}><select className="input" value={ttSjId} onChange={(e) => setTtSjId(e.target.value)}>
                      <option value="">{S.noSj}</option>
                      {sjDocs.map((d) => <option key={String(d.id)} value={String(d.id)}>{String(d.sbRef || d.id)} · {String(d.title)}</option>)}
                    </select></Field>
                    <Field label={S.refNoLbl}><input className="input font-mono" value={sbTtNumber(nextTtSeq(), sjYearOf(ttDate))} readOnly /></Field>
                  </FormGrid>
                  {ttItems.map((it, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2">
                      <input className="input col-span-8" placeholder={S.itemPh.replace("{n}", String(idx + 1))} value={it.name} onChange={(e) => setTtItems((s) => s.map((x, i) => (i === idx ? { ...x, name: e.target.value } : x)))} />
                      <input className="input col-span-3" placeholder={S.jumlahLbl} value={it.qty} onChange={(e) => setTtItems((s) => s.map((x, i) => (i === idx ? { ...x, qty: e.target.value } : x)))} />
                      <button className="btn-secondary col-span-1 text-xs" aria-label={S.delTtRow.replace("{n}", String(idx + 1))} onClick={() => setTtItems((s) => s.filter((_, i) => i !== idx))}>×</button>
                    </div>
                  ))}
                  <button className="btn-secondary text-xs" onClick={() => setTtItems((s) => [...s, { name: "", qty: "" }])}>{S.addRow}</button>
                  <FormGrid>
                    <Field label={S.receiverLbl}><input className="input" value={ttReceiver} onChange={(e) => setTtReceiver(e.target.value)} /></Field>
                    <Field label={S.giverLbl}><input className="input" value={ttGiver} onChange={(e) => setTtGiver(e.target.value)} /></Field>
                  </FormGrid>
                  <button className="btn-primary w-full justify-center" onClick={async () => {
                    const items = ttItems.filter((x) => x.name.trim() && x.qty.trim());
                    if (items.length === 0) { toast(S.needOneItem, "info"); return; }
                    const seq = nextTtSeq();
                    const no = sbTtNumber(seq, sjYearOf(ttDate));
                    const sj = sjDocs.find((d) => String(d.id) === ttSjId);
                    await add("documents", {
                      id: `TT-SMD-${sjYearOf(ttDate)}-${String(seq).padStart(3, "0")}`,
                      title: `Tanda Terima ${sj ? `(${String(sj.sbRef || sj.id)})` : ""}`.trim() || "Tanda Terima",
                      type: "Tanda Terima", project: "-", vessel: "-",
                      owner: ttGiver.trim() || "Anda", sbRef: no,
                      ttDate, ttSjId: ttSjId || "", ttItems: items,
                      ttReceiver: ttReceiver.trim(), ttGiver: ttGiver.trim(),
                      version: "v1.0", status: "Berlaku", updated: todayISO(), archived: false, docCopy: "Terkendali",
                      related: ttSjId ? [ttSjId] : [],
                      revisions: [{ version: "v1.0", at: todayISO(), by: ttGiver.trim() || "Anda", note: "Tanda terima diterbitkan" }],
                    }, { action: "menerbitkan tanda terima", target: no, module: "Inventori" });
                    void exportExcel([
                      [SB_KOP.line1, SB_KOP.name], [SB_KOP.hq, `HP ${SB_KOP.hp}`], [],
                      ["TANDA TERIMA", `NO REF: ${no}`], ["Tanggal", ttDate],
                      ["Surat Jalan", sj ? String(sj.sbRef || sj.id) : "-"], [],
                      ["No", "Nama Barang", "Jumlah"], ...items.map((x, i) => [i + 1, x.name.trim(), x.qty.trim()]), [],
                      ["Yang Menerima", "Yang Menyerahkan"], [ttReceiver.trim(), ttGiver.trim()],
                    ], `TT-${no.replaceAll("/", "-")}`, "Tanda Terima");
                    toast(S.ttIssued.replace("{n}", no));
                    setTtDate(todayISO()); setTtSjId("");
                    setTtItems([{ name: "", qty: "" }]); setTtReceiver(""); setTtGiver("");
                  }}>
                    {S.issueBtn}
                  </button>
                </div>
              </Card>
            </div>
          )}

          {tab === "Analisis" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Card className="p-5">
                  <CardHeader title={S.slowT} subtitle={S.slowS} />
                  <div className="mt-2 space-y-2">
                    {slowItems.length === 0 && <p className="py-4 text-center text-sm text-steel-400">{S.slowEmpty}</p>}
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
                  <CardHeader title={S.deadT} subtitle={S.deadS} />
                  <div className="mt-2 space-y-2">
                    {deadItems.length === 0 && <p className="py-4 text-center text-sm text-steel-400">{S.deadEmpty}</p>}
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
                <CardHeader title={S.agingT} subtitle={S.agingS} />
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
                      <Badge tone={r.bucket === "0-30 hari" ? "green" : r.bucket === "31-90 hari" ? "blue" : r.bucket === "91-180 hari" ? "amber" : "red"}>{r.bucket}</Badge>
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
        title={editing ? S.editTitle.replace("{n}", editing.id) : S.btnNew} subtitle={S.modalSavedSub}
        wide footer={<><button className="btn-secondary" onClick={() => { setShowAdd(false); setEditing(null); }}>{S.cancelBtn}</button><button className="btn-primary" onClick={save}>{S.saveBtn}</button></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label={S.nameLbl}><input className="input" value={form.name} onChange={(e) => setF("name", e.target.value)} placeholder={S.phName} /></Field>
            <Field label={S.skuLbl}><input className="input font-mono" value={form.sku} onChange={(e) => setF("sku", e.target.value)} placeholder={S.phSku} /></Field>
            <Field label={S.catLbl}>
              <select className="input" value={form.category} onChange={(e) => setF("category", e.target.value)}>
                {["Baja", "Mesin", "Pipa", "Listrik", "Cat", "Fastener", "Rigging", "Perlindungan", "Lainnya"].map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label={S.whLbl}>
              <select className="input" value={form.warehouse} onChange={(e) => setF("warehouse", e.target.value)}>
                {["Gudang Baja A", "Gudang Mesin", "Gudang Pipa", "Gudang Listrik", "Gudang B", "Gudang Rig"].map((w) => <option key={w}>{w}</option>)}
              </select>
            </Field>
            {editing ? (
              <Field label={S.stockNowLbl} hint={S.hintStockNow}>
                <input className="input bg-steel-50" value={fmtJumlah(Number(editing.stock))} disabled readOnly />
              </Field>
            ) : (
              <Field label={S.stock0Lbl}><NumInput min={0} className="input" value={form.stock} onChange={(e) => setF("stock", e.target.value)} /></Field>
            )}
            <Field label={S.minLbl}><NumInput min={0} className="input" value={form.minStock} onChange={(e) => setF("minStock", e.target.value)} /></Field>
            <Field label={S.unitLbl}>
              <select className="input" value={form.unit} onChange={(e) => setF("unit", e.target.value)}>
                {["pcs", "kg", "liter", "meter", "batang", "unit", "roll"].map((u) => <option key={u}>{u}</option>)}
              </select>
            </Field>
            <Field label={S.costLbl}><NumInput min={0} className="input" value={form.cost} onChange={(e) => setF("cost", e.target.value)} /></Field>
            <Field label={S.volLbl} hint={S.hintVol}><NumInput min={0} className="input" value={form.volume} onChange={(e) => setF("volume", e.target.value)} /></Field>
            <Field label={S.batchLbl} hint={form.category === "Mesin" ? S.hintBatchMesin : S.hintBatchOpt}>
              <input className="input font-mono" value={form.batch} onChange={(e) => setF("batch", e.target.value)} placeholder={S.phBatch} />
            </Field>
            <Field label={S.uom2Lbl} hint={S.hintUom2}>
              <input className="input" value={form.uom2} onChange={(e) => setF("uom2", e.target.value)} placeholder={S.phUom2} />
            </Field>
            <Field label={S.convLbl} hint={S.convHint.replace("{n}", form.unit || S.unitFallback)}>
              <NumInput min={0} className="input" value={form.konversi} onChange={(e) => setF("konversi", e.target.value)} placeholder={S.phConv} />
            </Field>
            <Field label={S.minWhLbl} hint={S.hintMinWh}>
              <NumInput min={0} className="input" value={form.minWh} onChange={(e) => setF("minWh", e.target.value)} placeholder={S.phMinWh} />
            </Field>
            <Field label={S.photoLbl} hint={S.hintPhoto}>
              <div className="flex items-center gap-2">
                <Camera className="h-4 w-4 shrink-0 text-steel-400" />
                <input className="input font-mono" value={form.photoUrl} onChange={(e) => setF("photoUrl", e.target.value)} placeholder="https://…" />
                <input ref={photoInputRef} type="file" accept=".png,.jpg,.jpeg,.pdf,.xlsx,.csv" className="hidden" aria-label={S.photoAria}
                  onChange={(e) => { void onPhotoFile(e.target.files?.[0]); }} />
                <button type="button" className="btn-secondary shrink-0 text-xs" disabled={uploadingPhoto}
                  title={isBackendConfigured() ? S.uploadTitle : S.localPhotoUrl}
                  onClick={() => {
                    if (!isBackendConfigured()) { toast(S.localPhotoUrl, "info"); return; }
                    photoInputRef.current?.click();
                  }}>
                  <Upload className="h-4 w-4" /> {uploadingPhoto ? S.uploading : "Upload"}
                </button>
              </div>
            </Field>
          </FormGrid>
          <FormGrid>
            <Field label={S.rackLbl} hint={S.hintRack}><input className="input font-mono" value={form.rack} onChange={(e) => setF("rack", e.target.value)} placeholder={S.phRack} /></Field>
            <Field label={S.binLbl} hint={S.hintBin}><input className="input font-mono" value={form.bin} onChange={(e) => setF("bin", e.target.value)} placeholder={S.phBin} /></Field>
          </FormGrid>
        </div>
      </Modal>

      {/* Modal GR/GI */}
      <Modal open={moveTarget !== null} onClose={closeMove} title={(moveKind === "in" ? S.moveTitleIn : S.moveTitleOut).replace("{n}", moveTarget?.name ?? "")}
        subtitle={moveFresh ? S.moveSub.replace("{a}", fmtJumlah(Number(moveFresh.stock))).replace("{b}", `${fmtJumlah(availOf(moveFresh))} ${moveFresh.unit}${hasUom2(moveFresh) ? ` (≈ ${fmtJumlah(qtyInUom2(moveFresh))} ${uom2Of(moveFresh)})` : ""}`) : ""}
        footer={<><button className="btn-secondary" onClick={closeMove}>{S.cancelBtn}</button><button className="btn-primary" onClick={saveMove}>{S.btnSaveTx}</button></>}>
        <div className="space-y-3">
          <Field label={S.txTypeLbl}>
            <div className="flex gap-2">
              {(["in", "out"] as const).map((k) => (
                <button key={k} onClick={() => setMoveKind(k)}
                  className={`flex-1 rounded-xl border px-3 py-2 text-sm font-medium ${moveKind === k ? "border-navy-700 bg-navy-700 text-white" : "border-steel-200 text-steel-600"}`}>
                  {k === "in" ? S.txIn : S.txOut}
                </button>
              ))}
            </div>
          </Field>
          {moveKind === "out" && moveBatches.length > 0 && (
            <div className="rounded-lg bg-steel-50 px-3 py-2 text-xs text-steel-600">
              <p className="font-semibold text-navy-900">{S.fifoTitle}</p>
              {moveBatches.map((b) => <p key={`${b.batch}-${b.date}`} className="font-mono">{b.batch} · {fmtJumlah(Number(b.qty))} · {fmtTanggal(b.date)}</p>)}
            </div>
          )}
          <FormGrid>
            <Field label={S.jumlahLbl}><NumInput min={1} className="input" value={moveQty} onChange={(e) => setMoveQty(e.target.value)} /></Field>
            {moveFresh && hasUom2(moveFresh) ? (
              <Field label={S.inputUnitLbl} hint={S.inputUnitHint.replace("{a}", moveFresh.unit).replace("{b}", `${fmtJumlah(convOf(moveFresh))} ${uom2Of(moveFresh)}`)}>
                <select className="input" value={moveUom} onChange={(e) => setMoveUom(e.target.value)} aria-label={S.inputUnitAria}>
                  <option value="base">{S.optBase.replace("{n}", moveFresh.unit)}</option>
                  <option value="uom2">{S.optUom2.replace("{n}", uom2Of(moveFresh))}</option>
                </select>
              </Field>
            ) : (
              <Field label={S.refLbl} hint={S.hintRef}>
                <input className="input font-mono" value={moveRef} onChange={(e) => setMoveRef(e.target.value)} />
              </Field>
            )}
          </FormGrid>
          {moveFresh && hasUom2(moveFresh) && (
            <Field label={S.refLbl} hint={S.hintRef}>
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
              <Field label={S.priceExLbl} hint={S.hintPriceEx}>
                <NumInput min={0} className="input" value={movePrice} onChange={(e) => setMovePrice(e.target.value)} placeholder={S.phPrice} />
              </Field>
              <Field label={S.taxLbl} hint={S.hintTax}>
                <NumInput min={0} className="input" value={moveTax} onChange={(e) => setMoveTax(e.target.value)} placeholder="0" />
              </Field>
            </FormGrid>
          )}
          {moveKind === "in" && (
            <Field label={S.supplierLbl} hint={S.hintSupplier}>
              <input className="input" value={moveSupplier} onChange={(e) => setMoveSupplier(e.target.value)} placeholder={S.phSupplier} />
            </Field>
          )}
          <FormGrid>
            <Field label={S.purposeLbl} hint={S.hintPurpose}>
              <input className="input" value={movePurpose} onChange={(e) => setMovePurpose(e.target.value)} placeholder={S.phPurpose} />
            </Field>
            <Field label={S.picLbl} hint={S.hintPic}>
              <input className="input" value={movePic} onChange={(e) => setMovePic(e.target.value)} placeholder={S.phPic} />
            </Field>
          </FormGrid>
          <Field label={S.batchLbl} hint={S.hintMoveBatch}>
            <input className="input font-mono" value={moveBatch} onChange={(e) => setMoveBatch(e.target.value)} placeholder={S.phBatch} />
          </Field>
        </div>
      </Modal>

      {/* Modal opname */}
      <Modal open={showOpname} onClose={() => setShowOpname(false)} title={S.opnameT} subtitle={S.opSub}
        footer={<><button className="btn-secondary" onClick={() => setShowOpname(false)}>{S.cancelBtn}</button><button className="btn-primary" onClick={saveOpname}>{S.btnSaveOp}</button></>}>
        <div className="space-y-3">
          <Field label={S.itemLbl}>
            <select className="input" value={opItem} onChange={(e) => setOpItem(e.target.value)}>
              <option value="">{S.pickItem}</option>
              {inventory.map((i) => <option key={i.id} value={i.id}>{i.name} · stok {fmtJumlah(Number(i.stock))} {i.unit}</option>)}
            </select>
          </Field>
          <Field label={S.countedLbl} hint={opTarget ? S.recordedHint.replace("{a}", fmtJumlah(Number(opTarget.stock))).replace("{b}", opTarget.unit) : undefined}>
            <NumInput min={0} className="input" value={opCount} onChange={(e) => setOpCount(e.target.value)} />
          </Field>
          {opSelisih !== null && opSelisih !== 0 && (
            <p className="rounded-lg bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700">
              {S.diffNote.replace("{a}", opSelisih > 0 ? "+" : "").replace("{b}", fmtJumlah(opSelisih))}
            </p>
          )}
        </div>
      </Modal>

      {/* Modal transfer gudang */}
      <Modal open={showTransfer} onClose={() => setShowTransfer(false)} title={S.btnTransfer} subtitle={S.trSub}
        footer={<><button className="btn-secondary" onClick={() => setShowTransfer(false)}>{S.cancelBtn}</button><button className="btn-primary" onClick={saveTransfer}>{S.btnSaveTr}</button></>}>
        <div className="space-y-3">
          <Field label={S.itemLbl}>
            <select className="input" value={trItem} onChange={(e) => setTrItem(e.target.value)}>
              <option value="">{S.pickItem}</option>
              {inventory.map((i) => <option key={i.id} value={i.id}>{i.name} · {i.warehouse}</option>)}
            </select>
          </Field>
          <FormGrid>
            <Field label={S.qtyTrLbl} hint={trTarget ? S.availHint.replace("{a}", fmtJumlah(Number(trTarget.stock))).replace("{b}", trTarget.unit) : undefined}>
              <NumInput min={1} className="input" value={trQty} onChange={(e) => setTrQty(e.target.value)} />
            </Field>
            <Field label={S.destLbl}>
              <select className="input" value={trDest} onChange={(e) => setTrDest(e.target.value)}>
                <option value="">{S.pickWh}</option>
                {warehouses.map((w) => <option key={w}>{w}</option>)}
              </select>
            </Field>
          </FormGrid>
        </div>
      </Modal>

      {/* Modal reservasi */}
      <Modal open={reservTarget !== null} onClose={() => setReservTarget(null)} title={S.reservTitle.replace("{n}", reservTarget?.name ?? "")}
        subtitle={reservTarget ? S.tersediaSub.replace("{a}", fmtJumlah(availOf(inventory.find((i) => i.id === reservTarget.id) ?? reservTarget))).replace("{b}", reservTarget.unit) : ""}
        footer={<><button className="btn-secondary" onClick={() => setReservTarget(null)}>{S.cancelBtn}</button><button className="btn-primary" onClick={saveReservasi}>{S.btnSaveReserv}</button></>}>
        <div className="space-y-3">
          <Field label={S.proyekLbl}>
            <select className="input" value={reservProject} onChange={(e) => setReservProject(e.target.value)}>
              <option value="">{S.pickProject}</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.id} - {p.vessel}</option>)}
            </select>
          </Field>
          <Field label={S.reservQtyLbl}><NumInput min={1} className="input" value={reservQtyInput} onChange={(e) => setReservQtyInput(e.target.value)} /></Field>
        </div>
      </Modal>

      {/* Modal pick list */}
      <Modal open={showPick} onClose={() => setShowPick(false)} title={S.pickTitle} subtitle={S.pickSub}
        wide footer={<><button className="btn-secondary" onClick={() => setShowPick(false)}>{S.cancelBtn}</button><button className="btn-primary" onClick={savePick}>{S.btnPickGo}</button></>}>
        <div className="space-y-3">
          <Field label={S.proyekLbl}>
            <select className="input" value={pickProject} onChange={(e) => {
              setPickProject(e.target.value);
              setPickSel(inventory.filter((i) => reservedOf(i).some((r) => r.project === e.target.value)).map((i) => i.id));
            }}>
              <option value="">{S.pickProject}</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.id} - {p.vessel}</option>)}
            </select>
          </Field>
          {pickProject && pickItems.length === 0 && <EmptyState title={S.pickEmptyT} subtitle={S.pickEmptyS.replace("{n}", pickProject)} />}
          {pickItems.map((i) => {
            const res = reservedOf(i).find((r) => r.project === pickProject);
            const checked = pickSel.includes(i.id);
            return (
              <label key={i.id} className="flex items-center gap-3 rounded-xl border border-steel-200 px-3 py-2 text-sm">
                <input type="checkbox" checked={checked} onChange={(e) => setPickSel((s) => (e.target.checked ? [...s, i.id] : s.filter((x) => x !== i.id)))} aria-label={S.takeAria.replace("{n}", i.name)} />
                <span className="min-w-0 flex-1 truncate font-medium text-navy-900" title={String(i.name)}>{i.name}</span>
                <span className="shrink-0 text-steel-500">{fmtJumlah(Number(res?.qty ?? 0))} {i.unit}</span>
              </label>
            );
          })}
        </div>
      </Modal>

      {/* Modal label barcode */}
      <Modal open={labelItem !== null} onClose={() => setLabelItem(null)} title={S.labelTitle.replace("{n}", labelItem?.name ?? "")} subtitle={labelItem ? `${labelItem.id} · ${labelItem.sku}` : ""}
        footer={<><button className="btn-secondary" onClick={() => setLabelItem(null)}>{S.closeBtn}</button><button className="btn-primary" onClick={() => window.print()}><Printer className="h-4 w-4" /> {S.printBtn}</button></>}>
        {labelItem && (
          <div id="label-print" className="rounded-xl border border-steel-200 p-4 text-center">
            <p className="text-sm font-bold text-navy-900">{labelItem.name}</p>
            <p className="font-mono text-xs text-steel-500">{labelItem.sku}</p>
            <p className="font-mono text-xs text-steel-500">{rackText(labelItem)}{binOf(labelItem) ? ` · Bin ${binOf(labelItem)}` : ""}</p>
            <div className="mt-3 flex h-12 items-stretch justify-center gap-0 overflow-hidden" aria-hidden="true">
              {barcodeBits(String(labelItem.sku)).map((b, idx) => (
                <div key={idx} style={{ width: b ? 3 : 2, background: b ? "#0b1e33" : "#ffffff" }} />
              ))}
            </div>
            <p className="mt-2 font-mono text-xs tracking-widest text-navy-900">{labelItem.sku}</p>
            <p className="mt-1 font-mono text-[11px] text-steel-500" title={S.qrTitle}>QR: {qrPayloadOf(labelItem)}</p>
          </div>
        )}
      </Modal>

      {/* Modal detail */}
      <Modal open={detail !== null} onClose={() => setDetail(null)} title={freshDetail?.name ?? ""} subtitle={freshDetail ? `${freshDetail.id} · ${freshDetail.sku}` : ""}>
        {freshDetail && (
          <dl className="dl-div text-sm">
            {freshDetail.photoUrl ? (
              <img src={String(freshDetail.photoUrl)} alt={String(freshDetail.name)} className="h-32 w-full rounded-xl border border-steel-200 object-cover" />
            ) : null}
            {([
              [S.catLbl, freshDetail.category],
              [S.dlWh, rackText(freshDetail)],
              [S.binLbl, binOf(freshDetail) || "-"],
              [S.dlQr, qrPayloadOf(freshDetail)],
              [S.stockLbl, `${fmtJumlah(Number(freshDetail.stock))} ${freshDetail.unit}${hasUom2(freshDetail) ? ` (≈ ${fmtJumlah(qtyInUom2(freshDetail))} ${uom2Of(freshDetail)})` : ""}`],
              [S.dlAvail, `${fmtJumlah(availOf(freshDetail))} ${freshDetail.unit}`],
              [S.dlReserv, reservedOf(freshDetail).length > 0 ? reservedOf(freshDetail).map((r) => `${r.project} × ${fmtJumlah(Number(r.qty))}`).join("; ") : "-"],
              [S.volLbl, fmtJumlah(Number(freshDetail.volume ?? 0))],
              [S.dlMinGlobal, fmtJumlah(Number(freshDetail.minStock))],
              [S.dlMinWh.replace("{n}", freshDetail.warehouse), fmtJumlah(minWhOf(freshDetail))],
              [S.batchLbl, freshDetail.batch ? String(freshDetail.batch) : "-"],
              [S.abcLbl, abc[freshDetail.id] ?? "-"],
              [S.dlCost, fmtRupiah(Number(freshDetail.cost))],
              [S.dlAvg, Number(freshDetail.avgCost) > 0 ? fmtRupiah(Number(freshDetail.avgCost)) : "- (pakai harga master)"],
              [S.dlTotal, fmtRupiah(Number(freshDetail.stock) * effCost(freshDetail))],
            ] as [string, string][]).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4"><dt className="text-steel-500">{k}</dt><dd className="font-medium text-navy-900 text-right">{v}</dd></div>
            ))}
            <div className="rounded-xl bg-steel-50 px-3 py-2">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-navy-900"><History className="h-3.5 w-3.5" /> {S.histTitle}</p>
              {auditOf(freshDetail).length === 0 && <p className="mt-1 text-xs text-steel-400">{S.histEmpty}</p>}
              {auditOf(freshDetail).map((m) => (
                <p key={m.id} className="mt-1 flex items-center justify-between gap-2 text-xs text-steel-600">
                  <span className="truncate">{fmtTanggal(m.date)} · <Badge tone={moveTone(m.type, m.tone)}>{moveLabel(m.type)}</Badge> {fmtJumlah(Number(m.qty))}</span>
                  <span className="shrink-0 font-mono">{m.by}</span>
                </p>
              ))}
            </div>
            <Link to={`/inventori/bom/${freshDetail.id}`} className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-ocean-600 hover:underline">{S.openBomPage}</Link>
          </dl>
        )}
      </Modal>

      {showScan && (
        <ScanModal
          onClose={() => setShowScan(false)}
          onDetect={(v) => { setQ(v); setShowScan(false); toast(S.scanResult.replace("{n}", v)); }}
        />
      )}
    </div>
  );
}
