import writeXlsxFile, { type SheetData } from "write-excel-file/browser";

/* ============ E K S E L ============ */

/** Awalan sel berbahaya untuk injeksi formula Excel saat dibuka. */
const FORMULA_LEAD = ["=", "+", "-", "@", "\t", "|"];

function sanitizeCell(v: string): string {
  if (FORMULA_LEAD.some((p) => v.startsWith(p))) return `'${v}`;
  return v;
}

type CellRaw = string | number | boolean | Date | undefined;

function normalizeCell(c: unknown): CellRaw {
  if (c instanceof Date || typeof c === "string" || typeof c === "number" || typeof c === "boolean") return c;
  if (c === null || c === undefined) return undefined;
  return String(c);
}

export async function exportExcel(data: unknown[][], filename: string, sheetName = "Export"): Promise<void> {
  const widths: number[] = [];
  const rows: SheetData = (data ?? []).map((row, r) =>
    (row ?? []).map((c, cIdx) => {
      let raw = normalizeCell(c);
      if (typeof raw === "string") raw = sanitizeCell(raw);
      widths[cIdx] = Math.max(widths[cIdx] ?? 10, Math.min(String(raw ?? "").length + 2, 45));
      // Baris 0 = judul (besar, navy), baris 1 = header (tebal + fill).
      if (r === 0) return { value: raw, fontWeight: "bold" as const, fontSize: 14, color: "#0B3A63" };
      if (r === 1) return { value: raw, fontWeight: "bold" as const, backgroundColor: "#E9EFF4" };
      return raw ?? null;
    })
  );
  await writeXlsxFile(rows, {
    sheet: cleanSheetName(sheetName),
    columns: widths.map((w) => ({ width: w })),
    stickyRowsCount: 1,
  }).toFile(`${filename}.xlsx`);
}

export interface ExcelSheet {
  /** Nama tab sheet (otomatis dibersihkan: maks 31 karakter, tanpa []:*?/\ ). */
  name: string;
  /** Baris 0 = header tabel (tebal + fill), baris berikutnya = data. */
  rows: unknown[][];
}

const SHEET_NAME_BANNED = /[[\]:*?/\\]/g;

function cleanSheetName(name: string): string {
  return (String(name || "").trim() || "Sheet").replace(SHEET_NAME_BANNED, "-").slice(0, 31);
}

/** Workbook multi-sheet bergaya seragam: header tebal, lebar kolom otomatis,
 *  sanitasi anti-injeksi formula, baris kepala menempel saat di-scroll. */
export async function exportExcelSheets(sheets: ExcelSheet[], filename: string): Promise<void> {
  const usedNames = new Set<string>();
  const built = (sheets ?? []).map((s) => {
    let name = cleanSheetName(s.name);
    let n = 2;
    while (usedNames.has(name)) name = cleanSheetName(`${s.name} ${n++}`);
    usedNames.add(name);
    const widths: number[] = [];
    const data: SheetData = (s.rows ?? []).map((row, r) =>
      (row ?? []).map((c, cIdx) => {
        let raw = normalizeCell(c);
        if (typeof raw === "string") raw = sanitizeCell(raw);
        widths[cIdx] = Math.max(widths[cIdx] ?? 10, Math.min(String(raw ?? "").length + 2, 45));
        if (r === 0) return { value: raw ?? "", fontWeight: "bold" as const, backgroundColor: "#E9EFF4" };
        return raw ?? "";
      })
    );
    return {
      data,
      sheet: name,
      columns: widths.map((w) => ({ width: w })),
      stickyRowsCount: 1,
    };
  });
  if (built.length === 0) throw new Error("Tidak ada sheet untuk diekspor");
  await writeXlsxFile(built).toFile(`${filename}.xlsx`);
}
export { fmtRupiah, fmtJumlah, fmtMiliar, fmtTanggal, fmtRentang } from "./format";