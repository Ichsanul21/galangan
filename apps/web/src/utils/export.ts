import writeXlsxFile, { type SheetData } from "write-excel-file/browser";
import html2pdf from "html2pdf.js";

/** Awalan sel berbahaya untuk injeksi formula Excel saat dibuka. */
const FORMULA_LEAD = ["=", "+", "-", "@", "\t", "|"];

function sanitizeCell(v: string): string {
  if (FORMULA_LEAD.some((p) => v.startsWith(p))) return `'${v}`;
  return v;
}

export async function exportExcel(data: unknown[][], filename: string, sheetName = "Export"): Promise<void> {
  const widths: number[] = [];
  const rows: SheetData = (data ?? []).map((row, r) =>
    (row ?? []).map((c, cIdx) => {
      let raw = c instanceof Date || typeof c === "string" || typeof c === "number" || typeof c === "boolean" ? c : c === null || c === undefined ? undefined : String(c);
      if (typeof raw === "string") raw = sanitizeCell(raw);
      widths[cIdx] = Math.max(widths[cIdx] ?? 10, Math.min(String(raw ?? "").length + 2, 45));
      // Baris 0 = judul (besar, navy), baris 1 = header (tebal + fill).
      if (r === 0) return { value: raw, fontWeight: "bold" as const, fontSize: 14, color: "#0B3A63" };
      if (r === 1) return { value: raw, fontWeight: "bold" as const, backgroundColor: "#E9EFF4" };
      return raw ?? null;
    })
  );
  await writeXlsxFile(rows, {
    sheet: (sheetName || "Export").slice(0, 31),
    columns: widths.map((w) => ({ width: w })),
    stickyRowsCount: 1,
  }).toFile(`${filename}.xlsx`);
}

export function exportPDF(elementId: string, filename: string): void {
  const el = document.getElementById(elementId);
  if (!el) return;
  html2pdf().set({
    margin: 10,
    filename: `${filename}.pdf`,
    image: { type: "jpeg", quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { unit: "mm", format: "a4", orientation: "landscape" },
  }).from(el).save();
}

export { fmtRupiah, fmtJumlah, fmtMiliar, fmtTanggal, fmtRentang } from "./format";
