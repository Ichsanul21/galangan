// Relasi biaya equipment -> HPP / Biaya Proyek.
//
// SEBELUMNYA biaya equipment hidup terpisah dari proyek:
//   - bookings.cost  dihitung (hours × equipment.rate) lalu DITAMPILKAN di tab
//     "Biaya" modul Equipment, tapi tidak pernah masuk ke projects.
//   - maintenances.materialCost hanya nempel di baris equipment/maintenance.
//   - pages/proyek/ProjectDetail.tsx menghitung budget vs actual dari
//     invoices & changeOrders saja, sehingga HPP proyek under-reported:
//     modal kerja (sewa crane, genset, material servis) hilang dari margin.
//
// File ini adalah SATU tempat di mana semua biaya equipment sebuah proyek
// dijumlahkan, supaya modul Equipment dan modul Proyek membaca angka yang sama.

import type { StoreItem } from "../data/store";
import { materialsCost, materialsOf, statusOf, workDaysOf } from "./maintenance";
import { sameName } from "./names";

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/* ============================================================
   BOOKING / ALOKASI EQUIPMENT
   ============================================================ */

export const BOOKING_BILLABLE = new Set(["Selesai", "Terpakai"]);

/** Booking yang benar-benar membebankan biaya (dalam proses dihitung penuh). */
export function isBillableBooking(b: StoreItem): boolean {
  return BOOKING_BILLABLE.has(String(b.status ?? ""));
}

/**
 * Resolve equipment dari booking.
 * Field booking.equip bisa berisi id (runtime) ATAU name (seed lama) -
 * lihat pages/equipment/Equipment.tsx resolveEquip. Fungsi ini meniru
 * resolusi yang sama agar HPP dan UI equipment tidak berbeda Zulu.
 */
export function resolveEquipment(booking: StoreItem, equipment: StoreItem[]): StoreItem | undefined {
  const ref = String(booking.equip ?? "");
  if (ref === "") return undefined;
  const byId = equipment.find((e) => String(e.id) === ref);
  if (byId) return byId;
  const byCode = equipment.find((e) => String(e.code ?? "") === ref);
  if (byCode) return byCode;
  return equipment.find((e) => sameName(e.name, ref));
}

/**
 * Biaya satu booking equipment.
 * Sumber angka, berurutan:
 *   1. `booking.costTotal`  - bila sudah diisi manual (koreksi user)
 *   2. `booking.cost`       - hasil finish (hours × rate) di modul Equipment
 *   3. dihitung ulang: hours × rate
 * Fuel (fuelLiters × equipment.fuelPrice) ditambahkan sebagai biaya
 * operasional - inilah "biaya operasional" yang tidak pernah masuk HPP dulu.
 */
export function bookingCost(b: StoreItem, equipment: StoreItem[]): number {
  const explicit = num(b.costTotal);
  if (explicit > 0) return explicit;
  const eq = resolveEquipment(b, equipment);
  const rate = num(eq?.rate);
  const hours = num(b.hours);
  const rental = num(b.cost) > 0 ? num(b.cost) : Math.round(hours * rate);
  const fuel = Math.round(num(b.fuelLiters) * num(eq?.fuelPrice));
  return rental + fuel;
}

export interface BookingCostRow {
  id: string;
  booking: StoreItem;
  equipmentName: string;
  projectId: string;
  date: string;
  hours: number;
  rental: number;
  fuel: number;
  cost: number;
}

/** Semua booking sebuah proyek yang membebankan biaya, siap ditampilkan. */
export function bookingCostRows(
  projectId: string,
  bookings: StoreItem[],
  equipment: StoreItem[],
): BookingCostRow[] {
  const out: BookingCostRow[] = [];
  for (const b of bookings) {
    if (String(b.proyek ?? "") !== projectId) continue;
    if (!isBillableBooking(b)) continue;
    const eq = resolveEquipment(b, equipment);
    const rate = num(eq?.rate);
    const hours = num(b.hours);
    const rental = num(b.cost) > 0 ? num(b.cost) : Math.round(hours * rate);
    const fuel = Math.round(num(b.fuelLiters) * num(eq?.fuelPrice));
    out.push({
      id: String(b.id),
      booking: b,
      equipmentName: String(eq?.name ?? b.equip ?? "-"),
      projectId,
      date: String(b.date ?? ""),
      hours,
      rental,
      fuel,
      cost: rental + fuel,
    });
  }
  return out.sort((a, b2) => (a.date < b2.date ? -1 : a.date > b2.date ? 1 : 0));
}

/* ============================================================
   MAINTENANCE
   ============================================================ */

/**
 * Biaya servis sebuah proyek.
 * Beban penuh HPP hanya kalau siklus SUDAH SELESAI (material benar-benar
 * keluar dari gudang). "Sedang Proses" ditampilkan sebagai komitmen
 * (committed) supaya manajer bisa melihat biaya yang sudah terkunci tanpa
 * mengarang realized cost.
 */
export interface MaintCostRow {
  id: string;
  maintenance: StoreItem;
  equipmentName: string;
  status: string;
  date: string;
  material: number;
  /** Biaya tenaga servis (tarif per hari x hari kerja).
   *  SEBELUMNYA diabaikan di sini padahal sudah dihitung dan disimpan di
   *  maintenance.laborCost - kartu Biaya di Equipment menampilkannya, tapi
   *  HPP proyek hanya menjumlahkan material. Akibatnya HPP proyek
   *  under-reported: biaya tenaga servis hilang dari laba proyek. */
  labor: number;
  /** Material + tenaga = yang benar-benar membebankan HPP. */
  cost: number;
  downtimeHours: number;
  /** true = sudah membebankan HPP. */
  realized: boolean;
}

export function maintenanceCostRows(
  projectId: string,
  maintenances: StoreItem[],
): MaintCostRow[] {
  const out: MaintCostRow[] = [];
  for (const m of maintenances) {
    if (String(m.projectId ?? "") !== projectId) continue;
    const st = statusOf(m);
    if (st === "Dibatalkan") continue;
    const material = materialsCost(materialsOf(m));
    const labor = num(m.laborCost);
    out.push({
      id: String(m.id),
      maintenance: m,
      equipmentName: String(m.equipmentName ?? m.equipmentId ?? "-"),
      status: st,
      date: String(m.tanggal ?? ""),
      material,
      labor,
      cost: material + labor,
      downtimeHours: num(m.downtimeHours),
      realized: st === "Selesai",
    });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** Durasi kerja maintenance = downtime aktual equipment (jam). */
export function maintenanceDowntimeHours(m: StoreItem): number {
  const explicit = num(m.downtimeHours);
  if (explicit > 0) return explicit;
  // Fallback: 1 hari kerja = 8 jam, hanya untuk siklus yang sudah selesai.
  if (statusOf(m) !== "Selesai") return 0;
  return workDaysOf(m) * 8;
}

/* ============================================================
   HPP PROYEK
   ============================================================ */

export interface EquipmentCostSummary {
  /** Σ booking yang sudah selesai/terpakai. */
  rental: number;
  /** Σ bahan bakar. */
  fuel: number;
  /** Σ (material + tenaga) maintenance yang sudah selesai. */
  maintenanceRealized: number;
  /** Σ (material + tenaga) maintenance yang masih berjalan (komitmen). */
  maintenanceCommitted: number;
  /** Σ biaya equipment yang membebankan HPP = rental+fuel+maintenanceRealized. */
  totalRealized: number;
  /** Committed + committed maintenance (anggaran yang belum terealisasi). */
  totalCommitted: number;
  bookingRows: BookingCostRow[];
  maintenanceRows: MaintCostRow[];
}

export function equipmentCostSummary(
  projectId: string,
  bookings: StoreItem[],
  maintenances: StoreItem[],
  equipment: StoreItem[],
): EquipmentCostSummary {
  const bookingRows = bookingCostRows(projectId, bookings, equipment);
  const maintenanceRows = maintenanceCostRows(projectId, maintenances);
  const rental = bookingRows.reduce((s, r) => s + r.rental, 0);
  const fuel = bookingRows.reduce((s, r) => s + r.fuel, 0);
  const maintenanceRealized = maintenanceRows.filter((r) => r.realized).reduce((s, r) => s + r.cost, 0);
  const maintenanceCommitted = maintenanceRows.filter((r) => !r.realized).reduce((s, r) => s + r.cost, 0);
  const totalRealized = rental + fuel + maintenanceRealized;
  return {
    rental,
    fuel,
    maintenanceRealized,
    maintenanceCommitted,
    totalRealized,
    totalCommitted: totalRealized + maintenanceCommitted,
    bookingRows,
    maintenanceRows,
  };
}

/**
 * Total biaya equipment per proyek - untuk tabel ringkasan lintas proyek
 * (Analytics "Biaya per Proyek", Laporan "Per Proyek").
 */
export function equipmentCostByProject(
  projects: StoreItem[],
  bookings: StoreItem[],
  maintenances: StoreItem[],
  equipment: StoreItem[],
): { projectId: string; projectName: string; cost: number }[] {
  return projects.map((p) => {
    const id = String(p.id);
    const sum = equipmentCostSummary(id, bookings, maintenances, equipment);
    return {
      projectId: id,
      projectName: String(p.vessel ?? p.client ?? id),
      cost: sum.totalRealized,
    };
  });
}

/* ============================================================
   PENYESUAIAN KE PROYEK (tulisan)
   ============================================================ */

/**
 * Patch untuk projects.* yang memasukkan equipment cost ke ringkasan biaya.
 * Sengaja TIDAK menyentuh `budget` (itu angka kontrak dengan klien) dan
 * TIDAK menyentuh `progress` - equipment cost adalah REALISASI biaya, bukan
 * perubahan nilai kontrak.
 */
export function projectCostPatch(sum: EquipmentCostSummary): Record<string, number> {
  return {
    equipCostRealized: sum.totalRealized,
    equipCostRental: sum.rental,
    equipCostFuel: sum.fuel,
    equipMaintCost: sum.maintenanceRealized,
    equipMaintCommitted: sum.maintenanceCommitted,
    equipCostTotal: sum.totalCommitted,
  };
}
