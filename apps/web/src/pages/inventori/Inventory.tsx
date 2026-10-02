import { useEffect, useMemo, useRef, useState } from "react";
import { rebindLegacyMonthSeries } from "../../utils/monthAxis";
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
  RefreshCw,
  Barcode,
  BookmarkPlus,
  ListChecks,
  Printer,
  Upload,
  Download,
  Camera,
  History,
  Trash2,
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
import { QRCodeSVG } from "qrcode.react";
import { Card, CardHeader, PageHeader, Badge, KpiCard, Tabs, ChartTooltip, Modal, Field, FormGrid, toast, EmptyState, ProgressBar, SortTh, toggleSort, sortRows, usePager, useDebouncedValue, ConfirmModal,
  NumInput, AsyncButton, SecureImg,
} from "../../components/ui";
import type { SortState } from "../../components/ui";
import { useStore, type StoreItem } from "../../data/store";
import { findUsages } from "../../utils/usages";
import { sameName } from "../../utils/names";
import { categoryWarnings, katalogBadge, warnLevelOf, warnRankOf, effectiveMinStock } from "../../utils/inventoryWarn";
import {
  DEAD_REASONS,
  deadImpactTone,
  deadPatch,
  deadStockRows,
  deadSummaryByReason,
  type DeadReason,
} from "../../utils/deadStock";
import {
  WAREHOUSE_TYPES,
  allWarehouseNames,
  movementFlow,
  movementTouchesWh,
  warehouseStockRows,
  type WarehouseStock,
} from "../../utils/warehouse";
import { useModuleSync } from "../../data/useModuleSync";
import type { CollectionKey } from "../../data/store";
import { isBackendConfigured } from "../../services/http";
import { uploadFile } from "../../services/upload";
import { fmtJumlah, fmtRupiah, fmtMiliar, fmtPersen, fmtTanggal, todayISO } from "../../utils/format";
import { exportExcel } from "../../utils/export";
import { sbTonasePlat, sbSjNumber, sbTtNumber, maxSeq, parseSjSeq, SB_KOP } from "../../utils/sb";
import { deliveryOrderDoc, goodsNoteDoc, type GoodsNoteDocLabels } from "../../utils/pdfDocs";
import { FilterPopover } from "../../components/FilterPopover";
import { useT } from "../../i18n/LanguageContext";
import { n_inv } from "../../i18n/n_inv";
import { AlertBannerView, notifRowId, useModuleAlert, useNotifFlash } from "../../components/AlertBanner";
import { stockTrend, itemTrend, lowStockTrend, stockValueTrend, warehouseTrend } from "../../data";

const emptyForm = { name: "", category: "Baja", sku: "", warehouse: "Gudang Baja A", rack: "", bin: "", stock: "0", minStock: "0", unit: "pcs", cost: "0", volume: "0", batch: "", uom2: "", konversi: "", minWh: "", photoUrl: "", matType: "habis-pakai", eceran: false as boolean | string };

/* Form gudang. `capacity` string (input angka) - dikonversi saat submit.
   `aktif` boolean untuk menonaktifkan gudang tanpa menghapusnya (baris
   historis movement tetap menunjuk nama yang sama). */
const emptyWhForm = { name: "", type: "", capacity: "", lokasi: "", pic: "", aktif: true };

/* Jenis material: habis-pakai | retur | service. Eceran = flag terpisah (konversi satuan). */
const MAT_TYPES = ["habis-pakai", "retur", "service"] as const;
function isEceran(it: StoreItem): boolean {
  return it.eceran === true || String((it as Record<string, unknown>).eceran ?? "").toLowerCase() === "true";
}
function matTypeOf(it: StoreItem): string {
  const v = String(it.matType ?? "habis-pakai").trim().toLowerCase();
  if (v === "eceran") return "habis-pakai";
  return (MAT_TYPES as readonly string[]).includes(v) ? v : "habis-pakai";
}
function matTone(t: string): "gray" | "blue" | "teal" {
  return t === "retur" ? "blue" : t === "service" ? "teal" : "gray";
}
function matLabel(t: string): string {
  return t === "retur" ? "Retur (bisa kembali)" : t === "service" ? "Service (jasa)" : "Habis pakai";
}

/* Label tabel untuk surat jalan / tanda terima. Kedua dokumen ini memakai
   satu fungsi pdf (goodsNoteDoc) karena bentuknya sama, jadi judul kolomnya
   juga harus sama - sebelumnya ditulis dua kali dan bisa berbeda. */
const GOODS_NOTE_LABELS = (loc: "id" | "en"): GoodsNoteDocLabels => (loc === "en"
  ? { no: "No", namaBarang: "Item", jumlah: "Qty", tanggal: "Date", tujuan: "Destination", penerima: "Received by", penyerah: "Delivered by" }
  : { no: "No", namaBarang: "Nama Barang", jumlah: "Jumlah", tanggal: "Tanggal", tujuan: "Tujuan", penerima: "Yang Menerima", penyerah: "Yang Menyerahkan" });

/* Label "Mon YYYY" untuk deret statis, bulan berjalan terakhir. */

/* Nomor DO format RawData: nn/DO-SB/SMD/m/yyyy. */
const ROMAWII = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
function doNumber(seq: number, date = new Date()): string {
  return `${String(seq).padStart(2, "0")}/DO-SB/SMD/${ROMAWII[date.getMonth()]}/${date.getFullYear()}`;
}

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
  if (type === "Penerimaan") return "Barang Masuk";
  if (type === "Pengeluaran") return "Barang Keluar";
  if (type === "Selisih Opname") return "Opname";
  if (type === "Transfer") return "Transfer";
  if (type === "Retur") return "Retur";
  return type;
}
/* whFlowOf() DIHAPUS. Fungsi ini menggabungkan asal+tujuan jadi satu string
   ("dari X · ke Y"), yang tidak bisa dipakai untuk:
     - memfilter per gudang (substring match bikin "Gudang B" kena "Gudang Baja A"),
     - menyortir asal dan tujuan terpisah,
     - menampilkan kolom Dari Gudang / Ke Gudang terpisah.
   Penggantinya: movementFlow() di utils/warehouse.ts yang mengembalikan
   { from, to, internal, kind } terstruktur. */
function grGiTip(type: string, locale: string): string {
  if (type === "Penerimaan") return locale === "en" ? "Goods in" : "Barang Masuk";
  if (type === "Pengeluaran") return locale === "en" ? "Goods out" : "Barang Keluar";
  return String(type);
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

/* QR-only: barcode CSS lama dihapus, label memakai QRCodeSVG. */
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

const AGING_BUCKETS = ["0-30 hari", "31-90 hari", "91-180 hari", ">180 hari", "Belum ada barang masuk"];

export default function Inventory() {
  const { locale } = useT();
  const S = n_inv[locale];
  const { data, add, update, remove, log, branch, resync } = useStore();
  /* Batch modul per tab: Inventory butuh 8 koleksi. Tanpa ini halaman ini
     memanggil resync() penuh (50+ koleksi) tiap dibuka lewat tombol refresh
     PageHeader, padahal isinya hanya butuh sebagian. */
  const INV_COLS: CollectionKey[] = [
    "inventory", "movements", "projects", "requisitions",
    "documents", "settings", "purchaseOrders", "payables", "warehouses",
  ];
  useModuleSync(INV_COLS);
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
  const notified = useMemo(() => new Set(modAlert.items.map((a) => a.rowId)), [modAlert.items]);
  const [tab, setTab] = useState("Katalog");
  const [bomProject, setBomProject] = useState("Semua proyek");
  const [q, setQ] = useState("");
  const [showScan, setShowScan] = useState(false);
  const [cat, setCat] = useState("Semua");
  const [wh, setWh] = useState("Semua");
  const [abcF, setAbcF] = useState("Semua");
  const [matF, setMatF] = useState("Semua");
  const [sort, setSort] = useState<SortState>({ key: null, dir: "asc" });
  const [sort2, setSort2] = useState<SortState>({ key: null, dir: "asc" });
  const [sort3, setSort3] = useState<SortState>({ key: null, dir: "asc" });

  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<StoreItem | null>(null);
  const [detail, setDetail] = useState<StoreItem | null>(null);
  // Hapus item via ConfirmModal + daftar pemakai (blokir bila dipakai mutasi/PO).
  const [delInv, setDelInv] = useState<StoreItem | null>(null);
  /* Ubah movement HANYA metadata (tanggal/referensi/supplier/purpose/PIC) - qty/tipe/item
     TIDAK bisa diubah agar stok tak perlu dikoreksi (rumus bisnis tidak disentuh). */
  const [moveEdit, setMoveEdit] = useState<StoreItem | null>(null);
  const [moveEditForm, setMoveEditForm] = useState({ date: "", by: "", supplier: "", purpose: "", pic: "" });
  /* Hapus movement = hapus catatan SAJA, stok TIDAK dikoreksi (dengan toast peringatan). */
  const [delMove, setDelMove] = useState<StoreItem | null>(null);
  /* ==== CRUD GUDANG (tab Stok per Gudang) ====
     Sumber data: koleksi `warehouses`. inventory.warehouse tetap NAMA (lihat
     utils/warehouse.ts), jadi nama jadi kunci - unik ditegakkan di backend
     (checkNameUnique) dan dicek lagi di FE agar pesan error ramah. */
  const [showWh, setShowWh] = useState(false);
  const [whForm, setWhForm] = useState(emptyWhForm);
  const [whEditing, setWhEditing] = useState<string | null>(null);
  const [delWh, setDelWh] = useState<WarehouseStock | null>(null);
  const [labelItem, setLabelItem] = useState<StoreItem | null>(null);
  const [moveTarget, setMoveTarget] = useState<StoreItem | null>(null);
  const [moveKind, setMoveKind] = useState<"in" | "out">("in");
  const [moveQty, setMoveQty] = useState("");
  const [moveRef, setMoveRef] = useState("");
  const [moveBatch, setMoveBatch] = useState("");
  const [moveUom, setMoveUom] = useState("base");
  const [movePrice, setMovePrice] = useState("");
  const [movePo, setMovePo] = useState("");
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
  const [showRetur, setShowRetur] = useState(false);
  const [retItem, setRetItem] = useState("");
  const [retQty, setRetQty] = useState("");
  const [retUom, setRetUom] = useState("base");
  const [retVendor, setRetVendor] = useState("");
  const [retReason, setRetReason] = useState("");

  const [reservTarget, setReservTarget] = useState<StoreItem | null>(null);
  const [reservProject, setReservProject] = useState("");
  const [reservQtyInput, setReservQtyInput] = useState("");
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  /* Preset plat roll→meter: panjang × lebar (m). */
  const [platP, setPlatP] = useState("6");
  const [platL, setPlatL] = useState("1.5");
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
  // Delivery Order penuh: nomor nn/DO-SB/SMD/m/yyyy + cetak + link ke Surat Jalan.
  const [doTo, setDoTo] = useState("");
  const [doDate, setDoDate] = useState(todayISO());
  const [doSjId, setDoSjId] = useState("");
  const [doDriver, setDoDriver] = useState("");
  const [doItems, setDoItems] = useState<{ name: string; qty: string }[]>([{ name: "", qty: "" }]);
  /* Ubah DO terbit via update documents (tanpa ubah rumus stok/reservasi). */
  const [doEdit, setDoEdit] = useState<StoreItem | null>(null);
  const [doEditForm, setDoEditForm] = useState({ to: "", date: todayISO(), driver: "", sjId: "", items: [{ name: "", qty: "" }] as { name: string; qty: string }[] });
  /* Batalkan DO = hapus dokumen + kembalikan reservasi yang merujuk DO bila ada. */
  const [delDo, setDelDo] = useState<StoreItem | null>(null);
  const doDocs = useMemo(
    () => (data.documents ?? []).filter((d) => d.type === "Delivery Order"),
    [data.documents],
  );
  /* DO max+1: sbRef gaya PO (leading nn/...) + dash id (trailing nnn). */
  const nextDoSeq = (): number => {
    const lead = maxSeq(doDocs.map((d) => String(d.sbRef ?? "")), /^(\d+)\//);
    const trail = maxSeq(doDocs.map((d) => String(d.id ?? "")), /(\d+)$/);
    return Math.max(lead, trail) + 1;
  };
  /* PDF resmi (mesin teks). Excel tetap tersedia sebagai pilihan kedua. */
  const printDoPdf = (d: StoreItem) => {
    const items = (Array.isArray(d.doItems) ? d.doItems : []) as { name: string; qty: string }[];
    try {
      deliveryOrderDoc({
        no: String(d.sbRef ?? d.id),
        tanggal: String(d.doDate ?? d.updated ?? ""),
        tujuan: String(d.doTo ?? d.vessel ?? "-"),
        driver: String(d.doDriver ?? "-"),
        suratJalan: String(d.doSjRef ?? d.doSjId ?? "-"),
        items,
        labels: {
          tanggal: locale === "en" ? "Date" : "Tanggal",
          tujuan: locale === "en" ? "Destination" : "Tujuan",
          driver: locale === "en" ? "Driver" : "Driver",
          suratJalan: locale === "en" ? "Delivery note" : "Surat Jalan",
          no: "No",
          namaBarang: locale === "en" ? "Item" : "Nama Barang",
          jumlah: locale === "en" ? "Qty" : "Jumlah",
        },
      }).save(`DO-${String(d.sbRef ?? d.id).replaceAll("/", "-")}`);
      toast(locale === "en"
        ? `DO ${String(d.sbRef ?? d.id)} printed as PDF`
        : `DO ${String(d.sbRef ?? d.id)} dicetak sebagai PDF`);
    } catch (e) {
      toast(e instanceof Error ? e.message : S.saveFail, "info");
    }
  };

  const printDo = (d: StoreItem) => {
    const items = (Array.isArray(d.doItems) ? d.doItems : []) as { name: string; qty: string }[];
    void exportExcel([
      [SB_KOP.line1, SB_KOP.name], [SB_KOP.hq, `HP ${SB_KOP.hp}`], [],
      ["DELIVERY ORDER", `NO: ${String(d.sbRef ?? d.id)}`], ["Tanggal", String(d.doDate ?? d.updated ?? "")],
      ["Tujuan", String(d.doTo ?? d.vessel ?? "-")], ["Driver", String(d.doDriver ?? "-")],
      ["Surat Jalan", String(d.doSjRef ?? d.doSjId ?? "-")], [],
      ["No", "Nama Barang", "Jumlah"], ...items.map((x, i) => [i + 1, String(x.name ?? ""), String(x.qty ?? "")]),
    ], `DO-${String(d.sbRef ?? d.id).replaceAll("/", "-")}`, "Delivery Order").catch(() => toast(S.saveFail, "info"));
    toast(locale === "en" ? `DO ${String(d.sbRef ?? d.id)} printed` : `DO ${String(d.sbRef ?? d.id)} dicetak`);
  };

  const openDoEdit = (d: StoreItem) => {
    setDoEdit(d);
    const items = (Array.isArray(d.doItems) ? d.doItems : []) as { name: string; qty: string }[];
    setDoEditForm({
      to: String(d.doTo ?? d.vessel ?? ""),
      date: String(d.doDate ?? d.updated ?? todayISO()),
      driver: String(d.doDriver ?? ""),
      sjId: String(d.doSjId ?? ""),
      items: items.length > 0 ? items.map((x) => ({ name: String(x.name ?? ""), qty: String(x.qty ?? "") })) : [{ name: "", qty: "" }],
    });
  };

  const saveDoEdit = async () => {
    if (!doEdit) return;
    const items = doEditForm.items.filter((x) => x.name.trim() && x.qty.trim());
    if (!doEditForm.to.trim() || items.length === 0) { toast(S.sjNeedDest, "info"); return; }
    const sj = sjDocs.find((d) => String(d.id) === doEditForm.sjId);
    try {
      await update("documents", doEdit.id, {
        doTo: doEditForm.to.trim(),
        vessel: doEditForm.to.trim(),
        doDate: doEditForm.date,
        updated: todayISO(),
        doDriver: doEditForm.driver.trim(),
        doSjId: doEditForm.sjId,
        doSjRef: sj ? String(sj.sbRef || sj.id) : "",
        doItems: items.map((x) => ({ name: x.name.trim(), qty: x.qty.trim() })),
        related: doEditForm.sjId ? [doEditForm.sjId] : [],
      });
      log("mengubah delivery order", `${String(doEdit.sbRef ?? doEdit.id)} → ${doEditForm.to.trim()}`, "Inventori");
      toast(locale === "en" ? `DO ${String(doEdit.sbRef ?? doEdit.id)} updated` : `DO ${String(doEdit.sbRef ?? doEdit.id)} diubah`);
      setDoEdit(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : S.saveFail, "info");
    }
  };
  const [showPick, setShowPick] = useState(false);
  const [pickProject, setPickProject] = useState("");
  const [pickSel, setPickSel] = useState<string[]>([]);
  const [pickQty, setPickQty] = useState<Record<string, string>>({});
  const [pickFail, setPickFail] = useState<string[]>([]);

  const dq = useDebouncedValue(q);
  const abc = useMemo(() => abcMap(inventory), [inventory]);

  /* Tren nilai stok: label "Mon YYYY". stockTrend berlabel tetap "Sep".."Ags"
     sementara invTrailingLabels() menghitung ulang 12 bulan terakhir dari
     tanggal hari ini lalu menempelkannya POSISIONAL ke data. Akibatnya titik
     "Ags" tampil sebagai "Sep 2026" dan seluruh grafik bergeser satu bulan
     tiap pergantian bulan, tanpa pernah memberi tahu. Sekarang data diputar
     mengikuti jendela label - pola yang sama sudah dipakai Equipment dan QC. */
  /* Nilai stok SENGAJA masih dari seed stockTrend.

     Berbeda dari invoice/inspeksi/jam, nilai stok tidak punya riwayat
     bertanggal di sistem: `inventory.stock` adalah kondisi saat ini, dan
     tidak ada snapshot bulanan. Movement bisa dijumlahkan, tapi itu
     mengubah nilai yang sama menjadi rekonstruksi, bukan data yang
     tercatat - lebih buruk daripada jujur memakai seed.

     Yang diperbaiki di sini adalah SUMBU dan FILTER TAHUN, bukan
     angkanya. Sumbu sekarang berurutan dan berakhir di bulan berjalan
     (monthAxis), dan label tidak lagi ditempel posisional ke seed yang tidak
     bergerak - yang membuat seluruh kurva bergeser satu bulan tiap
     pergantian bulan. Filter tahun memakai `key` YYYY-MM dari sumbu,
     bukan memotong 4 karakter terakhir dari label yang sudah dirender:
     begitu locale atau format label berubah, filternya ikut rusak. */
  const invTrend = useMemo(
    () => rebindLegacyMonthSeries(stockTrend, { locale: locale as "id" | "en" })
      .map((r) => ({ label: r.bln, key: r.key, year: Number(r.key.slice(0, 4)), nilai: Number(r.nilai || 0) })),
    [locale],
  );
  const [trendYear, setTrendYear] = useState("Semua");
  const trendYears = useMemo(
    () => Array.from(new Set(invTrend.map((d) => d.year))).sort((a, b) => b - a),
    [invTrend],
  );
  const trendShown = useMemo(
    () => (trendYear === "Semua" ? invTrend : invTrend.filter((d) => d.year === Number(trendYear))),
    [invTrend, trendYear],
  );

/* Gudang: koleksi `warehouses` (CRUD) + fallback settings.WAREHOUSE_CAP.
     capacityOf() sudah menangani kedua sumber, jadi tab Stok per Gudang tetap
     punya progress bar untuk instalasi lama yang belum punya baris gudang. */
  const warehouseRows = useMemo(
    () => warehouseStockRows(data.warehouses, inventory, data.settings),
    [data.warehouses, inventory, data.settings],
  );
  const whSorted = useMemo(() => sortRows(warehouseRows, sort2, (row, k) => {
    if (k === "nama") return row.name;
    if (k === "jenis") return String(row.row?.type ?? "");
    if (k === "item") return row.items.length;
    if (k === "terisi") return row.used;
    if (k === "kapasitas") return row.capacity;
    return row.name;
}), [warehouseRows, sort2]);

  const list = useMemo(() => inventory.filter((i) => {
    const matchQ = `${i.name} ${i.sku} ${binOf(i)}`.toLowerCase().includes(dq.toLowerCase());
    const matchCat = cat === "Semua" || i.category === cat;
    const matchWh = wh === "Semua" || i.warehouse === wh;
    const matchAbc = abcF === "Semua" || abc[i.id] === abcF;
    const matchMat = matF === "Semua" || matTypeOf(i) === matF;
    return matchQ && matchCat && matchWh && matchAbc && matchMat;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [inventory, dq, cat, wh, abcF, matF, abc]);
  const sorted = useMemo(() => sortRows(list, sort, (i, k) => {
    if (k === "qty") return Number(i.stock || 0);
    if (k === "volume") return Number(i.volume ?? 0);
    if (k === "total") return Number(i.stock || 0) * effCost(i);
    if (k === "kategori") return String(i.category ?? "");
    if (k === "abc") return String(abc[i.id] ?? "");
if (k === "mattype") return matTypeOf(i);
    /* Sort status memakai RANK dari utils/inventoryWarn (kritis > menipis >
       berlebih > aman), bukan nama level - pengurutan alfabetis akan
       menaruh "Aman" sebelum "Kritis". Dibalik (5 - rank) supaya saat
       ascending, item yang paling mendesak muncul duluan. */
    if (k === "status") return String(5 - warnRankOf(i));
    if (k === "rak") return String(rackText(i));
    if (k === "bin") return binOf(i);
    return String(i.name ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [list, sort, abc]);
  const pager = usePager(list.length, 25);
  const [movWh, setMovWh] = useState("Semua");
  /* Filter gudang terstruktur: dulu `whFlowOf(m).includes(movWh)` - substring
     pada string gabungan, jadi "Gudang B" ikut mencocokkan "Gudang Baja A",
     dan transfer antar gudang tak bisa dibedakan. movementTouchesWh()
     membandingkan endpoint dari/to satu per satu (longgar kapital/spasi). */
  const movFiltered = useMemo(
    () => (movWh === "Semua" ? movements : movements.filter((m) => movementTouchesWh(m, movWh))),
    [movements, movWh],
  );
  const movPager = usePager(movFiltered.length, 25);
  useEffect(() => {
    movPager.reset();
  }, [movWh]);
  const movSorted = useMemo(() => sortRows(movFiltered, sort3, (m, k) => {
    if (k === "jumlah") return Number(m.qty || 0);
    if (k === "total") return Number(m.total || 0);
    if (k === "item") return String(m.item ?? "");
    if (k === "tipe") return String(m.type ?? "");
    if (k === "dari") return movementFlow(m).from;
    if (k === "ke") return movementFlow(m).to;
    if (k === "gudang") return `${movementFlow(m).from} ${movementFlow(m).to}`;
    if (k === "referensi") return String(m.by ?? "");
    if (k === "info") return String(`${m.supplier ?? ""} ${m.purpose ?? ""} ${m.pic ?? ""}`);
    if (k === "tanggal") return String(m.date ?? "");
    return String(m.id ?? "");
  }), [movFiltered, sort3]);
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

  /* Warning inventory diklasifikasikan per kategori (utils/inventoryWarn).
     Ambang TIDAK seragam: kategori lead-time panjang (baja/pipa) diberi
     buffer lebih lebar, kategori jasa diabaikan karena tak punya stok fisik.
     Lihat utils/inventoryWarn.ts untuk tabel alasannya. */
  const lowStock = useMemo(
    () => inventory.filter((i) => {
      const lv = warnLevelOf(i).level;
      return lv === "low" || lv === "critical";
    }),
    [inventory],
  );
  const overStock = useMemo(
    () => inventory.filter((i) => warnLevelOf(i).level === "overstock"),
    [inventory],
  );
  /* Dipakai untuk ringkasan per kategori di tab Analisis + filter cepat.
     Banner besar di atas tabel Katalog DIHAPUS (lihat render katalogPrioritas). */
  const warnByCat = useMemo(
    () => categoryWarnings(inventory, { maxUrgentPerCategory: 4 }),
    [inventory],
  );
  const categories = useMemo(() => ["Semua", ...Array.from(new Set(inventory.map((i) => String(i.category ?? "").trim()).filter((c) => c && c !== "Semua")))], [inventory]);
  const totalValue = useMemo(() => inventory.reduce((s, i) => s + Number(i.stock || 0) * effCost(i), 0), [inventory]);
  /* Daftar gudang: baris terdaftar + yang hanya muncul di inventory.
     allWarehouseNames() sudah menyatukan keduanya (utils/warehouse.ts). */
  const warehouses = useMemo(
    () => allWarehouseNames(data.warehouses, inventory),
    [data.warehouses, inventory],
  );

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
/* Dead stock: baris siap render (alasan ber-KODE + badge dampak nilai).
     deadStockRows() sudah computing-dead sendiri dari moveIdx, jadi tidak
     ada lagi daftar `deadItems` terpisah - dulu ada, sekarang duplikat. */
  const deadRows = useMemo(
    () => deadStockRows(inventory, {
      hasOut: (item) => lastOutOf(item) !== null,
      daysSinceLastOut: (item) => {
        const d = lastOutOf(item);
        return d ? daysSince(d) : 9999;
      },
    }),
    [inventory, moveIdx],
  );
  const deadSummary = useMemo(() => deadSummaryByReason(deadRows), [deadRows]);

  const agingRows = useMemo(() => inventory.map((i) => {
    const lastIn = lastInOf(i);
    const age = lastIn ? daysSince(lastIn) : 9999;
    return { item: i, lastIn, age, bucket: lastIn ? agingBucket(age) : "Belum ada barang masuk" };
  }), [inventory, moveIdx]);

  // Analisis + BOM + Stok: search PER CARD (bukan global), tanpa potong jumlah.
  const [slowQ, setSlowQ] = useState("");
  const [deadQ, setDeadQ] = useState("");
  const [agingQ, setAgingQ] = useState("");
  const [gudangQ, setGudangQ] = useState<Record<string, string>>({});
  const [bomNeedQ, setBomNeedQ] = useState("");
  const [bomFcQ, setBomFcQ] = useState("");
  const slowShown = useMemo(() => {
    const nq = slowQ.trim().toLowerCase();
    return nq ? slowItems.filter((i) => `${i.name} ${i.sku}`.toLowerCase().includes(nq)) : slowItems;
  }, [slowItems, slowQ]);
  const deadShown = useMemo(() => {
    const nq = deadQ.trim().toLowerCase();
    if (!nq) return deadRows;
    return deadRows.filter((r) =>
      `${r.item.name} ${r.item.sku ?? ""} ${r.reason.label} ${r.note}`.toLowerCase().includes(nq),
    );
  }, [deadRows, deadQ]);
  const agingShown = useMemo(() => {
    const nq = agingQ.trim().toLowerCase();
    return nq ? agingRows.filter((r) => `${r.item.name} ${r.bucket}`.toLowerCase().includes(nq)) : agingRows;
  }, [agingRows, agingQ]);
  const bomNeedShown = useMemo(() => {
    const nq = bomNeedQ.trim().toLowerCase();
    return nq ? bomRows.filter((b) => `${b.key} ${b.item?.name ?? ""}`.toLowerCase().includes(nq)) : bomRows;
  }, [bomRows, bomNeedQ]);

  const activeProjects = projects.filter((p) => String(p.status) !== "Selesai");
  const forecastRows = activeProjects.flatMap((p) =>
    BOM_NEEDS.map((b) => {
      const item = inventory.find((i) => i.name.toLowerCase().includes(b.key.toLowerCase()));
      const stock = item ? Number(item.stock) : 0;
      const net = Math.max(0, b.need - stock);
      return { project: p.id, vessel: String(p.vessel ?? ""), ...b, item, stock, net };
    })
  );
  const forecastBase = useMemo(
    () => forecastRows.filter((f) => bomProject === "Semua proyek" || f.project === bomProject),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [forecastRows, bomProject],
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

  const setF = (k: string, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

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
    setMovePo("");
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
    setMovePo("");
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
      minWh: String(minWhOf(i)), photoUrl: String(i.photoUrl ?? ""), matType: matTypeOf(i), eceran: isEceran(i),
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
    const matType = (MAT_TYPES as readonly string[]).includes(String(form.matType ?? "").trim()) ? String(form.matType).trim() : "habis-pakai";
    const eceran = (form as Record<string, unknown>).eceran === true || String((form as Record<string, unknown>).eceran ?? "") === "true";
    if (eceran && (!uom2 || konv <= 0)) { toast(locale === "en" ? "Retail needs UOM2 + conversion" : "Eceran wajib isi satuan eceran + konversi", "info"); return; }
    if (!eceran && (uom2 || konv > 0)) { toast(locale === "en" ? "Turn on retail to use conversion" : "Aktifkan eceran untuk memakai konversi", "info"); return; }
    const prevMap = (editing?.minStockByWarehouse as Record<string, number> | undefined) ?? {};
    const minWhMap = { ...prevMap };
    if (form.minWh.trim() !== "") minWhMap[form.warehouse] = Number(form.minWh) || 0;
    if (minWhMap[form.warehouse] !== undefined && minWhMap[form.warehouse] < 0) { toast(S.minWhInvalid, "info"); return; }
    if (editing) {
      /* Stok read-only di form edit - hanya field non-stok yang disimpan. */
      try {
        await update("inventory", editing.id, {
          name: form.name.trim(), category: form.category, sku: form.sku.trim(), warehouse: form.warehouse,
          rack, bin, location: rack, minStock: numMin, unit: form.unit,
          cost: numCost, volume: volume || 0, batch: form.batch.trim(),
          uom2: eceran ? uom2 : "", konversi: eceran ? konv : 0, minStockByWarehouse: minWhMap, photoUrl: form.photoUrl.trim(), matType, eceran,
        });
        toast(S.updatedId.replace("{n}", editing.id));
        setEditing(null);
      } catch (e) {
        toast(e instanceof Error ? e.message : S.saveFail, "info");
        return;
      }
    } else {
      const stock = numStock;
      const batch = form.batch.trim();
      try {
        const created = await add("inventory", {
          name: form.name.trim(), category: form.category, sku: form.sku.trim(), warehouse: form.warehouse,
          rack, bin, stock, minStock: numMin, unit: form.unit,
          cost: numCost, location: rack, volume: volume || 0, batch,
          uom2: eceran ? uom2 : "", konversi: eceran ? konv : 0, minStockByWarehouse: minWhMap, photoUrl: form.photoUrl.trim(), avgCost: 0, matType, eceran,
          batches: batch ? [{ batch, qty: stock, date: todayISO() }] : [],
          reserved: [],
        }, { action: "mendaftarkan material", module: "Inventori" });
        toast(S.materialAdded.replace("{n}", created.id));
        setShowAdd(false);
      } catch (e) {
        toast(e instanceof Error ? e.message : S.saveFail, "info");
        return;
      }
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
      /* Average cost: (nilai lama + qty × harga) / stok baru, hanya saat barang masuk ber-harga. */
      const price = Number(movePrice);
      if (movePrice.trim() !== "" && (!price || price <= 0)) { toast(S.grPriceInvalid, "info"); return; }
      if (price > 0) {
        const oldStock = Number(fresh.stock);
        const oldVal = oldStock * effCost(fresh);
        patch.avgCost = Math.round(((oldVal + qty * price) / (oldStock + qty)) * 100) / 100;
      }
    }
    const refBase = moveKind === "in"
      ? [movePo.trim(), moveRef.trim()].filter(Boolean).join(" · ") || "Barang masuk manual · tanpa PO"
      : (moveRef.trim() || "Barang keluar manual");
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
        /* Gudang asal/tujuan TERSTRUKTUR (bukan hanya string gabungan) supaya
           kolom Dari/Ke Gudang di tab Pergerakan bisa diisi langsung dan
           filter per gudang jadi akurat. Lihat utils/warehouse.ts. */
        fromWh: moveKind === "in" ? "" : String(fresh.warehouse ?? ""),
        toWh: moveKind === "in" ? String(fresh.warehouse ?? "") : "",
        ...(moveKind === "in" && movePo.trim() ? { po: movePo.trim() } : {}),
        supplier: moveSupplier.trim(),
        priceExcl,
        tax: taxAmt,
        total: priceExcl > 0 ? Math.round(qty * priceExcl) + taxAmt : 0,
        purpose: movePurpose.trim(),
        pic: movePic.trim(),
        // Cabang dari proyek tertaut (cocokkan purpose/ref ke id/vessel proyek) atau fallback global.
        branch: moveBranch(`${movePurpose} ${refNote}`),
      }, { action: moveKind === "in" ? "menerima barang" : "mengeluarkan barang", target: `${fresh.name} × ${qty}`, module: "Inventori" });
      toast(S.moveSaved.replace("{a}", moveKind === "in" ? "Barang Masuk" : "Barang Keluar").replace("{b}", fresh.name).replace("{n}", fmtJumlah(qty)));
      closeMove();
    } catch {
      toast(S.moveFailed.replace("{n}", moveKind === "in" ? "Barang Masuk" : "Barang Keluar"), "info");
    }
  };

  const openMoveEdit = (m: StoreItem) => {
    setMoveEdit(m);
    setMoveEditForm({
      date: String(m.date ?? todayISO()),
      by: String(m.by ?? ""),
      supplier: String(m.supplier ?? ""),
      purpose: String(m.purpose ?? ""),
      pic: String(m.pic ?? ""),
    });
  };

  /* Simpan ubah movement: metadata saja, stok/item/qty/tipe tidak disentuh. */
  const saveMoveEdit = async () => {
    if (!moveEdit) return;
    if (!moveEditForm.date) { toast(locale === "en" ? "Date is required" : "Tanggal wajib diisi", "info"); return; }
    try {
      await update("movements", moveEdit.id, {
        date: moveEditForm.date,
        by: moveEditForm.by.trim(),
        supplier: moveEditForm.supplier.trim(),
        purpose: moveEditForm.purpose.trim(),
        pic: moveEditForm.pic.trim(),
      });
      log("mengubah movement", `${moveEdit.id} · ${String(moveEdit.item ?? "")} (metadata saja, stok tidak diubah)`, "Inventori");
      toast(locale === "en" ? `Movement ${moveEdit.id} updated (stock untouched)` : `Movement ${moveEdit.id} diubah (stok tidak diubah)`);
      setMoveEdit(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : S.saveFail, "info");
    }
  };

  /* BOM explode → PR Draft, cegah duplikat PR terbuka untuk item sama. */
  const buatPRDraft = async (itemName: string, qtyKurang: number, estAmount: number) => {
    const open = requisitions.some(
      (r) => String(r.item).toLowerCase() === itemName.toLowerCase()
        && ["Draft", "Draf", "Menunggu Approval", "RFQ", "Diajukan"].includes(String(r.status))
    );
    if (open) { toast(S.prOpenExists.replace("{n}", itemName), "info"); return; }
    try {
      const created = await add("requisitions", {
        item: itemName, by: "System BOM", amount: Math.max(0, Math.round(estAmount)), status: "Draft",
      }, { action: "membuat PR Draft (BOM)", target: `${itemName} × ${fmtJumlah(qtyKurang)}`, module: "Inventori" });
      toast(S.prDraftMade.replace("{a}", created.id).replace("{b}", itemName).replace("{n}", fmtJumlah(qtyKurang)));
    } catch (e) {
      toast(e instanceof Error ? e.message : S.saveFail, "info");
    }
  };

  const downloadTemplate = () => {
    void exportExcel(
      [
        ["nama", "sku", "kategori", "gudang", "stok", "minStok", "satuan", "harga", "rak", "bin"],
        ["Pelat Baja AH36 15mm", "AH36-15", "Baja", "Gudang Baja A", 100, 20, "kg", 150000, "A1-02", "B-03"],
      ],
      "Template-Inventori",
      "Template"
    ).then(() => toast(S.tplExcelDone)).catch(() => toast(S.saveFail, "info"));
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
        try {
          await update("inventory", item.id, patch);
          await add("movements", {
            item: item.name, itemId: item.id, type: "Penerimaan", qty,
            by: supplier ? `Impor IN ${date} · ${supplier}` : `Impor IN ${date}`,
            batch: String(item.batch ?? ""), date, tone: "in",
            supplier, priceExcl: price, tax, total, purpose, pic,
            branch: moveBranch(`${purpose} ${supplier}`),
          }, { action: "mengimpor barang masuk", target: `${item.name} x ${qty}`, module: "Inventori" });
          ok++;
        } catch (e) {
          fails.push(e instanceof Error ? e.message : S.saveFail);
        }
      }
      setImportReport([S.inOk.replace("{n}", String(ok)), ...fails]);
      toast(S.inDone.replace("{a}", String(ok)).replace("{b}", String(fails.length)));
    }).catch((e) => toast(e instanceof Error ? e.message : S.saveFail, "info"));
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
        try {
          await update("inventory", item.id, { stock: newStock, batches: nextBatches, reserved: nextRes });
          if (newStock < Number(item.minStock || 0)) {
            toast(S.warnBelowMinSimple.replace("{n}", item.name), "info");
          }
          await add("movements", {
            item: item.name, itemId: item.id, type: "Pengeluaran", qty,
            by: ket || `${purpose} (Impor OUT)`, batch: String(item.batch ?? ""),
            date, tone: "out", supplier: "", priceExcl: 0, tax: 0, total: 0, purpose, pic,
            branch: moveBranch(`${purpose} ${ket}`),
          }, { action: "mengimpor barang keluar", target: `${item.name} x ${qty}`, module: "Inventori" });
          ok++;
        } catch (e) {
          fails.push(e instanceof Error ? e.message : S.saveFail);
        }
      }
      setImportReport([S.outOk.replace("{n}", String(ok)), ...fails]);
      toast(S.outDone.replace("{a}", String(ok)).replace("{b}", String(fails.length)));
    }).catch((e) => toast(e instanceof Error ? e.message : S.saveFail, "info"));
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
        try {
          await add("inventory", {
            name: nama, sku, category: c[2] || "Lainnya", warehouse: c[3],
            stock: Number(c[4]) || 0, minStock: Number(c[5]) || 0, unit: c[6] || "pcs",
            cost: Number(c[7]) || 0, rack: c[8] || "", bin: (c[9] ?? "").trim(), location: c[8] || "",
            volume: 0, batch: "", batches: [], reserved: [],
            uom2: "", konversi: 0, minStockByWarehouse: {}, photoUrl: "", avgCost: 0,
          }, { action: "mengimpor material", module: "Inventori" });
          ok++;
        } catch (e) {
          fails.push(e instanceof Error ? e.message : S.saveFail);
        }
      }
      setImportReport([S.importOk.replace("{n}", String(ok)), ...fails]);
      toast(S.importDone.replace("{a}", String(ok)).replace("{b}", String(fails.length)));
    }).catch((e) => toast(e instanceof Error ? e.message : S.saveFail, "info"));
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
        /* Opname terjadi di satu gudang - dari = ke = gudang tersebut, supaya
           kolom Dari/Ke Gudang tidak kosong dan bisa difilter per gudang. */
        fromWh: String(opTarget.warehouse ?? ""),
        toWh: String(opTarget.warehouse ?? ""),
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
    /* Kunci item: itemId bila ada, fallback SKU dasar (tanpa sufiks "@gudang" lama). */
    const baseSkuOf = (sku: unknown): string => String(sku ?? "").split("@")[0].trim().toLowerCase();
    const srcKey = String((trTarget as StoreItem).itemId ?? "").trim() || baseSkuOf(trTarget.sku);
    const destRow = inventory.find((i) =>
      String(i.id) !== String(trTarget.id)
      && String(i.warehouse) === String(trDest)
      && (String((i as StoreItem).itemId ?? "").trim() || baseSkuOf(i.sku)) === srcKey
    ) ?? null;
    /* Ambil FIFO qty dari daftar batch sumber → {kept, moved}. */
    const splitBatches = (rows: BatchRow[], qtyNeed: number): { kept: BatchRow[]; moved: BatchRow[] } => {
      let sisa = qtyNeed;
      const kept: BatchRow[] = [];
      const moved: BatchRow[] = [];
      for (const b of rows) {
        if (sisa <= 0) { kept.push(b); continue; }
        const pakai = Math.min(Number(b.qty || 0), sisa);
        sisa -= pakai;
        if (Number(b.qty || 0) - pakai > 0) kept.push({ ...b, qty: Number(b.qty || 0) - pakai });
        if (pakai > 0) moved.push({ ...b, qty: pakai });
      }
      return { kept, moved };
    };
    /* Pindah reservasi proporsional qty → {kept, moved} (digabung per proyek di tujuan). */
    const splitReserved = (rows: Reservation[], qtyNeed: number): { kept: Reservation[]; moved: Reservation[] } => {
      let sisa = qtyNeed;
      const kept: Reservation[] = [];
      const moved: Reservation[] = [];
      for (const r of rows) {
        if (sisa <= 0) { kept.push(r); continue; }
        const pakai = Math.min(Number(r.qty || 0), sisa);
        sisa -= pakai;
        if (Number(r.qty || 0) - pakai > 0) kept.push({ project: r.project, qty: Number(r.qty || 0) - pakai });
        if (pakai > 0) moved.push({ project: r.project, qty: pakai });
      }
      return { kept, moved };
    };
    const mergeReserved = (a: Reservation[], b: Reservation[]): Reservation[] => {
      const map = new Map<string, number>();
      for (const r of [...a, ...b]) map.set(r.project, (map.get(r.project) ?? 0) + Number(r.qty || 0));
      return Array.from(map.entries()).map(([project, qty]) => ({ project, qty }));
    };
    try {
      const srcB = splitBatches([...batchesOf(trTarget)].sort((a, b) => String(a.date).localeCompare(String(b.date))), qty);
      const srcR = splitReserved(reservedOf(trTarget), qty);
      const srcMinMap = { ...((trTarget.minStockByWarehouse as Record<string, number> | undefined) ?? {}) };
      await update("inventory", trTarget.id, { stock: srcStock - qty, batches: srcB.kept, reserved: srcR.kept });
      if (destRow) {
        /* Kumpulkan ke baris tujuan ber-itemId sama: tambah stok + batch + reservasi + minStock. */
        const destMinMap = { ...((destRow.minStockByWarehouse as Record<string, number> | undefined) ?? {}), ...srcMinMap };
        await update("inventory", destRow.id, {
          stock: Number(destRow.stock || 0) + qty,
          batches: [...batchesOf(destRow), ...srcB.moved],
          reserved: mergeReserved(reservedOf(destRow), srcR.moved),
          minStock: Math.max(Number(destRow.minStock || 0), Number(trTarget.minStock || 0)),
          minStockByWarehouse: destMinMap,
        });
      } else {
        /* Buat baris tujuan: SKU ASLI, sufiks lokasi di bin/rack (bukan SKU). */
        const rackSrc = String(trTarget.rack ?? trTarget.location ?? "").trim();
        const binSrc = binOf(trTarget);
        await add("inventory", {
          name: trTarget.name, sku: String(trTarget.sku), category: trTarget.category, warehouse: trDest,
          rack: rackSrc ? `${rackSrc} (${trDest})` : trDest,
          bin: binSrc ? `${binSrc} (${trDest})` : trDest,
          stock: qty, minStock: Number(trTarget.minStock || 0), unit: trTarget.unit,
          cost: trTarget.cost, location: rackSrc ? `${rackSrc} (${trDest})` : trDest,
          volume: Number(trTarget.volume) || 0, batch: String(trTarget.batch ?? ""),
          uom2: String((trTarget as unknown as Record<string, unknown>).uom2 ?? ""), konversi: Number((trTarget as unknown as Record<string, unknown>).konversi) || 0,
          minStockByWarehouse: { ...srcMinMap },
          photoUrl: String(trTarget.photoUrl ?? ""), avgCost: Number((trTarget as unknown as Record<string, unknown>).avgCost) || 0,
          batches: srcB.moved, reserved: srcR.moved,
        }, { action: "transfer gudang", target: `${trTarget.name} × ${qty}: ${from} → ${trDest}`, module: "Inventori" });
      }
      await add("movements", {
        item: trTarget.name, itemId: trTarget.id, type: "Transfer", qty,
        /* `by` tetap diisi "A -> B" agar baris lama & laporan lama tetap
           terbaca; fromWh/toWh sekarang jadi sumber terstruktur. */
        by: `${from} → ${trDest}`,
        fromWh: from,
        toWh: trDest,
        date: todayISO(), tone: "in",
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

  const saveRetur = async () => {
    const item = inventory.find((i) => i.id === retItem) ?? null;
    if (!item) { toast("Pilih item retur dulu", "info"); return; }
    const raw = Number(retQty);
    if (!raw || raw <= 0) { toast(S.qtyGtZero, "info"); return; }
    /* Retur mendukung UOM2, sama seperti barang masuk/keluar. Versi lama
       memakai qty apa adanya, jadi retur 500 kg pada barang yang disimpan
       per lbr (1 lbr = 1100 kg) mengurangi 500 LEBAR dari stok, dan koreksi
       hutangnya ikut 500x lebih besar dari seharusnya. */
    const useUom2 = hasUom2(item) && retUom === "uom2";
    const qty = useUom2 ? raw / convOf(item) : raw;
    if (qty > Number(item.stock)) { toast(S.stockShort.replace("{n}", fmtJumlah(Number(item.stock))), "info"); return; }
    if (!retVendor.trim()) { toast("Vendor retur wajib diisi", "info"); return; }
    if (!retReason.trim()) { toast("Alasan retur wajib diisi", "info"); return; }
    const vendorTrim = retVendor.trim();
    const qtyNote = useUom2 ? `${fmtJumlah(raw)} ${uom2Of(item)} (${fmtJumlah(qty)} ${item.unit})` : fmtJumlah(qty);
    try {
      await update("inventory", item.id, { stock: Number(item.stock) - qty });
      await add("movements", {
        item: item.name, itemId: item.id, type: "Retur", qty,
        by: `Retur ke ${vendorTrim} - ${retReason.trim()}${useUom2 ? ` · input ${qtyNote}` : ""}`,
        date: todayISO(), tone: "out",
        supplier: vendorTrim, purpose: retReason.trim(),
        branch: moveBranch(`${vendorTrim} ${retReason}`),
      }, { action: "meretur barang", target: `${item.name} × ${qtyNote} (${vendorTrim})`, module: "Inventori" });
      /* Koreksi hutang: cari payable po/item/vendor terkait, kurangi amt proporsional. */
      const cands = (data.payables ?? []).filter((a) => {
        const vendorOk = sameName(a.v ?? a.vendor, vendorTrim);
        const itemOk = sameName(a.item, item.name);
        const poOk = String(a.po ?? "").toLowerCase().includes(String(item.id).toLowerCase())
          || String(a.po ?? "").toLowerCase().includes(String(item.sku ?? "").split("@")[0].trim().toLowerCase());
        return (vendorOk && (itemOk || poOk || !a.item)) || (itemOk && !vendorTrim);
      });
      const unitVal = effCost(item);
      let corrected = 0;
      for (const a of cands) {
        const amt = Number(a.amt || 0);
        if (amt <= 0) continue;
        const red = Math.min(amt, Math.round(qty * unitVal * 100) / 100);
        if (red <= 0) continue;
        await update("payables", a.id, { amt: Math.round((amt - red) * 100) / 100 });
        log("koreksi hutang (retur)", `${a.id} · ${item.name} × ${qtyNote} → -${fmtRupiah(red)} (sisa ${fmtRupiah(amt - red)})`, "Inventori");
        corrected++;
      }
      log("meretur barang", `${item.name} × ${qtyNote} ke ${vendorTrim}: ${retReason.trim()}`, "Inventori");
      toast(corrected > 0
        ? `Retur ${item.name} × ${qtyNote} tersimpan + koreksi ${corrected} hutang`
        : `Retur ${item.name} × ${qtyNote} tersimpan (tanpa payable terkait)`);
      setShowRetur(false);
      setRetItem(""); setRetQty(""); setRetVendor(""); setRetReason(""); setRetUom("base");
    } catch {
      toast(S.transferFailed.replace("{n}", item.name), "info");
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
    try {
      await update("inventory", fresh.id, { reserved: next });
      log("reservasi stok", `${fresh.name} × ${qty} untuk ${reservProject}`, "Inventori");
      toast(S.reservSaved.replace("{a}", fresh.name).replace("{n}", String(qty)).replace("{b}", reservProject));
      setReservTarget(null);
      setReservProject("");
      setReservQtyInput("");
    } catch (e) {
      toast(e instanceof Error ? e.message : S.saveFail, "info");
    }
  };

  /* ================= CRUD GUDANG ================= */

  /**
   * Simpan alasan dead stock sebagai KODE + keterangan terpisah.
   * Field `deadReason` lama ikut ditulis (isi = label baku) supaya laporan
   * lama yang masih membacanya tidak kehilangan informasi.
   */
  const saveDeadReason = async (item: StoreItem, reason: DeadReason) => {
    try {
      await update("inventory", item.id, deadPatch(reason, String(item.deadNote ?? "")));
      log(
        "mengubah alasan dead stock",
        `${item.name} · ${locale === "en" ? reason.labelEn : reason.label}`,
        "Inventori",
      );
    } catch (e) {
      toast(e instanceof Error ? e.message : S.saveFail, "info");
    }
  };

  /** Buka form ubah. Gudang tanpa baris `warehouses` tetap bisa diisi
      kapasitasnya - baris baru dibuat dengan nama yang sama. */
  const openWhEdit = (row: { name: string; row?: StoreItem }) => {
    const r = row.row;
    setWhForm({
      name: row.name,
      type: String(r?.type ?? ""),
      capacity: r && Number(r.capacity) > 0 ? String(Number(r.capacity)) : "",
      lokasi: String(r?.lokasi ?? ""),
      pic: String(r?.pic ?? ""),
      aktif: r?.aktif === undefined || r?.aktif === null ? true : r.aktif !== false,
    });
    setWhEditing(r?.id ?? null);
    setShowWh(true);
  };

  const closeWh = () => {
    setShowWh(false);
    setWhEditing(null);
    setWhForm(emptyWhForm);
  };

  /**
   * Simpan gudang (create atau update).
   *
   * Menolak nama duplikat DI SISI FE juga, karena nama adalah kunci relasi:
   * dua gudang bernama sama akan menggabungkan kartu "Stok per Gudang" dan
   * membuat kolom Dari/Ke Gudang ambigu. Pengecekan yang sama ada di backend
   * (409) untuk menutup dua klien menulis bersamaan.
   */
  const saveWh = async () => {
    const name = whForm.name.trim();
    if (!name) {
      toast(locale === "en" ? "Warehouse name is required" : "Nama gudang wajib diisi", "info");
      return;
    }
    const cap = whForm.capacity.trim() === "" ? 0 : Number(whForm.capacity);
    if (!Number.isFinite(cap) || cap < 0) {
      toast(locale === "en" ? "Capacity must be a positive number" : "Kapasitas harus angka positif", "info");
      return;
    }
    const dup = (data.warehouses ?? []).find(
      (w) => sameName(w.name, name) && String(w.id) !== String(whEditing),
    );
    if (dup) {
      toast(
        locale === "en"
          ? `Name "${name}" is already used by another warehouse`
          : `Nama "${name}" sudah dipakai gudang lain`,
        "info",
      );
      return;
    }
    try {
      if (whEditing) {
        await update("warehouses", whEditing, {
          name,
          type: whForm.type.trim(),
          capacity: Math.round(cap),
          lokasi: whForm.lokasi.trim(),
          pic: whForm.pic.trim(),
          aktif: whForm.aktif,
        });
        log("mengubah gudang", name, "Inventori");
      } else {
        await add(
          "warehouses",
          {
            name,
            type: whForm.type.trim(),
            capacity: Math.round(cap),
            lokasi: whForm.lokasi.trim(),
            pic: whForm.pic.trim(),
            aktif: whForm.aktif,
          },
          { action: "mendaftarkan gudang", target: name, module: "Inventori" },
        );
        log("mendaftarkan gudang", name, "Inventori");
      }
      toast(
        locale === "en"
          ? `Warehouse ${name} saved`
          : `Gudang ${name} tersimpan`,
      );
      closeWh();
    } catch (e) {
      toast(e instanceof Error ? e.message : S.saveFail, "info");
    }
  };

  /**
   * Hapus gudang. Diblokir bila masih ada item yang tersimpan di sana:
   * menghapus barisnya tidak menghapus barang, hanya membuat stok jadi
   * tidak terlihat di tab Stok per Gudang. Saran: nonaktifkan (aktif=false)
   * alih-alih menghapus.
   */
  const confirmDelWh = async () => {
    if (!delWh) return;
    const name = String(delWh?.name ?? "");
    const items = inventory.filter((i) => sameName(i.warehouse, name));
    const moves = movements.filter((m) => {
      const f = movementFlow(m);
      return sameName(f.from.replace(/^Supplier:\s*/i, ""), name) || sameName(f.to, name);
    });
    if (items.length > 0 || moves.length > 0) {
      toast(
        locale === "en"
          ? `Cannot delete: ${items.length} item(s) and ${moves.length} movement(s) still reference this warehouse. Deactivate it instead.`
          : `Tidak dapat hapus: masih ada ${items.length} item dan ${moves.length} mutasi yang menunjuk gudang ini. Nonaktifkan saja.`,
        "info",
      );
      return;
    }
    try {
      await remove("warehouses", String(delWh.row?.id ?? ""));
      log("menghapus gudang", name, "Inventori");
      toast(locale === "en" ? `Warehouse ${name} deleted` : `Gudang ${name} dihapus`);
      setDelWh(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : S.saveFail, "info");
    }
  };

  const openPick = () => {
    const first = projects[0]?.id ?? "";
    setPickProject(first);
    const rows = first ? inventory.filter((i) => reservedOf(i).some((r) => r.project === first)) : [];
    setPickSel(rows.map((i) => i.id));
    const q0: Record<string, string> = {};
    for (const i of rows) {
      const res = reservedOf(i).find((r) => r.project === first);
      q0[i.id] = String(Number(res?.qty ?? 0));
    }
    setPickQty(q0);
    setPickFail([]);
    setShowPick(true);
  };

  const savePick = async () => {
    if (!pickProject) { toast(S.projectFirst, "info"); return; }
    if (pickSel.length === 0) { toast(S.pickCheckOne, "info"); return; }
    let ok = 0;
    const fails: string[] = [];
    for (const id of pickSel) {
      const it = inventory.find((i) => i.id === id);
      if (!it) { fails.push(`${id}: item tidak ditemukan`); continue; }
      const res = reservedOf(it).find((r) => r.project === pickProject);
      if (!res || Number(res.qty) <= 0) { fails.push(`${it.name}: tanpa reservasi untuk ${pickProject}`); continue; }
      const want = pickQty[id] !== undefined && pickQty[id] !== "" ? Number(pickQty[id]) : Number(res.qty);
      if (!Number.isFinite(want) || want <= 0) { fails.push(`${it.name}: qty pick tidak valid`); continue; }
      if (want > Number(res.qty)) { fails.push(`${it.name}: pick ${fmtJumlah(want)} melebihi reservasi ${fmtJumlah(Number(res.qty))}`); continue; }
      if (want > Number(it.stock)) { fails.push(`${it.name}: stok ${fmtJumlah(Number(it.stock))} kurang untuk pick ${fmtJumlah(want)}`); continue; }
      try {
        const rest = Number(res.qty) - want;
        await update("inventory", it.id, {
          stock: Number(it.stock) - want,
          reserved: rest > 0
            ? reservedOf(it).map((r) => (r.project === pickProject ? { project: r.project, qty: rest } : r))
            : reservedOf(it).filter((r) => r.project !== pickProject),
        });
        await add("movements", {
          item: it.name, itemId: it.id, type: "Pengeluaran", qty: want,
          by: `${pickProject} (Pick List)`, date: todayISO(), tone: "out",
          fromWh: String(it.warehouse ?? ""),
          toWh: String(pickProject),
          purpose: String(pickProject),
          pic: "Pick List",
          branch: moveBranch(String(pickProject)),
        }, { action: "pick list", target: `${it.name} × ${want} (${pickProject})`, module: "Inventori" });
        ok++;
      } catch {
        fails.push(`${it.name}: gagal simpan`);
      }
    }
    setPickFail(fails);
    if (ok === 0) { toast(fails.length > 0 ? `Pick gagal: ${fails[0]}` : S.pickNothing, "info"); return; }
    toast(S.pickDone.replace("{a}", pickProject).replace("{n}", String(ok)).replace("{b}", fails.length > 0 ? S.pickFailSuffix.replace("{n}", String(fails.length)) : ""));
    if (fails.length === 0) {
      setShowPick(false);
      setPickSel([]);
    }
  };

  return (
    <div>
      <PageHeader
        title={S.pageTitle}
        subtitle={S.pageSub}
        icon={<Warehouse className="h-5 w-5" />}
        actions={
          <div className="flex items-center gap-2">
            <AsyncButton className="btn-secondary" title={locale === "en" ? "Reload data from backend" : "Muat ulang data dari backend"} onAction={async () => { await resync(); toast(locale === "en" ? "Data refreshed" : "Data dimuat ulang"); }}><RefreshCw className="h-4 w-4" /> {locale === "en" ? "Refresh" : "Muat ulang"}</AsyncButton>
            <button className="btn-secondary" onClick={openPick}><ListChecks className="h-4 w-4" /> {S.pickTitle}</button>
            <button className="btn-primary-gradient" onClick={() => { setForm(emptyForm); setShowAdd(true); }}><Plus className="h-4 w-4" /> {S.btnNew}</button>
          </div>
        }
      />

      {modAlert.active && <AlertBannerView items={modAlert.items} onPick={pickNotif} />}

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard label={S.kpiItems} value={String(inventory.length)} icon={<Package className="h-5 w-5" />} chip="navy" spark={itemTrend} hint={S.kpiItemsHint} />
        {/* Angka di bawah memakai klasifikasi per kategori, bukan `stock <= minStock`.
            `hint` menyebut jumlah item KRITIS supaya manajer tahu mana yang
            harus/PR hari ini, bukan cuma total yang "menipis". */}
        <KpiCard
          label={S.kpiLow}
          value={String(lowStock.length)}
          delta={S.kpiLowDelta}
          deltaDirection="down"
          icon={<AlertTriangle className="h-5 w-5" />}
          chip="rose"
          spark={lowStockTrend}
          hint={
            warnByCat.reduce((s, c) => s + c.counts.critical, 0) > 0
              ? (locale === "en"
                ? `${warnByCat.reduce((s, c) => s + c.counts.critical, 0)} critical across ${warnByCat.filter((c) => c.counts.critical > 0).length} categories`
                : `${warnByCat.reduce((s, c) => s + c.counts.critical, 0)} kritis di ${warnByCat.filter((c) => c.counts.critical > 0).length} kategori`)
              : S.kpiLowDelta
          }
        />
        <KpiCard
          label={locale === "en" ? "Overstock items" : "Item Berlebih"}
          value={String(overStock.length)}
          icon={<Warehouse className="h-5 w-5" />}
          chip="blue"
          hint={locale === "en"
            ? "Stock far above min. Ties up working capital."
            : "Stok jauh di atas minimum. Mengikat modal kerja."}
        />
        <KpiCard label={S.kpiValue} value={fmtMiliar(totalValue)} hint={S.kpiValueHint} icon={<Package className="h-5 w-5" />} chip="teal" spark={stockValueTrend} />
        <KpiCard label={S.whLbl} value={S.whCount.replace("{n}", String(warehouses.length))} hint={warehouses.slice(0, 3).join(", ")} chip="violet" spark={warehouseTrend} />
      </div>

      <div className="card">
        <Tabs tabs={["Katalog", "Stok per Gudang", "BOM", "Pergerakan", "Tonase & Surat Jalan", "Analisis"]} active={tab} onChange={setTab} labels={{ Katalog: S.tabKatalog, "Stok per Gudang": S.tabWh, BOM: S.tabBom, Pergerakan: S.tabMoves, "Tonase & Surat Jalan": S.tabTonase, Analisis: S.tabAnalisis }} />
        <div className="p-4">
          {tab === "Katalog" && (
            <>
              <p className="mb-3 rounded-lg bg-steel-50 px-3 py-2 text-xs text-steel-500">{S.fifoInfo}</p>
              <p className="mb-3 rounded-lg bg-steel-50 px-3 py-2 text-xs text-steel-500">
                {locale === "en"
                  ? "ABC formula: items ranked by stock value (stock × cost); cumulative ≤70% = A, ≤90% = B, rest = C."
                  : "Rumus ABC: item diurutkan berdasar nilai stok (stok × harga); kumulatif ≤70% = A, ≤90% = B, sisanya = C."}
              </p>
              {/* Warning notification tidak lagi berupa banner besar per kategori.
                  Sebelumnya: satu blok amber muncul begitu ADA SATU item menyentuh
                  minStok, sehingga 1 dari 400 item menghasilkan peringatan untuk
                  kategori yang sebenarnya sehat - dan tidak ada yang bisa tahu
                  item mana yang prioritas.

                  Sekarang: BANNER DIHAPUS, diganti strip ringkas yang
                  (a) hanya muncul bila ada item KRITIS,
                  (b) dikelompokkan per kategori dengan ambang berbeda
                      (utils/inventoryWarn.ts),
                  (c) bisa diklik untuk memfilter tabel ke item-item itu.
                  Detail lengkap ada di tab Analisis ("Warning per Kategori"). */}
              {warnByCat.length > 0 && (
                <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-steel-200 bg-steel-50 px-3 py-2 text-xs">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                  <span className="font-medium text-navy-900">
                    {locale === "en" ? "Attention needed" : "Perlu perhatian"}
                  </span>
                  {warnByCat.map((c) => (
                    <button
                      key={c.category}
                      type="button"
                      title={
                        locale === "en"
                          ? `${c.category}: ${c.counts.critical} critical, ${c.counts.low} low, ${c.counts.overstock} overstock. Click to filter the catalog.`
                          : `${c.category}: ${c.counts.critical} kritis, ${c.counts.low} menipis, ${c.counts.overstock} berlebih. Klik untuk memfilter katalog.`
                      }
                      onClick={() => {
                        setCat(c.category);
                        setTab("Katalog");
                      }}
                      className="inline-flex items-center gap-1.5 rounded-full border border-white bg-white px-2 py-0.5 font-medium shadow-sm hover:border-ocean-300"
                    >
                      <span className="text-navy-900">{c.category}</span>
                      {c.counts.critical > 0 && <Badge tone="red">{c.counts.critical} {locale === "en" ? "critical" : "kritis"}</Badge>}
                      {c.counts.low > 0 && <Badge tone="amber">{c.counts.low} {locale === "en" ? "low" : "menipis"}</Badge>}
                      {c.counts.overstock > 0 && <Badge tone="blue">{c.counts.overstock} {locale === "en" ? "over" : "berlebih"}</Badge>}
                    </button>
                  ))}
                </div>
              )}
              <div className="mb-3 flex flex-wrap gap-3">
                <div className="relative min-w-52 flex-1 sm:max-w-xs">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-steel-400" />
                  <input className="input pl-9 w-full" placeholder={S.searchPh} aria-label={S.searchAria} value={q} onChange={(e) => setQ(e.target.value)} />
                </div>
                <FilterPopover
                  activeCount={[cat !== "Semua", wh !== "Semua", abcF !== "Semua", matF !== "Semua"].filter(Boolean).length}
                  initial={{ cat, wh, abc: abcF, mat: matF }}
                  onReset={() => { setCat("Semua"); setWh("Semua"); setAbcF("Semua"); setMatF("Semua"); }}
                  onApply={(d) => { setCat(d.cat); setWh(d.wh); setAbcF(d.abc); setMatF(d.mat ?? "Semua"); }}
                >
                  {(draft, setDraft) => (
                    <div className="space-y-3">
                      <Field label={locale === "en" ? "Warehouse (Semua gudang)" : "Gudang (Semua gudang)"}>
                        <select className="input w-full" value={draft.wh} onChange={(e) => setDraft({ ...draft, wh: e.target.value })} aria-label={S.whAria}>
                          {["Semua", ...warehouses].map((w) => <option key={w} value={w}>{w === "Semua" ? "Semua gudang" : w}</option>)}
                        </select>
                      </Field>
                      <Field label={locale === "en" ? "ABC class (Semua kelas)" : "Kelas ABC (Semua kelas) — A: 70% nilai, B: 20%, C: 10%"}>
                        <select className="input w-full" value={draft.abc} onChange={(e) => setDraft({ ...draft, abc: e.target.value })} aria-label={S.abcAria}>
                          {["Semua", "A", "B", "C"].map((a) => <option key={a} value={a}>{a === "Semua" ? "Semua kelas" : `Kelas ${a}`}</option>)}
                        </select>
                      </Field>
                      <Field label={locale === "en" ? "Material type (All types)" : "Jenis material (Semua jenis)"}>
                        <select className="input w-full" value={draft.mat ?? "Semua"} onChange={(e) => setDraft({ ...draft, mat: e.target.value })}>
                          <option value="Semua">Semua jenis</option>
                          {[...MAT_TYPES].map((m) => <option key={m} value={m}>{matLabel(m)}</option>)}
                        </select>
                      </Field>
                      <div>
                        <p className="mb-1.5 block text-xs font-medium text-steel-600">{S.catLbl}</p>
                        <div className="flex flex-wrap gap-1">
                          {categories.map((c) => (
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
                    <tr><SortTh label={S.thMaterial} sortKey="material" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.catLbl} sortKey="kategori" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={locale === "en" ? "Type" : "Jenis"} sortKey="mattype" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.thQty} sortKey="qty" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.thVolume} sortKey="volume" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.thTotal} sortKey="total" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.thAbc} sortKey="abc" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.thStatus} sortKey="status" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.thRak} sortKey="rak" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><SortTh label={S.binLbl} sortKey="bin" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} /><th className="th">{S.thAksi}</th></tr>
                  </thead>
                  <tbody className="divide-y divide-steel-100">
{pager.slice(sorted).map((i) => {
                       /* Badge status memakai klasifikasi per kategori, bukan
                          `stock <= minStock` polos. Kategori lead-time panjang
                          dapat lebih awal peringatan; kategori jasa (tanpa stok
                          fisik) tidak pernah amber. */
                       const warn = warnLevelOf(i);
                       const badge = katalogBadge(i);
                       const minWh = effectiveMinStock(i);
                       const reserved = reservedQty(i);
                      const conv = convOf(i);
                      const u2 = uom2Of(i);
                      return (
                        <tr key={i.id} id={notifRowId(String(i.id))} className={flash.flashId === String(i.id) ? "notif-hl notif-flash hover:bg-surface" : (notified.has(String(i.id)) ? "notif-hl hover:bg-surface" : "hover:bg-surface")}>
                          <td className="td">
                            <p className="font-medium text-navy-900 truncate" title={String(i.name)}>{i.name}</p>
                            <p className="text-xs text-steel-500 font-mono">{i.sku}</p>
                            {reserved > 0 && <p className="text-xs text-amber-600">Reservasi {fmtJumlah(reserved)} {i.unit}</p>}
                          </td>
                          <td className="td"><Badge tone="gray">{i.category}</Badge></td>
                          <td className="td"><Badge tone={matTone(matTypeOf(i))}>{matLabel(matTypeOf(i))}{isEceran(i) ? " · Eceran" : ""}</Badge></td>
                          <td className="td font-semibold text-navy-900">
                            {fmtJumlah(Number(i.stock))} <span className="font-normal text-steel-400">{i.unit}</span>
                            {hasUom2(i) && <p className="text-xs font-normal text-steel-400">≈ {fmtJumlah(qtyInUom2(i))} {u2} (1 {i.unit} = {fmtJumlah(conv)} {u2})</p>}
                          </td>
                          <td className="td text-steel-600">{fmtJumlah(Number(i.volume ?? 0))}</td>
                          <td className="td font-semibold text-navy-900">{fmtRupiah(Number(i.stock) * effCost(i))}</td>
                          <td className="td"><Badge tone={abc[i.id] === "A" ? "red" : abc[i.id] === "B" ? "amber" : "gray"}>{abc[i.id]}</Badge></td>
                          <td className="td">
                            <Badge tone={badge.tone} title={
                              minWh <= 0
                                ? (locale === "en" ? "No minimum set" : "Minimum stok belum diisi")
                                : `${fmtJumlah(Number(i.stock))} ${String(i.unit ?? "")} dari minimum ${fmtJumlah(minWh)} ${String(i.unit ?? "")}`
                            }>{locale === "en" ? badge.textEn : badge.text}</Badge>
                            {warn.level === "critical" && (
                              <p className="mt-0.5 text-[11px] text-rose-600">
                                {locale === "en" ? "needs PR now" : "perlu PR sekarang"}
                              </p>
                            )}
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
                              <button className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50" title={locale === "en" ? "Delete" : "Hapus"} aria-label={`${locale === "en" ? "Delete" : "Hapus"} ${i.name}`} onClick={() => setDelInv(i)}><Trash2 className="h-4 w-4" /></button>
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
            <div className="space-y-4">
              {/* ==== HEADER + CRUD GUDANG ====
                  Dulunya tab ini hanya menampilkan kartu per gudang yang
                  TERDAFTAR di inventory, sehingga:
                    - gudang baru tidak bisa dibuat sebelum ada item di dalamnya,
                    - kapasitas hanya bisa diisi lewat settings.WAREHOUSE_CAP
                      (JSON mentah di halaman Pengaturan - tidak ada validasi),
                    - tidak ada edit/hapus sama sekali.
                  Sekarang baris `warehouses` (koleksi penuh, bukan JSON) jadi
                  sumber utama; kartu di bawah membaca dari sana. */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-navy-900">
                    {locale === "en" ? "Warehouse master & capacity" : "Data Gudang & Kapasitas"}
                  </h3>
                  <p className="text-xs text-steel-500">
                    {locale === "en"
                      ? "Capacity is a rough limit (mixed units). Set it here so utilisation can be tracked per warehouse."
                      : "Kapasitas adalah batas perkiraan (satuan tercampur). Diisi di sini agar utilisasi tiap gudang bisa dilacak."}
                  </p>
                </div>
                <button className="btn-primary-gradient" onClick={() => { setWhForm(emptyWhForm); setWhEditing(null); setShowWh(true); }}>
                  <Plus className="h-4 w-4" /> {locale === "en" ? "New warehouse" : "Tambah Gudang"}
                </button>
              </div>

              {/* ==== KARTU GUDANG (CRUD + KAPASITAS + RINCIAN STOK) ====
                  Tabel master Gudang yang pernah ada di atas dihapus. Grid
                  kartu ini sebenarnya sudah menampilkan gudang yang sama persis
                  (whSorted = sortRows(warehouseRows), bukan daftar lain), jadi
                  setiap gudang tampil DUA KALI: sekali sebagai baris 10 kolom,
                  sekali lagi sebagai kartu di bawahnya. Baris tabelnya yang
                  dipakai adalah kolom yang tidak ada di kartu - Jenis, PIC,
                  Status Aktif, dan id - jadi kolom itu dipindahkan ke kartu,
                  bukan dibuat presentasi ketiga. Utilisasi, item count, dan
                  kapasitas sudah ada di kartu sejak awal.

                  Konsekuensi yang disengaja: tabel tidak bisa diurutkan lewat
                  klik header, jadi pengurut dipindah jadi <select> di header
                  (pakai state sort2 yang sama). */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-steel-500">
                  {locale === "en" ? "Sort" : "Urutkan"}:
                </span>
                <select
                  className="input w-auto py-1.5 text-xs"
                  value={`${sort2.key}:${sort2.dir}`}
                  onChange={(e) => {
                    const [key, dir] = e.target.value.split(":");
                    setSort2({ key, dir: dir === "asc" ? "asc" : "desc" } as SortState);
                  }}
                  aria-label={locale === "en" ? "Sort warehouses" : "Urutkan gudang"}
                >
                  <option value="nama:asc">{locale === "en" ? "Name A-Z" : "Nama A-Z"}</option>
                  <option value="nama:desc">{locale === "en" ? "Name Z-A" : "Nama Z-A"}</option>
                  <option value="jenis:asc">{locale === "en" ? "Type" : "Jenis"}</option>
                  <option value="item:desc">{locale === "en" ? "Most items" : "Paling banyak item"}</option>
                  <option value="item:asc">{locale === "en" ? "Fewest items" : "Paling sedikit item"}</option>
                  <option value="terisi:desc">{locale === "en" ? "Most filled" : "Paling terisi"}</option>
                  <option value="kapasitas:desc">{locale === "en" ? "Largest capacity" : "Kapasitas terbesar"}</option>
                </select>
                <span className="text-xs text-steel-400">{whSorted.length} gudang</span>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {whSorted.map((row) => {
                const items = row.items;
                const gq = (gudangQ[row.name] ?? "").trim().toLowerCase();
                const shown = gq ? items.filter((i) => `${i.name} ${i.sku} ${binOf(i)}`.toLowerCase().includes(gq)) : items;
                return (
                  <Card key={row.name} className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-semibold text-navy-900 truncate" title={row.name}>{row.name}</h3>
                      <div className="flex shrink-0 gap-1">
                        <button
                          className="rounded-lg p-1 text-steel-400 hover:bg-steel-100 hover:text-navy-700"
                          title={locale === "en" ? "Edit warehouse" : "Ubah gudang"}
                          aria-label={`${locale === "en" ? "Edit" : "Ubah"} ${row.name}`}
                          onClick={() => openWhEdit(row)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          className="rounded-lg p-1 text-steel-400 hover:bg-rose-50 hover:text-rose-600"
                          title={locale === "en" ? "Delete warehouse" : "Hapus gudang"}
                          aria-label={`${locale === "en" ? "Delete" : "Hapus"} ${row.name}`}
                          onClick={() => setDelWh(row)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-steel-500">{items.length} item · {fmtJumlah(row.used)} unit{row.row?.lokasi ? ` · ${String(row.row.lokasi)}` : ""}</p>
                    {/* Kolom yang sebelumnya hanya ada di tabel master: Status
                        daftar, Jenis, PIC, dan id. Dipindah ke kartu supaya
                        tidak ada data gudang yang hanya terlihat di tabel. */}
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {row.row
                        ? (row.row.aktif === false
                          ? <Badge tone="gray">{locale === "en" ? "Inactive" : "Nonaktif"}</Badge>
                          : <Badge tone="green">{locale === "en" ? "Active" : "Aktif"}</Badge>)
                        : <Badge tone="amber">{locale === "en" ? "Unregistered" : "Belum daftar"}</Badge>}
                      {row.row?.type ? <Badge tone="ocean">{String(row.row.type)}</Badge> : null}
                      {row.row?.id && <span className="font-mono text-[11px] text-steel-400">{String(row.row.id)}</span>}
                    </div>
                    {row.row?.pic ? (
                      <p className="mt-1.5 text-xs text-steel-600">
                        <span className="text-steel-400">{locale === "en" ? "PIC" : "PIC"}: </span>
                        {String(row.row.pic)}
                      </p>
                    ) : null}
                    {row.pct !== null && (
                      <div className="mt-2">
                        <ProgressBar value={row.pct} tone={row.tone} />
                        <p className="mt-1 text-[11px] text-steel-500">
                          {locale === "en" ? "Capacity" : "Kapasitas"}: {fmtJumlah(row.used)} / {fmtJumlah(row.capacity)} ({row.pct}%)
                          {row.over && <span className="ml-1 font-medium text-rose-600">{locale === "en" ? "over limit" : "melebihi batas"}</span>}
                        </p>
                      </div>
                    )}
                    {row.pct === null && (
                      <button className="btn-secondary mt-2 !py-1 text-[11px]" onClick={() => openWhEdit(row)}>
                        {locale === "en" ? "Set capacity" : "Tentukan kapasitas"}
                      </button>
                    )}
                    <div className="relative mt-2">
                      <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-steel-400" />
                      <input className="input pl-8 !py-1.5 text-xs" placeholder={S.anSearchPh} aria-label={`${S.anSearchPh} ${row.name}`} value={gudangQ[row.name] ?? ""} onChange={(e) => setGudangQ((m) => ({ ...m, [row.name]: e.target.value }))} />
                    </div>
                    <div className="mt-3 max-h-64 space-y-1.5 overflow-y-auto pr-1">
                      {shown.map((i) => {
                        /* Badge memakai klasifikasi kategori (bukan stock<=min polos)
                           dan minimum per-gudang bila tersedia. */
                        const whMin = minWhOf(i, row.name);
                        const lv = warnLevelOf(i, row.name).level;
                        return (
                          <div key={i.id} className="flex items-center justify-between gap-2 text-sm">
                            <span className="text-steel-600 truncate" title={`${String(i.name)} · rak ${rackText(i)} · bin ${binOf(i) || "-"} · min gudang ${fmtJumlah(whMin)}`}>{i.name}{binOf(i) ? <span className="font-mono text-xs text-steel-400"> · {binOf(i)}</span> : null}</span>
                            <span className="flex shrink-0 items-center gap-1.5 font-medium">
                              {(lv === "critical" || lv === "low") && (
                                <Badge tone={lv === "critical" ? "red" : "amber"} title={locale === "en" ? `Minimum for this warehouse: ${whMin}` : `Minimum gudang ini: ${fmtJumlah(whMin)}`}>
                                  {lv === "critical" ? (locale === "en" ? "Critical" : "Kritis") : (locale === "en" ? "Low" : "Menipis")}
                                </Badge>
                              )}
                              {fmtJumlah(Number(i.stock))}
                            </span>
                          </div>
                        );
                      })}
                      {shown.length === 0 && (
                        <p className="py-3 text-center text-xs text-steel-400">
                          {gq ? (locale === "en" ? "No match" : "Tidak ada yang cocok") : (locale === "en" ? "No items stored" : "Belum ada barang")}
                        </p>
                      )}
                    </div>
                    {gq && <p className="mt-1 text-[11px] text-steel-400">{shown.length} / {items.length}</p>}
                  </Card>
                );
              })}
              {/* Empty state ikut pindah dari tabel yang dihapus - tanpa ini
                  tab "Stok per Gudang" kosong tanpa penjelasan begitu
                  pertama kali dibuka. */}
              {whSorted.length === 0 && (
                <div className="rounded-xl border border-dashed border-steel-300 bg-surface p-8 text-center md:col-span-2 lg:col-span-3">
                  <p className="text-sm font-medium text-steel-600">
                    {locale === "en" ? "No warehouses yet." : "Belum ada gudang."}
                  </p>
                  <p className="mt-1 text-xs text-steel-400">
                    {locale === "en"
                      ? "Add one to start tracking capacity."
                      : "Tambah dulu untuk mulai melacak kapasitas."}
                  </p>
                </div>
              )}
              </div>
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
                <div className="relative mt-2">
                  <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-steel-400" />
                  <input className="input pl-8 !py-1.5 text-xs" placeholder={S.anSearchPh} aria-label={S.anSearchPh} value={bomNeedQ} onChange={(e) => setBomNeedQ(e.target.value)} />
                </div>
                <div className="mt-3 max-h-96 space-y-2 overflow-y-auto pr-1">
                  {bomNeedShown.map((b) => {
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
              </Card>
              <Card className="p-5">
                <CardHeader title={S.aksiMatT} subtitle={S.aksiMatS} />
                <div className="mt-4 space-y-3">
                  <button className="btn-primary w-full justify-center whitespace-nowrap py-5 text-base" title={grGiTip("Penerimaan", locale)} onClick={() => { const first = lowStock[0] ?? inventory[0]; if (first) openMove(first, "in"); }}><ArrowDownToLine className="h-4 w-4" /> {S.btnGr}</button>
                  <button className="btn-secondary w-full justify-center" title={grGiTip("Pengeluaran", locale)} onClick={() => { const first = inventory[0]; if (first) openMove(first, "out"); }}><ArrowUpFromLine className="h-4 w-4" /> {S.btnGi}</button>
                  <button className="btn-secondary w-full justify-center" onClick={() => setShowTransfer(true)}><Repeat className="h-4 w-4" /> {S.btnTransfer}</button>
                  <button className="btn-secondary w-full justify-center" onClick={() => { setRetItem(""); setRetQty(""); setRetVendor(""); setRetReason(""); setRetUom("base"); setShowRetur(true); }}><ArrowUpFromLine className="h-4 w-4" /> Retur ke Vendor</button>
                  <button className="btn-secondary w-full justify-center" onClick={() => setShowOpname(true)}><ClipboardCheck className="h-4 w-4" /> {S.opnameT}</button>
                </div>
              </Card>
              <Card className="p-5 lg:col-span-3">
                <CardHeader title={S.fcT} subtitle={S.fcS} />
                <div className="relative mt-2 max-w-xs">
                  <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-steel-400" />
                  <input className="input pl-8 !py-1.5 text-xs" placeholder={S.anSearchPh} aria-label={S.anSearchPh} value={bomFcQ} onChange={(e) => setBomFcQ(e.target.value)} />
                </div>
                <div className="mt-3 max-h-96 overflow-y-auto">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-surface sticky top-0 z-10">
                      <tr><SortTh label={S.thProyek} sortKey="proyek" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} /><SortTh label={S.thNeed} sortKey="kebutuhan" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} /><SortTh label={S.stockLbl} sortKey="stok" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} /><SortTh label={S.thNet} sortKey="bersih" sort={sort2} onSort={(k) => setSort2((s) => toggleSort(s, k))} /><th className="th">{S.thAksi}</th></tr>
                    </thead>
                    <tbody className="divide-y divide-steel-100">
                      {sortRows(forecastBase.filter((f) => {
                        const nq = bomFcQ.trim().toLowerCase();
                        if (nq && !`${f.project} ${f.vessel} ${f.key} ${f.item?.name ?? ""}`.toLowerCase().includes(nq)) return false;
                        return true;
                      }), sort2, (f, k) => {
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
                </div>
                </div>
                {forecastBase.length === 0 && <EmptyState title={S.emptyNoProjT} subtitle={S.emptyNoProjS} />}
              </Card>
            </div>
            </div>
          )}

          {tab === "Pergerakan" && (
            <div className="space-y-4">
              <Card>
                <CardHeader title={S.trendT} subtitle={S.trendS} action={
                  <select className="input w-auto py-1.5 text-xs" value={trendYear} onChange={(e) => setTrendYear(e.target.value)} aria-label={locale === "en" ? "Filter year" : "Filter tahun"}>
                    <option value="Semua">{locale === "en" ? "All years" : "Semua tahun"}</option>
                    {trendYears.map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                } />
                <div className="h-44 p-4 pt-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trendShown} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
                      <defs><linearGradient id="invGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#0b3a63" stopOpacity={0.3} /><stop offset="95%" stopColor="#0b3a63" stopOpacity={0} /></linearGradient></defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e9eff4" vertical={false} />
                      <XAxis dataKey="label" stroke="#8aa2b6" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
                      <YAxis stroke="#8aa2b6" axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTooltip formatter={(v) => `Rp ${v} M`} />} />
                      <Area type="monotone" dataKey="nilai" stroke="#0b3a63" strokeWidth={2.5} fill="url(#invGrad)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </Card>
              <p className="rounded-lg bg-steel-50 px-3 py-2 text-xs text-steel-500" title={locale === "en" ? "Goods in = stock received · Goods out = stock issued" : "Barang masuk = stok diterima · Barang keluar = stok dikeluarkan"}>
                {locale === "en" ? "Goods in = stock received · Goods out = stock issued" : "Barang masuk = stok diterima · Barang keluar = stok dikeluarkan"}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-xs font-medium text-steel-600" htmlFor="mov-wh">{locale === "en" ? "Warehouse" : "Gudang"}</label>
                <select id="mov-wh" className="input w-auto py-1.5 text-xs" value={movWh} onChange={(e) => setMovWh(e.target.value)}>
                  <option value="Semua">{locale === "en" ? "All warehouses" : "Semua gudang"}</option>
                  {warehouses.map((w) => <option key={w} value={w}>{w}</option>)}
                </select>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-surface sticky top-0 z-10">
                    <tr><SortTh label={S.thTx} sortKey="transaksi" sort={sort3} onSort={(k) => setSort3((s) => toggleSort(s, k))} /><SortTh label={S.itemLbl} sortKey="item" sort={sort3} onSort={(k) => setSort3((s) => toggleSort(s, k))} /><SortTh label={S.thType} sortKey="tipe" sort={sort3} onSort={(k) => setSort3((s) => toggleSort(s, k))} /><SortTh label={S.jumlahLbl} sortKey="jumlah" sort={sort3} onSort={(k) => setSort3((s) => toggleSort(s, k))} /><SortTh label={locale === "en" ? "From warehouse" : "Dari Gudang"} sortKey="dari" sort={sort3} onSort={(k) => setSort3((s) => toggleSort(s, k))} /><SortTh label={locale === "en" ? "To warehouse" : "Ke Gudang"} sortKey="ke" sort={sort3} onSort={(k) => setSort3((s) => toggleSort(s, k))} /><SortTh label={locale === "en" ? "Detail" : "Detail Transaksi"} sortKey="info" sort={sort3} onSort={(k) => setSort3((s) => toggleSort(s, k))} /><SortTh label={S.thRef} sortKey="referensi" sort={sort3} onSort={(k) => setSort3((s) => toggleSort(s, k))} /><SortTh label={S.thTotalCol} sortKey="total" sort={sort3} onSort={(k) => setSort3((s) => toggleSort(s, k))} /><SortTh label={S.dateLbl} sortKey="tanggal" sort={sort3} onSort={(k) => setSort3((s) => toggleSort(s, k))} /><th className="th">{S.thAksi}</th></tr>
                  </thead>
                  <tbody className="divide-y divide-steel-100">
                    {movPager.slice(movSorted).map((m) => {
                      /* Kolom "Dari Gudang" / "Ke Gudang" DIPISAH, bukan satu
                         string gabungan. movementFlow() memecah baris mutasi
                         jadi dua endpoint:
                           - Barang Masuk  : dari = Supplier, ke = gudang tujuan
                           - Barang Keluar : dari = gudang,        ke = tujuan pakai
                           - Transfer     : dari = gudang asal,   ke = gudang tujuan
                           - Opname       : dari = ke = gudang itu sendiri
                         Supaya rekonsiliasi stok per gudang bisa dibaca langsung
                         dari tabel tanpa perlu paham format "A -> B". */
                      const flow = movementFlow(m);
                      const tipe = String(m.type ?? "");
                      const tipeLabel = moveLabel(m.type);
                      return (
                      <tr key={m.id} className="hover:bg-surface">
                        <td className="td font-mono font-medium text-navy-900">{m.id}</td>
                        <td className="td text-steel-600 truncate" title={String(m.item)}>{m.item}</td>
                        <td className="td">
                          <span title={grGiTip(tipe, locale)}>
                            <Badge tone={moveTone(m.type, m.tone)}>
                              {tipeLabel}
                            </Badge>
                          </span>
                        </td>
                        <td className="td font-semibold">{fmtJumlah(Number(m.qty))}</td>
                        {/* --- DARI GUDANG --- */}
                        <td className="td text-xs">
                          {flow.from !== "" ? (
                            <>
                              <p className="truncate font-medium text-navy-900" title={flow.from}>{flow.from}</p>
                              {flow.from.startsWith("Supplier:") && (
                                <p className="text-[11px] text-steel-400">{locale === "en" ? "external" : "eksternal"}</p>
                              )}
                            </>
                          ) : (
                            <span className="text-steel-400" title={locale === "en" ? "Not applicable for this movement type" : "Tidak berlaku untuk tipe mutasi ini"}>-</span>
                          )}
                        </td>
                        {/* --- KE GUDANG --- */}
                        <td className="td text-xs">
                          {flow.to !== "" ? (
                            <>
                              <p className="truncate font-medium text-navy-900" title={flow.to}>{flow.to}</p>
                              <p className="text-[11px] text-steel-400">
                                {flow.internal
                                  ? (locale === "en" ? "internal" : "internal")
                                  : (locale === "en" ? "issued" : "keluar")}
                              </p>
                            </>
                          ) : (
                            <span className="text-steel-400" title={locale === "en" ? "Not recorded" : "Tidak tercatat"}>-</span>
                          )}
                        </td>
                        {/* --- DETAIL TRANSAKSI --- */}
                        <td className="td text-xs text-steel-600">
                          <p className="font-medium text-navy-900" title={tipeLabel}>{tipeLabel}</p>
                          {m.supplier ? <p className="truncate" title={String(m.supplier)}>{locale === "en" ? "Supplier" : "Supplier"}: {m.supplier}</p> : null}
                          {m.purpose ? <p className="truncate" title={String(m.purpose)}>U: {m.purpose}</p> : null}
                          {m.pic ? <p className="truncate" title={String(m.pic)}>PIC: {m.pic}</p> : null}
                          {m.keterangan ? <p className="truncate italic" title={String(m.keterangan)}>{m.keterangan}</p> : null}
                          {!m.supplier && !m.purpose && !m.pic && !m.keterangan ? (
                            <span className="text-steel-400">-</span>
                          ) : null}
                        </td>
                        <td className="td font-mono text-xs text-steel-600 truncate" title={String(m.by)}>{m.by}</td>
                        <td className="td text-xs font-semibold">{Number(m.total) ? fmtRupiah(Number(m.total)) : "-"}</td>
                        <td className="td text-steel-600">{fmtTanggal(m.date)}</td>
                        <td className="td">
                          <div className="flex gap-1">
                            <button className="rounded-lg p-1.5 text-steel-500 hover:bg-steel-100" title={locale === "en" ? "Edit movement (info only, stock untouched)" : "Ubah movement (info saja, stok tidak diubah)"} aria-label={`${locale === "en" ? "Edit movement" : "Ubah movement"} ${m.id}`} onClick={() => openMoveEdit(m)}><Pencil className="h-4 w-4" /></button>
                            <button className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50" title={locale === "en" ? "Delete movement only (stock NOT adjusted)" : "Hapus movement saja (stok TIDAK dikoreksi)"} aria-label={`${locale === "en" ? "Delete movement" : "Hapus movement"} ${m.id}`} onClick={() => setDelMove(m)}><Trash2 className="h-4 w-4" /></button>
                          </div>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
                {movPager.bar}
              </div>
            </div>
          )}

          {tab === "Tonase & Surat Jalan" && (
            <>
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
                    try {
                      await add("inventory", {
                        name: `Plat ${tonT}mm ${tonP}x${tonL}`, category: "Baja", sku: `PLAT-${tonT}-${tonP}X${tonL}-${Date.now().toString(36).toUpperCase()}`,
                        warehouse: "Gudang Baja A", rack: "", bin: "", stock: Number(tonPcs) || 0, minStock: 0, unit: "lbr",
                        cost: 0, location: "", volume: kg, batch: "", uom2: "kg", konversi: kg / Math.max(1, Number(tonPcs) || 1),
                        minStockByWarehouse: {}, photoUrl: "", avgCost: 0, batches: [], reserved: [],
                      }, { action: "mendaftarkan plat dari kalkulator tonase", module: "Inventori" });
                      toast(S.plateAdded.replace("{a}", tonT).replace("{b}", String(kg)));
                    } catch (e) {
                      toast(e instanceof Error ? e.message : S.saveFail, "info");
                    }
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
                    try {
                      await add("documents", {
                        id: `SJ-SMD-${sjYearOf(sjDate)}-${String(seq).padStart(3, "0")}`,
                        title: `Surat Jalan ke ${sjTo.trim()}`, type: "Surat Jalan", project: "-", vessel: sjTo.trim(),
                        owner: sjGiver.trim() || "Anda", sbRef: no, sjDate, sjVehicle: sjVehicle.trim(), sjPlate: sjPlate.trim(),
                        sjDriver: sjDriver.trim(), sjItems: items, sjReceiver: sjReceiver.trim(), sjGiver: sjGiver.trim(),
                        version: "v1.0", status: "Berlaku", updated: todayISO(), archived: false, docCopy: "Terkendali",
                        related: [], revisions: [{ version: "v1.0", at: todayISO(), by: sjGiver.trim() || "Anda", note: "Surat jalan diterbitkan" }],
                      }, { action: "menerbitkan surat jalan", target: no, module: "Inventori" });
                      /* PDF resmi dibuat lebih dulu supaya berkas yang diarsipkan
                         selalu ada; Excel tetap ditambahkan sebagai pilihan kedua. */
                      goodsNoteDoc({
                        title: "Surat Jalan",
                        no,
                        tanggal: sjDate,
                        tujuan: sjTo.trim(),
                        extra: [
                          { label: locale === "en" ? "Vehicle" : "Kendaraan", value: sjVehicle.trim() },
                          { label: locale === "en" ? "Plate no." : "No. Polisi", value: sjPlate.trim() },
                          { label: locale === "en" ? "Driver" : "Driver", value: sjDriver.trim() },
                        ],
                        items: items.map((x) => ({ name: x.name.trim(), qty: x.qty.trim() })),
                        receiver: sjReceiver.trim(),
                        giver: sjGiver.trim(),
                        labels: GOODS_NOTE_LABELS(locale),
                      }).save(`SJ-${no.replaceAll("/", "-")}`);
                      void exportExcel([
                        [SB_KOP.line1, SB_KOP.name], [SB_KOP.hq, `HP ${SB_KOP.hp}`], [],
                        ["SURAT JALAN", `NO REF: ${no}`], ["Tanggal", sjDate], ["Tujuan", sjTo.trim()],
                        ["Kendaraan", sjVehicle.trim()], ["No. Polisi", sjPlate.trim()], ["Driver", sjDriver.trim()], [],
                        ["No", "Nama Barang", "Jumlah"], ...items.map((x, i) => [i + 1, x.name.trim(), x.qty.trim()]), [],
                        ["Yang Menerima", "Yang Menyerahkan"], [sjReceiver.trim(), sjGiver.trim()],
                      ], `SJ-${no.replaceAll("/", "-")}`, "Surat Jalan").catch(() => toast(S.saveFail, "info"));
                      toast(S.sjIssued.replace("{n}", no));
                      setSjTo(""); setSjVehicle(""); setSjPlate(""); setSjDriver("");
                      setSjItems([{ name: "", qty: "" }]); setSjReceiver(""); setSjGiver("");
                    } catch (e) {
                      toast(e instanceof Error ? e.message : S.saveFail, "info");
                    }
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
                    try {
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
                      goodsNoteDoc({
                        title: "Tanda Terima",
                        no,
                        tanggal: ttDate,
                        tujuan: "",
                        extra: [{ label: locale === "en" ? "Delivery note" : "Surat Jalan", value: sj ? String(sj.sbRef || sj.id) : "-" }],
                        items: items.map((x) => ({ name: x.name.trim(), qty: x.qty.trim() })),
                        receiver: ttReceiver.trim(),
                        giver: ttGiver.trim(),
                        labels: GOODS_NOTE_LABELS(locale),
                      }).save(`TT-${no.replaceAll("/", "-")}`);
                      void exportExcel([
                        [SB_KOP.line1, SB_KOP.name], [SB_KOP.hq, `HP ${SB_KOP.hp}`], [],
                        ["TANDA TERIMA", `NO REF: ${no}`], ["Tanggal", ttDate],
                        ["Surat Jalan", sj ? String(sj.sbRef || sj.id) : "-"], [],
                        ["No", "Nama Barang", "Jumlah"], ...items.map((x, i) => [i + 1, x.name.trim(), x.qty.trim()]), [],
                        ["Yang Menerima", "Yang Menyerahkan"], [ttReceiver.trim(), ttGiver.trim()],
                      ], `TT-${no.replaceAll("/", "-")}`, "Tanda Terima").catch(() => toast(S.saveFail, "info"));
                      toast(S.ttIssued.replace("{n}", no));
                      setTtDate(todayISO()); setTtSjId("");
                      setTtItems([{ name: "", qty: "" }]); setTtReceiver(""); setTtGiver("");
                    } catch (e) {
                      toast(e instanceof Error ? e.message : S.saveFail, "info");
                    }
                  }}>
                    {S.issueBtn}
                  </button>
                </div>
              </Card>
              <Card className="p-5">
                <CardHeader title={locale === "en" ? "Pick List / Delivery Order" : "Pick List / Delivery Order"} subtitle={locale === "en" ? "Pick = take stock · DO number nn/DO-SB/SMD/m/yyyy · print · link to Surat Jalan" : "Pick = ambil stok · DO nomor nn/DO-SB/SMD/m/yyyy · cetak · taut ke Surat Jalan"} />
                <div className="mt-3 space-y-3">
                  <FormGrid>
                    <Field label={S.dateLbl}><input type="date" className="input" value={doDate} onChange={(e) => setDoDate(e.target.value)} /></Field>
                    <Field label={S.fDest}><input className="input" value={doTo} onChange={(e) => setDoTo(e.target.value)} placeholder={S.phDest} /></Field>
                    <Field label={S.driverLbl}><input className="input" value={doDriver} onChange={(e) => setDoDriver(e.target.value)} /></Field>
                    <Field label={S.linkedSjLbl}><select className="input" value={doSjId} onChange={(e) => setDoSjId(e.target.value)}>
                      <option value="">{S.noSj}</option>
                      {sjDocs.map((d) => <option key={String(d.id)} value={String(d.id)}>{String(d.sbRef || d.id)} · {String(d.title)}</option>)}
                    </select></Field>
                    <Field label={S.refNoLbl}><input className="input font-mono" value={doNumber(nextDoSeq(), new Date(`${doDate}T00:00:00`))} readOnly /></Field>
                  </FormGrid>
                  {doItems.map((it, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2">
                      <input className="input col-span-8" placeholder={S.itemPh.replace("{n}", String(idx + 1))} value={it.name} onChange={(e) => setDoItems((s) => s.map((x, i) => (i === idx ? { ...x, name: e.target.value } : x)))} />
                      <input className="input col-span-3" placeholder={S.jumlahLbl} value={it.qty} onChange={(e) => setDoItems((s) => s.map((x, i) => (i === idx ? { ...x, qty: e.target.value } : x)))} />
                      <button className="btn-secondary col-span-1 text-xs" aria-label={S.delSjRow.replace("{n}", String(idx + 1))} onClick={() => setDoItems((s) => s.filter((_, i) => i !== idx))}>×</button>
                    </div>
                  ))}
                  <button className="btn-secondary text-xs" onClick={() => setDoItems((s) => [...s, { name: "", qty: "" }])}>{S.addRow}</button>
                  <button className="btn-primary w-full justify-center" onClick={async () => {
                    const items = doItems.filter((x) => x.name.trim() && x.qty.trim());
                    if (!doTo.trim() || items.length === 0) { toast(S.sjNeedDest, "info"); return; }
                    const seq = nextDoSeq();
                    const no = doNumber(seq, new Date(`${doDate}T00:00:00`));
                    const sj = sjDocs.find((d) => String(d.id) === doSjId);
                    try {
                      await add("documents", {
                        id: `DO-SMD-${sjYearOf(doDate)}-${String(seq).padStart(3, "0")}`,
                        title: `Delivery Order ke ${doTo.trim()}`, type: "Delivery Order", project: "-", vessel: doTo.trim(),
                        owner: "Anda", sbRef: no, doDate, doDriver: doDriver.trim(), doTo: doTo.trim(),
                        doSjId: doSjId || "", doSjRef: sj ? String(sj.sbRef || sj.id) : "", doItems: items,
                        version: "v1.0", status: "Berlaku", updated: todayISO(), archived: false, docCopy: "Terkendali",
                        related: doSjId ? [doSjId] : [],
                        revisions: [{ version: "v1.0", at: todayISO(), by: "Anda", note: "Delivery order diterbitkan" }],
                      }, { action: "menerbitkan delivery order", target: no, module: "Inventori" });
                      toast(locale === "en" ? `DO ${no} issued` : `DO ${no} diterbitkan`);
                      setDoTo(""); setDoSjId(""); setDoDriver("");
                      setDoItems([{ name: "", qty: "" }]);
                    } catch (e) {
                      toast(e instanceof Error ? e.message : S.saveFail, "info");
                    }
                  }}>
                    {S.issueBtn}
                  </button>
                </div>
              </Card>
            </div>
            <Card className="mt-4 p-5">
              <CardHeader title={locale === "en" ? "Issued DOs" : "DO Terbit"} subtitle={locale === "en" ? "Print + linked delivery note" : "Cetak + Surat Jalan tertaut"} />
              <div className="mt-2 space-y-2">
                {doDocs.map((d) => (
                  <div key={String(d.id)} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-steel-100 px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium text-navy-900">{String(d.title)} <span className="font-mono text-xs text-steel-500">· {String(d.sbRef ?? d.id)}</span></p>
                      <p className="text-xs text-steel-500">{fmtTanggal(String(d.doDate ?? d.updated ?? ""))} · {String(d.doTo ?? "-")}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {d.doSjId ? (
                        <Link to="/dokumen" className="btn-secondary text-xs" title={String(d.doSjRef ?? d.doSjId)}>
                          {locale === "en" ? "Open Surat Jalan" : "Buka Surat Jalan"}
                        </Link>
                      ) : null}
                      <button className="btn-secondary text-xs" onClick={() => printDoPdf(d)}><Printer className="h-3.5 w-3.5" /> {S.printPdfBtn}</button>
              <button className="btn-secondary text-xs" onClick={() => printDo(d)}>{S.printXlsxBtn}</button>
                      <button className="btn-secondary text-xs" onClick={() => openDoEdit(d)}>{locale === "en" ? "Edit" : "Ubah"}</button>
                      <button className="btn-secondary text-xs text-rose-600" onClick={() => setDelDo(d)}>{locale === "en" ? "Cancel DO" : "Batalkan"}</button>
                    </div>
                  </div>
                ))}
                {doDocs.length === 0 && <p className="text-xs text-steel-400">-</p>}
              </div>
            </Card>
            </>
          )}

          {tab === "Analisis" && (
            <div className="space-y-4">
              {/* ==== KLASIFIKASI WARNING PER KATEGORI ====
                  Pindah dari Katalog ke sini. Di Katalog hanya ada strip
                  satu baris; daftar lengkap + alasan ambang per kategori ada
                  di card ini, supaya alarm tidak lagi sekadar "ada satu item
                  menipis" tapi "kategori Baja punya 3 kritis & 5 menipis
                  karena lead time 45 hari". */}
              <Card className="p-5">
                <CardHeader
                  title={locale === "en" ? "Warning by category" : "Warning per Kategori Barang"}
                  subtitle={
                    locale === "en"
                      ? "Thresholds differ per category: long lead-time items warn earlier, service items are excluded (no physical stock)."
                      : "Ambang berbeda per kategori: barang lead time panjang diperingatan lebih awal, kategori jasa dikecualikan (tanpa stok fisik)."
                  }
                />
                {warnByCat.length === 0 ? (
                  <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-3 text-center text-sm text-emerald-700">
                    {locale === "en"
                      ? "All categories are within their thresholds. No warning."
                      : "Semua kategori dalam ambang. Tidak ada warning."}
                  </p>
                ) : (
                  <div className="mt-3 space-y-3">
                    {warnByCat.map((c) => (
                      <div key={c.category} className="rounded-xl border border-steel-200 p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => { setCat(c.category); setTab("Katalog"); }}
                            className="text-sm font-semibold text-navy-900 hover:underline"
                          >
                            {c.category}
                          </button>
                          <Badge tone={c.top === "critical" ? "red" : c.top === "low" ? "amber" : c.top === "overstock" ? "blue" : "gray"}>
                            {locale === "en"
                              ? `${c.counts.critical} critical / ${c.counts.low} low / ${c.counts.overstock} over`
                              : `${c.counts.critical} kritis / ${c.counts.low} menipis / ${c.counts.overstock} berlebih`}
                          </Badge>
                          <span className="text-[11px] text-steel-400">
                            {locale === "en"
                              ? `lead time ${c.leadTimeDays}d · ${c.total} items total`
                              : `lead time ${c.leadTimeDays} hari · total ${c.total} item`}
                          </span>
                        </div>
                        <div className="mt-2 flex items-center gap-3">
                          <ProgressBar
                            value={Math.round((c.counts.critical / Math.max(1, c.total)) * 100)}
                            tone={c.counts.critical > 0 ? "red" : "amber"}
                            className="flex-1"
                          />
                          <span className="shrink-0 text-[11px] text-steel-500">
                            {fmtPersen((c.counts.critical / Math.max(1, c.total)) * 100)}
                          </span>
                        </div>
                        {c.urgent.length > 0 && (
                          <ul className="mt-2 space-y-0.5">
                            {c.urgent.map((it) => {
                              const lv = warnLevelOf(it);
                              return (
                                <li key={it.id} className="flex items-center justify-between gap-2 text-xs">
                                  <span className="truncate text-steel-600" title={String(it.name)}>{it.name}</span>
                                  <span className="flex shrink-0 items-center gap-1.5">
                                    <Badge tone={lv.tone}>
                                      {locale === "en" ? lv.labelEn : lv.label}
                                    </Badge>
                                    <span className="text-steel-400">
                                      {fmtJumlah(Number(it.stock))} / {fmtJumlah(effectiveMinStock(it))} {it.unit}
                                    </span>
                                  </span>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Card className="p-5">
                  <CardHeader title={S.slowT} subtitle={S.slowS} />
                  <div className="relative mt-2">
                    <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-steel-400" />
                    <input className="input pl-8 !py-1.5 text-xs" placeholder={S.anSearchPh} aria-label={S.anSearchPh} value={slowQ} onChange={(e) => setSlowQ(e.target.value)} />
                  </div>
                  <div className="mt-2 max-h-96 space-y-2 overflow-y-auto pr-1">
                    {slowShown.length === 0 && <p className="py-4 text-center text-sm text-steel-400">{S.slowEmpty}</p>}
                    {slowShown.map((i) => (
                      <div key={i.id} className="flex items-center justify-between gap-3 border-b border-steel-100 py-2 text-sm">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-navy-900" title={String(i.name)}>{i.name}</p>
                          <p className="text-xs text-steel-400">Terakhir keluar {fmtTanggal(lastOutOf(i))}</p>
                        </div>
                        <Badge tone="amber">{locale === "en" ? "Slow" : "Lambat"}</Badge>
                      </div>
                    ))}
                  </div>
                </Card>
                <Card className="p-5">
                  <CardHeader
                    title={locale === "en" ? "Dead stock - reason label" : "Dead Stock - Badge Alasan"}
                    subtitle={
                      locale === "en"
                        ? "Each item carries a coded reason badge with impact level and follow-up hint."
                        : "Setiap item punya badge alasan berkode + tingkat dampak + saran tindak lanjut."
                    }
                  />
                  {/* Ringkasan per alasan - ini yang membuat alasannya bisa
                      dihitung ("5 item mati karena Proyek Dibatalkan"), bukan
                      sekadar teks yang hilang setelah dibaca. */}
                  {deadSummary.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {deadSummary.map((s) => (
                        <span key={s.reason.code} className="inline-flex items-center gap-1.5 rounded-full border border-steel-200 bg-steel-50 px-2 py-0.5 text-[11px]">
                          <Badge tone={deadImpactTone(s.reason.impact)}>{locale === "en" ? s.reason.labelEn : s.reason.label}</Badge>
                          <span className="font-semibold text-navy-900">{s.count}</span>
                          <span className="text-steel-400">·</span>
                          <span className="text-steel-500">{fmtRupiah(s.value)}</span>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="relative mt-3">
                    <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-steel-400" />
                    <input className="input pl-8 !py-1.5 text-xs" placeholder={S.anSearchPh} aria-label={S.anSearchPh} value={deadQ} onChange={(e) => setDeadQ(e.target.value)} />
                  </div>
                  <div className="mt-2 max-h-96 space-y-2 overflow-y-auto pr-1">
                    {deadShown.length === 0 && <p className="py-4 text-center text-sm text-steel-400">{S.deadEmpty}</p>}
                    {deadShown.map((row) => {
                      const it = row.item;
                      return (
                        <div key={it.id} className="flex items-start justify-between gap-3 border-b border-steel-100 py-2 text-sm">
                          <div className="min-w-0">
                            <p className="truncate font-medium text-navy-900" title={String(it.name)}>{it.name}</p>
                            <p className="text-xs text-steel-400">
                              {locale === "en" ? "Stock" : "Stok"} {fmtJumlah(Number(it.stock))} {it.unit} · {fmtRupiah(row.value)}
                              {it.warehouse ? ` · ${it.warehouse}` : ""}
                            </p>
                            {row.note !== "" && (
                              <p className="mt-0.5 text-xs italic text-steel-500" title={row.note}>
                                {locale === "en" ? "Note" : "Ket"}: {row.note}
                              </p>
                            )}
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1">
                            {/* Badge alasan = classify, bukan teks polos.
                                `title` memuat saran tindak lanjut supaya alasan
                                itu punya konsekuensi, bukan sekadar label. */}
                            <Badge
                              tone={deadImpactTone(row.reason.impact)}
                              title={
                                locale === "en"
                                  ? `${row.reason.hintEn} (${row.reason.action})`
                                  : `${row.reason.hint} (${row.reason.action})`
                              }
                            >
                              {locale === "en" ? row.reason.labelEn : row.reason.label}
                            </Badge>
                            {!row.manual && (
                              <Badge tone="gray" title={locale === "en" ? "Reason derived from stock movement; override it if you know better." : "Alasan diturunkan dari mutasi stok. Ubah bila ada informasi lain."}>
                                {locale === "en" ? "auto" : "otomatis"}
                              </Badge>
                            )}
                            <select
                              className="input !w-auto !py-1 text-[11px]"
                              value={row.reason.code}
                              onChange={(e) => {
                                const picked = DEAD_REASONS.find((r) => r.code === e.target.value);
                                if (picked) void saveDeadReason(it, picked);
                              }}
                              aria-label={`${locale === "en" ? "Dead stock reason" : "Alasan dead stock"} ${it.name}`}
                            >
                              {DEAD_REASONS.map((r) => (
                                <option key={r.code} value={r.code}>
                                  {locale === "en" ? r.labelEn : r.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              </div>
              <Card className="p-5">
                <CardHeader title={S.agingT} subtitle={S.agingS} />
                <div className="relative mt-2 max-w-xs">
                  <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-steel-400" />
                  <input className="input pl-8 !py-1.5 text-xs" placeholder={S.anSearchPh} aria-label={S.anSearchPh} value={agingQ} onChange={(e) => setAgingQ(e.target.value)} />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {AGING_BUCKETS.map((b) => (
                    <span key={b} className="rounded-lg bg-steel-50 px-3 py-1.5 text-xs font-medium text-steel-600">
                      {b}: <span className="font-bold text-navy-900">{agingRows.filter((r) => r.bucket === b).length}</span> item
                    </span>
                  ))}
                </div>
                <div className="mt-3 max-h-96 space-y-2 overflow-y-auto pr-1">
                  {agingShown.map((r) => (
                    <div key={r.item.id} className="flex items-center justify-between gap-3 border-b border-steel-100 py-2 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-navy-900" title={String(r.item.name)}>{r.item.name}</p>
                        <p className="text-xs text-steel-400">
                          {r.lastIn ? `Barang masuk terakhir ${fmtTanggal(r.lastIn)} · ${r.age} hari lalu` : "Belum pernah ada barang masuk"} · Stok {fmtJumlah(Number(r.item.stock))} {r.item.unit}
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
        wide footer={<><button className="btn-secondary" onClick={() => { setShowAdd(false); setEditing(null); }}>{S.cancelBtn}</button><AsyncButton className="btn-primary" onAction={save}>{S.saveBtn}</AsyncButton></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label={S.nameLbl}><input className="input" value={form.name} onChange={(e) => setF("name", e.target.value)} placeholder={S.phName} /></Field>
            <Field label={S.skuLbl}><input className="input font-mono" value={form.sku} onChange={(e) => setF("sku", e.target.value)} placeholder={S.phSku} /></Field>
            <Field label={S.catLbl}>
              <select className="input" value={form.category} onChange={(e) => setF("category", e.target.value)}>
                {["Baja", "Mesin", "Pipa", "Listrik", "Cat", "Fastener", "Rigging", "Perlindungan", "Lainnya"].map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label={locale === "en" ? "Material type" : "Jenis material"}>
              <select className="input" value={form.matType} onChange={(e) => setF("matType", e.target.value)}>
                {[...MAT_TYPES].map((m) => <option key={m} value={m}>{matLabel(m)}</option>)}
              </select>
            </Field>
            <Field label={locale === "en" ? "Sold retail (conversion)?" : "Dijual eceran (konversi)?"} hint={locale === "en" ? "If yes, fill UOM2 + conversion below" : "Jika ya, isi satuan eceran + konversi di bawah"}>
              <select className="input" value={String((form as Record<string, unknown>).eceran ?? "false")} onChange={(e) => setF("eceran", e.target.value === "true")}>
                <option value="false">Tidak — satuan tunggal</option>
                <option value="true">Ya — eceran + konversi</option>
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
            <div className="rounded-xl bg-steel-50 p-2.5">
              <p className="label">{locale === "en" ? "Retail conversion presets" : "Preset konversi eceran"}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  className="btn-secondary text-xs"
                  title={locale === "en" ? "Oil: tons to liters ×1100" : "Oli: Ton ke Liter ×1100"}
                  onClick={() => { setF("uom2", "liter"); setF("konversi", "1100"); }}
                >
                  {locale === "en" ? "Oil: Ton → Liter ×1100" : "Oli: Ton → Liter ×1100"}
                </button>
                <span className="flex items-center gap-1 text-xs text-steel-600">
                  P <input className="input !w-16 !py-1 text-xs" value={platP} onChange={(e) => setPlatP(e.target.value)} aria-label="Panjang (m)" /> × L{" "}
                  <input className="input !w-16 !py-1 text-xs" value={platL} onChange={(e) => setPlatL(e.target.value)} aria-label="Lebar (m)" />
                </span>
                <button
                  type="button"
                  className="btn-secondary text-xs"
                  title={locale === "en" ? "Plate roll to meters via P×L" : "Plat roll ke Meter via P×L"}
                  onClick={() => {
                    const p = Number(platP) || 0;
                    const l = Number(platL) || 0;
                    if (p <= 0 || l <= 0) { toast(locale === "en" ? "P×L must be positive" : "P×L harus positif", "info"); return; }
                    setF("uom2", "meter");
                    setF("konversi", String(Math.round(p * l * 100) / 100));
                  }}
                >
                  {locale === "en" ? "Plate roll → Meter (P×L)" : "Plat roll → Meter (P×L)"}
                </button>
              </div>
            </div>
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
                  <Upload className="h-4 w-4" /> {uploadingPhoto ? S.uploading : S.uploadBtn}
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

      {/* Modal Barang Masuk / Barang Keluar */}
      <Modal open={moveTarget !== null} onClose={closeMove} title={(moveKind === "in" ? S.moveTitleIn : S.moveTitleOut).replace("{n}", moveTarget?.name ?? "")}
        subtitle={moveFresh ? S.moveSub.replace("{a}", fmtJumlah(Number(moveFresh.stock))).replace("{b}", `${fmtJumlah(availOf(moveFresh))} ${moveFresh.unit}${hasUom2(moveFresh) ? ` (≈ ${fmtJumlah(qtyInUom2(moveFresh))} ${uom2Of(moveFresh)})` : ""}`) : ""}
        footer={<><button className="btn-secondary" onClick={closeMove}>{S.cancelBtn}</button><AsyncButton className="btn-primary" onAction={saveMove}>{S.btnSaveTx}</AsyncButton></>}>
        <div className="space-y-3">
          <Field label={S.txTypeLbl}>
            <div className="flex gap-2">
              {(["in", "out"] as const).map((k) => (
                <button key={k} onClick={() => setMoveKind(k)} title={grGiTip(k === "in" ? "Penerimaan" : "Pengeluaran", locale)}
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
          {moveKind === "in" && (
            <Field label="PO terkait (opsional)" hint="Pilih PO terbuka agar penerimaan terhubung ke PO. Kosong = dicatat tanpa PO.">
              <select className="input" value={movePo} onChange={(e) => setMovePo(e.target.value)}>
                <option value="">— Tanpa PO —</option>
                {(data.purchaseOrders ?? [])
                  .filter((p) => ["Diajukan", "Disetujui", "Dikirim"].includes(String(p.status)))
                  .map((p) => <option key={String(p.id)} value={String(p.id)}>{String(p.id)} · {String(p.item ?? "-")} · {String(p.vendor ?? "-")}</option>)}
              </select>
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
        footer={<><button className="btn-secondary" onClick={() => setShowOpname(false)}>{S.cancelBtn}</button><AsyncButton className="btn-primary" onAction={saveOpname}>{S.btnSaveOp}</AsyncButton></>}>
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
        footer={<><button className="btn-secondary" onClick={() => setShowTransfer(false)}>{S.cancelBtn}</button><AsyncButton className="btn-primary" onAction={saveTransfer}>{S.btnSaveTr}</AsyncButton></>}>
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

      {/* Modal retur ke vendor */}
      <Modal open={showRetur} onClose={() => setShowRetur(false)} title="Retur ke Vendor" subtitle="Kurangi stok + movement Retur + koreksi hutang terkait"
        footer={<><button className="btn-secondary" onClick={() => setShowRetur(false)}>{S.cancelBtn}</button><button className="btn-primary" onClick={saveRetur}>Simpan Retur</button></>}>
        <div className="space-y-3">
          <Field label={S.itemLbl}>
            <select className="input" value={retItem} onChange={(e) => setRetItem(e.target.value)}>
              <option value="">{S.pickItem}</option>
              {inventory.map((i) => <option key={i.id} value={i.id}>{i.name} · stok {fmtJumlah(Number(i.stock))} {i.unit}</option>)}
            </select>
          </Field>
          <FormGrid>
            <Field label={S.qtyTrLbl}>
              <NumInput min={1} className="input" value={retQty} onChange={(e) => setRetQty(e.target.value)} />
            </Field>
            <Field label="Vendor">
              <input className="input" value={retVendor} onChange={(e) => setRetVendor(e.target.value)} placeholder="Nama vendor" />
            </Field>
          </FormGrid>
          {(() => {
            const sel = inventory.find((i) => i.id === retItem);
            if (!sel || !hasUom2(sel)) return null;
            return (
              <Field label={S.inputUnitLbl} hint={S.inputUnitHint.replace("{a}", sel.unit).replace("{b}", `${fmtJumlah(convOf(sel))} ${uom2Of(sel)}`)}>
                <select className="input" value={retUom} onChange={(e) => setRetUom(e.target.value)} aria-label={S.inputUnitAria}>
                  <option value="base">{S.optBase.replace("{n}", sel.unit)}</option>
                  <option value="uom2">{S.optUom2.replace("{n}", uom2Of(sel))}</option>
                </select>
              </Field>
            );
          })()}
          <Field label="Alasan retur" hint="Wajib diisi, dicatat di movement + log koreksi hutang">
            <input className="input" value={retReason} onChange={(e) => setRetReason(e.target.value)} placeholder="Cth: barang cacat / salah kirim" />
          </Field>
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
              const rows = inventory.filter((i) => reservedOf(i).some((r) => r.project === e.target.value));
              setPickSel(rows.map((i) => i.id));
              const q0: Record<string, string> = {};
              for (const i of rows) {
                const res = reservedOf(i).find((r) => r.project === e.target.value);
                q0[i.id] = String(Number(res?.qty ?? 0));
              }
              setPickQty(q0);
              setPickFail([]);
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
              <div key={i.id} className="flex items-center gap-3 rounded-xl border border-steel-200 px-3 py-2 text-sm">
                <input type="checkbox" checked={checked} onChange={(e) => setPickSel((s) => (e.target.checked ? [...s, i.id] : s.filter((x) => x !== i.id)))} aria-label={S.takeAria.replace("{n}", i.name)} />
                <span className="min-w-0 flex-1 truncate font-medium text-navy-900" title={String(i.name)}>{i.name}</span>
                <span className="shrink-0 text-xs text-steel-500">reservasi {fmtJumlah(Number(res?.qty ?? 0))} · stok {fmtJumlah(Number(i.stock))} {i.unit}</span>
                <NumInput min={0} className="input w-24 !py-1.5 text-xs" value={pickQty[i.id] ?? ""} onChange={(e) => setPickQty((m) => ({ ...m, [i.id]: e.target.value }))} aria-label={`Qty pick ${i.name}`} />
              </div>
            );
          })}
          {pickFail.length > 0 && (
            <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
              <p className="font-semibold">Gagal pick ({pickFail.length}):</p>
              {pickFail.map((f, idx) => <p key={idx}>• {f}</p>)}
            </div>
          )}
        </div>
      </Modal>

      {/* Modal label QR */}
      <Modal open={labelItem !== null} onClose={() => setLabelItem(null)} title={S.labelTitle.replace("{n}", labelItem?.name ?? "")} subtitle={labelItem ? `${labelItem.id} · ${labelItem.sku}` : ""}
        footer={<><button className="btn-secondary" onClick={() => setLabelItem(null)}>{S.closeBtn}</button><button className="btn-primary" onClick={() => window.print()}><Printer className="h-4 w-4" /> {S.printBtn}</button></>}>
        {labelItem && (
          <div id="label-print" className="rounded-xl border border-steel-200 p-4 text-center">
            <p className="text-sm font-bold text-navy-900">{labelItem.name}</p>
            <p className="font-mono text-xs text-steel-500">{labelItem.sku}</p>
            <p className="font-mono text-xs text-steel-500">{rackText(labelItem)}{binOf(labelItem) ? ` · Bin ${binOf(labelItem)}` : ""}</p>
            <div className="mt-3 flex justify-center" title={S.qrTitle}>
              <QRCodeSVG value={qrPayloadOf(labelItem) || String(labelItem.id)} size={140} level="M" />
            </div>
            <p className="mt-1 font-mono text-[11px] text-steel-500" title={S.qrTitle}>QR: {qrPayloadOf(labelItem)}</p>
            <p className="mt-1 text-[11px] text-steel-400">Pindai QR untuk buka detail material</p>
          </div>
        )}
      </Modal>

      {/* Modal detail */}
      <Modal open={detail !== null} onClose={() => setDetail(null)} title={freshDetail?.name ?? ""} subtitle={freshDetail ? `${freshDetail.id} · ${freshDetail.sku}` : ""}>
        {freshDetail && (
          <dl className="dl-div text-sm">
            {freshDetail.photoUrl ? (
              <SecureImg src={String(freshDetail.photoUrl)} alt={String(freshDetail.name)} name={String(freshDetail.name)} className="h-32 w-full rounded-xl border border-steel-200 object-cover" />
            ) : (
              <SecureImg src="" alt={String(freshDetail.name)} name={String(freshDetail.name)} className="h-16 w-16 rounded-full" />
            )}
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

      {/* ==== MODAL CRUD GUDANG ==== */}
      <Modal
        open={showWh}
        onClose={closeWh}
        title={
          whEditing
            ? (locale === "en" ? `Edit warehouse - ${whForm.name}` : `Ubah Gudang - ${whForm.name}`)
            : (locale === "en" ? "New warehouse" : "Tambah Gudang")
        }
        subtitle={
          locale === "en"
            ? "Name is the key: inventory and movements reference warehouses by name."
            : "Nama adalah kunci: item dan mutasi menunjuk gudang berdasarkan nama."
        }
        footer={
          <>
            <button className="btn-secondary" onClick={closeWh}>{locale === "en" ? "Cancel" : "Batal"}</button>
            <AsyncButton className="btn-primary" onAction={saveWh}>
              {locale === "en" ? "Save" : "Simpan"}
            </AsyncButton>
          </>
        }
      >
        <div className="space-y-3">
          <FormGrid>
            <Field label={locale === "en" ? "Name" : "Nama Gudang"}>
              <input
                className="input"
                value={whForm.name}
                placeholder="Gudang Baja A"
                onChange={(e) => setWhForm({ ...whForm, name: e.target.value })}
              />
            </Field>
            <Field label={locale === "en" ? "Type" : "Jenis Barang"}>
              <select
                className="input"
                value={whForm.type}
                onChange={(e) => setWhForm({ ...whForm, type: e.target.value })}
              >
                <option value="">{locale === "en" ? "-- pick --" : "-- pilih --"}</option>
                {WAREHOUSE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field
              label={locale === "en" ? "Capacity (mixed units)" : "Kapasitas (satuan tercampur)"}
              hint={
                locale === "en"
                  ? "Leave 0 for no limit. Used only for the utilisation bar."
                  : "Isi 0 bila tanpa batas. Dipakai hanya untuk bar utilisasi."
              }
            >
              <NumInput
                min={0}
                className="input"
                value={whForm.capacity}
                placeholder="0"
                onChange={(e) => setWhForm({ ...whForm, capacity: e.target.value })}
              />
            </Field>
            <Field label={locale === "en" ? "Location" : "Lokasi"}>
              <input
                className="input"
                value={whForm.lokasi}
                placeholder="Area A - Dek Kiri"
                onChange={(e) => setWhForm({ ...whForm, lokasi: e.target.value })}
              />
            </Field>
            <Field label={locale === "en" ? "Person in charge" : "Penanggung Jawab"}>
              <input
                className="input"
                value={whForm.pic}
                placeholder="Agus Setiawan"
                onChange={(e) => setWhForm({ ...whForm, pic: e.target.value })}
              />
            </Field>
            <Field label={locale === "en" ? "Status" : "Status"}>
              <label className="flex h-10 items-center gap-2 text-sm text-navy-900">
                <input
                  type="checkbox"
                  checked={whForm.aktif}
                  onChange={(e) => setWhForm({ ...whForm, aktif: e.target.checked })}
                />
                {locale === "en" ? "Active" : "Aktif"}
              </label>
            </Field>
          </FormGrid>
          <p className="rounded-lg bg-steel-50 px-3 py-2 text-xs text-steel-500">
            {locale === "en"
              ? "Changing the name does not move stored items. Items keep their own warehouse field; move them with Transfer first if you need to rename."
              : "Mengubah nama tidak memindahkan barang tersimpan. Item tetap pada kolom gudangnya; pindahkan lewat Transfer bila perlu mengganti nama."}
          </p>
        </div>
      </Modal>

      <ConfirmModal
        open={delWh !== null}
        title={delWh ? (locale === "en" ? `Delete warehouse ${delWh.name}?` : `Hapus gudang ${delWh.name}?`) : ""}
        desc={(() => {
          if (!delWh) return "";
          const name = String(delWh.name ?? "");
          const items = inventory.filter((i) => sameName(i.warehouse, name));
          const moves = movements.filter((m) => {
            const f = movementFlow(m);
            return sameName(f.from.replace(/^Supplier:\s*/i, ""), name) || sameName(f.to, name);
          });
          if (items.length > 0 || moves.length > 0) {
            return locale === "en"
              ? `Blocked: ${items.length} item(s) and ${moves.length} movement(s) still point at this warehouse. Deactivate it instead so history stays intact.`
              : `Diblokir: masih ada ${items.length} item dan ${moves.length} mutasi yang menunjuk gudang ini. Nonaktifkan saja agar riwayat tetap utuh.`;
          }
          return locale === "en"
            ? "The warehouse record will be permanently deleted."
            : "Data gudang akan dihapus permanen.";
        })()}
        confirmLabel={locale === "en" ? "Delete" : "Hapus"}
        danger
        confirmDisabled={(() => {
          if (!delWh) return true;
          const name = String(delWh.name ?? "");
          return (
            inventory.some((i) => sameName(i.warehouse, name))
            || movements.some((m) => {
              const f = movementFlow(m);
              return sameName(f.from.replace(/^Supplier:\s*/i, ""), name) || sameName(f.to, name);
            })
          );
        })()}
        onCancel={() => setDelWh(null)}
        onConfirm={confirmDelWh}
      />

      <ConfirmModal
        open={delInv !== null}
        title={delInv ? (locale === "en" ? `Delete item ${delInv.id}?` : `Hapus item ${delInv.id}?`) : ""}
        desc={(() => {
          if (!delInv) return "";
          const used = findUsages(data, "inventory", String(delInv.id));
          const base = locale === "en"
            ? `Item ${delInv.name} (${delInv.sku ?? delInv.id}) will be permanently deleted.`
            : `Item ${delInv.name} (${delInv.sku ?? delInv.id}) akan dihapus permanen.`;
          return used.length > 0
            ? (locale === "en" ? `${base} Used in: ${used.join(", ")}. Deletion blocked.` : `${base} Dipakai di: ${used.join(", ")}. Penghapusan diblokir.`)
            : base;
        })()}
        confirmLabel={delInv && findUsages(data, "inventory", String(delInv.id)).length > 0
          ? (locale === "en" ? "Blocked - still in use" : "Diblokir - masih dipakai")
          : (locale === "en" ? "Delete" : "Hapus")}
        danger
        confirmDisabled={delInv ? findUsages(data, "inventory", String(delInv.id)).length > 0 : false}
        onCancel={() => setDelInv(null)}
        onConfirm={async () => {
          if (!delInv) return;
          const usedBy = findUsages(data, "inventory", String(delInv.id));
          if (usedBy.length > 0) { toast(locale === "en" ? `Delete blocked - used in: ${usedBy.join(", ")}` : `Hapus diblokir - dipakai di: ${usedBy.join(", ")}`, "info"); return; }
          try {
            await remove("inventory", String(delInv.id));
            log("menghapus item inventori", `${delInv.id} · ${delInv.name}`, "Inventori");
            toast(locale === "en" ? `Item ${delInv.id} deleted` : `Item ${delInv.id} dihapus`);
          } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
          setDelInv(null);
        }}
      />

      {/* Modal ubah movement: metadata saja (tanggal/referensi/supplier/purpose/PIC).
          Qty/tipe/item dikunci agar stok tak perlu dikoreksi. */}
      <Modal open={moveEdit !== null} onClose={() => setMoveEdit(null)}
        title={moveEdit ? (locale === "en" ? `Edit movement ${moveEdit.id}` : `Ubah movement ${moveEdit.id}`) : ""}
        subtitle={locale === "en" ? "Info only - stock is NOT recalculated" : "Info saja - stok TIDAK dihitung ulang"}
        footer={<><button className="btn-secondary" onClick={() => setMoveEdit(null)}>{S.cancelBtn}</button><AsyncButton className="btn-primary" onAction={saveMoveEdit}>{S.saveBtn}</AsyncButton></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label={S.dateLbl}><input type="date" className="input" value={moveEditForm.date} onChange={(e) => setMoveEditForm((f) => ({ ...f, date: e.target.value }))} /></Field>
            <Field label={S.refLbl}><input className="input font-mono" value={moveEditForm.by} onChange={(e) => setMoveEditForm((f) => ({ ...f, by: e.target.value }))} /></Field>
            <Field label={S.supplierLbl}><input className="input" value={moveEditForm.supplier} onChange={(e) => setMoveEditForm((f) => ({ ...f, supplier: e.target.value }))} /></Field>
            <Field label={S.picLbl}><input className="input" value={moveEditForm.pic} onChange={(e) => setMoveEditForm((f) => ({ ...f, pic: e.target.value }))} /></Field>
          </FormGrid>
          <Field label={S.purposeLbl}><input className="input" value={moveEditForm.purpose} onChange={(e) => setMoveEditForm((f) => ({ ...f, purpose: e.target.value }))} /></Field>
        </div>
      </Modal>

      <ConfirmModal
        open={delMove !== null}
        title={delMove ? (locale === "en" ? `Delete movement ${delMove.id}?` : `Hapus movement ${delMove.id}?`) : ""}
        desc={delMove ? (locale === "en"
          ? `Record ${moveLabel(String(delMove.type ?? ""))} ${String(delMove.item ?? "")} x ${fmtJumlah(Number(delMove.qty ?? 0))} (${String(delMove.by ?? "")}) will be deleted. STOCK IS NOT ADJUSTED - use Opname if stock needs correction.`
          : `Catatan ${moveLabel(String(delMove.type ?? ""))} ${String(delMove.item ?? "")} x ${fmtJumlah(Number(delMove.qty ?? 0))} (${String(delMove.by ?? "")}) akan dihapus. STOK TIDAK DIKOREKSI - gunakan Opname bila stok perlu disesuaikan.`) : ""}
        confirmLabel={locale === "en" ? "Delete without stock correction" : "Hapus tanpa koreksi stok"}
        danger
        onCancel={() => setDelMove(null)}
        onConfirm={async () => {
          if (!delMove) return;
          const mid = String(delMove.id);
          const summary = `${moveLabel(String(delMove.type ?? ""))} ${String(delMove.item ?? "")} x ${fmtJumlah(Number(delMove.qty ?? 0))}`;
          try {
            await remove("movements", mid);
            log("menghapus movement (tanpa koreksi stok)", `${mid} · ${summary}`, "Inventori");
            toast(locale === "en"
              ? `Movement ${mid} deleted - STOCK NOT adjusted. Use Opname if correction is needed.`
              : `Movement ${mid} dihapus - STOK TIDAK diubah. Gunakan Opname bila perlu koreksi.`, "info");
          } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
          setDelMove(null);
        }}
      />

      {/* Modal ubah DO terbit */}
      <Modal open={doEdit !== null} onClose={() => setDoEdit(null)}
        title={doEdit ? (locale === "en" ? `Edit DO ${String(doEdit.sbRef ?? doEdit.id)}` : `Ubah DO ${String(doEdit.sbRef ?? doEdit.id)}`) : ""}
        subtitle={locale === "en" ? "Number stays the same" : "Nomor DO tetap sama"}
        wide footer={<><button className="btn-secondary" onClick={() => setDoEdit(null)}>{S.cancelBtn}</button><AsyncButton className="btn-primary" onAction={saveDoEdit}>{S.saveBtn}</AsyncButton></>}>
        <div className="space-y-3">
          <FormGrid>
            <Field label={S.dateLbl}><input type="date" className="input" value={doEditForm.date} onChange={(e) => setDoEditForm((f) => ({ ...f, date: e.target.value }))} /></Field>
            <Field label={S.fDest}><input className="input" value={doEditForm.to} onChange={(e) => setDoEditForm((f) => ({ ...f, to: e.target.value }))} /></Field>
            <Field label={S.driverLbl}><input className="input" value={doEditForm.driver} onChange={(e) => setDoEditForm((f) => ({ ...f, driver: e.target.value }))} /></Field>
            <Field label={S.linkedSjLbl}><select className="input" value={doEditForm.sjId} onChange={(e) => setDoEditForm((f) => ({ ...f, sjId: e.target.value }))}>
              <option value="">{S.noSj}</option>
              {sjDocs.map((d) => <option key={String(d.id)} value={String(d.id)}>{String(d.sbRef || d.id)} · {String(d.title)}</option>)}
            </select></Field>
          </FormGrid>
          {doEditForm.items.map((it, idx) => (
            <div key={idx} className="grid grid-cols-12 gap-2">
              <input className="input col-span-8" placeholder={S.itemPh.replace("{n}", String(idx + 1))} value={it.name} onChange={(e) => setDoEditForm((f) => ({ ...f, items: f.items.map((x, i) => (i === idx ? { ...x, name: e.target.value } : x)) }))} />
              <input className="input col-span-3" placeholder={S.jumlahLbl} value={it.qty} onChange={(e) => setDoEditForm((f) => ({ ...f, items: f.items.map((x, i) => (i === idx ? { ...x, qty: e.target.value } : x)) }))} />
              <button className="btn-secondary col-span-1 text-xs" aria-label={S.delSjRow.replace("{n}", String(idx + 1))} onClick={() => setDoEditForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))}>×</button>
            </div>
          ))}
          <button className="btn-secondary text-xs" onClick={() => setDoEditForm((f) => ({ ...f, items: [...f.items, { name: "", qty: "" }] }))}>{S.addRow}</button>
        </div>
      </Modal>

      <ConfirmModal
        open={delDo !== null}
        title={delDo ? (locale === "en" ? `Cancel DO ${String(delDo.sbRef ?? delDo.id)}?` : `Batalkan DO ${String(delDo.sbRef ?? delDo.id)}?`) : ""}
        desc={delDo ? (locale === "en"
          ? `DO ${String(delDo.sbRef ?? delDo.id)} (${String(delDo.title ?? "")}) will be cancelled. Linked reservations, if any, will be released back.`
          : `DO ${String(delDo.sbRef ?? delDo.id)} (${String(delDo.title ?? "")}) akan dibatalkan. Reservasi yang merujuk DO ini, bila ada, akan dikembalikan.`) : ""}
        confirmLabel={locale === "en" ? "Cancel DO" : "Batalkan DO"}
        danger
        onCancel={() => setDelDo(null)}
        onConfirm={async () => {
          if (!delDo) return;
          const doId = String(delDo.id);
          const doRef = String(delDo.sbRef ?? "");
          try {
            /* Kembalikan reservasi yang merujuk DO ini (pembuatan DO tidak
               menyentuh stok, jadi pembatalan pun tidak menyentuh stok). */
            let released = 0;
            for (const it of inventory) {
              const cur = reservedOf(it);
              if (!cur.some((r) => r.project === doId || (doRef !== "" && r.project === doRef))) continue;
              const next = cur.filter((r) => r.project !== doId && (doRef === "" || r.project !== doRef));
              await update("inventory", it.id, { reserved: next });
              released += cur.length - next.length;
            }
            await remove("documents", doId);
            log("membatalkan delivery order", `${doRef || doId} · reservasi kembali: ${released}`, "Inventori");
            toast(locale === "en"
              ? `DO ${doRef || doId} cancelled${released > 0 ? ` - ${released} reservation(s) released` : " - no linked reservations"}`
              : `DO ${doRef || doId} dibatalkan${released > 0 ? ` - ${released} reservasi dikembalikan` : " - tanpa reservasi terkait"}`);
          } catch (e) { toast(e instanceof Error ? e.message : S.saveFail, "info"); }
          setDelDo(null);
        }}
      />
    </div>
  );
}

