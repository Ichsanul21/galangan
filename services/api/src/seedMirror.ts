// Generator cermin seed FE → BE. Jalankan: npm run seed:mirror
// Membaca modul MURNI apps/web (data/seeds.ts + data/index.ts — tanpa React,
// tanpa import.meta.env) lalu menulis src/seedFeMirror.ts (generated, di-commit).
// Wajib dijalankan ulang setiap ada perubahan seed FE.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const webData = path.resolve(here, "../../../apps/web/src/data");

const seeds = await import(pathToFileURL(path.join(webData, "seeds.ts")).href);
const index = await import(pathToFileURL(path.join(webData, "index.ts")).href);

interface Item {
  id: string;
  branch?: unknown;
  [key: string]: unknown;
}

// [namaExport, tabelBE]
const MAP: Array<[string, string]> = [
  ["seedWorkOrders", "workOrders"],
  ["seedTermins", "termins"],
  ["seedVendors", "vendors"],
  ["seedRequisitions", "requisitions"],
  ["seedInspections", "inspections"],
  ["seedBookings", "bookings"],
  ["seedPayables", "payables"],
  ["seedInvoices", "invoices"],
  ["seedDocuments", "documents"],
  ["seedBranches", "branches"],
  ["seedAttendance", "attendance"],
  ["seedPayroll", "payroll"],
  ["seedTaxPeriods", "taxPeriods"],
  ["seedRfqs", "rfqs"],
  ["seedChangeOrders", "changeOrders"],
  ["seedRisks", "risks"],
  ["seedLeaves", "leaves"],
  ["seedTrainings", "trainings"],
  ["seedTimesheets", "timesheets"],
  ["seedDrawings", "drawings"],
  ["seedToolbox", "toolbox"],
  ["seedCalibrations", "calibrations"],
  ["seedCommunications", "communications"],
  ["seedContracts", "contracts"],
  ["seedBast", "bast"],
  ["seedTrials", "trials"],
  ["seedRequests", "requests"],
  ["seedClientPos", "clientPos"],
];

const INDEX_MAP: Array<[string, string]> = [
  ["projects", "projects"],
  ["vessels", "vessels"],
  ["drydocks", "drydocks"],
  ["dockSlots", "dockSlots"],
  ["inventory", "inventory"],
  ["equipment", "equipment"],
  ["subcontractors", "subcontractors"],
  ["employees", "employees"],
  ["services", "services"],
  ["spareparts", "spareparts"],
  ["ncrList", "ncr"],
  ["incidents", "incidents"],
  ["purchaseOrders", "purchaseOrders"],
  ["quotations", "quotations"],
  ["clients", "clients"],
  ["inventoryMovement", "movements"],
  ["surveyTimeline", "surveys"],
  ["activities", "activities"],
  ["seedBoq", "boq"],
];

interface MirrorRow {
  table: string;
  id: string;
  branch: string;
  data: Record<string, unknown>;
}

function toRows(table: string, items: unknown): MirrorRow[] {
  if (!Array.isArray(items)) throw new Error(`seed ${table} bukan array`);
  return (items as Item[]).map((item) => {
    if (!item || typeof item.id !== "string" || item.id === "") {
      throw new Error(`seed ${table} punya baris tanpa id`);
    }
    const { id, branch, ...rest } = item;
    return {
      table,
      id,
      branch: typeof branch === "string" ? branch : "",
      data: rest as Record<string, unknown>,
    };
  });
}

const rows: MirrorRow[] = [];
for (const [name, table] of MAP) {
  if (!(name in seeds)) throw new Error(`export ${name} tidak ada di seeds.ts`);
  rows.push(...toRows(table, (seeds as Record<string, unknown>)[name]));
}
for (const [name, table] of INDEX_MAP) {
  if (!(name in index)) throw new Error(`export ${name} tidak ada di data/index.ts`);
  rows.push(...toRows(table, (index as Record<string, unknown>)[name]));
}

const seen = new Set<string>();
for (const r of rows) {
  const k = `${r.table}:${r.id}`;
  if (seen.has(k)) throw new Error(`duplikat id seed: ${k}`);
  seen.add(k);
}

const out = `// GENERATED — jangan edit manual. Dibuat oleh \`npm run seed:mirror\`
// dari apps/web/src/data/seeds.ts + data/index.ts (${rows.length} baris).
export interface MirrorRow {
  table: string;
  id: string;
  branch: string;
  data: Record<string, unknown>;
}

export const FE_MIRROR_ROWS: MirrorRow[] = ${JSON.stringify(rows, null, 2)};
`;

fs.writeFileSync(path.join(here, "seedFeMirror.ts"), out);
console.log(`[seed:mirror] tulis seedFeMirror.ts (${rows.length} baris)`);
