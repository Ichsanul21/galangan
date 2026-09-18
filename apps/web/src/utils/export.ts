import * as XLSX from "xlsx";
import html2pdf from "html2pdf.js";

export function exportExcel(data: any[][], filename: string): void {
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Export");
  XLSX.writeFile(wb, `${filename}.xlsx`);
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

export function fmtRupiah(n: number): string {
  return "Rp " + n.toLocaleString("id-ID");
}

export function fmtJumlah(n: number): string {
  return n.toLocaleString("id-ID");
}
