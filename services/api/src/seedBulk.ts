import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exec, q, closeDb } from "./db.js";

// Impor bulk data persis dokumen (Fase 0 -> seed-data/*.json) ke tabel generik.
// Idempoten (skip-if-exists per id). Tidak menyentuh seed FE.
// Jalankan setelah `npm run seed`:  npm run seed:bulk
// Butuh .env produksi: set -a; source <(sudo cat .env); set +a

const here = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(here, "../seed-data");

function load<T>(name: string): T {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), "utf8")) as T;
}

function payDate(note: string): string {
  const m = note.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!m) return "";
  const yy = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${yy}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

async function put(table: string, id: string, branch: string, data: Record<string, unknown>, now: string, ctr: { ins: number; skip: number; done: number; total: number }): Promise<void> {
  const exists = await q("SELECT id FROM " + table + " WHERE id = ?", [id]);
  if (exists.length > 0) {
    ctr.skip += 1;
  } else {
    try {
      await exec(`INSERT INTO ${table} (id, branch, data, updated_at) VALUES (?, ?, ?, ?)`, [
        id,
        branch,
        JSON.stringify(data),
        now,
      ]);
      ctr.ins += 1;
    } catch (err) {
      // Idempoten juga terhadap balapan/rerun: duplikat = anggap skip.
      const code = (err as { code?: string; errno?: number } | null)?.code;
      const errno = (err as { code?: string; errno?: number } | null)?.errno;
      if (code === "ER_DUP_ENTRY" || errno === 1062 || /UNIQUE constraint failed/i.test(String((err as Error)?.message ?? ""))) {
        ctr.skip += 1;
      } else {
        throw err;
      }
    }
  }
  // Progress bar kasar: tulis tiap 2000 baris + tiap fase.
  ctr.done += 1;
  if (ctr.done % 2000 === 0 || ctr.done === ctr.total) {
    const pct = ctr.total > 0 ? Math.round((ctr.done / ctr.total) * 100) : 0;
    console.log(`[seed:bulk] ${ctr.done}/${ctr.total} (${pct}%) ins=${ctr.ins} skip=${ctr.skip}`);
  }
}

async function main(): Promise<void> {
  const now = new Date().toISOString();
  const hutang = load<{ items: Array<Record<string, any>> }>("hutang.json");
  const kode = load<{ barang: Array<{ kode: string; nama: string }>; supplier: Array<{ kode: string; nama: string }> }>("warehouse_kode.json");
  const stock = load<Array<{ kode: string; nama: string; awal: number; masuk: number; keluar: number; akhir: number }>>("warehouse_stock.json");
  const win = load<Array<Record<string, any>>>("warehouse_in.json");
  const wout = load<Array<Record<string, any>>>("warehouse_out.json");
  const fhutang = load<Array<{ no: string; nama: string; saldoAwal: number; saldoAkhir: number }>>("finance_hutang.json");
  const fpiu = load<Array<{ no: string; nama: string; saldoAwal: number; saldoAkhir: number }>>("finance_piutang.json");
  const fbank = load<{ banks: Array<Record<string, any>>; jurnal: Array<Record<string, any>> }>("finance_bank.json");
  const faset = load<Array<Record<string, any>>>("finance_aset.json");
  const total =
    hutang.items.length + kode.barang.length + win.length + wout.length +
    kode.supplier.length + fhutang.length + fpiu.length + fbank.jurnal.length +
    faset.length + 3; // 3 baris settings
  const ctr = { ins: 0, skip: 0, done: 0, total };
  console.log(`[seed:bulk] mulai, total ${total} baris`);

  // ---- 1. Hutang dagang 48 baris -> payables ----
  let n = 0;
  for (const h of hutang.items) {
    n += 1;
    const id = `AP-RAW-${String(n).padStart(3, "0")}`;
    const sisa = Number(h.jumlah || 0) - Number(h.pay1 || 0) - Number(h.pay2 || 0);
    await put("payables", id, "", {
      id,
      v: "PT KALTIM LESTARI UNGGUL",
      po: h.noPo,
      noInvoice: h.noInvoice,
      amt: h.jumlah,
      openAwal: h.jumlah,
      due: h.tglTagihan,
      pph: "",
      st: sisa <= 0 ? "Lunas" : "Belum Dibayar",
      vessel: h.keterangan,
      item: h.jenisBarang,
      pay1: h.pay1,
      pay1date: payDate(String(h.pay1note ?? "")),
      pay1note: h.pay1note,
      pay2: h.pay2,
      pay2date: payDate(String(h.pay2note ?? "")),
      pay2note: h.pay2note,
      tglTagihan: h.tglTagihan,
    }, now, ctr);
  }

  // ---- 2. Warehouse KODE+STOCK -> inventory ----
  const stockMap = new Map(stock.map((s) => [s.kode, s]));
  // File asli memakai ulang 31 kode untuk barang berbeda — kemunculan
  // ke-2+ diberi sufiks -2/-3 agar semua 4784 baris masuk persis dokumen.
  const usedInvIds = new Set<string>();
  for (const b of kode.barang) {
    const st = stockMap.get(b.kode);
    let invId = `WH-${b.kode}`;
    if (usedInvIds.has(invId)) {
      let k = 2;
      while (usedInvIds.has(`${invId}-${k}`)) k += 1;
      invId = `${invId}-${k}`;
    }
    usedInvIds.add(invId);
    await put("inventory", invId, "", {
      id: invId,
      name: b.nama || b.kode,
      category: "Warehouse 2024",
      sku: b.kode,
      warehouse: "Gudang Santi",
      stock: st ? Number(st.akhir || 0) : 0,
      stockAwal: st ? Number(st.awal || 0) : 0,
      stockMasuk: st ? Number(st.masuk || 0) : 0,
      stockKeluar: st ? Number(st.keluar || 0) : 0,
      minStock: 0,
      unit: "pcs",
      cost: 0,
      avgCost: 0,
    }, now, ctr);
  }

  // ---- 3. IN/OUT -> movements ----
  n = 0;
  for (const m of win) {
    n += 1;
    await put("movements", `MV-RAW-IN-${String(n).padStart(4, "0")}`, "", {
      id: `MV-RAW-IN-${String(n).padStart(4, "0")}`,
      item: m.nama,
      itemId: `WH-${m.kode}`,
      type: "Penerimaan",
      qty: m.jumlah,
      unit: m.satuan,
      by: m.supNama || m.vendor,
      supplier: m.supNama,
      date: m.tanggal,
      tone: "in",
      price: m.hargaNonPpn,
      tax: m.pajak,
      total: m.total,
      purpose: m.purpose,
    }, now, ctr);
  }
  n = 0;
  for (const m of wout) {
    n += 1;
    await put("movements", `MV-RAW-OUT-${String(n).padStart(5, "0")}`, "", {
      id: `MV-RAW-OUT-${String(n).padStart(5, "0")}`,
      item: m.nama,
      itemId: m.kode ? `WH-${m.kode}` : "",
      type: "Pengeluaran",
      qty: m.jumlah,
      unit: m.satuan,
      by: m.purpose,
      date: m.tanggal,
      tone: "out",
      purpose: m.purpose,
      pic: m.pic,
      keterangan: m.keterangan,
    }, now, ctr);
  }

  // ---- 4. Supplier warehouse + vendor hutang -> vendors ----
  const supSeen = new Set<string>();
  let vs = 0;
  for (const sp of kode.supplier as Array<{ kode: string; nama: string }>) {
    if (!sp.nama || supSeen.has(sp.nama.toUpperCase())) continue;
    supSeen.add(sp.nama.toUpperCase());
    vs += 1;
    await put("vendors", `VND-WH-${String(vs).padStart(3, "0")}`, "", {
      id: `VND-WH-${String(vs).padStart(3, "0")}`,
      name: sp.nama,
      cat: "Material",
      supKode: sp.kode,
      status: "Aktif",
    }, now, ctr);
  }
  let vh = 0;
  for (const v of fhutang) {
    if (!v.nama || supSeen.has(v.nama.toUpperCase())) continue;
    supSeen.add(v.nama.toUpperCase());
    vh += 1;
    await put("vendors", `VND-FIN-${String(vh).padStart(3, "0")}`, "", {
      id: `VND-FIN-${String(vh).padStart(3, "0")}`,
      name: v.nama,
      cat: "Hutang Dagang",
      status: "Aktif",
      saldoAwal: v.saldoAwal,
      saldoAkhir: v.saldoAkhir,
    }, now, ctr);
  }

  // ---- 5. Piutang -> clients ----
  let cp = 0;
  for (const c of fpiu) {
    if (!c.nama) continue;
    cp += 1;
    await put("clients", `CLN-FIN-${String(cp).padStart(3, "0")}`, "", {
      id: `CLN-FIN-${String(cp).padStart(3, "0")}`,
      name: c.nama,
      saldoAwal: c.saldoAwal,
      saldoAkhir: c.saldoAkhir,
    }, now, ctr);
  }

  // ---- 6. Bank + jurnal + aset ----
  await put("settings", "BANK_ACCOUNTS_RAW", "", {
    id: "BANK_ACCOUNTS_RAW",
    key: "BANK_ACCOUNTS_RAW",
    value: fbank.banks,
    label: "Rekening bank (RawData JU Agu-2026)",
    group: "rawdata",
  }, now, ctr);
  let jn = 0;
  for (const j of fbank.jurnal) {
    jn += 1;
    await put("journals", `JU-RAW-${String(jn).padStart(3, "0")}`, "", {
      id: `JU-RAW-${String(jn).padStart(3, "0")}`,
      date: j.tanggal,
      ...j,
    }, now, ctr);
  }
  let an = 0;
  for (const a of faset) {
    an += 1;
    await put("assets", `AST-RAW-${String(an).padStart(3, "0")}`, "", {
      id: `AST-RAW-${String(an).padStart(3, "0")}`,
      ...a,
    }, now, ctr);
  }

  // ---- 7. Subkon detail + tonase -> settings ----
  const subkon = load<Record<string, unknown>>("subkon.json");
  await put("settings", "RAW_SUBKON_PAK_YUSUF", "", {
    id: "RAW_SUBKON_PAK_YUSUF",
    key: "RAW_SUBKON_PAK_YUSUF",
    value: subkon,
    label: "Rincian subkon Pak Yusuf (RawData)",
    group: "rawdata",
  }, now, ctr);
  const tonase = load<Record<string, unknown>>("tonase.json");
  await put("settings", "TONASE_REF", "", {
    id: "TONASE_REF",
    key: "TONASE_REF",
    value: tonase,
    label: "Tabel tonase (TABLE TONASE PLAT.jpg)",
    group: "rawdata",
  }, now, ctr);

  console.log(`[seed:bulk] done (inserted=${ctr.ins} skipped=${ctr.skip})`);
}

const entry = process.argv[1] ?? "";
if (entry.endsWith("seedBulk.ts") || entry.endsWith("seedBulk.js")) {
  main()
    .then(() => closeDb().then(() => process.exit(0)))
    .catch((err) => {
      console.error("[seed:bulk] failed:", err);
      process.exit(1);
    });
}
