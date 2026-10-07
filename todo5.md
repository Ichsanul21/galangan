# TODO 5 - Analisis 3 Revisi Client terhadap Codebase

Sumber permintaan: `notes.txt` (catatan revisi client, 3 gelombang: "hasil cek
mandiri", "NEW REVISION 5 OKTOBER", "NEW REVISION 2 OKTOBER").

Audit dilakukan terhadap `bd975c3` - **read-only**, dengan membaca kode, bukan
dari ingatan. Semua status di bawah punya bukti `file:line`.

Status: `SELESAI` = terpenuhi - `SEBAGIAN` = ada tapi tidak memenuhi kalimat
permintaan - `BELUM` = tidak ada kodenya - `AMBIGU` = tidak bisa dinilai tanpa
klarifikasi client.

---

# RINGKASAN

| Status | Jumlah |
|---|---|
| Selesai | 43 |
| Sebagian | 19 |
| Belum | 7 |
| **Total baris tabel** | **69** |

Hitungan di atas dihitung ulang dari baris tabel aktual (bukan angka audit
awal 72/73 yang sudah tidak konsisten - kemungkinan satu item tercatat dua
kali di dua bagian, C1 sinkronisasi vs C1 CRM).

Perubahan dari audit awal (+3 Selesai, -2 Sebagian): S3b, H1b, dan DK2.

Perubahan dari Gelombang 3: H3 naik ke SELESAI (10 field PIC memakai
`EntityPicker`), A2 naik dari BELUM ke SEBAGIAN.

Perubahan dari Gelombang 4: D1, D8, dan P8 naik ke SELESAI. D1 (Log
Penawaran & Tagihan, `172146e`), D8 (risiko auto dari WBS/SOW, `9fa8e55`),
P8 (override status Terlambat, `32d10c6`).

Perubahan dari Gelombang 5 + sesi lanjutan (real check terhadap kode):
D3, D10, D11, D12, D15 naik ke SELESAI (`68ec10d`..`12da962`). B2 naik ke
SELESAI (MoneyInput + parseRupiah di 6 file). D5 SELESAI (`d3ba2c1`):
skema `suratNo`, tabel grouped + expand, Excel + PDF per surat. F1 SELESAI
(`27a6d40`): kolom Dibuat/Diubah di tabel record Finance + tab Riwayat
Hapus. I2 SELESAI (`37e3b59`): klarifikasi ada di `notes.txt`, strip
"perlu perhatian" kini status → dropdown kategori. Tabel proyek P1, P2,
P6, P7, P9, P12, P13, P14 dan D9 + E2/E5 juga sudah ada di kode tapi
status tabel lama tidak pernah diperbarui - kini diselaraskan.

## Lima yang paling penting dan harus didahulukan

| # | Item | Kenapa |
|---|---|---|
| 1 | **C1 sisa: PATCH shallow-merge** | Dua perangkat mengedit baris sama masih last-writer-wins. Semua jalur sync lain (backendMode, loop 401, keyset, livelock) sudah ditutup. |
| 2 | **B1 + P10/P11: cabang & form proyek** | Filter cabang topbar + select cabang di form masih ada; client minta "rencana lokasi docking" + EntityPicker kapal/klien/PM. `branch` juga kunci RBAC. |
| 3 | **P3/P4/P5: card & filter Projects** | Card status tanpa label selesai/tertunda, grafik masih di card, FilterPopover belum slide/motion. Revisi 5 Okt eksplisit. |
| 4 | **D6/D7/D13: dokumen BoQ, CO↔BoQ, PO wajib** | D6 lampiran BoQ belum masuk koleksi documents. D7 approval CO ada tapi nol koneksi BoQ. D13 PO masih referensi opsional, client minta wajib + approval procurement. |
| 5 | **Deploy VPS + QA browser** | 4 commit sesi lanjutan (`d3ba2c1`, `27a6d40`, `37e3b59` + I2 flyout `19b5e9b`) belum push/deploy; belum teruji 2 device. |

---

# 1. CORE DAN ETC LINTAS MODUL

## A1 - Seeder harga, tidak ada yang 0, riset harga real - **SEBAGIAN**

**Terbukti:** `apps/web/src/utils/rates.ts:29-55` memuat 3 tarif riset dengan
sumber dan tanggal berlaku (Solar Industri B40 18.950, MFO 18.900, UMP Kaltim
3.680.000). `data/index.ts:487` dan `data/seeds.ts:15` menurunkan harga dari
modul itu, bukan angka literal.

**Yang sudah:** tidak ada harga 0 di seed. Pencarian seluruh key bermuatan
`price`, `rate`, `cost`, `amount`, `nilai`, `harga`, `tarif`, `budget`, atau
`nominal` bernilai `0` menghasilkan nol di `seeds.ts` dan `data/index.ts`.
Sisa 49 angka `0` semuanya non-harga: `openAwal` (15), `downtime` dan `pay2`,
rincian PPh 21 sampai 26 (18), rincian PPN (10), `retensi`, `bpjsKes`, `bpjsTk`,
`fuelLiters`, `deductions`.

**Kurang:**
1. Hanya 2 dari 3 tarif yang benar-benar dipakai data. `MFO_LOW_SULPHUR` nol
   konsumen.
2. Sebagian besar harga tetap angka tanpa sumber: `equipment.rate`,
   `acquisitionCost`, `inventory.cost`, `dockSlots.ratePerDay`,
   `TARIF_LISTRIK_KWH`, `TARIF_AIR_M3`. Tidak ada yang memaksa tarif ini
   traceable.
3. `seedReprice.ts` hanya menutup 4 koleksi. Invoice, PO, inventory, dan
   payroll tidak pernah di-reprice.

## A2 - Search di seluruh tabel semua modul - **SEBAGIAN**

**Terukur:** 81 elemen `<table>` di 22 file UI. Hitungan mentah 88, tapi 7 sisanya
adalah komentar `<table>` di `services/http.ts` dan `services/repositories.ts`,
bukan tabel.

**Tujuh file yang nol `SearchBox` sudah handled** (audit awal mencatat 19 tabel
tanpa search di file-file ini):

| File | Tabel tanpa search (audit awal) | Status |
|---|---|---|
| `proyek/ProjectDetail.tsx` | 7 | 6 dari 7 sudah ada search |
| `payroll/Payroll.tsx` | 3 | 3 dari 3 |
| `absensi/Absensi.tsx` | 3 | 3 dari 3 |
| `drydock/Drydock.tsx` | 2 | 2 dari 2 |
| `Analytics.tsx` | 2 | 1 dari 2 |
| `kapal/VesselDetail.tsx` | 1 | **sengaja tidak** - lihat bawah |
| `inventori/BomDetail.tsx` | 1 | 1 dari 1 |

**Gap Equipment sudah tertutup.** Audit awal mencatat hanya 2 dari 9 tabel yang
tercakup; sekarang 8 dari 9. Yang ditambah: Maintenance, Kalibrasi, Sedang
Dipakai, Biaya per proyek, HPP per proyek, dan dua sub-tabel di modal rincian
biaya. Tabel Maintenance persis yang dikeluhkan client.

**Tiga tabel yang sengaja dibiarkan tanpa search:**

| Tabel | Alasan |
|---|---|
| `ProjectDetail` matriks risiko | Barisnya adalah lima level kemungkinan tetap, kolomnya lima level dampak. Sumbu kisi, bukan daftar - tidak ada "satu baris panjang" yang perlu dicari. Yang bisa dicari (judul, mitigasi) ada di daftar kartu tepat di bawahnya. |
| `Equipment` heatmap booking | Kisi hari x jam dengan baris tetap. Sama: bukan daftar. |
| `VesselDetail` rencana 5 tahun | `planYears` dihitung sebagai `[baseYear+1 .. baseYear+5]`, jadi **selalu tepat lima baris**. Menambah search di sini akan menambah kontrol untuk sesuatu yang tidak mungkin panjang. |

Ketiganya akan jadi tidak benar kalau nanti berubah jadi daftar dinamis.

**Finance dan Procurement belum tuntas.** Finance punya 28 tabel di 13 tab;
16 sudah diberi search (AR, AP, Kas & Bank utama + mutasi, Jadwal Bayar,
Buku Besar snapshot + voucher, Laba Rugi, Neraca AP/AR live + audit, Aset,
Jurnal). Sisa tanpa search: aging AR, kas recap, adjustments, LR histori,
overhead, P&L bulanan, Neraca ringkasan, P&L jurnal - semuanya ringkasan
pendek yang tidak mungkin panjang. Procurement belum diaudit per-tab.
Klaim "semua tabel punya search" **tidak bisa dipertahankan** berdasarkan
bukti yang ada, tapi celah yang tersisa bukan lagi tabel panjang.

## B1 - Filter cabang di top bar dihapus - **BELUM**

`layouts/AppShell.tsx:547-564` masih ada `<select>` cabang di topbar, aktif
sebagai filter global (`store.tsx:937-941`) dan persisten di localStorage.

## B2 - Format titik pada semua input angka harga - **SELESAI**

`MoneyInput` (`components/ui.tsx:1875`) memakai `type="text"` + masking
tampilan `1.000.000`, parser `parseRupiah` di `utils/format.ts` dipakai
saat commit. Field money di 6 file utama (UI, Equipment, BoQSection,
Subcontractor, Procurement, Payroll, Finance) sudah dialihkan - commit
`6813df9`..`223e8e5`. Sisa `NumInput` non-uang (qty, persen, jam) sengaja
tidak diubah.

## C1 - Delay sinkronisasi data antar device - **SEBAGIAN** (penting)

**Yang benar-benar sudah diperbaiki (termasuk Gelombang 1-2):**
- `store.tsx` `applyPulled()`. Aturan "server menang untuk id yang
  dikenal, id lokal saja dipertahankan" menutup akar "baris hilang setelah
  POST sukses".
- `bumpEpoch()` di setiap mutasi sukses. `pullNeedsMerge` membuat tarikan
  yang mulai sebelum POST ber-merge, bukan replace.
- `update()` tidak lagi `return` diam-diam di 409 STALE.
- Early-return `dirty.size === 0` yang membuat listener tidak terdaftar -
  sudah ditutup.
- Rate limit per-user, bukan per-IP.
- **`backendMode` tidak lagi beku** (`store.tsx:870-889`): nilai turunan
  `isBackendConfigured() && getJwt()`, re-eval saat `focus` /
  `visibilitychange` / storage. Badge topbar ikut benar saat JWT hilang.
- Loop push 401 dihentikan + minta login ulang (`953a6d9`).
- Pagination keyset `after=updated_at|id` menggantikan OFFSET yang bisa
  kehilangan baris (`0fceaa1` + `8ec5042`, `crudCursor.ts`).
- Token konkurensi WBS/team via compare-and-swap `baseData` 409 STALE
  (`821e017` + `921fcac`), tanpa migrasi kolom.

**Yang masih bisa menghasilkan gejala yang sama:**
1. **`PATCH` koleksi biasa masih shallow merge** - `crud.ts` menimpa
   seluruh `data` baris. Dua perangkat mengedit baris sama →
   last-writer-wins. Klien replay patch di atas versi server (tahu lewat
   toast), tapi field yang tidak disentuh perangkat lain bisa tertimpa
   kalau patch-nya tidak lengkap.
2. **`acceptPull` hanya menjaga `settings`** - respons `rows: []` sesaat
   untuk koleksi lain masih bisa mengganti daftar lokal dengan kosong.
3. **`degrade()` network/401/429** tetap resolve false + tulis lokal
   (offline-first, disengaja). Gejala "toast sukses tapi tidak sync" kini
   harusnya tertutup oleh backendMode re-eval + sinyal auth di push loop -
   tapi belum diverifikasi di browser 2 device.

## C2 - Sinkronisasi offline/online, gap tak terlalu jauh, tanpa overrun - **SEBAGIAN**

**Yang sudah (Gelombang 1-2):** antrean offline dirty+tombstone tanpa TTL,
retry 429 hormati `Retry-After`, konkurensi `updated_at`, cursor maju
meski ada baris gagal (livelock ditutup `fede89b`), budget push GLOBAL
per run + rotasi koleksi, trigger ditahan lewat `pushAgainRef` lalu
dijadwalkan di `finally`.

**Yang hilang:**
1. **Tidak ada delta sync.** Nol `etag`/`version`/`cursor`/`since` di
   luar `/api/version`. Setiap tarikan baca penuh tabel (limit 5000).
2. **Tidak ada tarikan periodik.** Interval 45 detik hanya push. Data
   device lain masuk saat pindah route / remount modul. `document.hidden`
   skip push tanpa catch-up queue.
3. **Koleksi dirty dikecualikan dari tarikan** sampai antrean habis -
   koleksi besar (mis. movements ~19rb) bisa lama tidak menerima update
   server selama masih ada baris lokal yang belum ter-push.
4. **Tombstone dibuang** saat lewat `TOMBSTONE_CAP_PER_COL = 500`.

## C3 - Export PDF: langsung download, generate dari data bukan tampilan - **SEBAGIAN**

**Sudah:** generate server-side total. `routes/pdf.ts` jalankan
`prepare` → `buildFromModel` → `render`. Filter allowlist. 19 pemanggilan
PDF, 18 `open = false`. Tidak ada html2canvas.

**Kurang:** `pages/sdm/HR.tsx:282` masih `open = true` + modal `<iframe>`
untuk surat HR - melanggar "jangan menampilkan preview". Semua export
lain download.

---

# 2. MODUL MANAJEMEN PROYEK - bagian 1 (card, filter, form)

| # | Permintaan | Status | Bukti dan Kekurangan |
|---|---|---|---|
| P1 | Notifikasi warning maksimal 3, "perkecil" jadi "tampilkan semua" | **SELESAI** | `AlertBanner.tsx`: label memakai `t.notif.showAll` "Tampilkan semua" saat banner ditutup; `PREVIEW_N` sudah tidak ada (render cap `RENDER_CAP = 200` untuk anti-lag, bukan preview 5). Kunci `showAll` di `i18n/id.ts:125` dipakai banner modul + AppShell. |
| P2 | Kasih nomor pada kolom | **SELESAI** | `Projects.tsx:345` header `colNo`; index baris dirender di `:378-380` `(pager.page-1)*pager.size + rowIndex + 1`. |
| P3 | Card total: label selesai dan sedang berjalan; card sedang berjalan: label tertunda | **BELUM** | `Projects.tsx:201` `inProgress` masih `status !== "Selesai"` sehingga ikut menghitung Batal/Terlambat. Card "Sedang Berjalan" hanya delta "{n} terlambat", tanpa breakdown label Selesai/Tertunda. |
| P4 | Card status diberi gradient, grafik di card dihapus | **BELUM** | Empat `KpiCard` Projects (`:251-254`) masih mengirim `spark`. Gradient tile ikon ada di `ui.tsx`, `.card` putih. |
| P5 | Filter popup jadi tampil deret dengan animasi slide | **BELUM** | `FilterPopover.tsx:46-49` masih `fixed inset-0` + `absolute left-full`, tanpa `framer-motion`. Dipakai lintas modul. |
| P6 | Kelola detail dipindahkan ke aksi jadi button "detail" | **SELESAI** | `Projects.tsx:421-429` `RowAction` Eye "Detail" di kolom Aksi; komentar menyatakan pindah dari sel Tahap. |
| P7 | Default data menampilkan 25 | **SELESAI** | `Projects.tsx:221` `usePager(list.length, 25)`. |
| P8 | Progres proyek harus disesuaikan lagi | **SELESAI** (`32d10c6`) | Status "Terlambat" bisa di-override manual. `shouldAutoSetLate` + `shouldClearOverride` di `utils/projectDelay.ts`. Badge "Override" di ProjectDetail. 12 pemeriksaan di `scripts/p8-probe.ts`. |
| P9 | Proyek terbaru tampil paling atas | **SELESAI** | `Projects.tsx:105` default sort `{ key: "createdAt", dir: "desc" }`. |
| P10 | Form cabang diganti rencana lokasi docking | **BELUM** | `ProjectAddModal.tsx:213-216` masih `<select>` branch (`branchOptions` hardcode 3 kota). `branch` juga kunci scope RBAC (`inBranch`) - penghapusan = keputusan scoping baru. |
| P11 | Select untuk kapal, klien, dan PM | **BELUM** | `ProjectAddModal.tsx:180-224` klien/PM masih `<select>` biasa; kapal belum EntityPicker. `EntityPicker` ada di `ui.tsx` tapi belum dipasang di form ini. |
| P12 | Status dihapus dari form proyek baru | **SELESAI** | `ProjectAddModal.tsx:202-208` komentar "Field status dihapus dari form proyek baru (P12)"; tidak ada select status di form. Default tetap "Dalam Proses"; ganti status di detail. |
| P13 | Hapus teks "(otomatisnya)" | **SELESAI** | Pencarian `"Terlambat (otomatis"` / `"(otomatis"` di `ProjectDetail.tsx` hasilkan nol. Sisa teks "Terlambat terisi otomatis dari jatuh tempo" adalah hint yang benar (bukan label status). |
| P14 | Card progres: tambah detail saat terlambat | **SELESAI** | `ProjectDetail.tsx:1055` komentar "Angka keterlambatan di card progres (P14)"; teks keterlambatan + badge override status ada di header/card progres. |

---

# 3. MODUL MANAJEMEN PROYEK - bagian 2 (tab detail)

| # | Permintaan | Status | Bukti dan Kekurangan |
|---|---|---|---|
| D1 | Ganti "Desain & Class Approval" dengan "Log Penawaran dan Tagihan" | **SELESAI** (`172146e`) | Blok edit 4-stage dihapus. Tabel Log Penawaran & Tagihan menampilkan quotation, contract, dan invoices. Gate Desain→Produksi cek dokumen Sertifikat Kelas yang Disetujui, fallback designStages. |
| D2 | Milestone menyeluruh, 7 hari jadi 1 bulan, list saja | **SEBAGIAN** | List saja terpenuhi. Masih default H-7 via `ALERT_MILESTONE_DAYS` (`ProjectDetail.tsx:483`), terikat setting alert global. |
| D3 | Update progress WBS: material ikut inventori, histori, dan foto | **SELESAI** (`68ec10d` + `0a65a8f`) | `saveWbsTask` menulis `photos[]` (array, bukan photoUrl tunggal), `materialUsed`, dan `add("movements")` Pengeluaran. Tabel WBS merender 📷 jumlah foto (`:1214`). |
| D4 | Gantt mini: detail bulan di bawah indikator | **SEBAGIAN** | Gantt mini ada dengan bar + progress%. Label rentang bulan (`fmtBulan` min→max) ada di header, **tick bulan per kolom di bawah bar belum ada**. |
| D5 | **BoQ: satu nomor surat bisa beberapa pekerjaan, hanya total/status/dokumen/aksi, klik untuk detail** | **SELESAI** (`d3ba2c1`) | `BoQItem.suratNo`, seed per SPK. `BoQSection.tsx` tabel grouped + expand detail (ubah qty/harga, revisi, log, hapus Draft, tombol status). Excel blok per surat + subtotal. PDF `laporanProyek` per No Surat + subtotal. Grouping dihitung dari `suratNo` (bukan FK DB induk surat). |
| D6 | Dokumen BoQ masuk tab Dokumen dan Laporan | **SEBAGIAN** | Lampiran BoQ (`fileUrl`) masih dirender di tab BoQ saja, belum masuk `data.documents`. Duplikasi tampilan di ReportSection vs daftar kartu belum dirapikan. |
| D7 | Change Order harus lewat approval dulu dan terkoneksi BoQ | **SEBAGIAN** | Rantai approval ada (Diajukan→Disetujui→apply). **Koneksi BoQ nol** - `setCoStatus` tidak membuat/merevisi baris BoQ, "Diterapkan" tidak menyentuh budget/kontrak. |
| D8 | Hapus table risiko (input manual → auto dari WBS/SOW) | **SELESAI** (`9fa8e55`) | `utils/riskAuto.ts`, dedup `source`+`wbsTask`, trigger di ProjectDetail + Projects. Form manual dihapus; kartu risiko tetap. |
| D9 | "Commissioning & Sea Trial" jadi "Commisioning & Trial" | **SELESAI** | `n_prj.ts:256` (ID) dan `:863` (EN) sudah "Commisioning & Trial". |
| D10 | Form Trial: checklist dari WBS, catatan, dan kondisi | **SELESAI** (`b03cc41`) | `trialForm.checklist` diisi dari WBS task selesai; UI checklist + kondisi (`Baik`/`Perlu Perbaiki`/`Rusak`); `saveTrial` menyimpan checklist. |
| D11 | Garansi dari WBS, kartu garansi per pekerjaan | **SELESAI** (`2432cab`) | `createWarranty(wbsTask?)`; kartu garansi muncul untuk WBS `progress >= 100` yang belum punya warranty (`:1957`). |
| D12 | Tab Service: list dari WBS, teknisi pilihan, biaya terkait BoQ | **SELESAI** (`a5c1eb4`) | Form service punya `boqRef` select dari `data.boq` proyek. List service terhubung pekerjaan/WBS di tab Terkait/Service. |
| D13 | Sparepart wajib via PO dan stok; Service wajib approval procurement | **SEBAGIAN** (`c6fc6ee`) | Form sparepart/service punya **referensi opsional** ke PO yang Disetujui. Client minta **wajib** (hard block) + approval procurement - belum dipaksa. |
| D14 | Tab Tim terkoneksi dengan SDM dan karyawan | **SEBAGIAN** | Satu arah: picker dari `data.employees`. HR/KaryawanDetail tidak baca `teamByProject`; `usages` tidak hitung keanggotaan tim. |
| D15 | Tambah section subkon | **SELESAI** (`12da962`) | Tab **Subkon** di `ProjectDetail.tsx:1079,1858`: ringkasan subkontraktor, WO, termin, nilai kontrak per proyek. |

---

# 4. MODUL EQUIPMENT, SUBKONTRAKTOR, QC AND SAFETY, DOKUMEN

| # | Permintaan | Status | Bukti dan Kekurangan |
|---|---|---|---|
| E1 | "Catat servis" membuka modal catatan dulu | **SEBAGIAN** | Modal catatan ada dan finish setelah simpan. Masih ada jalur bypass di tab Register yang bisa langsung `Selesai` tanpa modal - belum diverifikasi ulang setelah commit E1; body audit lama masih relevan sampai diperiksa di browser. |
| E2 | Input jam strict 24H di semua browser dan modul | **SELESAI** (`2ecb039`) | `TimeInput` di `components/ui.tsx:1671` (`type="text"` + masking, bukan `type="time"`). Dipakai Equipment booking (`:2840-2841`) + modul lain. `norm24` menolak nilai di luar 00:00-23:59. 49 probe di commit terkait. |
| E3 | Historis data booking selesai di tab Alokasi | **SELESAI** | Card riwayat booking selesai di tab Alokasi. Kekurangan kecil: timestamp selesai memakai tanggal booking, bukan waktu finish. |
| E4 | Riwayat booking selesai pindah dari Biaya ke Alokasi | **SELESAI** | Render di tab Alokasi. Tab Biaya hanya agregat. |
| E5 | Card biaya per proyek dengan tombol detail | **SELESAI** (`7006a0a`) | Modal `costDetailFor` "Rincian biaya equipment per proyek" (`Equipment.tsx:2964+`) - equipment dipakai, biaya, jam pakai, downtime dari `utils/projectCost.ts`. |
| S1 | Kwitansi PDF konten terpotong | **SELESAI** | Kolom tabel + paginasi two-pass. Gate `pdf-probe.ts`. |
| S2 | Requirement BAST, invoice, dan bukti bayar | **SELESAI** | `invoiceNo`, `bastNo`, `proof.ref` wajib. Catatan: berupa nomor teks, bukan unggah file - kalau client maksud lampiran, itu terpisah. |
| S3 | Milestone per WO dengan popup modal | **SEBAGIAN** | Milestone **SOW subkontraktor** punya modal kelola (`msSub`, `:1499-1522`). Progres WO memakai checklist milestone WO. **Modal tambah/hapus milestone per WO** (client: "bikin popup modal baru untuk milestone per WO") belum ada - `saveMilestone` masih tulis ke `subcontractors` (SOW), bukan ke baris WO. |
| S3b | Bug yang ditemukan audit | **SELESAI** (`37321db`) | Modal progres WO kini render `woMilestonesOf(woProg)`, sama dengan sumber validasi. |
| Q1 | Drawing view pakai modal popup | **SELESAI** | Modal preview, bukan expand inline. |
| Q2 | Sub-tipe dokumen terhubung tab Sertifikat QC | **SEBAGIAN** | `utils/docTypes.ts` jadi sumber untuk form Dokumen/Proyek. Tab Sertifikat QC masih filter `/sertifikat/i` pada `d.type` saja - koneksi satu arah. |
| DOC1 | Kolom pratinjau dihapus, pratinjau hanya di Aksi | **SELESAI** | Header tanpa kolom pratinjau; aksi Detail + `preview={false}`. |

---

# 5. MODUL SDM, CRM, DASHBOARD, MONITORING, ANALYTICS, LAPORAN

| # | Permintaan | Status | Bukti dan Kekurangan |
|---|---|---|---|
| H1a | Preview lampiran tidak dikunci saat diajukan | **SEBAGIAN** | Gate lama dihapus di HR (`HR.tsx:1543-1572`), preview terbuka untuk semua status kecuali `Ditolak`. Tapi `KaryawanDetail.tsx:737-746` masih mengunci saat `status === "Disetujui"`; saat `Diajukan` sel menampilkan `-`. |
| H1b | Auto-preview setelah upload | **SELESAI** (`b4f15d4`) | `HR.tsx` mount panel otomatis saat `fileUrl` terisi. `KaryawanDetail.tsx` form ubah cuti sebelumnya tidak punya preview sama sekali - sekarang memakai `DocumentPreviewPanel` dengan `autoLoad`. Hint di `HR.tsx` yang masih "Pratinjau baru tampil di tabel setelah pengajuan disetujui final" ikut diselaraskan: pratinjau terbuka begitu ada lampiran, hanya status Ditolak yang mengunci. |
| H1c | Surat persetujuan cuti saat disetujui | **SEBAGIAN** | Recipe server lengkap (`pdf/registry.ts:275-311`, `pdf/documents/hr.ts:85-152`): nama, NIK, jabatan, unit, tipe, periode, durasi, alasan, tanda tangan. Tapi on-demand, bukan otomatis saat approval. `approveHrd` (`:783-831`) tidak membuat baris `letters`, tidak ada arsip atau thumbnail. PDF baru terbit saat tombol ditekan. |
| H2 | Surat: preview PDF bukan teks | **SELESAI** | `HR.tsx:1786` memanggil `pdfDoc.request` dengan `kind:"suratHr"`, modal `<iframe>` di `:2269-2299` plus Unduh dan Buka di tab baru. Preview form yang belum disimpan masih `<pre>` (`:2217-2222`), bisa dipertanggungjawabkan karena baris belum ada. |
| H3 | Penanggung jawab searchable dari data pegawai | **SELESAI** (`016abab`) | Dua field yang sudah ada sebelumnya (`Documents`, `ProjectDetail`) kini memakai `utils/employeeOptions.ts` yang sama - sebelumnya masing-masing membangun daftarnya sendiri dengan format hint berbeda. Sepuluh field teks bebas lain diubah ke `EntityPicker`: PIC Equipment, tiga PIC Inventory (mutasi, gudang, edit mutasi), PIC BOM, tiga PIC QC (JSA, TBM, Patrol), PIC Dock. 24 pemeriksaan di `scripts/employee-probe.ts`. Sisa `<select>` (manager proyek, PIC negosiasi, teknisi, inspector) **di purposely tidak diubah: sudah terbatas ke daftar karyawan/PM, jadi tidak bisa salah ketik. Catatan desain: `isKnownEmployee` dipakai sebagai peringatan visual (border + `aria-invalid`), bukan pemblokir simpan - berbeda dari `Documents` yang memang menolak nama di luar master karena kolom "oleh" di revisi dokumen adalah jawaban hukum. PIC bisa awak kapal atau subkontraktor yang tidak ada di master. |
| C1 | Deskripsi survei expand dan collapse | **SELESAI** | `CRM.tsx:124-127,1231,1253-1261` dengan `aria-expanded`. Catatan: saat tertutup masih tampil dipangkas 90 karakter (`:1239`), bukan disembunyikan penuh. |
| D1 | Dashboard PDF dari data, bukan tampilan | **SELESAI** | `Dashboard.tsx:406-417` memakai `kind:"analitik"`; server hitung ulang KPI dari baris DB (`pdf/registry.ts:1061-1103`). Kekurangan: saat backend tidak aktif tetap toast "PDF berhasil diekspor" tanpa mengunduh apa pun (`:407-410`). |
| M1 | Filter "hanya perhatian" jadi "proyek butuh perhatian" | **SELESAI** | `Monitoring.tsx:211` plus `n_prj.ts:573` yang berisi "Proyek Butuh Perhatian". |
| AN1 | Export Excel Analytics lengkap | **SEBAGIAN** | 17 sheet sudah ada (`Analytics.tsx:808-826`). Yang tampil tapi tidak diekspor: distribusi tipe proyek dari donut tiga bucket (`:939-955`, sheet memakai sumber berbeda `:780-785`), pendapatan per cabang (`:1031-1050`), kolom NCR Terbuka (`:1203-1217`), jumlah proyek per cabang di Diagnostik (`:1240`), delta KPI (`:913-916`), annotations per tab (`:1487-1502`). |
| AN2 | PDF tidak terpotong dan garis opacity dibold | **SEBAGIAN** | Paginasi tabel sudah benar (`pdf/blocks.ts:492`). Masih terpotong: `pdf/chart.ts:506` memakai `slice(0,12)` membuang sisanya tanpa catatan; `chart.ts:484` daftar nilai donut berhenti di `ctx.bottom`; `registry.ts:932` `slice(0,25)`, `:1050` `slice(0,8)`, `reports.ts:645-648` `limit=5`. Garis bold belum ada sama sekali: tidak ada logika opacity ke lineWidth. Gridline masih `STROKE.hair` 0,15mm (`chart.ts:334,545`); visibilitas dibenahi lewat warna, bukan tebal. `chart.ts` belum disentuh sejak commit mesin PDF (`055d560`). |
| L1 | Laporan PDF baru, bukan capture tampilan | **SELESAI** | `Laporan.tsx:383-414` memakai `kind:"laporanProyek"` atau `"laporan"`; dokumen dirakit di `pdf/documents/laporan.ts:147,249`. |
| DOC2 | Tombol dan kolom pratinjau dihapus | **SELESAI** | Sama dengan DOC1. |
| PD1 | Proyek: jangan auto-preview setelah upload | **SELESAI** | `ProjectDetail.tsx:1426-1437`, `isOpen` hanya saat `openDocId` cocok. Preview hanya saat ikon mata diklik. |
| PD2 | Ikon view membuka modal popup dengan download di dalam | **BELUM** | `ProjectDetail.tsx:1468-1487` ikon mata masih expand inline (`:1480-1487`), bukan modal; tombol download justru berdiri di samping ikon (`:1478`). Komentar `:157-161` menyatakan ini sengaja membatalkan permintaan lama. Modal Detail (`:2006-2061`) sudah punya preview dan Unduh, tapi dipicu tombol Detail bukan ikon view. |
| PD3 | Ganti tombol Excel dengan tombol Detail dan modal | **SELESAI** | Tombol Excel per-dokumen hilang; diganti Detail (`:1455-1457`) yang membuka modal `:2006-2080` dengan preview, lampiran, dan riwayat revisi. Excel tetap sebagai aksi kedua di footer modal (`:2014-2022`). |

---

# 6. MODUL DRYDOCK, INVENTORY, KEUANGAN

| # | Permintaan | Status | Bukti dan Kekurangan |
|---|---|---|---|
| DK1 | Card mapping slot area dibuat grafikal | **SELESAI** | `Drydock.tsx:702-764`: tile per area, lebar diskalakan per jumlah slot (`:723,:737,:747`), badge jumlah slot (`:742`), terisi (`:751`), kapal berbeda (`:752`), konflik (`:753`). Area tanpa slot tetap digambar (`:718-721`). |
| DK2 | Peta fasilitas skala panjang (pekerjaan F2) | **SELESAI** (`48368f9`) | `components/FacilityMap.tsx` SVG skala tunggal, pita kapal, outline merah. Keterbatasan yang dulu tercatat - hanya kapal pertama per fasilitas yang digambar lewat `.find()` - sudah ditutup: semua kapal kini digambar satu jalur masing-masing, dan `problems` digabung dari seluruh kapal. Intinya dipindah ke `vesselsForFacility` di `utils/facilityMap.ts` supaya bisa diuji, dengan 8 assertion baru di `scripts/facility-probe.ts`. |
| I1 | Filter "perlu perhatian" per status, bukan kategori | **SELESAI** | `Inventory.tsx` `list` memakai `warnLevelOf(...).level === warnF`; strip Katalog punya kontrol status (kini berbentuk tombol I2); sort status pakai `warnRankOf`. Bukti baris basi setelah rewrite I2 - status tetap benar. |
| I2 | Tombol [jumlah][status] membuka dropdown [jumlah][kategori] | **SELESAI** (`37e3b59`) | Klarifikasi di `notes.txt` (revisi 2 & 5 Okt). Strip "Perlu perhatian": tombol `[badge][Kritis/Menipis/Berlebih/...]` → flyout kategori di dalam status itu (`warnByLevelCat`). Pilih kategori → `warnF`+`cat` sekaligus. Daftar kategori datar campuran badge dihapus. I1 = filter status; I2 = drill-down-nya. |
| F1 | Semua tabel Finance dapat tanggal plus sort, dan tanggal hapus | **SELESAI** (`27a6d40`) | Kolom Dibuat/Diubah + sort di tabel record: Invoice, AR, AP, Jurnal, Aset, Alokasi payroll, Jadwal bayar (dari source), Mutasi Kas. Tab agregat: catatan `latestSrcTs` (sumber terakhir berubah). Tab **Riwayat Hapus**: audit log server `action=delete` + jejak lokal activities modul Keuangan. |
| F2 | Kas Bank, Buku Besar, Neraca, dan Laba Rugi tambah tanggal | **SEBAGIAN** | Keempat punya `HistFilterBar` + badge as-of + catatan `latestSrcTs`. **Kolom tanggal per baris** di tabel agregat (saldo, trial balance, AP/AR live, LR trial) belum ada - angkanya dihitung dari transaksi, bukan record. Kalau client tetap mau jejak per baris, perlu join ke sumber (jurnal/invoice/payable) di UI agregat. |

---

# 7. HAL YANG PERLU DITANYAKAN KE CLIENT

| # | Item | Kenapa tidak bisa diputuskan sendiri |
|---|---|---|
| 1 | ~~**I2** filter Inventory dua tingkat~~ | ~~Perlu tahu alasan balikannya~~ Klarifikasi ADA di `notes.txt` revisi 2 & 5 Okt. Sudah diimplementasi (`37e3b59`). |
| 2 | ~~**D1** hapus "Desain & Class Approval"~~ | Sudah dijawab + diimplementasi (`172146e`): pindah ke Documents, Class Approval satu dari banyak dokumen. |
| 3 | ~~**D8** hapus table risiko~~ | Sudah dijawab + diimplementasi (`9fa8e55`): risiko auto dari WBS/SOW, bukan dihapus. |
| 4 | ~~**P8** progres proyek disesuaikan lagi~~ | Sudah dijawab + diimplementasi (`32d10c6`): override status Terlambat manual. |
| 5 | ~~**S2** requirement BAST dan invoice~~ | Nomor teks wajib sudah ada. Kalau client maksud **unggah dokumen** (bukan ketik nomor), itu belum - perlu konfirmasi. |
| 6 | ~~**I1 versus I2**~~ | Tidak bertentangan: I1 filter status; I2 drill-down status→kategori. |
| 7 | **D13** PO sparepart/service: referensi vs wajib? | Sudah ada PO reference opsional. Client bilang "wajib via PO" + approval procurement - perlu putuskan hard-block atau tetap fleksibel + approval. |
| 8 | **S3** milestone WO: modal terpisah per WO? | Modal kelola ada untuk milestone SOW. Client minta "popup modal untuk milestone per WO" - di form WO, di tab subkon, atau otomatis dari SOW? |
| 9 | **B1/P10** hapus cabang: skoping RBAC bagaimana? | `branch` dipakai `inBranch` untuk filter data per cabang. Kalau topbar + form cabang dihapus, scoping pindah ke mana (user.branch tetap, atau rencana lokasi docking jadi metadata saja)? |
| 10 | **PD2** ikon view dokumen: modal atau expand? | Revisi minta modal + download; komentar lama di kode sengaja membatalkan. Perlu konfirmasi ulang mana yang berlaku. |

---

# 8. URUTAN KERJA YANG DISARANKAN

**Gelombang 1 - perbaikan bug (data salah, kecil) - SELESAI di `b4f15d4`:**
1. [x] S3b: modal progres WO menampilkan SOW tapi memvalidasi WO - DIPERBAIKI
   (`37321db`, render kini `woMilestonesOf(woProg)`, sama dengan validasi)
2. [x] C1-3: "toast sukses palsu saat network/401/429" - **DIREVISI, bukan
   diperbaiki apa adanya.** `degrade()` ternyata benar: menulis lokal + antre
   saat offline-first memang disengaja, dan melempar error akan MENGHAPUS
   pekerjaan offline pengguna. Akar masalahnya ada di C1-2 dan di loop push.
3. [x] C1-2: `backendMode` beku saat sessionStorage hilang - DIPERBAIKI
   (`ff28249`, nilai turunan + re-eval saat focus/storage/visibility)
4. [x] Loop push mengulang 401 selamanya tanpa berhenti - DIPERBAIKI
   (`953a6d9`, sinyal `"auth"` menghentikan seluruh loop + minta login ulang)
5. [x] `FacilityMap` hanya menggambar kapal pertama per fasilitas - DIPERBAIKI
   (`48368f9`, semua kapal digambar satu jalur masing-masing + 8 probe baru)
6. [x] H1: hint form cuti bertentangan dengan perilaku - DIPERBAIKI
   (`b4f15d4`, hint diselaraskan + form ubah cuti dapat auto-preview)

**Gelombang 2 - integritas data sinkronisasi - SELESAI di `921fcac`:**
7. [x] C1-1: pagination OFFSET di atas `updated_at` - DIPERBAIKI
   (`0fceaa1` + `8ec5042`). Server menambah mode keyset lewat parameter
   `after=updated_at|id`; klien menarik halaman demi halaman memakai cursor,
   bukan `OFFSET`. `services/api/src/routes/crudCursor.ts` +
   `scripts/page-probe.ts` (18 pemeriksaan, termasuk bukti bahwa OFFSET lama
   memang kehilangan baris dan keyset tidak).
8. [x] C2-4: livelock baris racun - DIPERBAIKI (`fede89b`). Cursor selalu
   maju melewati jendela meski ada baris gagal. Baris racun punya jatah 5
   percobaan lalu menyerah dan diberi tahu sekali per baris, bukan diulang
   tiap 45 detik selamanya. Jalur tombstone yang sebelumnya `break` +
   `continue` ikut dibuka. `apps/web/scripts/push-probe.ts` (15 pemeriksaan).
9. [x] C2-5: overrun 10.800 request per run - DIPERBAIKI (`fede89b`). Budget
   jadi GLOBAL per run (`PUSH_BUDGET_PER_RUN = 250`, di bawah
   `WRITE_LIMIT = 300`) bukan 200 per koleksi, dengan rotasi koleksi
   (`pushColCursorRef`) supaya tidak ada yang kelaparan.
10. [x] C2-5b: trigger yang dibuang saat push berjalan - DIPERBAIKI
   (`fede89b`). `pushAgainRef` menahan trigger, lalu menjadwalkan run lanjutan
   dari blok `finally` lewat `pushPendingRef`.
11. [x] C1-5: token konkurensi WBS/team - DIPERBAIKI (`821e017` +
   `921fcac`). Dipakai compare-and-swap lewat `baseData`, BUKAN menambah
   kolom `updated_at` - tabel `wbs_by_project`/`team_by_project` hanya punya
   `project_id` + `data`, dan menambah kolom berarti migrasi produksi saat
   `005_sessions.sql` sudah punya selisih checksum. Klien menyimpan isi
   terakhir yang dibaca dari server (`wbsBaseRef`/`teamBaseRef`) dan
   mengirimkannya; server membalas 409 STALE bila isinya sudah berbeda.
   `baseData` yang tidak dikirim tetap diterima agar klien lama tidak macet.

**Gelombang 3 - permintaan yang sudah jelas - SELESAI di `89c981f`:**
10. [x] D9 (ganti string label), P1 (PREVIEW_N 3 plus label), P2 (nomor kolom),
    P6, P7, P9, P12, P13, P14 - `e0c4f2a`
11. [x] E2 (komponen input jam bersama, 49 probe) - `2ecb039`;
    E5 (tombol detail biaya) - `7006a0a`
12. [x] H3 (EntityPicker ke 10 field PIC tersisa, 24 probe) - `016abab`
13. [x] A2 parsial - `6b3786e` (WBS), `2eb1fdb` (Payroll 3), `fc56ad7`
    (Absensi 3), `1c66274` (Drydock 2), `8bd08af` (Analytics, BomDetail),
    `f7fc243` (Finance AR + AP), `89c981f` (Equipment 6, ProjectDetail 5),
    `44c42d8` + `cb2957b` (Finance 6 tab lagi: Kas & Bank, Jadwal Bayar,
    Buku Besar, Laba Rugi, Neraca, Aset, Jurnal, mutasi kas, BB voucher).
    **Belum tuntas:** Procurement per-tab; ringkasan pendek Finance.

**Gelombang 4 - SELESAI di `172146e`:**
14. [x] D1 (Log Penawaran & Tagihan, Class Approval pindah ke Dokumen) - `172146e`
    [x] D8 (risiko auto dari WBS/SOW, form manual dihapus) - `9fa8e55`
    [x] P8 (override status Terlambat) - `32d10c6`
    [x] S2 (BAST/invoice nomor teks) - sudah selesai sebelumnya
    [x] D9 (ganti string) - sudah selesai sebelumnya

**Gelombang 5 + sesi lanjutan - kerja skema besar - SELESAI (kode), doc diselaraskan:**
15. [x] D3 (material WBS + movements + foto array) - `68ec10d` + `0a65a8f`
    [x] D10 (trial checklist dari WBS + kondisi) - `b03cc41`
    [x] D11 (garansi per WBS task) - `2432cab`
    [x] D12 (service referensi BoQ) - `a5c1eb4`
    [x] D13 (sparepart referensi PO) - `c6fc6ee` — **status final SEBAGIAN** (opsional, bukan wajib)
    [x] D15 (tab Subkon di ProjectDetail) - `12da962`
    [x] D5 (BoQ per nomor surat) - `d3ba2c1` skema suratNo + UI grouped + Excel + PDF
    [x] B2 (MoneyInput + parseRupiah, field money di 6 file) - `6813df9`..`223e8e5`
    [x] F1 (kolom tanggal Finance + Riwayat Hapus) - `27a6d40`
    [x] I2 (tombol [jumlah][status] → dropdown kategori) - `19b5e9b` + `37e3b59` (klarifikasi di notes.txt)
    [x] Tabel proyek P1/P2/P6/P7/P9/P12/P13/P14 + E2/E5 - sudah ada di kode sejak Gelombang 3, status tabel baru disinkronkan di real check

**Belum dikerjakan (urutan saran):**
- B1 hapus filter cabang topbar
- P3/P4/P5 card status + grafik + FilterPopover slide
- P10/P11 form proyek (rencana lokasi docking + EntityPicker)
- D4 tick bulan Gantt; D6 dokumen BoQ; D7 CO↔BoQ; D13 hard PO; D14 tim↔SDM
- S3 modal milestone per WO; PD2 ikon view modal; C3 HR `open=false`
- C1 sisa PATCH shallow-merge; C2 delta sync / tarikan periodik
- Deploy VPS + QA browser 2 device

---

# CATATAN REVISI

## Gelombang 1 dikerjakan di `b4f15d4`

Lima item selesai. Dua di antaranya mengubahunderstanding awal:

**1. "C1-3 toast sukses palsu" adalah salah diagnosis.** `degrade()`
mengembalikan `false` untuk network/401/429 secara sengaja: data ditulis
lokal, ditandai dirty, lalu didorong ulang nanti. Itu offline-first yang
benar. Kalau `degrade` ikut melempar error, pekerjaan offline pengguna hilang
saat jaringan mati - persis kebalikan dari yang dibutuhkan. Gejala "tulisan
berhasil tapi tidak muncul di perangkat lain" punya akar di tempat lain:

- `backendMode` beku: badge hijau padahal `remoteActive()` sudah false
- loop push tidak membedakan 401 dari "baris ini gagal", jadi satu token
  kedaluwarsa membuat antrean diulang tiap 45 detik selamanya tanpa pernah
  memberi tahu pengguna harus login ulang

**2. H1 ternyata punya dua bagian.** Selain hint yang salah, form ubah cuti
di `KaryawanDetail` memang tidak punya pratinjau sama sekali - jadi H1b naik
dari SEBAGIAN ke SELESAI.

## Gelombang 2 dikerjakan di `921fcac`

Empat item integritas data sinkronisasi selesai. Dua keputusan yang perlu
dicatat karena mengubah cara berpikir soal "hemat perubahan":

**1. Pagination OFFSET diganti keyset, bukan diperbaiki.** Menambah kolom
`sort key` yang stabil tidak menyelesaikan masalah - selama sort key bisa
berubah (dan `updated_at` memang berubah setiap penulisan), baris bisa
melompati jendela. Satu-satunya pagination yang tidak bisa kehilangan baris adalah yang
menandai posisi, bukan menghitung offset. `OFFSET` tetap dipertahankan untuk
pager UI karena di sana nomor halaman memang dibutuhkan.

**2. Token konkurensi WBS/team dibuat tanpa migrasi.** Tabel
`wbs_by_project`/`team_by_project` hanya punya `project_id` + `data`. Menambah
`updated_at` berarti migrasi produksi, dan `005_sessions.sql` sudah punya
selisih checksum sehingga jalur migrasi tidak bisa dipercaya tanpa diperiksa
dulu. Solusinya compare-and-swap: klien mengirim isi yang ia yakini masih ada
di server, server menolak dengan 409 STALE kalau sudah berbeda. Butuh kolom
nol dan tidak mengubah skema.

**Risiko tersisa yang disengaja:** `PATCH` untuk koleksi biasa masih shallow
merge tanpa merge per-field. Dua perangkat yang mengedit baris yang sama
masih last-writer-wins - hanya saja sekarang keduanya tahu lewat toast, dan
klien mereplay patch-nya di atas versi server (`store.tsx` sekitar `update()`),
bukan menimpa lokal secara diam-diam. Menyelesaikan ini berarti merge
per-field di server, dan itu pekerjaan tersendiri.

## Gelombang 3 dikerjakan di `89c981f`

Tujuh belas item selesai. Dua hal yang perlu dicatat karena keduanya menyangkut
pertimbangan soal apa yang sebenarnya bermasalah:

**1. H3 hanya field yang jelas-jelas salah yang ditutup.** Sepuluh field PIC
diubah ke `EntityPicker`, tapi empat `<select>` lain dibiarkan: manager proyek,
PIC negosiasi, teknisi, dan inspektur. Alasannya selektif, bukan lupa -
semuanya sudah terbatas ke daftar karyawan atau PM, jadi tidak bisa salah ketik.
Empat `select` yang tersisa bukan free-text; menjadikannya searchable hanya
menambah kontrol tanpa menutup celah apa pun.

Yang perlu dicatat: `isKnownEmployee` dipakai sebagai **peringatan**, bukan
pemblokir simpan. `Documents` menolak nama di luar master karena kolom "oleh"
di revisi dokumen adalah jawaban hukum; PIC maintenance dan PIC dock tidak
seperti itu, orangnya bisa awak kapal atau subkontraktor yang tidak ada di
master. Menghapus `allowCustom` akan membuat form tidak bisa dipakai di lapangan,
dan itu kegagalan yang lebih buruk daripada nama yang salah eja.

**2. Tiga tabel Equipment dan satu ProjectDetail sengaja dibiarkan tanpa
search.** Untuk terlihat jelas, "19 tabel" di audit awal ternyata bukan 19
tabel yang sama sifatnya. Heatmap booking adalah kisi hari x jam, matriks
risiko adalah kisi 5 x 5, dan tabel rencana kapal adalah
`[baseYear+1 .. baseYear+5]` - selalu lima baris, tidak mungkin jadi panjang.
Menambah search di sana tidak memperbaiki apa pun; ia hanya menambah kontrol
yang tidak punya yang mencari. Kalau salah satu berubah jadi daftar dinamis nanti,
maka tiga tabel ini ikut salah dan perlu dikembalikan.

Untuk Equipment dan ProjectDetail, ukuran yang sama berlaku pada tabel yang
memang dinamis: semuanya diberi search, karena isinya bisa melebihi layar.
Catatan teknis yang perlu diingat kalau tabel ini diubah lagi: pencarian HPP
harus jalan di atas nama proyek, bukan `projectId` - kuncinya id sementara
yang diketik orang namanya; tabel maintenance juga ikut mencocokkan catatan
free-text; dan pager maintenance ikut mereset saat filter berubah, tanpa itu
orang yang sedang di halaman 5 akan melihat halaman kosong begitu saja.

**Finance masih setengah.** Piutang dan Hutang baru diberi search; delapan tab
Finance lain belum. Klaim "semua tabel punya search" tetap tidak bisa dipertahankan,
dan dokumen ini sengaja tidak mengklaim sebaliknya.

---

## Gelombang 4 dikerjakan di `172146e`

Tiga item selesai setelah client memberikan klarifikasi. Keputusan yang perlu dicatat:

**1. D1: Class Approval pindah ke Documents, bukan dihapus.** Client
menjelaskan: "harusnya gk cuma class approval aja, tp lebih banyak dokumen
yang dibutuhkan untuk diapproval". Artinya class approval adalah satu dari
banyak dokumen yang perlu disetujui, dan alur approval Documents
(Draft→Diajukan→Disetujui→Berlaku) lebih tepat daripada enum sendiri di
designStages. Gate Desain→Produksi kini membaca dokumen Sertifikat Kelas
yang Disetujui, dengan fallback ke designStages lama supaya proyek yang
belum punya dokumen tidak terkunci.

**2. D8: Risiko di-automate, bukan dihapus.** Client mengonfirmasi:
"Resiko ini harusnya saat menambahkan wbs/sow sudah ada gk sih?" Artinya
risiko memang harus ada, tapi dihasilkan otomatis dari data yang sudah ada
(WBS task dan milestone WO), bukan diinput manual. Deduplikasi berbasis
`source` + `wbsTask` supaya tidak ada risiko ganda. Milestone yang sudah
selesai → risiko terkait otomatis ditutup.

**3. P8: Override status Terlambat.** Client menjelaskan: "maksudnya itu
override status progress projectnya, yang ada 'Terlambat (Otomatis)' itu
harus bisa dioverride, saat ini kalau dioverride otomatis terpindah ke
'Terlambat (otomatis)' lagi". Akar masalahnya ada dua useEffect yang
menulis status "Terlambat" tanpa menghormati pilihan user. Solusinya
field `statusOverride` + `shouldAutoSetLate`/`shouldClearOverride` yang
menjadi satu sumber untuk Detail dan List.

## Real check + sesi lanjutan (D5, F1, I2, sinkronisasi doc)

Checklist Gelombang 3/5 menandai banyak item selesai lewat commit
(`e0c4f2a`, `68ec10d`, …) tetapi **tabel status di bagian 2-6 tidak
pernah diperbarui**. Real check membaca ulang kode terhadap `todo5.md`:

- **16+ baris tabel dikoreksi** dari BELUM/SEBAGIAN ke SELESAI (P1, P2,
  P6, P7, P9, P12, P13, P14, B2, D3, D9-D12, D15, E2, E5) - buktinya ada
  di kode, bukan dari ingatan.
- **D13 dinaikkan dari BELUM ke SEBAGIAN** (bukan SELESAI): PO sudah ada
  sebagai referensi opsional; client minta wajib + approval.
- **Body C1/C2 ditulis ulang**: `backendMode` beku, livelock, overrun,
  badai 429, pagination OFFSET, token WBS/team sudah ditutup di
  Gelombang 1-2. Yang tersisa: PATCH shallow-merge, acceptPull
  settings-only, tanpa delta sync/tarikan periodik.
- **I2**: klarifikasi ternyata sudah ada di `notes.txt` (revisi 2 Okt
  baris 95, revisi 5 Okt baris 17) - tidak perlu ditanya ke client.
  Diimplementasi: strip status → dropdown kategori.
- **Hitungan ringkasan** diganti 43/19/7 dari 69 baris tabel aktual;
  angka audit lama 72/73 sudah tidak konsisten.
- **§7 dibersihkan**: D1/D8/P8/S2/I2 tidak perlu ditanya lagi; ditambah
  pertanyaan yang benar-benar masih terbuka (D13 hard-block?, S3 modal
  WO, B1/RBAC, PD2).

---

**Peringatan soal nomor baris:** dokumen ini awalnya diaudit terhadap
`bd975c3`. Banyak `file:line` di bagian 1-6 sudah bergeser karena commit
Gelombang 1-5 + sesi lanjutan. Rujukan tanpa nomor baris sengaja
dibiarkan; bukti status kini menunjuk pola kode + hash commit, bukan
baris basi.

---

# CATATAN METODE

- Audit awal read-only terhadap `bd975c3`. Gelombang 1-5 dikerjakan
  setelah itu (`37321db`..`37e3b59`).
- **Real check** terhadap working tree sesi lanjutan: setiap status
  tabel yang berubah diverifikasi dengan membaca kode (bukan menerima
  checkbox Gelombang apa adanya).
- Semua angka (jumlah tabel, jumlah call site) dihitung dengan
  enumerasi, bukan estimasi.
- Probe tidak dijalankan selama audit. Status "SELESAI" berarti kode
  memenuhi permintaan, bukan berarti terverifikasi di browser.
- Yang tetap belum bisa dibuktikan tanpa browser: jarak visual, animasi,
  perilaku sync nyata antar dua device, dan kebenaran angka PDF.
