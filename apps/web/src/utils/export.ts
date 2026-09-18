import ExcelJS from "exceljs";
import html2pdf from "html2pdf.js";

export async function exportExcel(data: unknown[][], filename: string, sheetName = "Export"): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "ISMS Galangan";
  wb.created = new Date();
  const ws = wb.addWorksheet((sheetName || "Export").slice(0, 31));
  const widths: number[] = [];
  data.forEach((row, r) => {
    const values = (row ?? []).map((c, cIdx) => {
      const v = c ?? "";
      const len = String(v).length;
      widths[cIdx] = Math.max(widths[cIdx] ?? 10, Math.min(len + 2, 45));
      return typeof v === "number" || typeof v === "string" ? v : String(v);
    });
    ws.addRow(values);
    if (r === 0) ws.getRow(1).font = { bold: true };
  });
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf as ArrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
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
