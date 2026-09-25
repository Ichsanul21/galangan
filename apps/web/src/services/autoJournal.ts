// Jurnal kas/bank otomatis idempoten (uang mengalir): dipakai Finance
// (pelunasan invoice, bayar hutang) dan Payroll (bayar gaji).
// Idempoten via dokumen unik — aman dipanggil ulang / dari aksi massal.
import type { CollectionKey, StoreItem } from "../data/store";

export interface CashJournalArgs {
  add: (
    collection: CollectionKey,
    item: Omit<StoreItem, "id"> & { id?: string },
    meta?: { action: string; target?: string; module: string },
  ) => Promise<StoreItem>;
  journals: Array<Record<string, unknown>>;
  branch: string;
  dokumen: string;
  date: string;
  uraian: string;
  db: string;
  kr: string;
  amount: unknown;
}

const num = (v: unknown): number => Number(v) || 0;

/** Petakan metode bayar ke rekening kas: Tunai→Kas Kantor, bank→rekeningnya. */
export function kasKodeOf(method: string): string {
  const m = String(method ?? "").toLowerCase();
  if (m.includes("tunai") || m.includes("kas")) return "1-111";
  if (m.includes("mandiri")) return "1-121";
  if (m.includes("bni")) return "1-122";
  return "1-120"; // BRI (rekening invoice SB)
}

/** Tulis 1 baris jurnal berimbang. Return true bila benar-benar menulis. */
export async function postCashJournal(args: CashJournalArgs): Promise<boolean> {
  const amount = Math.round(num(args.amount));
  if (amount <= 0 || !args.db || !args.kr || args.db === args.kr) return false;
  if ((args.journals ?? []).some((j) => String(j.dokumen ?? "") === args.dokumen)) return false;
  try {
    await args.add(
      "journals",
      {
        date: args.date,
        kodePembantu: "",
        dokumen: args.dokumen,
        uraian: args.uraian,
        db: args.db,
        kr: args.kr,
        amount,
        sumber: args.db.startsWith("1-11") || args.kr.startsWith("1-11") ? "Kas" : "Bank",
        status: "Posted",
        branch: args.branch !== "SEMUA" ? args.branch : "",
      },
      { action: "jurnal otomatis kas/bank", module: "Keuangan" },
    );
    return true;
  } catch {
    return false;
  }
}
