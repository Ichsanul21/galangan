// Daftar pemakai (usages) untuk modal hapus: deskripsi singkat per relasi
// agar UI bisa menampilkan alasan + memblokir hapus tanpa andalkan 409 BE.
// Perbandingan nama memakai sameName (trim + case-insensitive); join ID exact.
import type { StoreShape } from "../data/store";
import { sameName } from "./names";

function rowsOf(data: StoreShape, key: string): Record<string, unknown>[] {
  const rec = data as unknown as Record<string, unknown>;
  const v = rec[key];
  return Array.isArray(v) ? (v as Record<string, unknown>[]) : [];
}

function push(out: string[], n: number, label: string): void {
  if (n > 0) out.push(`${n} ${label}`);
}

/**
 * findUsages(data, collection, id): string[]
 * Mengembalikan deskripsi pemakai, mis. ["3 PO", "2 Hutang"].
 * Relasi: vendors←purchaseOrders.vendor+payables.v,
 * clients←invoices.client+quotations.client,
 * vessels←projects.vessel+surveys+dockSlots+warranties,
 * projects←purchaseOrders.project+invoices.project+wbs,
 * employees←payroll.employeeId+attendance+leaves,
 * inventory←movements.itemId+purchaseOrders.itemId.
 * Tambahan best-effort: documents←documents.related, coa←journals.db/kr,
 * boq←projects.approvedBoq, payables/invoices←saling po, workOrders←subcontractors.wo,
 * ncr←inspections.ncrId.
 * Koleksi lain → [] (tidak ada relasi anak yang dikenal).
 */
export function findUsages(data: StoreShape, collection: string, id: string): string[] {
  const out: string[] = [];
  const key = String(id ?? "");
  switch (collection) {
    case "vendors": {
      const v = rowsOf(data, "vendors").find((r) => String(r.id) === key);
      const name = String(v?.name ?? key);
      push(out, rowsOf(data, "purchaseOrders").filter((p) => sameName(p.vendor, name)).length, "PO");
      push(
        out,
        rowsOf(data, "payables").filter((a) => sameName(a.v ?? a.vendor, name)).length,
        "Hutang",
      );
      break;
    }
    case "clients": {
      const c = rowsOf(data, "clients").find((r) => String(r.id) === key);
      const name = String(c?.name ?? key);
      push(out, rowsOf(data, "invoices").filter((i) => sameName(i.client, name)).length, "Invoice");
      push(out, rowsOf(data, "quotations").filter((q) => sameName(q.client, name)).length, "Penawaran");
      break;
    }
    case "vessels": {
      const v = rowsOf(data, "vessels").find((r) => String(r.id) === key);
      const name = String(v?.name ?? key);
      push(out, rowsOf(data, "projects").filter((p) => sameName(p.vessel, name)).length, "Proyek");
      push(out, rowsOf(data, "surveys").filter((s) => sameName(s.vessel, name)).length, "Survei");
      push(out, rowsOf(data, "dockSlots").filter((s) => sameName(s.vessel, name)).length, "Slot Dock");
      push(out, rowsOf(data, "warranties").filter((w) => sameName(w.vessel, name)).length, "Garansi");
      break;
    }
    case "projects": {
      push(
        out,
        rowsOf(data, "purchaseOrders").filter((p) => String(p.project ?? p.projectId ?? "") === key).length,
        "PO",
      );
      push(out, rowsOf(data, "invoices").filter((i) => String(i.project ?? "") === key).length, "Invoice");
      const wbs = (data.wbsByProject as Record<string, unknown[]> | undefined)?.[key];
      if (Array.isArray(wbs) && wbs.length > 0) push(out, wbs.length, "Tugas WBS");
      break;
    }
    case "employees": {
      push(out, rowsOf(data, "payroll").filter((p) => String(p.employeeId ?? "") === key).length, "Slip Gaji");
      push(out, rowsOf(data, "attendance").filter((a) => String(a.employeeId ?? "") === key).length, "Absensi");
      push(out, rowsOf(data, "leaves").filter((l) => String(l.employeeId ?? "") === key).length, "Cuti");
      break;
    }
    case "inventory": {
      push(out, rowsOf(data, "movements").filter((m) => String(m.itemId ?? "") === key).length, "Mutasi");
      push(out, rowsOf(data, "purchaseOrders").filter((p) => String(p.itemId ?? "") === key).length, "PO");
      break;
    }
    case "documents": {
      const refs = rowsOf(data, "documents").filter(
        (d) =>
          String(d.id) !== key &&
          Array.isArray(d.related) &&
          (d.related as unknown[]).map(String).includes(key),
      );
      push(out, refs.length, "Dokumen terkait");
      break;
    }
    case "coa": {
      const c = rowsOf(data, "coa").find((r) => String(r.id) === key);
      const kode = String(c?.kode ?? key);
      push(
        out,
        rowsOf(data, "journals").filter((j) => String(j.db ?? "") === kode || String(j.kr ?? "") === kode).length,
        "Jurnal",
      );
      break;
    }
    /* Tanpa case "boq" findUsages selalu [] sehingga label "Diblokir - masih
       dipakai" dan penguncian hapus BoQ TIDAK PERNAH bisa aktif (dead code). */
    case "boq": {
      push(out, rowsOf(data, "projects").filter((p) => String(p.approvedBoq ?? "") === key).length, "Proyek");
      break;
    }
    /* Label dikembalikan ke ConfirmModal apa adanya. Karena dipakai di dialog
       yang juga tampil saat locale=en, label harus netral/bilingual-safe. */
    case "payables":
    case "invoices": {
      const isAp = collection === "payables";
      push(
        out,
        rowsOf(data, isAp ? "invoices" : "payables").filter((x) => String(x.po ?? "") === key).length,
        isAp ? "Invoice" : "Hutang",
      );
      break;
    }
    case "workOrders": {
      push(out, rowsOf(data, "subcontractors").filter((s) => String(s.wo ?? "") === key).length, "Subkontraktor");
      break;
    }
    case "ncr": {
      push(out, rowsOf(data, "inspections").filter((i) => String(i.ncrId ?? "") === key).length, "Inspeksi");
      break;
    }
    default:
      break;
  }
  return out;
}
