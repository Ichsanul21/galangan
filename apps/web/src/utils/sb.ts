// Helper turunan RawData PT Syukur Bersaudara (docs/RawData).
// Rumus invoice: TOTAL=Jasa+Material, DPP=TOTAL*11/12, PPN=12%*DPP (0 bila SKDT),
// PPh=2%*Jasa, Grand=TOTAL+PPN-PPh-DP-Retensi. Tonase plat: P*L*T*7850 (mm -> kg).

export const SB_KOP = {
  name: "PT. SYUKUR BERSAUDARA",
  line1: "PERUSAHAAN GALANGAN DAN INDUSTRI KAPAL",
  hq: "KANTOR PUSAT SAMARINDA - KALIMANTAN TIMUR",
  addr1: "Jl. Mulawarman No.23 Telp. (0541) 6246750, Admin 08115524456",
  addr2: "Shipyard: Jl. Olah Bebaya Kampung Tengah Pulau Atas (Samarinda Ilir)",
  hp: "0811 552 4456",
  web: "www.syukurbersaudara.com",
  email: "syukurbersaudara@gmail.com",
  director: "H. Syarif Sarapping",
};

export const DPP_FACTOR = 11 / 12;
export const PPN_INVOICE_DEFAULT = 12;
export const PPH_JASA_DEFAULT = 2;
export const PPH_SUBKON_OPTIONS = [0.5, 2];

export interface SbInvoiceInput {
  jasa: number;
  material: number;
  ppnRate?: number; // default 12
  pphRate?: number; // default 2 (% dari jasa)
  skdt?: boolean; // tanpa PPN (contoh: INV PAKAI SKDT BG MHKL 35)
  dpApplied?: number; // amortisasi uang muka (contoh: V2 potong DP-1 1.098M)
  retentionPct?: number;
}

export interface SbInvoiceMath {
  jasa: number;
  material: number;
  total: number;
  dpp: number;
  ppn: number;
  pph: number;
  dpApplied: number;
  retentionAmt: number;
  grand: number;
}

export function sbInvoiceMath(i: SbInvoiceInput): SbInvoiceMath {
  const jasa = Math.max(0, Number(i.jasa) || 0);
  const material = Math.max(0, Number(i.material) || 0);
  const total = jasa + material;
  const dpp = Math.round(total * DPP_FACTOR);
  const ppnRate = i.skdt ? 0 : (i.ppnRate ?? PPN_INVOICE_DEFAULT);
  const ppn = Math.round((dpp * ppnRate) / 100);
  const pph = Math.round((jasa * (i.pphRate ?? PPH_JASA_DEFAULT)) / 100);
  const dpApplied = Math.max(0, Math.round(Number(i.dpApplied) || 0));
  const retentionAmt = Math.round((total * (Number(i.retentionPct) || 0)) / 100);
  const grand = total + ppn - pph - dpApplied - retentionAmt;
  return { jasa, material, total, dpp, ppn, pph, dpApplied, retentionAmt, grand };
}

/** Max sekuens dari daftar nomor dokumen: parse grup digit re, kembalikan max atau 0. */
export function maxSeq(docNos: string[], re: RegExp): number {
  let max = 0;
  for (const s of docNos) {
    re.lastIndex = 0;
    const m = re.exec(String(s ?? ""));
    if (m) {
      const n = parseInt(m[1] ?? m[0], 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  return max;
}

/** Parse sekuens Surat Jalan format dash SJ-SMD-YYYY-nnn: ambil digit trailing. */
export function parseSjSeq(ref: unknown): number {
  const m = /(\d+)$/.exec(String(ref ?? ""));
  return m ? Number(m[1]) || 0 : 0;
}

/** No. PO format RawData: nn/PO-SB/SMD/m/yyyy (cth 06/PO-SB/SMD/I/2024). */
export function sbPoNumber(seq: number, date = new Date()): string {
  const romawi = ["I","II","III","IV","V","VI","VII","VIII","IX","X","XI","XII"];
  return `${String(seq).padStart(2, "0")}/PO-SB/SMD/${romawi[date.getMonth()]}/${date.getFullYear()}`;
}

/** No. Dock Space: nnn/DS-SB/SMD/m/yyyy. No. Surat Jalan: SJ-SMD-yyyy-nnn. */
export function sbDsNumber(seq: number, date = new Date()): string {
  const romawi = ["I","II","III","IV","V","VI","VII","VIII","IX","X","XI","XII"];
  return `${String(seq).padStart(3, "0")}/DS-SB/SMD/${romawi[date.getMonth()]}/${date.getFullYear()}`;
}

export function sbSjNumber(seq: number, year = new Date().getFullYear()): string {
  return `SJ-SMD-${year}-${String(seq).padStart(3, "0")}`;
}

/** No. Tanda Terima: TT-SMD-yyyy-nnn (segmen beda dari SJ agar unik). */
export function sbTtNumber(seq: number, year = new Date().getFullYear()): string {
  return `TT-SMD-${year}-${String(seq).padStart(3, "0")}`;
}

/** Berat plat (kg) dari P x L (mm) x T (mm) x pcs. Baja 7850 kg/m3. */
export function sbTonasePlat(pMm: number, lMm: number, tMm: number, pcs = 1): number {
  if (pMm <= 0 || lMm <= 0 || tMm <= 0 || pcs <= 0) return 0;
  return Math.round(pMm * lMm * tMm * pcs * 7.85e-6 * 1000) / 1000;
}

/** PO include-PPN (RawData: "Harga Include PPN"): pecah DPP vs PPN. Default = PPN_RATE (12%). */
export function sbSplitIncludePpn(totalIncl: number, ppnRate = 12): { dpp: number; ppn: number } {
  const t = Math.max(0, Number(totalIncl) || 0);
  const dpp = Math.round((t * 100) / (100 + ppnRate));
  return { dpp, ppn: t - dpp };
}
