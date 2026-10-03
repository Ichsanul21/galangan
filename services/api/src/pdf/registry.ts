/* Registri dokumen PDF.
 *
 * `kind` adalah enum TERTUTUP - server tidak menerima nama dokumen bebas dari
 * klien. Kalau klien boleh mengarang nama, dia juga boleh mengarang isi.
 * Untuk dokumen resmi yang tidak dapat diterima:渲染-model dibangun dari
 * baris DB milik server, dan pemanggil hanya menyebut dokumen mana yang mau.
 */
import type { Document } from "./document.js";
import { kwitansi } from "./documents/kwitansi.js";
import { suratCuti } from "./documents/suratCuti.js";
import { bast } from "./documents/bast.js";
import { spk } from "./documents/spk.js";
import { po } from "./documents/po.js";
import { suratJalan } from "./documents/suratJalan.js";
import { deliveryOrder } from "./documents/deliveryOrder.js";
import { tandaTerima } from "./documents/tandaTerima.js";
import { kopPenawaran } from "./documents/kopPenawaran.js";
import { slipGaji } from "./documents/slipGaji.js";
import { loadEntity, loadMany, num, str, text, longDate, money, rupiah, qty, L, type Locale } from "./documents/shared.js";

export interface RenderContext {
  locale: Locale;
  /** Cabang pengguna; laporan dibatasi ke cabang ini. */
  branch: string;
}

/** Definisi satu jenis dokumen. */
interface Recipe {
  /** Nama untuk route + audit. */
  kind: string;
  /** Judul dokumen, ditampilkan di audit. */
  title: string;
  /** true = laporan (data hidup, tidak perlu snapshot untuk cetak ulang). */
  report?: boolean;
  /** Entitas DB yang jadi sumber utama; menentukan apakah `id` wajib. */
  entity: { field: string; prefix: string };
  /** true = payload req/id wajib; false = laporan boleh tanpa id. */
  requiresEntity: boolean;
  build: (id: string, ctx: RenderContext) => Promise<Document>;
}

/* ==========================================================================
   Helper
   ========================================================================== */

async function terminDoc(id: string, ctx: RenderContext): Promise<Document> {
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
  /* Requirement baru client 2 Oktober: invoice & BAST wajib ada sebelum
     kwitansi diterbitkan. Kalau salah satu kosong, kwitansi tetap boleh
     dicetak (dokumensometimes dibutuhkan untuk arsip) tetapi diberi catatan
     yang jujur - bukan diam-diam terlihat lengkap. */
  if (str(t, "invoiceNo") === "-") notes.push(L(ctx.locale, "Belum ada nomor invoice - kwitansi ini belum dapat dicocokkan ke invoice.", "Invoice number missing - this receipt cannot be matched to an invoice."));
  if (str(t, "bastNo") === "-") notes.push(L(ctx.locale, "Belum ada nomor BAST - serah terima pekerjaan belum terdokumentasi.", "BAST number missing - the handover is not documented."));
  if (ret > 0) notes.push(L(ctx.locale, "Retensi dilepas setelah work order selesai.", "Retention is released after the work order closes."));

  const sub = await loadMany({ field: "subcontractors", prefix: "SUB" }, { ids: [str(t, "subId")] })
    .then((rows) => rows[0]);

  return kwitansi(
    {
      no: `KW/${id.replaceAll("/", "-")}`,
      tanggal: str(t, "paidAt"),
      diterimaDari: str(t, "sub"),
      untuk: [id, str(t, "milestone")].filter((s) => s !== "-").join(" - "),
      breakdown,
      netLabel: L(ctx.locale, "Dibayar", "Net paid"),
      catatan: notes.join("\n"),
      locale: ctx.locale,
    },
    { footer: (p, total) => `Halaman ${p} dari ${total} · Termin ${id}` },
  );
  void sub;
}

async function suratCutiDoc(id: string, ctx: RenderContext): Promise<Document> {
  const leave = await loadEntity({ field: "leaves", prefix: "LV" }, id);
  if (!leave) throw new Error(`Leave ${id} tidak ditemukan`);
  const emp = await loadEntity({ field: "employees", prefix: "EMP" }, str(leave, "employeeId"));
  if (!emp) throw new Error(`Employee tidak ditemukan`);

  return suratCuti({
    no: `SPC/${id.replaceAll("/", "-")}`,
    tanggal: str(leave, "approvedAt") || new Date().toISOString().slice(0, 10),
    namaKaryawan: str(emp, "name"),
    nip: str(emp, "nip"),
    jabatan: str(emp, "position"),
    departemen: str(emp, "department"),
    jenis: str(leave, "type") === "Izin" ? "Izin" : "Cuti",
    alasan: str(leave, "reason"),
    tanggalMulai: str(leave, "startDate"),
    tanggalSelesai: str(leave, "endDate"),
    jumlahHari: num(leave, "days"),
    namaAtasan: str(leave, "approvedBy") || "-",
    namaDireksi: "H. Syarif Sarapping",
    locale: ctx.locale,
  });
}

async function bastDoc(id: string, ctx: RenderContext): Promise<Document> {
  const b = await loadEntity({ field: "bast", prefix: "BAST" }, id);
  if (!b) throw new Error(`BAST ${id} tidak ditemukan`);
  const proj = await loadEntity({ field: "projects", prefix: "PRJ" }, str(b, "projectId"));
  const sub = await loadEntity({ field: "subcontractors", prefix: "SUB" }, str(b, "subcontractorId"));

  return bast({
    no: id,
    tanggal: str(b, "date"),
    projectName: proj ? str(proj, "name") : str(b, "projectName"),
    subcontractorName: sub ? str(sub, "name") : str(b, "subcontractorName"),
    subcontractorAddress: sub ? str(sub, "address") : undefined,
    scopeOfWork: str(b, "scope"),
    deliverables: (b.deliverables as Array<{ description: string; qty?: number; unit?: string; status: string }>) || [],
    notes: str(b, "notes"),
    nameReceiver: str(b, "receiverName") || "H. Syarif Sarapping",
    nameGiver: sub ? str(sub, "name") : str(b, "giverName"),
    locale: ctx.locale,
  });
}

async function spkDoc(id: string, ctx: RenderContext): Promise<Document> {
  const wo = await loadEntity({ field: "workOrders", prefix: "WO" }, id);
  if (!wo) throw new Error(`Work Order ${id} tidak ditemukan`);
  const sub = await loadEntity({ field: "subcontractors", prefix: "SUB" }, str(wo, "sub"));
  const proj = await loadEntity({ field: "projects", prefix: "PRJ" }, str(wo, "project"));

  return spk({
    no: id,
    tanggal: str(wo, "createdAt") || new Date().toISOString().slice(0, 10),
    projectName: proj ? str(proj, "name") : str(wo, "projectName"),
    subcontractorName: sub ? str(sub, "name") : str(wo, "subName"),
    subcontractorAddress: sub ? str(sub, "address") : undefined,
    subcontractorNPWP: sub ? str(sub, "npwp") : undefined,
    scopeOfWork: str(wo, "scope"),
    startDate: str(wo, "startDate"),
    endDate: str(wo, "targetDate"),
    contractValue: num(wo, "value"),
    paymentTerms: str(wo, "paymentTerms") || "Termin",
    k3Requirements: str(wo, "k3Requirements"),
    nameDirector: "H. Syarif Sarapping",
    nameSubcontractor: sub ? str(sub, "name") : str(wo, "subName"),
    locale: ctx.locale,
  });
}

async function poDoc(id: string, ctx: RenderContext): Promise<Document> {
  const p = await loadEntity({ field: "purchaseOrders", prefix: "PO" }, id);
  if (!p) throw new Error(`PO ${id} tidak ditemukan`);
  const vendor = await loadEntity({ field: "vendors", prefix: "VND" }, str(p, "vendorId"));

  const items = (p.items as Array<{ description: string; qty: number; unit: string; unitPrice: number; total: number }>) || [];
  const subtotal = items.reduce((s, i) => s + i.total, 0);
  const taxRate = num(p, "taxRate") || 11;
  const taxAmount = Math.round(subtotal * taxRate / 100);
  const totalAmount = subtotal + taxAmount;

  return po({
    no: id,
    tanggal: str(p, "date"),
    vendorName: vendor ? str(vendor, "name") : str(p, "vendorName"),
    vendorAddress: vendor ? str(vendor, "address") : undefined,
    vendorNPWP: vendor ? str(vendor, "npwp") : undefined,
    projectName: str(p, "projectName"),
    items,
    subtotal,
    taxRate,
    taxAmount,
    totalAmount,
    paymentTerms: str(p, "paymentTerms") || "NET 30",
    deliveryTerms: str(p, "deliveryTerms"),
    notes: str(p, "notes"),
    nameOrderer: str(p, "ordererName") || "-",
    nameApprover: "H. Syarif Sarapping",
    locale: ctx.locale,
  });
}

async function suratJalanDoc(id: string, ctx: RenderContext): Promise<Document> {
  const m = await loadEntity({ field: "movements", prefix: "MV" }, id);
  if (!m) throw new Error(`Movement ${id} tidak ditemukan`);

  return suratJalan({
    no: id,
    tanggal: str(m, "date"),
    tujuan: str(m, "destination"),
    projectName: str(m, "projectName"),
    items: [{ name: str(m, "item"), qty: qty(m, "qty") }],
    receiver: str(m, "receiver") || "-",
    giver: str(m, "giver") || "Gudang",
    locale: ctx.locale,
  });
}

async function deliveryOrderDoc(id: string, ctx: RenderContext): Promise<Document> {
  const m = await loadEntity({ field: "movements", prefix: "MV" }, id);
  if (!m) throw new Error(`Movement ${id} tidak ditemukan`);

  return deliveryOrder({
    no: id,
    tanggal: str(m, "date"),
    asal: str(m, "supplier"),
    projectName: str(m, "projectName"),
    items: [{ name: str(m, "item"), qty: qty(m, "qty") }],
    receiver: str(m, "receiver") || "Gudang",
    sender: str(m, "supplier") || "-",
    locale: ctx.locale,
  });
}

async function tandaTerimaDoc(id: string, ctx: RenderContext): Promise<Document> {
  const m = await loadEntity({ field: "movements", prefix: "MV" }, id);
  if (!m) throw new Error(`Movement ${id} tidak ditemukan`);

  return tandaTerima({
    no: id,
    tanggal: str(m, "date"),
    asal: str(m, "from"),
    projectName: str(m, "projectName"),
    items: [{ name: str(m, "item"), qty: qty(m, "qty") }],
    receiver: str(m, "receiver") || "-",
    giver: str(m, "giver") || "-",
    locale: ctx.locale,
  });
}

async function kopPenawaranDoc(id: string, ctx: RenderContext): Promise<Document> {
  const q = await loadEntity({ field: "quotations", prefix: "QT" }, id);
  if (!q) throw new Error(`Quotation ${id} tidak ditemukan`);
  const client = await loadEntity({ field: "clients", prefix: "CLT" }, str(q, "clientId"));

  return kopPenawaran({
    no: id,
    tanggal: str(q, "date"),
    clientName: client ? str(client, "name") : str(q, "clientName"),
    projectName: str(q, "projectName"),
    totalValue: num(q, "totalValue"),
    validUntil: str(q, "validUntil"),
    notes: str(q, "notes"),
    nameSigner: "H. Syarif Sarapping",
    locale: ctx.locale,
  });
}

async function slipGajiDoc(id: string, ctx: RenderContext): Promise<Document> {
  const p = await loadEntity({ field: "payroll", prefix: "PAY" }, id);
  if (!p) throw new Error(`Payroll ${id} tidak ditemukan`);
  const emp = await loadEntity({ field: "employees", prefix: "EMP" }, str(p, "employeeId"));

  const rows = [
    { komponen: "Gaji Pokok", nilai: rupiah(num(p, "basicSalary")) },
    { komponen: "Tunjangan", nilai: rupiah(num(p, "allowances")) },
    { komponen: "Lembur", nilai: rupiah(num(p, "overtimePay")) },
    { komponen: "Potongan", nilai: rupiah(-num(p, "deductions")) },
    { komponen: "BPJS Kesehatan", nilai: rupiah(-num(p, "bpjsKes")) },
    { komponen: "BPJS Ketenagakerjaan", nilai: rupiah(-num(p, "bpjsTk")) },
    { komponen: "PPh 21", nilai: rupiah(-num(p, "pph21")) },
  ];

  return slipGaji({
    id,
    karyawan: emp ? str(emp, "name") : str(p, "employeeName"),
    periode: str(p, "period"),
    tipe: str(p, "type") || "Bulanan",
    rows,
    netLabel: "Total Diterima",
    net: rupiah(num(p, "net")),
    status: str(p, "status"),
    locale: ctx.locale,
  });
}

/* ==========================================================================
   Registri
   ========================================================================== */

const RECIPES: Recipe[] = [
  { kind: "kwitansi", title: "Kwitansi pembayaran termin", entity: { field: "termins", prefix: "TRM" }, requiresEntity: true, build: terminDoc },
  { kind: "suratCuti", title: "Surat persetujuan cuti/izin", entity: { field: "leaves", prefix: "LV" }, requiresEntity: true, build: suratCutiDoc },
  { kind: "bast", title: "Berita Acara Serah Terima", entity: { field: "bast", prefix: "BAST" }, requiresEntity: true, build: bastDoc },
  { kind: "spk", title: "Surat Perintah Kerja", entity: { field: "workOrders", prefix: "WO" }, requiresEntity: true, build: spkDoc },
  { kind: "po", title: "Purchase Order", entity: { field: "purchaseOrders", prefix: "PO" }, requiresEntity: true, build: poDoc },
  { kind: "suratJalan", title: "Surat Jalan", entity: { field: "movements", prefix: "MV" }, requiresEntity: true, build: suratJalanDoc },
  { kind: "deliveryOrder", title: "Delivery Order", entity: { field: "movements", prefix: "MV" }, requiresEntity: true, build: deliveryOrderDoc },
  { kind: "tandaTerima", title: "Tanda Terima", entity: { field: "movements", prefix: "MV" }, requiresEntity: true, build: tandaTerimaDoc },
  { kind: "kopPenawaran", title: "Kop Penawaran", entity: { field: "quotations", prefix: "QT" }, requiresEntity: true, build: kopPenawaranDoc },
  { kind: "slipGaji", title: "Slip Gaji", entity: { field: "payroll", prefix: "PAY" }, requiresEntity: true, build: slipGajiDoc },
];

export const DOC_KINDS = RECIPES.map((r) => r.kind);

export function findRecipe(kind: string): Recipe | undefined {
  return RECIPES.find((r) => r.kind === kind);
}

/** Ekspor helper agar route tidak perlu tahu detail internal. */
export { longDate, money, rupiah, qty, text, num, str, loadEntity, loadMany };