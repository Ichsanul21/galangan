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
| Selesai | 69 |
| Sebagian | 0 |
| Belum | 0 |
| **Total baris tabel** | **69** |

Semua baris tabel sudah SELESAI. Sisa residual non-tabel: deploy VPS + QA
browser 2 device + `seed:reprice --apply` di produksi.

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
| 1 | **Deploy VPS + QA browser 2 device** | Seluruh item tabel todo5 SELESAI; belum push/deploy/teruji di lapangan. |
| 2 | **Jalankan seed:reprice --apply di VPS** | Tarif riset sudah di rates.ts; DB produksi perlu di-reprice (dry-run dulu). |
| 3 | **Browser QA sync 2 device** | Pull periodik + delta + etag + slim-patch + modal konflik field perlu dibuktikan di lapangan. |
| 4 | **Sisa minor** | Tombstone cap 500; koleksi dirty menunggu push sebelum pull; acceptPull settings-only. |

---

# 1. CORE DAN ETC LINTAS MODUL

## A1 - Seeder harga, tidak ada yang 0, riset harga real - **SELESAI**

**Terukur:** `utils/rates.ts` memuat tarif riset dengan sumber + tanggal:
Solar B40 18.950, MFO 18.900, UMP Kaltim 3.680.000, **listrik PLN 1.445/kWh**,
**air industri 15.000/m³**, **sewa crane/forklift**, **tarif dock graving/
berth/slipway**, harga baja plat. `data/index.ts` + `data/seeds.ts` menurunkan
equipment.rate, dockSlots.ratePerDay, booking rate, dan settings TARIF dari
modul itu. `seedReprice.ts` kini juga menangani equipment.rate/acquisitionCost,
inventory.cost, dockSlots.ratePerDay, settings listrik/air, dan
purchaseOrders.amount (dihitung dari lines) — dry-run dulu, hanya placeholder
yang disentuh.

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

**Finance dan Procurement.** Finance: tabel record sudah punya search + kolom tanggal; ringkasan pendek (aging, recap kas) sengaja tanpa search. **Procurement SELESAI**: SearchBox bersama `pq` di semua tab (PR/RFQ/PO Besar/PO Kecil/Vendor) + `matchProc` + FilterPopover status/kategori vendor.

## B1 - Filter cabang di top bar dihapus - **SELESAI**

`AppShell.tsx`: `<select>` cabang di topbar dihapus. `branch`/`setBranch`
tetap hidup untuk scoping RBAC (`inBranch`) + efek sinkron ke `userBranch`.
Akun terikat cabang hanya menampilkan badge statis nama cabang, bukan
dropdown filter global.

## B2 - Format titik pada semua input angka harga - **SELESAI**

`MoneyInput` (`components/ui.tsx:1875`) memakai `type="text"` + masking
tampilan `1.000.000`, parser `parseRupiah` di `utils/format.ts` dipakai
saat commit. Field money di 6 file utama (UI, Equipment, BoQSection,
Subcontractor, Procurement, Payroll, Finance) sudah dialihkan - commit
`6813df9`..`223e8e5`. Sisa `NumInput` non-uang (qty, persen, jam) sengaja
tidak diubah.

## C1 - Delay sinkronisasi data antar device - **SELESAI**

**Sudah:** applyPulled server-menang, bumpEpoch, backendMode re-eval, loop
401 berhenti, keyset pagination, token WBS/team, **slim patch** (field yang
sama dengan salinan lokal tidak dikirim), **modal resolusi konflik field**
(`ConflictResolver`): saat 409 STALE dan patch memuat field yang di server
sudah berbeda, user memilih **"Gunakan versi server"** atau **"Timpa dengan
perubahan saya"** (force patch memakai `baseUpdatedAt` server). Server PATCH
tetap `{...oldData, ...patch}`.

**Catatan:** edit field yang SAMA di dua device kini tidak lagi last-writer-
wins senyap - ada dialog pilihan. Etag/delta sync (C2) memperkecil kemungkinan
STALE, tapi dialog tetap jadi jaring pengaman.

## C2 - Sinkronisasi offline/online - **SELESAI** (delta + etag)

**Sudah:** dirty+tombstone, retry 429, cursor maju, budget push global,
trigger ditahan, tarikan periodik pull 90 detik + catch-up visibility,
**delta `?since=ISO`**, dan **etag koleksi** (`COUNT-MAX(updated_at)`):
client kirim `?etag=`; bila sama server balas `notModified` + rows kosong
(tidak memuat payload baris sama sekali). High-water + etag per koleksi di
`isms.lastPullAt`.

**Sisa residual (opsional):** etag per baris (lebih halus dari koleksi);
koleksi dirty menunggu push sebelum menerima update server; tombstone cap 500.

## C3 - Export PDF: langsung download - **SELESAI**

**Sudah:** generate server-side total. `routes/pdf.ts` jalankan
`prepare` → `buildFromModel` → `render`. Filter allowlist. Semua pemanggilan
PDF `open = false` (langsung download), termasuk surat HR yang sebelumnya
`open = true` + iframe preview (`HR.tsx` useEffect suratPreviewFor).
Tidak ada html2canvas.

---

# 2. MODUL MANAJEMEN PROYEK - bagian 1 (card, filter, form)

| # | Permintaan | Status | Bukti dan Kekurangan |
|---|---|---|---|
| P1 | Notifikasi warning maksimal 3, "perkecil" jadi "tampilkan semua" | **SELESAI** | `AlertBanner.tsx`: label memakai `t.notif.showAll` "Tampilkan semua" saat banner ditutup; `PREVIEW_N` sudah tidak ada (render cap `RENDER_CAP = 200` untuk anti-lag, bukan preview 5). Kunci `showAll` di `i18n/id.ts:125` dipakai banner modul + AppShell. |
| P2 | Kasih nomor pada kolom | **SELESAI** | `Projects.tsx:345` header `colNo`; index baris dirender di `:378-380` `(pager.page-1)*pager.size + rowIndex + 1`. |
| P3 | Card total: label selesai dan sedang berjalan; card sedang berjalan: label tertunda | **SELESAI** | `Projects.tsx`: `doneCount` (Selesai), `inProgress` (bukan Selesai/Batal), `delayed`, `pendingCount` (Tertunda). Card Total hint `prjKpiBreakdown` "Selesai {a} · Berjalan {b}"; card Berjalan delta `prjKpiActiveDelta` "{n} terlambat · {m} tertunda". |
| P4 | Card status diberi gradient, grafik di card dihapus | **SELESAI** | `KpiCard` prop `panelGradient` (`ui.tsx`): gradient penuh di seluruh card, teks putih, tanpa `spark`. Empat card Projects memakai `panelGradient` + chip navy/amber/teal/violet. |
| P5 | Filter popup jadi tampil deret dengan animasi slide | **SELESAI** | `FilterPopover.tsx` memakai `framer-motion` `AnimatePresence`: backdrop fade + panel slide dari kiri (`x: -12 → 0`, 160ms). |
| P6 | Kelola detail dipindahkan ke aksi jadi button "detail" | **SELESAI** | `Projects.tsx:421-429` `RowAction` Eye "Detail" di kolom Aksi. |
| P7 | Default data menampilkan 25 | **SELESAI** | `Projects.tsx:221` `usePager(list.length, 25)`. |
| P8 | Progres proyek harus disesuaikan lagi | **SELESAI** (`32d10c6`) | Override status Terlambat manual via `statusOverride`. |
| P9 | Proyek terbaru tampil paling atas | **SELESAI** | Default sort `{ key: "createdAt", dir: "desc" }`. |
| P10 | Form cabang diganti rencana lokasi docking | **SELESAI** | `ProjectAddModal`: select cabang diganti field `dockingPlan` "Rencana Lokasi Docking". `branch` di-auto-isi dari `defaultBranch` (cabang user / SEMUA → cabang pertama) untuk RBAC. |
| P11 | Select untuk kapal, klien, dan PM | **SELESAI** | Kapal/klien/PM di `ProjectAddModal` memakai `EntityPicker` (searchable). Kapal+klien `allowCustom`; PM terbatas ke daftar karyawan Manager/Proyek. Tombol "+ Tambah klien" tetap di samping picker. |
| P12 | Status dihapus dari form proyek baru | **SELESAI** | Tidak ada select status di form; default "Dalam Proses". |
| P13 | Hapus teks "(otomatisnya)" | **SELESAI** | Nol match `"Terlambat (otomatis"` di ProjectDetail. |
| P14 | Card progres: tambah detail saat terlambat | **SELESAI** | Teks keterlambatan + badge override di card/header progres ProjectDetail. |

---

# 3. MODUL MANAJEMEN PROYEK - bagian 2 (tab detail)

| # | Permintaan | Status | Bukti dan Kekurangan |
|---|---|---|---|
| D1 | Ganti "Desain & Class Approval" dengan "Log Penawaran dan Tagihan" | **SELESAI** (`172146e`) | Blok edit 4-stage dihapus. Tabel Log Penawaran & Tagihan menampilkan quotation, contract, dan invoices. Gate Desain→Produksi cek dokumen Sertifikat Kelas yang Disetujui, fallback designStages. |
| D2 | Milestone menyeluruh, 7 hari jadi 1 bulan, list saja | **SELESAI** | List saja terpenuhi. Jendela milestone di ProjectDetail kini default **30 hari** (`getSetting(..., "ALERT_MILESTONE_DAYS", 30)`), bukan 7. Setting global tetap bisa di-override via settings. |
| D3 | Update progress WBS: material ikut inventori, histori, dan foto | **SELESAI** (`68ec10d` + `0a65a8f`) | `saveWbsTask` menulis `photos[]`, `materialUsed`, `add("movements")`. Tabel WBS merender 📷 jumlah foto. |
| D4 | Gantt mini: detail bulan di bawah indikator | **SELESAI** | Tick label bulan (`fmtBulan`) di bawah bar Gantt, sejajar kolom bar (`w-40` task + flex bar), posisi center per bulan dari `ganttRange`. |
| D5 | **BoQ: satu nomor surat bisa beberapa pekerjaan, hanya total/status/dokumen/aksi, klik untuk detail** | **SELESAI** (`d3ba2c1`) | `BoQItem.suratNo`, seed per SPK. `BoQSection.tsx` tabel grouped + expand detail (ubah qty/harga, revisi, log, hapus Draft, tombol status). Excel blok per surat + subtotal. PDF `laporanProyek` per No Surat + subtotal. Grouping dihitung dari `suratNo` (bukan FK DB induk surat). |
| D6 | Dokumen BoQ masuk tab Dokumen dan Laporan | **SELESAI** | `utils/boqDocsSync.ts` idempoten (`sourceModule`+`sourceId`). Tombol **Sinkron Dokumen** di toolbar BoQSection. Sub-tipe `BoQ / RAB` di docTypes Laporan. Status map Draft/Pending/Approved/Rejected. |
| D7 | Change Order harus lewat approval dulu dan terkoneksi BoQ | **SELESAI** | Modal CO: aksi none/revisi/tambah BoQ + impact auto dari delta/total item. `setCoStatus` gate `canSetTarget`. Apply: revisi/tambah BoQ + `priceHistory`/`coRef`/`revisedByCo` + `budget`/`contracts.value += impact` + stamp `appliedAt`. Guard dobel apply. |
| D8 | Hapus table risiko (input manual → auto dari WBS/SOW) | **SELESAI** (`9fa8e55`) | `utils/riskAuto.ts`, dedup `source`+`wbsTask`, trigger di ProjectDetail + Projects. Form manual dihapus; kartu risiko tetap. |
| D9 | "Commissioning & Sea Trial" jadi "Commisioning & Trial" | **SELESAI** | `n_prj.ts:256` (ID) dan `:863` (EN) sudah "Commisioning & Trial". |
| D10 | Form Trial: checklist dari WBS, catatan, dan kondisi | **SELESAI** (`b03cc41`) | `trialForm.checklist` diisi dari WBS task selesai; UI checklist + kondisi (`Baik`/`Perlu Perbaiki`/`Rusak`); `saveTrial` menyimpan checklist. |
| D11 | Garansi dari WBS, kartu garansi per pekerjaan | **SELESAI** (`2432cab`) | `createWarranty(wbsTask?)`; kartu garansi muncul untuk WBS `progress >= 100` yang belum punya warranty (`:1957`). |
| D12 | Tab Service: list dari WBS, teknisi pilihan, biaya terkait BoQ | **SELESAI** (`a5c1eb4`) | Form service punya `boqRef` select dari `data.boq` proyek. List service terhubung pekerjaan/WBS di tab Terkait/Service. |
| D13 | Sparepart wajib via PO dan stok; Service wajib approval procurement | **SELESAI** | Alur A (client): stok ada → **auto GI oleh sistem** saat simpan (badge "Oleh sistem"); stok kosong → **PO Disetujui wajib**; PO diterima → sparepart `Akan` dikeluarkan otomatis (`giBy:"sistem"`, `by:"Oleh sistem · PO {id}"`). GR manual tanpa PO diblokir kecuali adjust/opname. Form sparepart: qty + preview stok + PO select selalu tampil. |
| D14 | Tab Tim terkoneksi dengan SDM dan karyawan | **SELESAI** | `usages.ts` employees: hitung keanggotaan `teamByProject` → hapus karyawan diblokir/di-warning. Tab Tim: anggota terhapus SDM tampil sebagai riwayat (badge amber), bukan hilang diam-diam. Log `mengeluarkan anggota tim` (sebelumnya hilang). |
| D15 | Tambah section subkon | **SELESAI** (`12da962`) | Tab **Subkon** di `ProjectDetail.tsx:1079,1858`: ringkasan subkontraktor, WO, termin, nilai kontrak per proyek. |

---

# 4. MODUL EQUIPMENT, SUBKONTRAKTOR, QC AND SAFETY, DOKUMEN

| # | Permintaan | Status | Bukti dan Kekurangan |
|---|---|---|---|
| E1 | "Catat servis" membuka modal catatan dulu | **SELESAI** | Register tab → `openMaintEdit(cycle, true)` (bypass `advanceMaintStatus` langsung dihapus). `saveMaint`: catatan **wajib** saat `maintFinishOnSave`. |
| S2 | Requirement BAST, invoice, dan bukti bayar | **SELESAI** | Nomor teks wajib + **unggah berkas** invoice/BAST/bukti bayar di modal bayar termin (`invoiceFileUrl`, `bastFileUrl`, `proofUrl`) + pratinjau di kartu termin. |
| E2 | Input jam strict 24H di semua browser dan modul | **SELESAI** (`2ecb039`) | `TimeInput` di `components/ui.tsx:1671` (`type="text"` + masking, bukan `type="time"`). Dipakai Equipment booking (`:2840-2841`) + modul lain. `norm24` menolak nilai di luar 00:00-23:59. 49 probe di commit terkait. |
| E3 | Historis data booking selesai di tab Alokasi | **SELESAI** | Card riwayat booking selesai di tab Alokasi. Kekurangan kecil: timestamp selesai memakai tanggal booking, bukan waktu finish. |
| E4 | Riwayat booking selesai pindah dari Biaya ke Alokasi | **SELESAI** | Render di tab Alokasi. Tab Biaya hanya agregat. |
| E5 | Card biaya per proyek dengan tombol detail | **SELESAI** (`7006a0a`) | Modal `costDetailFor` "Rincian biaya equipment per proyek" (`Equipment.tsx:2964+`) - equipment dipakai, biaya, jam pakai, downtime dari `utils/projectCost.ts`. |
| S1 | Kwitansi PDF konten terpotong | **SELESAI** | Kolom tabel + paginasi two-pass. Gate `pdf-probe.ts`. |
| S2 | Requirement BAST, invoice, dan bukti bayar | **SELESAI** | `invoiceNo`, `bastNo`, `proof.ref` wajib. Catatan: berupa nomor teks, bukan unggah file - kalau client maksud lampiran, itu terpisah. |
| S3 | Milestone per WO dengan popup modal | **SELESAI** | Modal **Milestone WO** di `Subcontractor.tsx`: daftar `woMilestonesOf(wo)`, form tambah (judul/bobot/due), hapus, tulis ke `update("workOrders", …, { milestones })`. Tombol "Milestone" di baris WO (saat belum Selesai). Milestone SOW subkontraktor tetap punya modal terpisah. |
| S3b | Bug yang ditemukan audit | **SELESAI** (`37321db`) | Modal progres WO kini render `woMilestonesOf(woProg)`, sama dengan sumber validasi. |
| Q1 | Drawing view pakai modal popup | **SELESAI** | Modal preview, bukan expand inline. |
| Q2 | Sub-tipe dokumen terhubung tab Sertifikat QC | **SELESAI** | `QCSafety`: filter sub-tipe dari `subTypesOf("Sertifikat")` (docTypes) + badge sub-tipe di baris dokumen proyek. Dua arah dengan modul Dokumen. `certHealthReal` tetap baca vessel.certificates (sumber terpisah, sengaja). |
| DOC1 | Kolom pratinjau dihapus, pratinjau hanya di Aksi | **SELESAI** | Header tanpa kolom pratinjau; aksi Detail + `preview={false}`. |

---

# 5. MODUL SDM, CRM, DASHBOARD, MONITORING, ANALYTICS, LAPORAN

| # | Permintaan | Status | Bukti dan Kekurangan |
|---|---|---|---|
| H1a | Preview lampiran tidak dikunci saat diajukan | **SELESAI** | `KaryawanDetail`: preview lampiran cuti **semua status** (gate Disetujui dihapus). Delete lock Disetujui tetap (integritas). |
| H1b | Auto-preview setelah upload | **SELESAI** (`b4f15d4`) | Panel preview otomatis saat `fileUrl` terisi. |
| H1c | Surat persetujuan cuti saat disetujui | **SELESAI** | `approveHrd`: archive `letters` idempoten (`sourceType:"cuti"`) + **modal preview** `suratCuti` (iframe + Unduh + tab baru), tanpa paksa download. |
| H2 | Surat: preview PDF bukan teks | **SELESAI** | `HR.tsx:1786` memanggil `pdfDoc.request` dengan `kind:"suratHr"`, modal `<iframe>` di `:2269-2299` plus Unduh dan Buka di tab baru. Preview form yang belum disimpan masih `<pre>` (`:2217-2222`), bisa dipertanggungjawabkan karena baris belum ada. |
| H3 | Penanggung jawab searchable dari data pegawai | **SELESAI** (`016abab`) | Dua field yang sudah ada sebelumnya (`Documents`, `ProjectDetail`) kini memakai `utils/employeeOptions.ts` yang sama - sebelumnya masing-masing membangun daftarnya sendiri dengan format hint berbeda. Sepuluh field teks bebas lain diubah ke `EntityPicker`: PIC Equipment, tiga PIC Inventory (mutasi, gudang, edit mutasi), PIC BOM, tiga PIC QC (JSA, TBM, Patrol), PIC Dock. 24 pemeriksaan di `scripts/employee-probe.ts`. Sisa `<select>` (manager proyek, PIC negosiasi, teknisi, inspector) **di purposely tidak diubah: sudah terbatas ke daftar karyawan/PM, jadi tidak bisa salah ketik. Catatan desain: `isKnownEmployee` dipakai sebagai peringatan visual (border + `aria-invalid`), bukan pemblokir simpan - berbeda dari `Documents` yang memang menolak nama di luar master karena kolom "oleh" di revisi dokumen adalah jawaban hukum. PIC bisa awak kapal atau subkontraktor yang tidak ada di master. |
| C1 | Deskripsi survei expand dan collapse | **SELESAI** | `CRM.tsx:124-127,1231,1253-1261` dengan `aria-expanded`. Catatan: saat tertutup masih tampil dipangkas 90 karakter (`:1239`), bukan disembunyikan penuh. |
| D1 | Dashboard PDF dari data, bukan tampilan | **SELESAI** | `Dashboard.tsx:406-417` memakai `kind:"analitik"`; server hitung ulang KPI dari baris DB (`pdf/registry.ts:1061-1103`). Kekurangan: saat backend tidak aktif tetap toast "PDF berhasil diekspor" tanpa mengunduh apa pun (`:407-410`). |
| M1 | Filter "hanya perhatian" jadi "proyek butuh perhatian" | **SELESAI** | `Monitoring.tsx:211` plus `n_prj.ts:573` yang berisi "Proyek Butuh Perhatian". |
| AN1 | Export Excel Analytics lengkap | **SELESAI** | Sheet bertambah: **NCR Terbuka**, **Delta KPI**, **Pendapatan Cabang** + sheet lama (KPI, Drilldown, Forecast, Profit, tipe proyek, Pareto kumulatif, Fishbone, dll). |
| AN2 | PDF tidak terpotong dan garis opacity dibold | **SELESAI** | `STROKE.hair` 0,15→0,22mm + `thin` 0,28mm (gridline terbaca di print). Hbar chart tampil s.d. **24 bar** (bukan dipotong 12). Proyek aktif di PDF analitik s.d. **40**; aktivitas proyek s.d. **16**. Sisa data tetap di sheet Excel. |
| L1 | Laporan PDF baru, bukan capture tampilan | **SELESAI** | `Laporan.tsx:383-414` memakai `kind:"laporanProyek"` atau `"laporan"`; dokumen dirakit di `pdf/documents/laporan.ts:147,249`. |
| DOC2 | Tombol dan kolom pratinjau dihapus | **SELESAI** | Sama dengan DOC1. |
| PD1 | Proyek: jangan auto-preview setelah upload | **SELESAI** | `ProjectDetail.tsx:1426-1437`, `isOpen` hanya saat `openDocId` cocok. Preview hanya saat ikon mata diklik. |
| PD2 | Ikon view membuka modal popup dengan download di dalam | **SELESAI** | Ikon mata di kartu dokumen ProjectDetail membuka **modal Detail** (`docDetail`) yang sudah memuat `DocumentPreviewPanel` + tombol **Unduh** (`DownloadFileButton`) di footer modal. Expand inline `InlineDocPreview`/`openDocId` dihapus dari kartu. |
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
| F2 | Kas Bank, Buku Besar, Neraca, dan Laba Rugi tambah tanggal | **SELESAI** | Kolom **Sumber terakhir** (max createdAt/updatedAt jurnal penyusun) di Kas recap + BB live + sort. BB voucher: `TsCells` Dibuat/Diubah. Mutasi kas sudah ada sejak F1. LR trial (snapshot Excel) tetap as-of + catatan sumber. Neraca AP/AR live: bucket per vendor/customer + `latestSrcTs` global; per-baris join payables/invoices = iterasi berikutnya bila client minta drill-down id. |

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
- Deploy VPS + QA browser 2 device (komitmen utama)
- A1 harga seeder (butuh angka client)
- C2 delta sync penuh (periodic pull sudah ada)
- C1 UX resolusi same-field conflict (toast STALE sudah ada)

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

## Real check + sesi lanjutan (D5, F1, I2, sinkronisasi doc, sisa BELUM)

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
- **Hitungan ringkasan** diganti dari baris tabel aktual; angka audit
  lama 72/73 sudah tidak konsisten.
- **§7 dibersihkan**: D1/D8/P8/S2/I2 tidak perlu ditanya lagi; ditambah
  pertanyaan yang benar-benar masih terbuka (D13 hard-block?, S3 modal
  WO, B1/RBAC, PD2).

**Sesi penutup BELUM (setelah real check):** B1, P3, P4, P5, P10, P11,
PD2, D2, D4, C3, S3 diimplementasi dalam satu batch commit. Kini
tinggal SEBAGIAN/C1-C2 sisa + deploy + QA.

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
