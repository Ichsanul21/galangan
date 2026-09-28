// Kebijakan akses tulis per koleksi (ditegakkan server — matriks Peran di FE
// hanya cerminan untuk dibaca manusia). Aturan:
// - peran operasional spesifik dulu (qc, gudang, procurement, finance, hr,
//   sales, proyek, subkon, drydock, equipment): tulis hanya koleksinya.
// - lalu sapuan manager: semua operasional + kelola users.
// - terakhir sapuan direktur/developer/admin: semua + kelola users + settings.
// - viewer/client/tamu + peran tak dikenal: read-only.
// Urutan penting: spesifik-sebelum-umum agar "Project Manager"/"Admin Gudang"
// kena aturan operasionalnya, bukan sapuan. Pencocokan substring
// case-insensitive.
import type { FastifyReply, FastifyRequest } from "fastify";
import { fail } from "./envelope.js";

const ALL = "*";

interface PolicyRule {
  match: RegExp;
  write: string[]; // koleksi boleh tulis; "*" = semua operasional
  manageUsers: boolean;
  settings: boolean; // tulis settings/coa
}

const POLICY: PolicyRule[] = [
  // Spesifik dulu, sapu-jagad belakangan: "Project Manager"/"QC Manager"
  // harus kena aturan operasionalnya, bukan sapuan /manager/; "Admin Gudang"
  // kena aturan gudang, bukan sapuan /admin/.
  { match: /qc|hse|inspector|quality|safety/i, write: ["ncr", "incidents", "inspections", "drawings", "toolbox", "calibrations", "documents", "walks", "auditPlans"], manageUsers: false, settings: false },
  { match: /gudang|warehouse|inventory|logistik/i, write: ["inventory", "movements", "documents"], manageUsers: false, settings: false },
  { match: /procurement|purchasing|pengadaan/i, write: ["requisitions", "rfqs", "purchaseOrders", "vendors", "documents"], manageUsers: false, settings: false },
  { match: /finance|keuangan|account|pajak|tax/i, write: ["invoices", "payables", "journals", "taxPeriods", "assets", "documents"], manageUsers: false, settings: false },
  { match: /\bhr\b|sdm|payroll|absensi|hc\b|personalia/i, write: ["employees", "attendance", "payroll", "leaves", "trainings", "timesheets", "documents"], manageUsers: false, settings: false },
  { match: /sales|crm|marketing|commercial/i, write: ["quotations", "clients", "contracts", "requests", "communications", "clientPos", "documents"], manageUsers: false, settings: false },
  { match: /project|proyek|foreman|tim\b|teknisi|engineer|produksi|operation/i, write: ["projects", "vessels", "workOrders", "wbs_by_project", "team_by_project", "dockSlots", "documents", "services", "spareparts", "boq", "surveys", "trials", "warranties", "bast", "changeOrders", "risks", "drawings"], manageUsers: false, settings: false },
  { match: /subkon|subcontractor/i, write: ["subcontractors", "workOrders", "termins", "timesheets", "documents"], manageUsers: false, settings: false },
  { match: /drydock|dock|docking|galangan/i, write: ["drydocks", "dockSlots", "vessels", "bookings", "documents"], manageUsers: false, settings: false },
  { match: /equipment|alat|maintenance|mekanik|utility/i, write: ["equipment", "bookings", "calibrations", "documents"], manageUsers: false, settings: false },
  { match: /manager/i, write: [ALL], manageUsers: true, settings: false },
  { match: /direktur|developer|direksi|admin/i, write: [ALL], manageUsers: true, settings: true },
];

export interface AccessProfile {
  writeCollections: string[] | "*";
  manageUsers: boolean;
  settings: boolean;
}

export function accessFor(role: unknown): AccessProfile {
  const r = String(role ?? "");
  for (const p of POLICY) {
    if (p.match.test(r)) {
      return { writeCollections: p.write.includes(ALL) ? "*" : p.write, manageUsers: p.manageUsers, settings: p.settings };
    }
  }
  return { writeCollections: [], manageUsers: false, settings: false };
}

export function canWriteCollection(role: unknown, collection: string): boolean {
  // Jejak audit: semua peran login boleh mencatat aktivitas (append-only
  // dari sisi FE). Tanpa ini antrean pendingSync activities 403 selamanya
  // untuk peran operasional.
  if (collection === "activities") return true;
  const a = accessFor(role);
  if (a.writeCollections === "*") return true;
  return a.writeCollections.includes(collection);
}

export function requireCollectionWrite(collection: string) {
  return async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!req.user) {
      return reply.status(401).send({ ok: false, error: { message: "Unauthorized", code: "UNAUTHORIZED" } });
    }
    if (!canWriteCollection(req.user.role, collection)) {
      return reply.status(403).send(fail(`Peran ${req.user.role} tidak boleh mengubah ${collection}`, "FORBIDDEN"));
    }
  };
}

export function requireManageUsers() {
  return async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!req.user) {
      return reply.status(401).send({ ok: false, error: { message: "Unauthorized", code: "UNAUTHORIZED" } });
    }
    if (!accessFor(req.user.role).manageUsers) {
      return reply.status(403).send(fail(`Peran ${req.user.role} tidak dapat mengelola pengguna`, "FORBIDDEN"));
    }
  };
}

export function requireSettingsWrite() {
  return async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!req.user) {
      return reply.status(401).send({ ok: false, error: { message: "Unauthorized", code: "UNAUTHORIZED" } });
    }
    if (!accessFor(req.user.role).settings) {
      return reply.status(403).send(fail(`Peran ${req.user.role} tidak boleh mengubah konstanta`, "FORBIDDEN"));
    }
  };
}
