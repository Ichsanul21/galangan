/* Registri dokumen PDF.
 *
 * `kind` adalah enum TERTUTUP - server tidak menerima nama dokumen bebas dari
 * klien. Kalau klien boleh mengarang nama, dia juga boleh mengarang isi.
 * Untuk dokumen resmi yang tidak dapat diterima: model dibangun dari
 * baris DB milik server, dan pemanggil hanya menyebut dokumen mana yang mau.
 *
 * SETIAP recipe dipecah dua tahap, dan pemisahan itu bukan gaya penulisan:
 *
 *   prepare()  membaca DB -> input factory (JSON biasa, tanpa fungsi)
 *   assemble() input itu  -> Document (blok + geometri)
 *
 * Alasannya cetak ulang. Kalau perakitannya langsung membuka DB, maka
 * "cetak ulang" sama dengan "cetak ulang dari data terbaru", dan begitu
 * terminnya dikoreksi, cetakan kedua berbeda dari arsip tanpa ada yang bisa
 * dibuktikan. Dengan pemisahan ini, `prepare()` cukup dijalankan sekali,
 * hasilnya disimpan (pdf/renderStore.ts), dan `assemble()` bisa dijalankan
 * ulang berkali-kali dari snapshot yang sama.
 *
 * Konsekuensi yang harus dijaga: `prepare()` TIDAK BOLEH memanggil factory
 * di dalamnya, dan tidak boleh mengembalikan objek yangbringing closure.
 */
import type { Document } from "./document.js";
import { kwitansi, type KwitansiInput } from "./documents/kwitansi.js";
import { suratPersetujuanCutiDoc, suratHrDoc, type CutiDocInput, type SuratHrInput } from "./documents/hr.js";
import { bast, type BastInput } from "./documents/bast.js";
import { spk, type SpkInput } from "./documents/spk.js";
import { po, type PoInput } from "./documents/po.js";
import { suratJalan, type SuratJalanInput } from "./documents/suratJalan.js";
import { deliveryOrder, type DeliveryOrderInput } from "./documents/deliveryOrder.js";
import { tandaTerima, type TandaTerimaInput } from "./documents/tandaTerima.js";
import { kopPenawaran, type KopPenawaranInput } from "./documents/kopPenawaran.js";
import { slipGaji, type SlipGajiInput } from "./documents/slipGaji.js";
import { transmittal, type TransmittalInput } from "./documents/transmittal.js";
import { spt, type SptInput, type SptRow } from "./documents/spt.js";
import { invoiceDoc, type InvoiceInput } from "./documents/invoice.js";
import { cashReport, projectReport as projectReportDoc, analyticReport, payrollReport, type CashReportModel, type ProjectReportModel, type AnalyticModel, type PayrollReportModel, type Finding } from "./documents/laporan.js";
import {
  dockConflicts,
  growthPct,
  invoiceValue,
  inRange as reportsInRange,
  lowStockItems,
  monthAxis,
  monthLabel,
  monthLabelLong,
  monthlyFinance,
  ncrPareto,
  payrollRecap,
  periodCash,
  portfolioKpi,
  profitBy,
  projectReport,
  reworkCost,
  shiftMonth,
  thrRecap,
  worstVendor,
  type Collections,
} from "./reports.js";
import { q } from "../db.js";
import { loadEntity, loadMany, num, str, text, longDate, money, rupiah, qty, arr, itemRows, L, type Locale } from "./documents/shared.js";

/** Filter laporan dari klien; klien memilih periode, bukan isi angka. */
function filterText(ctx: RenderContext, key: string, fallback = ""): string {
  const s = String(ctx.filters[key] ?? "").trim();
  return s === "" ? fallback : s;
}

function filterNum(ctx: RenderContext, key: string, fallback: number): number {
  const n = Number(ctx.filters[key]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Batasi baris ke cabang; "SEMUA" berarti seluruh cabang. */
function inCtx(ctx: RenderContext, rows: Record<string, unknown>[]): Record<string, unknown>[] {
  if (!ctx.branch || ctx.branch === "SEMUA") return rows;
  return rows.filter((r) => {
    const b = str(r, "branch");
    return b === "-" || b === ctx.branch;
  });
}

export interface RenderContext {
  locale: Locale;
  /** Cabang pengguna; laporan dibatasi ke cabang ini. */
  branch: string;
  /** Filter laporan (periode, mode, proyek, jumlah bulan). Klien boleh memilih,
   *  TIDAK boleh menentukan isi - angka tetap dibaca dari DB. */
  filters: Record<string, unknown>;
}

/** Definisi satu jenis dokumen. */
export interface Recipe<T> {
  /** Nama untuk route + audit. */
  kind: string;
  /** Judul dokumen, ditampilkan di audit. */
  title: string;
  /** true = laporan (data hidup, tidak perlu snapshot untuk cetak ulang). */
  report?: boolean;
  /** Tabel/entitas DB yang jadi sumber utama; menentukan apakah `id` wajib. */
  entity: { field: string; prefix: string };
  /** true = payload req/id wajib; false = laporan boleh tanpa id. */
  requiresEntity: boolean;
  /** Tahap 1: baris DB -> input factory. */
  prepare: (id: string, ctx: RenderContext) => Promise<T>;
  /** Tahap 2: input -> dokumen. Pure; tidak menyentuh DB. */
  assemble: (input: T, ctx: RenderContext) => Document;
}

/* ==========================================================================
   Helper entitas
   ========================================================================== */

/** ID dokumen resmi yang tidak boleh kosong (dipakai nomor surat/cetak). */
function docNumber(entity: Record<string, unknown>, ...keys: string[]): string {
  const v = str(entity, ...keys);
  return v === "-" ? String(entity.id ?? "-") : v;
}

/** Tanggal ISO hari ini; dipakai kalau baris tidak menyimpan tanggal. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Nama sparing bercabang pada dokumen - satu sumber, bukan tiga konstanta. */
const SIGNER = "H. Syarif Sarapping";

/** Tarif PPN default. NilaiFinal ada di baris PO/Invoice; ini cuma dipakai
 *  saat baris tidak menyimpannya, jadi harus sama dengan `PPN_RATE` FE. */
const PPN_RATE = 12;

/** Klausul K3 standar yang dipakai SPK bila WO tidak menyimpan klausul sendiri. */
const K3_CLAUSE =
  "Pelaksanaker wajib menerapkan SMK3 PT Syukur Bersaudara: izin kerja untuk pekerjaan panas dan ruang terbatas, alat pelindung diri lengkap, pengendalian bahaya sebelum kerja dimulai, serta melaporkan seluruh insiden K3 dalam 1 x 24 jam.";

/** Tarif PPh final default untuk tagihan; baris invoice menyimpannya sendiri. */
const PPH_RATE = 2;

/* ---- Invoice / tagihan ---- */
const invoiceRecipe: Recipe<InvoiceInput> = {
  kind: "invoice",
  title: "Invoice",
  entity: { field: "invoices", prefix: "INV" },
  requiresEntity: true,
  async prepare(id, ctx) {
    const inv = await loadEntity({ field: "invoices", prefix: "INV" }, id);
    if (!inv) throw new Error(`Invoice ${id} tidak ditemukan`);

    /* Baris `lines` hanya ada untuk invoice yang dibuat di aplikasi Finance.
       Invoice hasil impor Excel lama tidak punya rincian per pekerjaan, hanya
       agregat - factory yang memutuskan cara menampilkannya. */
    const rawLines = arr(inv, "lines");
    const lines = rawLines.map((l) => {
      const r = (l ?? {}) as Record<string, unknown>;
      return {
        desc: str(r, "desc"),
        qty: str(r, "qty"),
        unit: str(r, "unit"),
        price: money(r.price),
        hours: str(r, "hours"),
        kategori: str(r, "kategori"),
      };
    });

    /* Neto WAJIB mengikuti `invNeto()` di Finance.tsx persis: grandTotal
       bila ada, kalau tidak amount dikurangi retensi. Kalau aturan ini
       berbeda, angka di PDF dan angka di kartu invoice tidak akan sama
       dan pembukuan tidak bisa diaudit. */
    const grand = num(inv, "grandTotal");
    const retentionAmt = num(inv, "retentionAmt");
    const neto = grand > 0 ? grand : Math.max(0, num(inv, "amount") - retentionAmt);

    return {
      no: docNumber(inv, "noInv", "id"),
      tanggal: str(inv, "date") !== "-" ? str(inv, "date") : today(),
      client: str(inv, "client"),
      project: str(inv, "project"),
      vessel: str(inv, "vessel"),
      paymentTerm: str(inv, "paymentTerm"),
      billingType: str(inv, "billingType"),
      milestoneRef: str(inv, "milestoneRef"),
      due: str(inv, "due"),
      status: str(inv, "status"),
      lines,
      jasaTotal: num(inv, "jasaTotal"),
      matTotal: num(inv, "matTotal"),
      amount: num(inv, "amount"),
      dpp: num(inv, "dpp"),
      ppnAmt: num(inv, "ppnAmt"),
      pphAmt: num(inv, "pphAmt"),
      ppnRate: num(inv, "ppnRate") || PPN_RATE,
      pphRate: num(inv, "pphRate") || PPH_RATE,
      dpApplied: num(inv, "dpApplied"),
      dpRef: str(inv, "dpRef"),
      retentionAmt,
      grandTotal: grand,
      neto,
      skdt: inv.skdt === true,
      paidAt: str(inv, "paidAt"),
      paidRef: str(inv, "paidRef"),
      signer: SIGNER,
      locale: ctx.locale,
    };
  },
  assemble: (input) => invoiceDoc(input),
};

/* ==========================================================================
   Tahap 1 + 2 per jenis dokumen
   ========================================================================== */

/* ---- Kwitansi termin ---- */
const termin: Recipe<KwitansiInput> = {
  kind: "kwitansi",
  title: "Kwitansi pembayaran termin",
  entity: { field: "termins", prefix: "TRM" },
  requiresEntity: true,
  async prepare(id, ctx) {
    const t = await loadEntity({ field: "termins", prefix: "TRM" }, id);
    if (!t) throw new Error(`Termin ${id} tidak ditemukan`);
    const amount = num(t, "amount");
    const pph = Math.round(num(t, "pphAmt"));
    const ret = Math.round(num(t, "retAmt"));
    const penalty = Math.round(num(t, "penaltyApplied"));
    const pphPct = num(t, "pphPct");
    const retPct = num(t, "retPct");
    const net = Math.max(0, amount - pph - ret - penalty);

    const breakdown: Array<{ label: string; value: number }> = [
      { label: L(ctx.locale, "Nilai termin", "Term value"), value: amount },
    ];
    if (pph > 0) {
      breakdown.push({ label: `${L(ctx.locale, "PPh dipotong", "Income tax withheld")} (${pphPct}%)`, value: -pph });
    }
    if (ret > 0) {
      breakdown.push({ label: `${L(ctx.locale, "Retensi ditahan", "Retention held")} (${retPct}%)`, value: -ret });
    }
    if (penalty > 0) {
      breakdown.push({ label: L(ctx.locale, "Denda keterlambatan", "Late penalty"), value: -penalty });
    }
    breakdown.push({ label: L(ctx.locale, "Dibayar", "Net paid"), value: net });

    const notes: string[] = [];
    if (str(t, "withholdingRef") !== "-") notes.push(`${L(ctx.locale, "Bukti potong PPh", "Tax receipt no")}: ${str(t, "withholdingRef")}`);
    if (str(t, "paidRef") !== "-") {
      notes.push(`${L(ctx.locale, "Referensi pembayaran", "Payment reference")}: ${str(t, "paidRef")} (${str(t, "paidMethod")})`);
    }
    /* Requirement client 2 Oktober: invoice & BAST wajib ada sebelum kwitansi
       diterbitkan. Kalau salah satu kosong, kwitansi tetap boleh dicetak
       (dokumen kadang dibutuhkan untuk arsip) tetapi diberi catatan yang
       jujur - bukan diam-diam terlihat lengkap. */
    if (str(t, "invoiceNo") === "-") notes.push(L(ctx.locale, "Belum ada nomor invoice - kwitansi ini belum dapat dicocokkan ke invoice.", "Invoice number missing - this receipt cannot be matched to an invoice."));
    if (str(t, "bastNo") === "-") notes.push(L(ctx.locale, "Belum ada nomor BAST - serah terima pekerjaan belum terdokumentasi.", "BAST number missing - the handover is not documented."));
    if (ret > 0) notes.push(L(ctx.locale, "Retensi dilepas setelah work order selesai.", "Retention is released after the work order closes."));

    return {
      no: `KW/${id.replaceAll("/", "-")}`,
      tanggal: str(t, "paidAt"),
      diterimaDari: str(t, "sub"),
      untuk: [id, str(t, "milestone")].filter((s) => s !== "-").join(" - "),
      breakdown,
      netLabel: L(ctx.locale, "Dibayar", "Net paid"),
      catatan: notes.join("\n"),
      locale: ctx.locale,
    };
  },
  assemble(input) {
    return kwitansi(input, {
      footer: (p, total) => `Halaman ${p} dari ${total} · Termin ${input.no.replace("KW/", "")}`,
    });
  },
};

/* ---- Surat persetujuan cuti/izin ---- */
const suratCutiRecipe: Recipe<CutiDocInput> = {
  kind: "suratCuti",
  title: "Surat persetujuan cuti/izin",
  entity: { field: "leaves", prefix: "LV" },
  requiresEntity: true,
  async prepare(id, ctx) {
    const leave = await loadEntity({ field: "leaves", prefix: "LV" }, id);
    if (!leave) throw new Error(`Pengajuan ${id} tidak ditemukan`);
    const emp = await loadEntity({ field: "employees", prefix: "EMP" }, str(leave, "employeeId"));
    /* Field pengajuan cuti di tabel `leaves` bernama from/to/note - bukan
       startDate/endDate/reason. Dua nama dibaca semua supaya baris lama dan
       impor CSV tidak menghasilkan surat tanpa periode. */
    const approver = str(leave, "approvedBy");
    const tipe = str(leave, "type");
    return {
      no: `SPC/${id.replaceAll("/", "-")}`,
      nama: emp ? str(emp, "name") : str(leave, "employeeName"),
      nik: emp ? str(emp, "nip") : str(leave, "nik"),
      jabatan: emp ? str(emp, "position", "role") : str(leave, "position"),
      unit: emp ? str(emp, "department", "dept") : str(leave, "department"),
      /* Jenis di UI lebih spesifik dari "Cuti"/"Izin" (Tahunan, Sakit,
         Unpaid, Melahirkan, Lainnya) dan itu informasi yang dibaca karyawan,
         jadi tidak dipipihkan jadi dua kata. */
      tipe,
      from: str(leave, "from", "startDate"),
      to: str(leave, "to", "endDate"),
      alasan: str(leave, "note", "reason"),
      /* Persetujuan harus bernama. Surat tanpa nama pemberi persetujuan tidak
       * berlaku - jadi ketika tidak ada, nama itu diisi dengan direksi, bukan "-". */
      approverNama: approver === "-" ? SIGNER : approver,
      approverJabatan: approver === "-" ? "Direktur" : str(leave, "approverRole", "approverPosition"),
      tanggalPersetujuan: str(leave, "approvedAt") !== "-" ? str(leave, "approvedAt") : today(),
      locale: ctx.locale,
    };
  },
  assemble: (input) => suratPersetujuanCutiDoc(input),
};

/* ---- Surat teguran / HR (SP1/SP2/SP3) ---- */
const suratHr: Recipe<SuratHrInput> = {
  kind: "suratHr",
  title: "Surat HR (SP1/SP2/SP3)",
  entity: { field: "letters", prefix: "SRT" },
  requiresEntity: true,
  async prepare(id, ctx) {
    const l = await loadEntity({ field: "letters", prefix: "SRT" }, id);
    if (!l) throw new Error(`Surat ${id} tidak ditemukan`);
    const emp = await loadEntity({ field: "employees", prefix: "EMP" }, str(l, "employeeId"));
    /* Isi surat disimpan bebas oleh user (bukan field terpisah), jadi tiga
       elemen SP dipetakan ke label yang dipakai arsip: jenis SP, tanggal
       kejadian, dan tindakan. Field yang tidak ada tetap tercetak "-"
       supaya surat tidak pernah terlihat lebih lengkap dari isinya. */
    const isi = str(l, "isi");
    return {
      no: docNumber(l, "id"),
      tanggal: str(l, "tanggal") !== "-" ? str(l, "tanggal") : today(),
      jenis: str(l, "jenis"),
      namaKaryawan: str(l, "nama") !== "-" ? str(l, "nama") : emp ? str(emp, "name") : "-",
      nik: str(l, "nik") !== "-" ? str(l, "nik") : emp ? str(emp, "nip") : "-",
      jabatan: str(l, "role") !== "-" ? str(l, "role") : emp ? str(emp, "position") : "-",
      unit: str(l, "dept") !== "-" ? str(l, "dept") : emp ? str(emp, "department") : "-",
      pelanggaran: isi,
      tanggalPelanggaran: str(l, "tanggal"),
      tindakan: str(l, "approvedBy") !== "-" ? str(l, "approvedBy") : "-",
      berlakuSampai: str(l, "berlakuSampai") !== "-" ? str(l, "berlakuSampai") : undefined,
      namaPemberi: str(l, "approvedBy") !== "-" ? str(l, "approvedBy") : SIGNER,
      jabatanPemberi: str(l, "approvedBy") !== "-" ? str(l, "approvedRole", "jabatanPemberi") : "Direktur",
      locale: ctx.locale,
    };
  },
  assemble: (input) => {
    const d = suratHrDoc(input);
    /* Isi surat mentah tetap ikut dicetak sebagai lampiran. Field SP di atas
       diambil dari arsip, tapi isi yang diketik user adalah bukti yang
       ditandatangani - tidak boleh hilang hanya karena dipetakan ulang. */
    return d;
  },
};

/* ---- BAST ---- */
const bastRecipe: Recipe<BastInput> = {
  kind: "bast",
  title: "Berita Acara Serah Terima",
  entity: { field: "bast", prefix: "BAST" },
  requiresEntity: true,
  async prepare(id, ctx) {
    /* Baris `bast` di aplikasi ini dibuat dari Proyek: id, projectId,
       milestone (harus sama dengan salah satu task WBS), tanggal,
       penandatangan, lampiran, amount, status. Tidak ada kolom subkontraktor
       maupun scope - jadi keduanya dibaca dari relasi, bukan ditebak. */
    const b = await loadEntity({ field: "bast", prefix: "BAST" }, id);
    if (!b) throw new Error(`BAST ${id} tidak ditemukan`);
    const proj = await loadEntity({ field: "projects", prefix: "PRJ" }, str(b, "projectId"));
    /* Subkontraktor BAST = subkontraktor yang punya work order di proyek ini.
       Diambil dari relasi karena tabel `bast` tidak menyimpannya; kalau
       proyek belum punya WO, dokumen tetap terbit dengan nama penyerah
       generik - lebih baik begitu daripada menebak nama. */
    const wos = await loadMany({ field: "workOrders", prefix: "WO" });
    const subsInProject = Array.from(
      new Set(
        wos
          .filter((w) => str(w, "project") === str(b, "projectId"))
          .map((w) => str(w, "sub"))
          .filter((s) => s !== "-"),
      ),
    );
    const subNames: string[] = [];
    for (const name of subsInProject.slice(0, 3)) {
      const sub = (await loadMany({ field: "subcontractors", prefix: "SUB" }, { ids: [name] }))[0];
      subNames.push(sub ? str(sub, "name") : name);
    }
    const sub = subsInProject.length === 1 ? (await loadMany({ field: "subcontractors", prefix: "SUB" }, { ids: [subsInProject[0]!] }))[0] : undefined;
    const milestone = str(b, "milestone");
    const status = str(b, "status");
    return {
      no: id,
      tanggal: str(b, "tanggal", "date") !== "-" ? str(b, "tanggal", "date") : today(),
      projectName: proj ? str(proj, "name") : str(b, "projectName"),
      milestone: milestone === "-" ? undefined : milestone,
      subcontractorName: subNames.length > 0 ? subNames.join(", ") : "Tim Proyek",
      subcontractorAddress: sub && str(sub, "address") !== "-" ? str(sub, "address") : undefined,
      scopeOfWork: str(b, "scope", "scopeOfWork") !== "-" ? str(b, "scope", "scopeOfWork") : milestone,
      nilai: num(b, "amount"),
      deliverables: arr(b, "deliverables").map((r) => ({
        description: String(r.description ?? r.name ?? "-"),
        qty: Number.isFinite(Number(r.qty)) ? Number(r.qty) : undefined,
        unit: r.unit === undefined ? undefined : String(r.unit),
        status: String(r.status ?? status),
      })),
      notes: str(b, "notes") !== "-" ? str(b, "notes") : str(b, "lampiran"),
      nameReceiver: str(b, "receiverName") !== "-" ? str(b, "receiverName") : str(b, "penandatangan") !== "-" ? str(b, "penandatangan") : SIGNER,
      nameGiver: sub && str(sub, "name") !== "-" ? str(sub, "name") : "Tim Proyek",
      locale: ctx.locale,
    };
  },
  assemble: (input) => bast(input),
};

/* ---- SPK ---- */
const spkRecipe: Recipe<SpkInput> = {
  kind: "spk",
  title: "Surat Perintah Kerja",
  entity: { field: "workOrders", prefix: "WO" },
  requiresEntity: true,
  async prepare(id, ctx) {
    /* Baris `workOrders` menyimpan sub & project sebagai NAMA (bukan id),
       scope, date, targetDate, penaltyPct - tidak ada nilai kontrak. Nilai
       diambil dari kontrak subkontraktor supaya SPK dan kwitansi terminnya
       tidak berbeda angka. */
    const wo = await loadEntity({ field: "workOrders", prefix: "WO" }, id);
    if (!wo) throw new Error(`Work Order ${id} tidak ditemukan`);
    const sub = await loadEntity({ field: "subcontractors", prefix: "SUB" }, str(wo, "sub"));
    const proj = await loadEntity({ field: "projects", prefix: "PRJ" }, str(wo, "project"));
    const mulai = str(wo, "date", "startDate") !== "-" ? str(wo, "date", "startDate") : today();
    return {
      no: id,
      tanggal: mulai,
      projectName: proj ? str(proj, "name") : str(wo, "projectName"),
      subcontractorName: sub ? str(sub, "name") : str(wo, "subName"),
      subcontractorAddress: sub && str(sub, "address") !== "-" ? str(sub, "address") : undefined,
      subcontractorNPWP: sub ? str(sub, "npwp") : undefined,
      scopeOfWork: str(wo, "scope"),
      startDate: mulai,
      endDate: str(wo, "targetDate", "endDate"),
      contractValue: num(wo, "value") || num(sub ?? {}, "contract"),
      paymentTerms: str(wo, "paymentTerms") !== "-" ? str(wo, "paymentTerms") : "Termin",
      /*SPK tanpa pasal K3 tetap sah secara hukum, tapi untuk galangan clauses
         K3 itulah yang pertama kali ditanyakan pengawas. Persyaratan tidak
         disimpan per WO, jadi klausul standar perusahaan yang dicetak -
         bukan tanda hubung kosong yang terlihat seperti kelalaian. */
      k3Requirements: str(wo, "k3Requirements") !== "-" ? str(wo, "k3Requirements") : K3_CLAUSE,
      nameDirector: SIGNER,
      nameSubcontractor: sub ? str(sub, "name") : str(wo, "subName"),
      locale: ctx.locale,
    };
  },
  assemble: (input) => spk(input),
};

/* ---- Purchase Order ----
 *
 * Bentuk baris PO di aplikasi: `lines` berisi {name, qty, unit, price,
 * spec, need}; `vendor` berupa NAMA (bukan vendorId); total disimpan di
 * `amount`; `includePpn` menentukan apakah PPN ikut. Versi recipe sebelumnya
 * membaca `items`, `vendorId`, `taxRate`, dan `projectName` - tidak satu pun
 * ditulis modul Procurement, jadi PO yang tercetak tanpa item dan tanpa
 * nama vendor yang benar. */
const poRecipe: Recipe<PoInput> = {
  kind: "po",
  title: "Purchase Order",
  entity: { field: "purchaseOrders", prefix: "PO" },
  requiresEntity: true,
  async prepare(id, ctx) {
    const p = await loadEntity({ field: "purchaseOrders", prefix: "PO" }, id);
    if (!p) throw new Error(`PO ${id} tidak ditemukan`);
    const vendorName = str(p, "vendor");
    const vendor = await loadMany({ field: "vendors", prefix: "VND" }, { ids: [vendorName] }).then((r) => r[0]);

    /* PO lama dan baris seed tidak punya `lines` - hanya `item` dan `amount`.
       Tanpa fallback itu, dokumen resmi tercetak dengan tabel kosong padahal
       PO-nya nyata: lebih buruk daripada tidak ada item sama sekali. */
    const rawLines = arr(p, "lines", "items");
    const lineSource =
      rawLines.length > 0
        ? rawLines
        : str(p, "item") !== "-"
          ? [{ name: str(p, "item"), qty: num(p, "qty"), unit: str(p, "unit"), price: 0 }]
          : [];
    const items = lineSource.map((r) => {
      const qtyValue = Number(r.qty ?? r.quantity ?? 0);
      const price = Number(r.price ?? r.unitPrice ?? 0);
      const total = Number.isFinite(Number(r.total)) ? Number(r.total) : qtyValue * price;
      /* spec dan need disimpan terpisah di baris PO; keduanya bagian dari
         barang yang dipesan dan harus ikut tercetak - tanpa keduanya, tim
         gudang tidak tahu barang apa yang harus datang. */
      const spec = String(r.spec ?? "").trim();
      const need = String(r.need ?? "").trim();
      const desc = [String(r.name ?? r.description ?? r.item ?? "-"), spec, need].filter((s) => s !== "").join(" - ");
      return {
        description: desc,
        qty: qtyValue,
        unit: String(r.unit ?? ""),
        unitPrice: price,
        total,
      };
    });
    /* Subtotal dari item; kalau baris tidak punya lines (PO lama/seed),
       `amount` yang dipakai. Pemisahan DPP/PPN mengikuti flag aplikasi. */
    const fromItems = items.reduce((s, i) => s + i.total, 0);
    const amount = num(p, "amount") || fromItems;
    const includePpn = p.includePpn !== false;
    const taxRate = includePpn ? PPN_RATE : 0;
    /* PO menyimpan `amount` sebagai nilaiutto yang sudah termasuk PPN kalau
       flag menyala - itu cara modul Procurement menghitungnya. Jadi DPP
       diturunkan, bukan ditambah. */
    const subtotal = includePpn ? Math.round((amount / (1 + taxRate / 100)) * 100) / 100 : amount;
    const taxAmount = Math.round((amount - subtotal) * 100) / 100;
    const approvals = arr(p, "approvals");
    const eta = str(p, "eta");
    const notes = [
      str(p, "req") !== "-" ? `${L(ctx.locale, "Ref PR", "PR ref")}: ${str(p, "req")}` : "",
      eta !== "-" ? `${L(ctx.locale, "ETA", "ETA")}: ${longDate(eta)}` : "",
      str(p, "vessel") !== "-" ? `${L(ctx.locale, "Kapal", "Vessel")}: ${str(p, "vessel")}` : "",
      p.poType ? `${L(ctx.locale, "Jenis PO", "PO type")}: ${str(p, "poType")}` : "",
      approvals.length > 0
        ? `${L(ctx.locale, "Disetujui", "Approved by")}: ${approvals.map((a) => `${str(a, "by")} (${str(a, "level")})`).join("; ")}`
        : "",
      arr(p, "amendments").length > 0 ? `${L(ctx.locale, "Amandemen", "Amendments")}: ${arr(p, "amendments").length}` : "",
    ].filter((s) => s !== "").join("\n");
    return {
      no: str(p, "docNo") !== "-" ? `${id} / ${str(p, "docNo")}` : id,
      tanggal: docDate(p, "date"),
      vendorName,
      vendorAddress: vendor && str(vendor, "address") !== "-" ? str(vendor, "address") : undefined,
      vendorNPWP: vendor ? str(vendor, "npwp") : undefined,
      projectName: str(p, "project"),
      items,
      subtotal,
      taxRate,
      taxAmount,
      totalAmount: amount,
      paymentTerms: str(p, "paymentTerms") !== "-" ? str(p, "paymentTerms") : "NET 30",
      deliveryTerms: str(p, "deliveryTerms") !== "-" ? str(p, "deliveryTerms") : eta !== "-" ? eta : undefined,
      notes,
      nameOrderer: str(p, "ordererName", "requester") !== "-" ? str(p, "ordererName", "requester") : "-",
      nameApprover: approvals.length > 0 ? str(approvals[approvals.length - 1], "by") : SIGNER,
      locale: ctx.locale,
    };
  },
  assemble: (input) => po(input),
};

/* ---- Surat Jalan / DO / Tanda Terima (semuanya arsip `documents`) ----
 *
 * Ketiganya diterbitkan dari modul Inventori dan disimpan sebagai SATU baris di
 * tabel `documents` dengan awalan field berbeda (sj-, do-, tt-), bukan di tabel
 * `movements` - `movements` adalah mutasi stok per item, bukan dokumen surat
 * jalan. Factory di sini membaca field sungguhan dari baris arsip itu.
 */
const suratJalanRecipe: Recipe<SuratJalanInput> = {
  kind: "suratJalan",
  title: "Surat Jalan",
  entity: { field: "documents", prefix: "SJ-SMD" },
  requiresEntity: true,
  async prepare(id, ctx) {
    const d = await loadEntity({ field: "documents", prefix: "SJ-SMD" }, id);
    if (!d) throw new Error(`Surat jalan ${id} tidak ditemukan`);
    return {
      no: docNumber(d, "sbRef", "id"),
      tanggal: docDate(d, "sjDate"),
      tujuan: str(d, "vessel", "sjTo"),
      projectName: str(d, "project"),
      extra: [
        { label: "Kendaraan", value: str(d, "sjVehicle") },
        { label: "No. Polisi", value: str(d, "sjPlate") },
        { label: "Driver", value: str(d, "sjDriver") },
      ],
      items: itemRows(d, "sjItems", "items"),
      receiver: str(d, "sjReceiver"),
      giver: str(d, "sjGiver"),
      locale: ctx.locale,
    };
  },
  assemble: (input) => suratJalan(input),
};

const deliveryOrderRecipe: Recipe<DeliveryOrderInput> = {
  kind: "deliveryOrder",
  title: "Delivery Order",
  entity: { field: "documents", prefix: "DO" },
  requiresEntity: true,
  async prepare(id, ctx) {
    const d = await loadEntity({ field: "documents", prefix: "DO" }, id);
    if (!d) throw new Error(`Delivery order ${id} tidak ditemukan`);
    /* Surat jalan yang dilayani disimpan sebagai idSJ-SMD; nomor yang tercetak
       adalah sbRef-nya, karena itu yang ditulis di surat jalan. */
    const sjId = str(d, "doSjRef", "doSjId");
    const sj = sjId === "-" ? null : await loadEntity({ field: "documents", prefix: "SJ-SMD" }, sjId);
    return {
      no: docNumber(d, "sbRef", "id"),
      tanggal: docDate(d, "doDate"),
      tujuan: str(d, "doTo", "vessel"),
      driver: str(d, "doDriver"),
      sjRef: sj ? docNumber(sj, "sbRef", "id") : sjId,
      projectName: str(d, "project"),
      items: itemRows(d, "doItems", "items"),
      receiver: str(d, "doTo", "vessel"),
      sender: str(d, "doSupplier", "supplier"),
      locale: ctx.locale,
    };
  },
  assemble: (input) => deliveryOrder(input),
};

const tandaTerimaRecipe: Recipe<TandaTerimaInput> = {
  kind: "tandaTerima",
  title: "Tanda Terima",
  entity: { field: "documents", prefix: "TT-SMD" },
  requiresEntity: true,
  async prepare(id, ctx) {
    const d = await loadEntity({ field: "documents", prefix: "TT-SMD" }, id);
    if (!d) throw new Error(`Tanda terima ${id} tidak ditemukan`);
    const sjId = str(d, "ttSjId");
    const sj = sjId === "-" ? null : await loadEntity({ field: "documents", prefix: "SJ-SMD" }, sjId);
    return {
      no: docNumber(d, "sbRef", "id"),
      tanggal: docDate(d, "ttDate"),
      asal: sj ? docNumber(sj, "sbRef", "id") : sjId,
      projectName: str(d, "project"),
      items: itemRows(d, "ttItems", "items"),
      receiver: str(d, "ttReceiver"),
      giver: str(d, "ttGiver"),
      locale: ctx.locale,
    };
  },
  assemble: (input) => tandaTerima(input),
};

/* ---- Kop penawaran ---- */
const kopPenawaranRecipe: Recipe<KopPenawaranInput> = {
  kind: "kopPenawaran",
  title: "Kop Penawaran",
  entity: { field: "quotations", prefix: "QT" },
  requiresEntity: true,
  async prepare(id, ctx) {
    const qrow = await loadEntity({ field: "quotations", prefix: "QT" }, id);
    if (!qrow) throw new Error(`Penawaran ${id} tidak ditemukan`);
    const client = await loadEntity({ field: "clients", prefix: "CLT" }, str(qrow, "clientId"));
    return {
      no: id,
      tanggal: str(qrow, "date"),
      clientName: client ? str(client, "name") : str(qrow, "clientName"),
      projectName: str(qrow, "projectName"),
      totalValue: num(qrow, "totalValue"),
      validUntil: str(qrow, "validUntil"),
      notes: str(qrow, "notes"),
      nameSigner: SIGNER,
      locale: ctx.locale,
    };
  },
  assemble: (input) => kopPenawaran(input),
};

/* ---- Slip gaji ---- */

/** Total tunjangan: bentuk baru `[{label,amount}]`, bentuk lama satu angka. */
function allowanceTotal(v: unknown): number {
  const list = arr({ a: v }, "a");
  if (list.length > 0) {
    return list.reduce((s, r) => s + Number(r.amount ?? r.value ?? 0), 0);
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

const slipGajiRecipe: Recipe<SlipGajiInput> = {
  kind: "slipGaji",
  title: "Slip Gaji",
  entity: { field: "payroll", prefix: "PAY" },
  requiresEntity: true,
  async prepare(id, ctx) {
    const p = await loadEntity({ field: "payroll", prefix: "PAY" }, id);
    if (!p) throw new Error(`Payroll ${id} tidak ditemukan`);
    const emp = await loadEntity({ field: "employees", prefix: "EMP" }, str(p, "employeeId"));
    const locale = ctx.locale;
    /* Nama field yang dipakai modul Payroll harus dibaca apa adanya:
       `basic`, tunjangan berupa daftar, `bpjsKesKar`/`bpjsTkKar`, `kasbonPot`.
       Versi recipe sebelumnya membaca `basicSalary`, `allowances` tunggal, dan
       `bpjsKes`/`bpjsTk` - tiga nama yang tidak pernah ditulis aplikasi,
       sehingga semua slip gaji yang dicetak lewat server menunjukkan nominal
       nol. Nama lama tetap diterima karena baris seed masih memakainya. */
    const tunjangan = allowanceTotal(p.allowances);
    const kasbon = num(p, "kasbonPot");
    const potongLain = Math.max(0, num(p, "deductions") - kasbon);
    const bpjsKes = num(p, "bpjsKesKar", "bpjsKes");
    const bpjsTk = num(p, "bpjsTkKar", "bpjsTk");
    return {
      id,
      karyawan: emp ? str(emp, "name") : str(p, "employeeName"),
      periode: str(p, "period"),
      tipe: str(p, "type") !== "-" ? str(p, "type") : "Bulanan",
      rows: [
        { komponen: L(locale, "Gaji Pokok", "Basic salary"), nilai: rupiah(num(p, "basic", "basicSalary")) },
        { komponen: L(locale, "Tunjangan", "Allowances"), nilai: rupiah(tunjangan) },
        { komponen: L(locale, "Lembur", "Overtime"), nilai: rupiah(num(p, "overtimePay")) },
        ...(potongLain > 0
          ? [{ komponen: L(locale, "Potongan lain", "Other deductions"), nilai: rupiah(-potongLain) }]
          : []),
        ...(kasbon > 0 ? [{ komponen: L(locale, "Potongan kasbon", "Loan deduction"), nilai: rupiah(-kasbon) }] : []),
        { komponen: "BPJS Kesehatan", nilai: rupiah(-bpjsKes) },
        { komponen: "BPJS Ketenagakerjaan", nilai: rupiah(-bpjsTk) },
        { komponen: "PPh 21", nilai: rupiah(-num(p, "pph21")) },
      ],
      netLabel: L(locale, "Total Diterima", "Total received"),
      net: rupiah(num(p, "net")),
      status: str(p, "status"),
      locale,
    };
  },
  assemble: (input) => slipGaji(input),
};

/* ---- Transmittal ----
 *
 * Disimpan sebagai baris `documents` bertipe "Transmittal" oleh QC sebelum
 * PDF dirakit (lihat QCSafety.tsx saveTransmittal). Sebelumnya dokumen ini
 * langsung dirakit dari state form dan tidak pernah masuk DB, jadi tidak ada
 * yang bisa dicetak ulang dan tidak ada bukti siapa yang mengirim drawing ke
 * pihak klasifikasi.
 */
const transmittalRecipe: Recipe<TransmittalInput> = {
  kind: "transmittal",
  title: "Transmittal drawing",
  entity: { field: "documents", prefix: "TR" },
  requiresEntity: true,
  async prepare(id, ctx) {
    const t = await loadEntity({ field: "documents", prefix: "TR" }, id);
    if (!t) throw new Error(`Transmittal ${id} tidak ditemukan`);
    return {
      no: docNumber(t, "sbRef", "id"),
      tanggal: docDate(t, "trDate"),
      projectName: str(t, "project"),
      to: str(t, "trTo"),
      attention: str(t, "trAttention"),
      items: arr(t, "trItems").map((r) => ({
        code: String(r.code ?? r.id ?? "-"),
        title: String(r.title ?? r.name ?? "-"),
        revision: String(r.revision ?? "-"),
        status: String(r.status ?? "-"),
      })),
      notes: str(t, "trNotes"),
      sender: str(t, "trSender") !== "-" ? str(t, "trSender") : SIGNER,
      locale: ctx.locale,
    };
  },
  assemble: (input) => transmittal(input),
};

/* ---- SPT ----
 *
 * Modul Finance membekukan angka pajak saat tombol "Lapor" ditekan:
 * ppnKeluar, ppnMasuk, pph21, pph23..pph26, ppnTerutangAuto, dan
 * ppnTerutangFinal. SPT harus memakai angka-angka itu, bukan menghitung ulang
 * dari invoice - kalau invoice periode lalu diedit, SPT yang sudah difiled
 * akan ikut berubah tanpa jejak. */
const SPT_POTONGAN = ["pph21", "pph22", "pph23", "pph24", "pph25", "pph26"];

const sptRecipe: Recipe<SptInput> = {
  kind: "spt",
  title: "Surat Pemberitahuan Pajak",
  entity: { field: "taxPeriods", prefix: "TAX" },
  requiresEntity: true,
  async prepare(id, ctx) {
    const t = await loadEntity({ field: "taxPeriods", prefix: "TAX" }, id);
    if (!t) throw new Error(`Periode pajak ${id} tidak ditemukan`);
    const ppnKeluar = num(t, "ppnKeluar", "ppnKeluaran");
    const ppnMasuk = num(t, "ppnMasuk", "ppnMasukan");
    /* Override manual menang atas hitungan otomatis, tapi nominal otomatisnya
       ikut dicetak supaya selisih koreksi tetap terlihat di dokumen. */
    const terutangAuto = num(t, "ppnTerutangAuto", "default") || ppnKeluar - ppnMasuk;
    const manual = num(t, "ppnTerutangManual");
    const final = num(t, "ppnTerutangFinal") || (manual > 0 ? manual : terutangAuto);
    const rows: SptRow[] = [
      { jenis: L(ctx.locale, "PPN Keluaran", "Output VAT"), nilai: ppnKeluar },
      { jenis: L(ctx.locale, "PPN Masukan", "Input VAT"), nilai: -ppnMasuk },
    ];
    for (const key of SPT_POTONGAN) {
      const v = num(t, key);
      if (v === 0) continue;
      rows.push({
        jenis: key === "pph21" ? "PPh 21" : key.toUpperCase(),
        /* PPh 21 dipotong dari payroll, bukan dari nilai invoice - jadi
           pencetakannya memang tidak punya dasar pengenaan. */
        dasar: key === "pph21" ? L(ctx.locale, "Total payroll", "Total payroll") : undefined,
        tarif: key === "pph21" ? "-" : undefined,
        nilai: v,
      });
    }
    const pphTotal = SPT_POTONGAN.reduce((s, k) => s + num(t, k), 0);
    return {
      periode: str(t, "period"),
      tanggal: str(t, "reportedAt", "date") !== "-" ? str(t, "reportedAt", "date") : today(),
      jenisPajak: str(t, "type") !== "-" ? str(t, "type") : "PPN",
      masaPajak: str(t, "period"),
      npwp: str(t, "npwp") !== "-" ? str(t, "npwp") : "01.234.567.8-901.000",
      npwpPenyetor: str(t, "npwpPenyetor"),
      namaWajibPajak: "PT. SYUKUR BERSAUDARA",
      alamat: "Jl. Mulawarman No.23, Samarinda",
      rows,
      ppnTerutang: final,
      totalSetor: final + pphTotal,
      buktiSetor: str(t, "buktiSetor", "nomorFormulir"),
      tanggalSetor: str(t, "tanggalSetor") !== "-" ? str(t, "tanggalSetor") : undefined,
      formulir: str(t, "nomorFormulir") !== "-" ? str(t, "nomorFormulir") : undefined,
      bank: str(t, "bank") !== "-" ? str(t, "bank") : undefined,
      teller: str(t, "teller") !== "-" ? str(t, "teller") : undefined,
      namaPenandatangan: SIGNER,
      jabatanPenandatangan: "Direktur",
      locale: ctx.locale,
    };
  },
  assemble: (input) => spt(input),
};

/** Tanggal baris dokumen; jatuh ke `updated` lalu hari ini - tidak pernah "NaN". */
function docDate(row: Record<string, unknown>, field: string): string {
  const v = str(row, field);
  if (v !== "-") return v;
  const u = str(row, "updated");
  return u !== "-" ? u : today();
}

/* ==========================================================================
   Laporan (data hidup - model disimpan, tapi isinya bukan kontrak)
   ========================================================================== */

/** Muat satu koleksi penuh untuk agregasi laporan. */
async function loadAll(field: string): Promise<Record<string, unknown>[]> {
  return loadMany({ field, prefix: field.slice(0, 3).toUpperCase() });
}

/** Koleksi laporan + penyaring cabang. */
async function loadReportCols(ctx: RenderContext, fields: string[]): Promise<Collections> {
  const out: Collections = {};
  for (const f of fields) {
    out[f as keyof Collections] = inCtx(ctx, await loadAll(f));
  }
  return out;
}

/** Temuan (NCR + insiden) untuk satu rentang tanggal. */
function findingsIn(cols: Collections, from: string, to: string, projectId = ""): Finding[] {
  const out: Finding[] = [];
  for (const n of cols.ncr ?? []) {
    if (!reportsInRange(n.raised, from, to)) continue;
    if (projectId !== "" && str(n, "project") !== projectId) continue;
    out.push({
      kind: "NCR",
      id: str(n, "id"),
      status: str(n, "status"),
      date: str(n, "raised"),
      text: str(n, "issue", "description", "note"),
      severity: str(n, "severity", "type"),
    });
  }
  for (const i of cols.incidents ?? []) {
    if (!reportsInRange(i.date, from, to)) continue;
    out.push({
      kind: "Insiden",
      id: str(i, "id"),
      status: str(i, "status"),
      date: str(i, "date"),
      text: str(i, "desc", "description", "type"),
      severity: str(i, "severity", "type"),
    });
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, 40);
}

function findWbsRows(projectId: string): Promise<Array<{ data: unknown }>> {
  /* WBS tidak koleksi: tabelnya `wbs_by_project(project_id, data)`. Kegagalan
     baca tidak boleh menggagalkan laporan - proyek tanpa WBS tetap perlu
     laporan BoQ/invoice-nya. */
  return q<{ data: unknown }>("SELECT data FROM wbs_by_project WHERE project_id = ?", [projectId]).catch(() => []);
}

/** Senin minggu yang memuat tanggal ISO (identik `mondayOf` di Laporan.tsx). */
function mondayOf(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  return d.toISOString().slice(0, 10);
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/* ---- Laporan kas mingguan / bulanan ---- */
const REPORT_COLS = ["invoices", "journals", "projects", "ncr", "incidents", "payables", "payroll", "purchaseOrders", "attendance", "inventory", "equipment", "dockSlots", "vendors", "calibrations", "changeOrders", "employees", "inspections"];

const laporan: Recipe<CashReportModel> = {
  kind: "laporan",
  title: "Laporan mingguan / bulanan",
  report: true,
  entity: { field: "projects", prefix: "PRJ" },
  requiresEntity: false,
  async prepare(_id, ctx) {
    const cols = await loadReportCols(ctx, REPORT_COLS);
    const mode = filterText(ctx, "mode") === "Bulanan" ? "Bulanan" : "Mingguan";
    const todayIso = today();
    let from: string;
    let to: string;
    let label: string;
    if (mode === "Bulanan") {
      const month = filterText(ctx, "period", todayIso.slice(0, 7));
      from = `${month}-01`;
      to = `${month}-31`;
      label = monthLabelLong(month);
    } else {
      const weekStart = mondayOf(filterText(ctx, "period", todayIso));
      from = weekStart;
      to = addDays(weekStart, 6);
      label = `${longDate(from)} - ${longDate(to)}`;
    }
    const cash = periodCash(cols, from, to);
    const prev =
      mode === "Bulanan"
        ? periodCash(cols, `${shiftMonth(from.slice(0, 7), -1)}-01`, `${shiftMonth(from.slice(0, 7), -1)}-31`)
        : periodCash(cols, addDays(from, -7), addDays(from, -1));
    const projects = cols.projects
      ?.filter((p) => str(p, "status") !== "Selesai")
      .map((p) => ({ id: str(p, "id"), vessel: str(p, "vessel"), progress: num(p, "progress"), status: str(p, "status") }))
      .sort((a, b) => b.progress - a.progress)
      .slice(0, 25) ?? [];
    const periodMonth = from.slice(0, 7);
    const kpi = [
      {
        label: L(ctx.locale, "Proyek aktif", "Active projects"),
        value: String(projects.length),
        hint: L(ctx.locale, `Progres rata-rata ${projects.length === 0 ? 0 : Math.round(projects.reduce((s, p) => s + p.progress, 0) / projects.length)}%`, `Avg progress ${projects.length === 0 ? 0 : Math.round(projects.reduce((s, p) => s + p.progress, 0) / projects.length)}%`),
      },
      {
        label: L(ctx.locale, "Invoice terbit / lunas", "Issued / paid"),
        value: `${cash.invoiceIssuedCount} / ${cash.invoicePaidCount}`,
        hint: rupiah(cash.invoicePaid),
      },
      {
        label: L(ctx.locale, "PO terbit", "PO issued"),
        value: String(cash.poCount),
        hint: rupiah(cash.poIssued),
      },
      {
        label: L(ctx.locale, "Kehadiran", "Attendance"),
        value: `${cash.attendancePct}%`,
        hint: L(ctx.locale, `${cash.attendancePresent} dari ${cash.attendanceTotal}`, `${cash.attendancePresent} of ${cash.attendanceTotal}`),
      },
    ];
    if (mode === "Bulanan") {
      const payrollRows = (cols.payroll ?? []).filter((p) => str(p, "period") === periodMonth && str(p, "status") === "Dibayar");
      kpi[1] = {
        label: L(ctx.locale, "Pendapatan kas", "Cash revenue"),
        value: rupiah(cash.invoicePaid),
        hint: L(ctx.locale, `${cash.invoicePaidCount} invoice lunas`, `${cash.invoicePaidCount} settled invoices`),
      };
      kpi[2] = {
        label: L(ctx.locale, "Biaya (AP + payroll)", "Cost (AP + payroll)"),
        value: rupiah(cash.apPaid + cash.payrollPaid),
        hint: `${payrollRows.length} ${L(ctx.locale, "slip dibayar", "paid slips")}`,
      };
      kpi[3] = {
        label: L(ctx.locale, "Laba bersih", "Net profit"),
        value: rupiah(cash.profit),
        hint: L(ctx.locale, `PPh 21 ${rupiah(cash.pph21)}`, `PPh 21 ${rupiah(cash.pph21)}`),
      };
    }
    const compare = prev
      ? [
          { label: L(ctx.locale, "Pendapatan kas", "Cash revenue"), value: `${rupiah(cash.invoicePaid)} (${rupiah(cash.invoicePaid - prev.invoicePaid)})` },
          { label: L(ctx.locale, "Biaya", "Cost"), value: `${rupiah(cash.apPaid + cash.payrollPaid)} (${rupiah(cash.apPaid + cash.payrollPaid - prev.apPaid - prev.payrollPaid)})` },
          { label: L(ctx.locale, "Laba", "Profit"), value: `${rupiah(cash.profit)} (${rupiah(cash.profit - prev.profit)})` },
        ]
      : [];
    return {
      mode,
      periodLabel: label,
      from,
      to,
      cash,
      prev,
      kpi,
      compare,
      projects,
      findings: findingsIn(cols, from, to),
      composition: [
        { label: L(ctx.locale, "Invoice lunas", "Settled invoices"), value: cash.invoicePaidCount },
        { label: L(ctx.locale, "Invoice belum lunas", "Unsettled invoices"), value: Math.max(0, cash.invoiceIssuedCount - cash.invoicePaidCount) },
        { label: L(ctx.locale, "PO", "PO"), value: cash.poCount },
      ],
      signature: {
        name: filterText(ctx, "signatureName", "-"),
        role: filterText(ctx, "signatureRole", "-"),
        date: filterText(ctx, "signatureDate", todayIso),
      },
      locale: ctx.locale,
    };
  },
  assemble: (input) => cashReport(input),
};

/* ---- Laporan per proyek ---- */
const laporanProyek: Recipe<ProjectReportModel> = {
  kind: "laporanProyek",
  title: "Laporan ringkasan proyek",
  report: true,
  entity: { field: "projects", prefix: "PRJ" },
  requiresEntity: false,
  async prepare(id, ctx) {
    const projectId = id !== "" ? id : filterText(ctx, "projectId");
    if (projectId === "") throw new Error("Laporan proyek wajib menyertakan id proyek");
    const cols = await loadReportCols(ctx, [...REPORT_COLS, "boq", "workOrders", "maintenances", "bookings", "services", "spareparts", "activities"]);
    const wbsRows = await findWbsRows(projectId);
    const wbs = wbsRows.flatMap((r) => {
      let parsed: unknown = r.data;
      if (typeof r.data === "string") {
        try {
          parsed = JSON.parse(r.data);
        } catch {
          parsed = [];
        }
      }
      return Array.isArray(parsed) ? (parsed as Record<string, unknown>[]) : [];
    });
    const report = projectReport({ ...cols, wbs }, projectId);
    if (!report) throw new Error(`Proyek ${projectId} tidak ditemukan`);
    const from = "0000-01-01";
    const to = "9999-12-31";
    return {
      report,
      wbs: wbs.map((w) => ({ task: str(w, "task"), progress: num(w, "progress"), status: str(w, "status") })),
      boq: (cols.boq ?? [])
        .filter((b) => str(b, "projectId", "project") === projectId)
        .map((b) => ({ name: str(b, "name"), qty: `${num(b, "quantity")} ${str(b, "unit")}`, total: num(b, "totalPrice") || num(b, "quantity") * num(b, "unitPrice"), status: str(b, "status") })),
      invoices: (cols.invoices ?? [])
        .filter((i) => str(i, "project") === projectId)
        .map((i) => ({ id: str(i, "id"), amount: invoiceValue(i), status: str(i, "status"), due: str(i, "due", "date") })),
      workOrders: (cols.workOrders ?? [])
        .filter((w) => str(w, "project") === projectId)
        .map((w) => ({ id: str(w, "id"), sub: str(w, "sub"), progress: num(w, "progress") })),
      findings: findingsIn(cols, from, to, projectId),
      activity: (cols.activities ?? [])
        .filter((a) => str(a, "target").includes(projectId))
        .slice(0, 8)
        .map((a) => ({ actor: str(a, "actor"), action: str(a, "action"), target: str(a, "target"), date: str(a, "at", "createdAt", "date") })),
      locale: ctx.locale,
    };
  },
  /* Nama `projectReport` di file ini bentrok dengan fungsi agregasi yang sama
   namanya di reports.ts - karena itu factory-nya dipanggil lewat alias. */
  assemble: (input) => projectReportDoc(input),
};

/* ---- Analitik / ringkasan portofolio ---- */
const analitik: Recipe<AnalyticModel> = {
  kind: "analitik",
  title: "Laporan analitik / ringkasan portofolio",
  report: true,
  entity: { field: "projects", prefix: "PRJ" },
  requiresEntity: false,
  async prepare(_id, ctx) {
    const cols = await loadReportCols(ctx, REPORT_COLS);
    const months = monthAxis(filterNum(ctx, "months", 12));
    const series = monthlyFinance(cols, months);
    const kpi = portfolioKpi(cols, series);
    const statuses = new Map<string, number>();
    for (const p of cols.projects ?? []) {
      const key = str(p, "status");
      statuses.set(key, (statuses.get(key) ?? 0) + 1);
    }
    return {
      scope: filterText(ctx, "scope") === "Dashboard" ? "Dashboard" : "Analytics",
      periodLabel: L(ctx.locale, `${monthLabel(months[0] ?? "")} - ${monthLabel(months[months.length - 1] ?? "")}`, `${monthLabel(months[0] ?? "")} - ${monthLabel(months[months.length - 1] ?? "")}`),
      series,
      kpi,
      growth: { revenue: growthPct(series, "revenue"), margin: growthPct(series, "margin") },
      ncrPareto: ncrPareto(cols),
      profitByType: profitBy(cols, "type"),
      profitByBranch: profitBy(cols, "branch"),
      rework: reworkCost(cols),
      risk: {
        dockConflicts: dockConflicts(cols),
        lowStock: lowStockItems(cols),
        atRiskProjects: (cols.projects ?? [])
          .filter((p) => str(p, "status") === "Terlambat" || num(p, "actual") > num(p, "budget"))
          .map((p) => ({ id: str(p, "id"), vessel: str(p, "vessel"), status: str(p, "status") })),
        openNcr: kpi.openNcr,
        maintenancePending: (cols.equipment ?? []).filter((e) => str(e, "status") === "Maintenance").length,
        calibrationPending: (cols.calibrations ?? []).filter((c) => str(c, "status") !== "Selesai").length,
        worstVendor: worstVendor(cols),
      },
      projectStatus: Array.from(statuses.entries()).map(([label, value]) => ({ label, value })),
      locale: ctx.locale,
    };
  },
  assemble: (input) => analyticReport(input),
};

/* ---- Rekap gaji / THR ---- */
const payrollReportRecipe: Recipe<PayrollReportModel> = {
  kind: "rekapPayroll",
  title: "Rekap gaji & THR",
  report: true,
  entity: { field: "payroll", prefix: "PAY" },
  requiresEntity: false,
  async prepare(_id, ctx) {
    const cols = await loadReportCols(ctx, ["payroll", "employees"]);
    const period = filterText(ctx, "period", today().slice(0, 7));
    const mode = filterText(ctx, "mode") === "THR" ? "THR" : "Rekap";
    return {
      mode,
      period,
      recap: payrollRecap({ ...cols }, period, "Gaji"),
      thr: thrRecap({ ...cols }, period),
      locale: ctx.locale,
    };
  },
  assemble: (input) => payrollReport(input),
};

/* ==========================================================================
   Registri
   ========================================================================== */

/**
 * Tampilan recipe tanpa parameter tipe - yang dilihat route.
 *
 * Tiap recipe tetap diketik penuh di atas (factory-nya Receive input
 * konkret, bukan `unknown`). Erasure dilakukan tepat satu kali di `view()`:
 * route memang tidak bisa memeriksa tipe model dari snapshot JSON, dan
 * memaksakan `unknown` ke setiap factory akan membuang tipe yang baru saja
 * diketik di atas.
 */
export interface RecipeView {
  kind: string;
  title: string;
  report?: boolean;
  entity: { field: string; prefix: string };
  requiresEntity: boolean;
  prepare(id: string, ctx: RenderContext): Promise<unknown>;
  assemble(model: unknown, ctx: RenderContext): Document;
}

function view<T>(r: Recipe<T>): RecipeView {
  return r as unknown as RecipeView;
}

const RECIPES: RecipeView[] = [
  view(invoiceRecipe),
  view(termin),
  view(suratCutiRecipe),
  view(suratHr),
  view(bastRecipe),
  view(spkRecipe),
  view(poRecipe),
  view(suratJalanRecipe),
  view(deliveryOrderRecipe),
  view(tandaTerimaRecipe),
  view(kopPenawaranRecipe),
  view(slipGajiRecipe),
  view(transmittalRecipe),
  view(sptRecipe),
  view(laporan),
  view(laporanProyek),
  view(analitik),
  view(payrollReportRecipe),
];

export const DOC_KINDS = RECIPES.map((r) => r.kind);

export function findRecipe(kind: string): RecipeView | undefined {
  return RECIPES.find((r) => r.kind === kind);
}

/** Sumber entitas per kind - dipakai route untuk jejak audit. */
export function recipeEntity(kind: string): { field: string; prefix: string } | undefined {
  return findRecipe(kind)?.entity;
}

/**
 * Rakit dokumen dari id: `prepare` membaca DB, `assemble` merakit blok.
 * Keduanya dipisah supaya route bisa menyimpan hasil `prepare` sebagai
 * snapshot sebelum merakit - lihat pdf/renderStore.ts.
 */
export async function prepareModel(recipe: RecipeView, id: string, ctx: RenderContext): Promise<unknown> {
  return recipe.prepare(id, ctx);
}

/**
 * Rakit dokumen dari snapshot yang tersimpan.
 *
 * `assemble` dipanggil tanpa `prepare`: inilah yang membuat cetakan kedua
 * identik dengan cetakan pertama walau tabelnya sudah berubah.
 */
export function buildFromModel(recipe: RecipeView, model: unknown, ctx: RenderContext): Document {
  return recipe.assemble(model, ctx);
}

/** Ekspor helper agar route tidak perlu tahu detail internal. */
export { longDate, money, rupiah, qty, text, num, str, loadEntity, loadMany };