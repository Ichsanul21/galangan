import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { exec, q, closeDb } from "./db.js";

/* Perbarui harga lama yang sudah ada di DB ke tarif riset pasar (F7).
 *
 * Kenapa skrip ini perlu ada: `seed.ts` itu skip-if-exists, jadi baris yang
 * sudah pernah diimpor ke produksi TIDAK akan pernah tertimpa. Artinya
 * `fuelPrice: 12500` dan `laborCost: 2200000` yang sudah ada di DB VPS akan
 * tetap begitu selamanya, sementara kodenya sudah memakai 18.950 dan 622.256.
 * Gejalanya bukan error: halaman tetap jalan, angka tetap tampil - hanya
 * angkanya yang tidak bisa dipertanggungjawabkan ke sumber mana pun.
 *
 * ATURAN AMAN - ini yang membuat skrip ini boleh jalan di produksi:
 *
 * 1. Hanya field yang nilainya MASIH sama dengan placeholder lama yang diubah.
 *    Kalau ada yang sudah mengedit harga di Pengaturan atau mengoreksi manual,
 *    nilainya tidak lagi cocok placeholder sehingga TIDAK disentuh. Harga
 *    hasil negosiasi tidak boleh ditimpa angka riset.
 * 2. Defaultnya dry-run. Tanpa `--apply` skrip hanya mencetak rencana dan
 *    tidak menulis apa pun, supaya tidak ada perubahan tak sengaja di DB
 *    produksi.
 * 3. Idempoten. Jalankan dua kali, yang kedua melaporkan "0 berubah".
 * 4. Nomor hari kerja maintenance DITURUNKAN dari nilai lama
 *    (laborCost lama / tarif lama), bukan diketik ulang. Jadi tidak ada angka
 *    baru yang muncul dari udara.
 *
 * Jalankan:
 *   npm run seed:reprice            # dry-run, hanya laporan
 *   npm run seed:reprice -- --apply # menulis
 */

const here = path.dirname(fileURLToPath(import.meta.url));

/* Tarif target diambil dari modul web yang sama persis dengan yang dipakai
 * frontend, bukan diketik ulang di sini. Modul itu murni (tanpa React, tanpa
 * import.meta.env) - pola yang sama dipakai seedMirror.ts. Kalau rates.ts
 * berubah, skrip ini ikut berubah tanpa perlu disentuh.
 *
 * Bentuk modul ini ditulis ulang secara lokal, bukan `typeof import(...)`:
 * tsconfig API tidak mencakup apps/web, jadi tipe import akan gagal, sementara
 * import runtime lewat pathToFileURL tetap jalan. */
interface RatesModule {
  fuelPricePerLiter(): number;
  loadedLaborRatePerDay(role: "welder"): number;
  tarifListrikPerKwh(): number;
  tarifAirPerM3(): number;
  SEWA_ALAT: Record<string, { value: number; unit: string; source: string; effective: string }>;
  TARIF_DOCK: Record<string, { value: number; unit: string; source: string; effective: string }>;
}
const rates = (await import(
  pathToFileURL(path.resolve(here, "../../../apps/web/src/utils/rates.ts")).href
)) as RatesModule;

const TARGET_FUEL = rates.fuelPricePerLiter();
const TARGET_WELDER = rates.loadedLaborRatePerDay("welder");
const TARGET_KWH = rates.tarifListrikPerKwh();
const TARGET_AIR = rates.tarifAirPerM3();
const SEWA = rates.SEWA_ALAT;
const DOCK = rates.TARIF_DOCK;

/* Nilai placeholder yang diganti. Ditulis eksplisit supaya selalu ada yang
 * bisa ditanyakan kalau ada baris yang ternyata tidak berubah. */
const OLD_FUEL = new Set([11_500, 12_500, 13_500]);
const OLD_WELDER_RATE = 1_100_000;

/* Ada dua cara untuk menulis, dan keduanya sengaja didukung:
 *
 *   npx tsx src/seedReprice.ts --apply
 *   REPRICE_APPLY=1 npx tsx src/seedReprice.ts
 *
 * Jalur env var ada karena `npm run seed:reprice -- --apply` TIDAK meneruskan
 * flag di npm/PowerShell Windows: skrip berjalan dalam mode dry-run tapi
 * pemanggil melihat `--apply` di baris perintahnya dan mengira sudah ditulis.
 * Ini kegagalan senyap yang paling berbahaya untuk skrip yang menulis DB.
 */
const apply = process.argv.includes("--apply") || process.env.REPRICE_APPLY === "1";

if (!apply && process.argv.some((a) => a.includes("apply"))) {
  console.warn(
    "[reprice] PERINGATAN: argumen 'apply' ada tapi tidak dikenali - tetap DRY-RUN. " +
      "Gunakan `npx tsx src/seedReprice.ts --apply` atau `REPRICE_APPLY=1`.",
  );
}

interface Row {
  id: string;
  branch: string | null;
  data: string;
  updated_at?: string | null;
}

interface Change {
  table: string;
  id: string;
  field: string;
  from: unknown;
  to: unknown;
}

const changes: Change[] = [];
const untouched: string[] = [];

const n = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};

/**
 * Jumlah hari kerja maintenance, diturunkan dari sumber yang paling kuat.
 *
 * Urutannya penting: `laborDays` eksplisit > `laborCost / tarif lama` >
 * tanggal selesai - mulai. Yang terakhir dipakai inklusif, jadi pekerjaan
 * yang mulai dan selesai di tanggal yang sama tetap dihitung 1 hari.
 *
 * Kalau tidak ada satu pun sumber, dikembalikan null - pemanggil lalu
 * MELEWATI baris itu. Durasi yang dikarang akan membuat HPP salah dan tidak
 * ada yang bisa mengetahuinya, jadi lebih baik baris itu dilaporkan.
 */
function deriveDays(
  data: Record<string, unknown>,
  oldLabor: number | null,
  oldRate: number | null,
): { days: number | null; from: string } {
  const explicit = n(data.laborDays);
  if (explicit !== null && explicit > 0) return { days: Math.round(explicit), from: "laborDays" };

  if (oldLabor !== null && oldRate !== null && oldRate > 0) {
    return { days: Math.max(1, Math.round(oldLabor / oldRate)), from: "laborCost / tarif lama" };
  }

  const mulai = String(data.mulai ?? "").trim();
  const selesai = String(data.selesai ?? "").trim();
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (iso.test(mulai) && iso.test(selesai)) {
    const ms = Date.parse(`${selesai}T00:00:00Z`) - Date.parse(`${mulai}T00:00:00Z`);
    if (Number.isFinite(ms) && ms >= 0) {
      return { days: Math.round(ms / 86_400_000) + 1, from: "tanggal selesai - mulai" };
    }
  }

  return { days: null, from: "tidak bisa diturunkan" };
}

const write = async (table: string, id: string, data: unknown, branch: string | null, prevUpdated: string | null): Promise<void> => {
  const now = new Date().toISOString();
  await exec(`UPDATE ${table} SET data = ?, updated_at = ? WHERE id = ?`, [JSON.stringify(data), now, id]);
  /* branch tidak diubah - sengaja, supaya patch ini tidak menyentuh kolom lain. */
  void branch;
  void prevUpdated;
};

async function main(): Promise<void> {
  console.log(`[reprice] target fuelPrice = ${TARGET_FUEL.toLocaleString("id-ID")}/L`);
  console.log(`[reprice] target tarif welder = ${TARGET_WELDER.toLocaleString("id-ID")}/hari`);
  console.log(`[reprice] mode = ${apply ? "APPLY (menulis)" : "DRY-RUN (tidak menulis)"}`);

  /* ---------- equipment.fuelPrice ---------- */
  {
    const rows = await q<Row>("SELECT id, branch, data, updated_at FROM equipment");
    for (const r of rows) {
      const data = JSON.parse(r.data) as Record<string, unknown>;
      const cur = n(data.fuelPrice);
      if (cur === TARGET_FUEL) continue;
      /* Kosong diisi, dilewati tidak: tidak ada nilai manusia yang bisa
         tertimpa, dan harga yang hilang justru bug yang paling mahal
         karena tidak terlihat. */
      if (cur !== null && !OLD_FUEL.has(cur)) {
        untouched.push(`equipment ${r.id}: fuelPrice ${cur} bukan placeholder lama, tidak disentuh`);
        continue;
      }
      changes.push({ table: "equipment", id: r.id, field: "fuelPrice", from: cur, to: TARGET_FUEL });
      if (apply) {
        data.fuelPrice = TARGET_FUEL;
        await write("equipment", r.id, data, r.branch, r.updated_at ?? null);
      }
    }
  }

  /* ---------- maintenances: tarif tenaga + turunannya ---------- */
  {
    const rows = await q<Row>("SELECT id, branch, data, updated_at FROM maintenances");
    for (const r of rows) {
      const data = JSON.parse(r.data) as Record<string, unknown>;
      const oldRate = n(data.laborRatePerDay);
      const oldLabor = n(data.laborCost);

      /* Jumlah hari kerja diturunkan berurutan dari sumber terkuat:
         1. `laborDays` yang sudah ada
         2. `laborCost` lama dibagi tarif lama
         3. tanggal selesai - mulai (inklusif, jadi satu hari kerja = 1)
         Tidak ada angka yang diketik dari udara; kalau tidak ada satu pun
         sumber, baris dilewati dan dilaporkan. */
      const d = deriveDays(data, oldLabor, oldRate);
      let days = d.days;
      if (days === null) {
        /* Jumlah hari tidak bisa diturunkan. Tarif tetap diisi kalau kosong
           (tidak ada nilai manusia yang tertimpa), tapi laborCost TIDAK
           dihitung ulang: durasi yang dikarang akan membuat HPP salah dan
           tidak ada yang bisa mengetahuinya. Baris ini dilaporkan untuk
           diputuskan manual. */
        if (oldRate === null) {
          changes.push({ table: "maintenances", id: r.id, field: "laborRatePerDay", from: null, to: TARGET_WELDER });
          if (apply) {
            data.laborRatePerDay = TARGET_WELDER;
            await write("maintenances", r.id, data, r.branch, r.updated_at ?? null);
          }
        }
        if (oldRate !== null && oldRate !== TARGET_WELDER) {
          untouched.push(`maintenance ${r.id}: tarif ${oldRate} bukan placeholder lama, tidak disentuh`);
        }
        untouched.push(`maintenance ${r.id}: laborDays tidak diketahui, laborCost/costTotal TIDAK dihitung ulang`);
        continue;
      }
      if (apply) {
        console.log(`[reprice]   ${r.id}: ${days} hari dari ${d.from}`);
      }

      if (oldRate !== TARGET_WELDER) {
        if (oldRate !== null && oldRate !== OLD_WELDER_RATE) {
          untouched.push(`maintenance ${r.id}: tarif ${oldRate} bukan placeholder lama, tidak disentuh`);
          continue;
        }
        changes.push({ table: "maintenances", id: r.id, field: "laborRatePerDay", from: oldRate, to: TARGET_WELDER });
        if (apply) {
          data.laborRatePerDay = TARGET_WELDER;
          await write("maintenances", r.id, data, r.branch, r.updated_at ?? null);
        }
      }

      const newLabor = TARGET_WELDER * days;
      if (days !== n(data.laborDays)) {
        changes.push({ table: "maintenances", id: r.id, field: "laborDays", from: n(data.laborDays), to: days });
        if (apply) {
          data.laborDays = days;
          await write("maintenances", r.id, data, r.branch, r.updated_at ?? null);
        }
      }
      if (oldLabor !== newLabor) {
        changes.push({ table: "maintenances", id: r.id, field: "laborCost", from: oldLabor, to: newLabor });
        if (apply) {
          data.laborCost = newLabor;
          await write("maintenances", r.id, data, r.branch, r.updated_at ?? null);
        }
      }

      /* costTotal harus selalu sama dengan materialCost + laborCost. Kalau
         tidak, kartu Biaya dan PDF menampilkan angka yang tidak mungkin. */
      const mat = n(data.materialCost) ?? 0;
      const total = mat + newLabor;
      if (n(data.costTotal) !== total) {
        changes.push({ table: "maintenances", id: r.id, field: "costTotal", from: n(data.costTotal), to: total });
        if (apply) {
          data.costTotal = total;
          await write("maintenances", r.id, data, r.branch, r.updated_at ?? null);
        }
      }
    }
  }

  /* ---------- settings: tarif tenaga servis ---------- */
  {
    const rows = await q<Row>("SELECT id, branch, data, updated_at FROM settings WHERE id = ?", ["SET-EQLAB"]);
    for (const r of rows) {
      const data = JSON.parse(r.data) as Record<string, unknown>;
      const cur = n(data.value);
      if (cur === TARGET_WELDER) continue;
      if (cur !== null && cur !== OLD_WELDER_RATE) {
        untouched.push(`settings SET-EQLAB: nilai ${cur} bukan placeholder lama, tidak disentuh`);
        continue;
      }
      changes.push({ table: "settings", id: r.id, field: "value", from: cur, to: TARGET_WELDER });
      if (apply) {
        data.value = TARGET_WELDER;
        await write("settings", r.id, data, r.branch, r.updated_at ?? null);
      }
    }
    if (rows.length === 0) untouched.push("settings SET-EQLAB tidak ada di DB");
  }

  /* ---------- drydocks: dimensi untuk peta fasilitas (F2) ----------
     Field ini BARU, jadi aman selalu diisi: tidak ada nilai lama yang bisa
     tertimpa. Peta menolak fasilitas yang panjangnya tidak terbaca, jadi
     tanpa ini drydock tidak muncul di peta. */
  {
    const rows = await q<Row>("SELECT id, branch, data, updated_at FROM drydocks");
    for (const r of rows) {
      const data = JSON.parse(r.data) as Record<string, unknown>;
      const missing: string[] = [];
      if (!(n(data.lengthM) !== null && n(data.lengthM)! > 0)) missing.push("lengthM");
      if (n(data.widthM) === null) missing.push("widthM");
      if (data.kind === undefined) missing.push("kind");
      if (missing.length === 0) continue;

      const name = String(data.name ?? r.id);
      const nums = [...String(data.capacity ?? "").matchAll(/(\d+(?:[.,]\d+)?)\s*m\b/gi)]
        .map((m) => Number(m[1].replace(",", ".")))
        .filter((x) => Number.isFinite(x) && x > 0);
      const lengthM = n(data.lengthM) ?? nums[0] ?? 0;
      if (!(lengthM > 0)) {
        untouched.push(`drydock ${r.id} (${name}): panjang tidak terbaca dari capacity, dilewati`);
        continue;
      }
      data.lengthM = lengthM;
      data.widthM = n(data.widthM) ?? nums[1] ?? Math.round(lengthM / 10);
      data.kind = /slipway/i.test(name) ? "slipway" : /berth/i.test(name) ? "berth" : "graving";
      if (n(nums[2]) !== null) data.depthM = nums[2];

      changes.push({ table: "drydocks", id: r.id, field: missing.join("+"), from: null, to: data.lengthM });
      if (apply) await write("drydocks", r.id, data, r.branch, r.updated_at ?? null);
    }
  }

  /* ---------- equipment: rate sewa + acquisitionCost kosong ---------- */
  {
    const rows = await q<Row>("SELECT id, branch, data, updated_at FROM equipment");
    for (const r of rows) {
      const data = JSON.parse(r.data) as Record<string, unknown>;
      const name = String(data.name ?? "");
      let targetRate: number | null = null;
      if (/gantry.*50|50t/i.test(name) && /crane|gantry/i.test(name)) targetRate = SEWA.crane50T?.value ?? null;
      else if (/mobile.*100|100t/i.test(name) && /crane/i.test(name)) targetRate = SEWA.crane100T?.value ?? null;
      else if (/forklift.*10|10t/i.test(name)) targetRate = SEWA.forklift10T?.value ?? null;

      const rate = n(data.rate);
      if (targetRate !== null && (rate === null || rate === 0)) {
        changes.push({ table: "equipment", id: r.id, field: "rate", from: rate, to: targetRate });
        if (apply) { data.rate = targetRate; await write("equipment", r.id, data, r.branch, r.updated_at ?? null); }
      }
      const acq = n(data.acquisitionCost);
      if (acq === null || acq === 0) {
        /* acquisitionCost nol = bug seed lama; isi dengan estimasi book value
           berdasarkan umur pakai × tarif sewa harian × 180 hari (order of
           magnitude asumsi, bukan riset) - TIDAK ditimpa bila sudah ada. */
        const life = n(data.usefulLife) ?? 10;
        const est = targetRate ?? rate ?? 250000;
        const guess = Math.round(est * 180 * life);
        if (guess > 0) {
          changes.push({ table: "equipment", id: r.id, field: "acquisitionCost", from: acq, to: guess });
          if (apply) { data.acquisitionCost = guess; await write("equipment", r.id, data, r.branch, r.updated_at ?? null); }
        }
      }
    }
  }

  /* ---------- inventory.cost nol ---------- */
  {
    const rows = await q<Row>("SELECT id, branch, data, updated_at FROM inventory");
    for (const r of rows) {
      const data = JSON.parse(r.data) as Record<string, unknown>;
      const cost = n(data.cost);
      if (cost !== null && cost > 0) continue;
      const avg = n(data.avgCost);
      if (avg !== null && avg > 0) {
        changes.push({ table: "inventory", id: r.id, field: "cost", from: cost, to: avg });
        if (apply) { data.cost = avg; await write("inventory", r.id, data, r.branch, r.updated_at ?? null); }
        continue;
      }
      /* Fallback: harga jual eceran × 0,7 sebagai cost konservatif. */
      const eceran = n(data.eceran) || n(data.price);
      if (eceran !== null && eceran > 0) {
        const guess = Math.round(eceran * 0.7);
        changes.push({ table: "inventory", id: r.id, field: "cost", from: cost, to: guess });
        if (apply) { data.cost = guess; await write("inventory", r.id, data, r.branch, r.updated_at ?? null); }
      } else {
        untouched.push(`inventory ${r.id} (${String(data.name ?? r.id)}): cost nol dan tidak ada avgCost/eceran untuk diturunkan`);
      }
    }
  }

  /* ---------- dockSlots.ratePerDay nol ---------- */
  {
    const rows = await q<Row>("SELECT id, branch, data, updated_at FROM dockSlots");
    for (const r of rows) {
      const data = JSON.parse(r.data) as Record<string, unknown>;
      const rate = n(data.ratePerDay);
      if (rate !== null && rate > 0) continue;
      const dockId = String(data.dockId ?? "");
      let target = 0;
      if (/^DD/i.test(dockId)) target = DOCK.graving?.value ?? 0;
      else if (/^BH/i.test(dockId)) target = DOCK.berth?.value ?? 0;
      else if (/^SL/i.test(dockId)) target = DOCK.slipway?.value ?? 0;
      if (target > 0) {
        changes.push({ table: "dockSlots", id: r.id, field: "ratePerDay", from: rate, to: target });
        if (apply) { data.ratePerDay = target; await write("dockSlots", r.id, data, r.branch, r.updated_at ?? null); }
      } else {
        untouched.push(`dockSlots ${r.id}: ratePerDay nol dan prefix dockId tidak dikenal`);
      }
    }
  }

  /* ---------- settings TARIF_LISTRIK / TARIF_AIR ---------- */
  {
    for (const [id, target] of [["SET-TARIFKWH", TARGET_KWH], ["SET-TARIFAIR", TARGET_AIR]] as const) {
      const rows = await q<Row>("SELECT id, branch, data, updated_at FROM settings WHERE id = ?", [id]);
      for (const r of rows) {
        const data = JSON.parse(r.data) as Record<string, unknown>;
        const cur = n(data.value);
        if (cur === target) continue;
        if (cur !== null && cur !== 0 && cur !== 1650 && cur !== 15000) {
          /* 1650/15000 adalah placeholder seed lama; nilai lain dianggap
             sudah dikustomisasi user. */
          if (id === "SET-TARIFKWH" && cur === 1650) { /* lama, ganti */ }
          else if (id === "SET-TARIFAIR" && cur === 15000 && target === 15000) continue;
          else { untouched.push(`settings ${id}: nilai ${cur} bukan placeholder, tidak disentuh`); continue; }
        }
        changes.push({ table: "settings", id: r.id, field: "value", from: cur, to: target });
        if (apply) { data.value = target; await write("settings", r.id, data, r.branch, r.updated_at ?? null); }
      }
    }
  }

  /* ---------- purchaseOrders.amount nol (dihitung dari lines) ---------- */
  {
    const rows = await q<Row>("SELECT id, branch, data, updated_at FROM purchaseOrders");
    for (const r of rows) {
      const data = JSON.parse(r.data) as Record<string, unknown>;
      const amt = n(data.amount);
      if (amt !== null && amt > 0) continue;
      const lines = Array.isArray(data.lines) ? (data.lines as Record<string, unknown>[]) : [];
      const sum = lines.reduce((s, l) => s + (n(l.qty) ?? 0) * (n(l.price) ?? 0), 0);
      if (sum > 0) {
        changes.push({ table: "purchaseOrders", id: r.id, field: "amount", from: amt, to: sum });
        if (apply) { data.amount = sum; await write("purchaseOrders", r.id, data, r.branch, r.updated_at ?? null); }
      } else {
        const qty = n(data.qty) ?? 0;
        const unit = n(data.unitPrice) ?? 0;
        if (qty > 0 && unit > 0) {
          const guess = Math.round(qty * unit);
          changes.push({ table: "purchaseOrders", id: r.id, field: "amount", from: amt, to: guess });
          if (apply) { data.amount = guess; await write("purchaseOrders", r.id, data, r.branch, r.updated_at ?? null); }
        } else {
          untouched.push(`purchaseOrders ${r.id}: amount nol dan lines/unitPrice tidak bisa dihitung`);
        }
      }
    }
  }

  /* ---------- laporan ---------- */
  console.log("");
  for (const c of changes) {
    console.log(
      `[reprice] ${c.table}.${c.id}.${c.field}: ${String(c.from ?? "-")} -> ${String(c.to)}`,
    );
  }
  if (untouched.length > 0) {
    console.log("");
    for (const u of untouched) console.log(`[reprice] LEWATI ${u}`);
  }
  console.log("");
  console.log(
    `[reprice] ${changes.length} perubahan, ${untouched.length} dilewati${apply ? ", DITULIS" : ", belum ditulis (dry-run)"}`,
  );

  if (apply) {
    /* Verifikasi setelah tulis: invarian harus benar-benar berlaku di DB,
       bukan hanya di rencana. Skrip yang "tidak gagal" belum berarti berhasil. */
    let bad = 0;
    const eq = await q<Row>("SELECT id, data FROM equipment");
    for (const r of eq) {
      const v = n((JSON.parse(r.data) as Record<string, unknown>).fuelPrice);
      if (v !== TARGET_FUEL) {
        bad += 1;
        console.error(`[reprice] GAGAL equipment ${r.id}: fuelPrice = ${v}, harusnya ${TARGET_FUEL}`);
      }
    }
    const mt = await q<Row>("SELECT id, data FROM maintenances");
    for (const r of mt) {
      const d = JSON.parse(r.data) as Record<string, unknown>;
      const labor = n(d.laborCost) ?? 0;
      const rate = n(d.laborRatePerDay) ?? 0;
      const days = n(d.laborDays) ?? 0;
      const mat = n(d.materialCost) ?? 0;
      if (labor !== rate * days) {
        bad += 1;
        console.error(`[reprice] GAGAL ${r.id}: laborCost ${labor} != ${rate} x ${days}`);
      }
      if ((n(d.costTotal) ?? 0) !== mat + labor) {
        bad += 1;
        console.error(`[reprice] GAGAL ${r.id}: costTotal ${String(n(d.costTotal))} != ${mat} + ${labor}`);
      }
    }
    if (bad > 0) {
      console.error(`[reprice] ${bad} invarian tidak terpenuhi. Restore dari backup.`);
      process.exitCode = 1;
      return;
    }
    console.log("[reprice] verifikasi DB: semua invarian terpenuhi");
  }
}

const entry = process.argv[1] ?? "";
if (entry.endsWith("seedReprice.ts") || entry.endsWith("seedReprice.js")) {
  main()
    .then(() => closeDb().then(() => process.exit(process.exitCode ?? 0)))
    .catch((err) => {
      console.error("[reprice] failed:", err instanceof Error ? err.message : err);
      process.exit(1);
    });
}