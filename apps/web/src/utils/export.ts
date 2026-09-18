import writeXlsxFile, { type SheetData } from "write-excel-file/browser";
import html2pdf from "html2pdf.js";

export async function exportExcel(data: unknown[][], filename: string, sheetName = "Export"): Promise<void> {
  const widths: number[] = [];
  const rows: SheetData = (data ?? []).map((row, r) =>
    (row ?? []).map((c, cIdx) => {
      const raw = c instanceof Date || typeof c === "string" || typeof c === "number" || typeof c === "boolean" ? c : c === null || c === undefined ? undefined : String(c);
      widths[cIdx] = Math.max(widths[cIdx] ?? 10, Math.min(String(raw ?? "").length + 2, 45));
      if (r === 0) return { value: raw, fontWeight: "bold" as const };
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
