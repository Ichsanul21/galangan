# TODO 2 — Revisi Client 02 September: PDF Native & 23 Sisa Poin

Status: **belum dikerjakan.** File ini hanya catatan rencana, tidak ada kode yang
disentuh selain dokumen ini.

Commit yang diaudit: `1dd963a` (HEAD `main`, working tree bersih)
Metode: 8 auditor paralel read-only terhadap `apps/web` + `services/api`
Hubungan dengan `todo.md`: dokumen itu audit bug dari commit `1dd963a` (kelas
error/lifecycle). Dokumen ini menutup **catatan revisi client 02 September** yang
berbeda isi dan sebagian besar **sudah terperbaiki** oleh 40 commit pada 01–02
Oktober. Yang tersisa dicatat di sini.

---

## Keputusan yang sudah diambil (sudah dikonfirmasi client)

| # | Keputusan | Konsekuensi |
|---|---|---|
| 1 | **Semua PDF = file asli, bukan capture layar.** Ganti `exportPDF`/html2canvas dengan mesin `PdfDoc` yang sudah ada | HTML/DOM dihapus dari jalur PDF; 4 report + dokumen approval |
| 2 | **Grafik digambar vektor native di dalam `PdfDoc`**, bukan raster dari SVG | Blok print/`pdfMode`/`chartAnim` jadi tidak diperlukan dan dihapus. Hasil PDF **tidak identik dengan layar** — tanpa tooltip, gradasi, kartu rounded. Itu memang bentuk dokumen formal yang benar |
| 3 | **Cakupan**: 4 PDF yang ada + Surat Persetujuan Cuti + Payroll + dokumen persetujuan PO/WO/BAST/kwitansi | 9 dokumen transaksional sudah native, tidak berubah |
| 4 | **Kerja bertahap, commit + push per gelombang.** Dokumentasi dulu di `todo2.md` | Setiap gelombang = 1 PR/commit ke `origin/main` |

---

## Ringkasan status per bagian catatan revisi

| # | Bagian client | Status | Bukti ringkas |
|---|---|---|---|
| 1 | Dashboard | ⚠️ 2 dari 3 | 1a & 1b sudah; **1c belum** |
| 2 | CRM & Klien | ⚠️ sebagian | 3 cacat di `CRM.tsx` |
| 3 | Procurement | ✅ sudah | satu komponen dipakai kedua tab |
| 4 | Keuangan & Billing | ⚠️ sebagian | 4a sudah; **4b & 4c belum** |
| 5 | Manajemen Proyek | ⚠️ sebagian | 5b & 5d sudah; **5a, 5c, 5e belum** |
| 6 | Monitoring Proyek | ❌ belum | 1 baris label |
| 7 | Drydock & Capacity | ✅ sudah | filter sungguhan |
| 8 | Inventori | ⚠️ sebagian | 8a sudah; **8b belum** |
| 9 | Equipment | ⚠️ sebagian | 9b sudah; **9a belum**, 9c/9d parsial |
| 10 | Subkontraktor | ⚠️ sebagian | kwitansi sudah; **invoice/BAST belum** |
| 11 | QC & Safety | ⚠️ sebagian | 11b sudah; **11a belum** |
| 12 | SDM & Karyawan | ❌ belum | upload preview sudah; sisanya belum |
| 13 | Dokumen | ❌ belum | tidak ada file sama sekali |
| 14 | Analytics | ⚠️ sebagian | 14a sudah; **14b & 14c belum** |
| 15 | Laporan | ⚠️ sebagian | 15b sudah; **15a & 15c belum** |
| 16 | Etc | ⚠️ sebagian | scrollbar sudah; **konsistensi bahasa belum** |

**10 item sudah selesai. Sisanya dipecah jadi 23 poin kerja bernomor
(`G3.1`–`G3.23`) yang dikelompokkan dalam 4 gelombang — beberapa poin berasal dari
satu nomor revisi client karena satu baris kode bisa jadi beberapa cacat.**

---

# A. Arsitektur: PDF vektor native

## A1. Kenapa html2canvas dibuang

`export.ts` meraster DOM: html2canvas → satu kanvas besar → dipotong per halaman
→ JPEG → `addImage`. Hasilnya **PDF berisi gambar**: teks tidak bisa dicari, tidak
bisa disalin, tidak bisa dibaca screen reader, ukurannya besar karena tiap halaman
foto. Dan justru tiga keluhan client di item 14c/15a — "blank page", "content
terpotong", "tidak bisa download" — berasal dari pecahan yang sama:

- `captureElement` (`export.ts:216`) memakai `el.scrollWidth`/`scrollHeight`;
  elemen yang sedang di-layout (`ResponsiveContainer` recharts belum ukur)
  menghasilkan kanvas 0-dimensi → `throw "Konten gagal diraster"`.
- `MAX_CANVAS_SIDE = 16384` (`export.ts:166`) menurunkan skala diam-diam untuk
  konten panjang; kalimat jadi tidak terbaca.
- `findCleanCutY` (`export.ts:176`) menggeser titik potong naik sampai 45%
  tinggi halaman, menyisakan halaman nyaris kosong di ujung → "blank page".
- `.truncate` = `overflow:hidden` **tidak pernah dibuka** oleh loop pembuka
  `export.ts:295` yang hanya menyasar `overflow auto|scroll` dan `maxHeight`.
  `Laporan.tsx:535` & `:676` karena itu benar-benar terpotong.
- `catch {}` di pemanggil (`Analytics.tsx:798`, `Laporan.tsx:380`) membuang
  pesan error asli, jadi user hanya melihat "tidak bisa download".

**Tidak satu pun dari itu bisa terjadi pada mesin teks**, karena PdfDoc tidak
melihat DOM sama sekali.

## A2. Yang sudah ada di `pdfLayout.ts` (478 baris) — dan itu sudah cukup

| Primitive | Baris | Sifat yang mustahil untuk html2canvas |
|---|---|---|
| `kop()` | 216 | kop surat, rata tengah |
| `title()` | 250 | judul + nomor/tanggal |
| `kv()` | 270 | blok label/nilai, nilai tidak terdorong label panjang |
| **`table()`** | **300** | **page-break otomatis + header tabel diulang tiap halaman + sel wrap + baris total. `html2canvas` kehilangan `<thead>` setiap tabel terpotong** |
| `para()` / `paraKV()` | 398 / 414 | paragraf wrap otomatis |
| `rule()` | 387 | garis pemisah |
| `signatures()` | 430 | blok tanda tangan pindah halaman utuh |
| `save()` | 463 | footer "Halaman N dari M" di semua halaman |
| `raw()` | 475 | akses jsPDF |

Plus `sanitizePdf` (`:57`), `pdfNum` (`:64`), `pdfDate` (`:71`), opsi
`compress: false` untuk probe (`:84`).

## A3. Yang harus ditambah ke `PdfDoc`

| Kebutuhan | Status sekarang | Rencana |
|---|---|---|
| `image()` untuk foto pindaian & tanda tangan | **tidak ada** — hanya disebut di komentar `pdfLayout.ts:28` | primitive `image(src, wMm, hMm)` dengan `need()` page-break |
| `blob()` / `dataUrl()` | **tidak ada** — `save()` satu-satunya output (`:463`) | `output("blob")` supaya hasil generate bisa dipratinjau sebelum unduh (dipakai item 10b, 12a, 12b) |
| `plotArea()` | tidak ada | kotak terukur + judul chart + sumbu, dasar engine grafik |
| Engine grafik vektor | tidak ada | file baru `utils/pdfChart.ts` |

## A4. `utils/pdfChart.ts` — engine plot vektor (BARU)

Berkas tunggal, tanpa dependency. Primitive:

```
niceScale(max, ticks)            → batas atas bulat + posisi tick
drawBar / drawGroupedBar / drawStackedBar
drawLine / drawArea              → garis + isian, marker opsional
drawDonut                       → slice + legenda nilai nominal
drawHbarRank                    → bar horizontal terurut (10 besar)
drawPareto                      → bar + garis kumulatif persen
drawLegend / drawAxisX / drawAxisY
```

Aturan yang harus dijaga:

- Sumbu X memakai label dari `monthAxis` (`monthAxis.ts:103`) → **bulan + tahun
  eksplisit, bulan sekarang di titik terakhir.** Item 3 dan 14a otomatis terpenuhi
  di PDF tanpa kode tambahan.
- Tick sumbu Y selalu bulat enak dibaca (`niceScale`), bukan angka mentah —
  inilah yang membedakan "grafik laporan" dari "screenshot".
- Palet warna diambil dari konstanta yang sudah ada: `NAVY`/`STEEL`/`LINE`/`HEAD_FILL`
  (`pdfLayout.ts:121-124`) + warna aksen seragam dengan grafik di layar.
- Lebar plot, tinggi plot, `fontSize`, dan orientasi ditentukan lewat spec, bukan konstanta global,
  supaya dokumen portrait dan landscape sama-sama rapi.

## A5. Peta konversi

| Lokasi sekarang | Target | Item client |
|---|---|---|
| `Dashboard.tsx:369` `exportPDF("dashboard-pdf", …)` | `dashboardDoc()` | 1a |
| `Analytics.tsx:796` `exportPDF("analytics-pdf", …)` | `analyticsDoc()` | 14c |
| `Laporan.tsx:377` `exportPDF("laporan-konten", …)` | `laporanDoc()` | 15a/15b/15c |
| `ReportSection.tsx:91` `exportPDF(elementId, …)` | `laporanProyekDoc()` | — |
| — | `rekapPayrollDoc()`, `thrDoc()` | keputusan 3 |
| `HR.tsx:762` `approveHrd` | `suratPersetujuanCutiDoc()` | 12a |
| `Procurement` alur persetujuan PO | `beritaPersetujuanPoDoc()` | keputusan 3 |
| `Subcontractor` work order | `spkDoc()` (Surat Perintah Kerja) | keputusan 3 |
| `ProjectDetail` BAST | `bastDoc()` | keputusan 3 |
| `Subcontractor.tsx:602` kwitansi | sudah native `pdfDocs.ts:519` | — |
| `HR.tsx:1076` surat HR | sudah native `pdfDocs.ts:458` | — |
| 7 dokumen lain (`poDoc`, `kopPenawaranDoc`, `deliveryOrderDoc`, `goodsNoteDoc`, `slipGajiDoc`, `transmittalDoc`, `sptDoc`) | sudah native | — |

Setelah keempat report migrasi, **boleh dihapus**:

- `exportPDF`, `captureElement`, `planSlices`, `findCleanCutY`, `svgToImg`,
  `pdfExporting`, `exportBusy`, `MAX_CANVAS_SIDE`, `ExportPDFOptions`,
  `chartAnim` — `export.ts:86-429`
- import `html2canvas` (`export.ts:2`) + dependency `html2canvas@1.4.1`
  di `apps/web/package.json`
- blok print `Analytics.tsx:1468-1625` (156 baris)
- state `pdfMode` + blok kop PDF di `Dashboard.tsx:173,357-374,456-458,460-484`
- `printAvoid` `Laporan.tsx:47`
- `isAnimationActive={chartAnim()}` di `Dashboard.tsx:857-859,933` dan
  `Analytics.tsx:888-889,928,940-941,1030-1032`
- `data-export-hide` (`Dashboard.tsx:478`) — satu-satunya pemakaian di repo
- atribut `inPlace` di `ExportPDFOptions`

`export.ts` yang tersisa hanya `exportExcel` + `exportExcelSheets` (dipakai ±25 call site).

---

# Gelombang 0 — Mesin (blocking, harus pertama)

> Kalau gelombang ini tidak benar, semua gelombang berikutnya menumpuk di atas
> fondasi yang salah. Selesaikan dan `npm run check` hijau dulu.

### G0.1 `PdfDoc.image()`
- **File:** `src/utils/pdfLayout.ts` (tambah sebelum `save()` di `:463`)
- **Kebutuhan:** `image(src: string, opts: { wMm: number; hMm?: number; alt?: string })`
  → `need(h)` dulu supaya tidak menggambar melewati margin bawah, lalu
  `pdf.addImage(src, …)`. `raw()` sudah ada tapi primitive-nya belum.
- **Alasan:** komentar `pdfLayout.ts:28` sudah menjanjikan "`Chart pun tetap harus
  di-raster (addImage) - lihat image()`" — file itu **tidak pernah ada**. Fakta
  ini jangan dihapus dari komentar, tapi harus dibuat supaya benar.
- **Verifikasi:** kasus baru di `scripts/pdf-probe.ts` yang menyisipkan PNG 1×1
  berlabel dan memeriksa halaman tetap utuh.

### G0.2 `PdfDoc.blob()` + `dataUrl()`
- **File:** `src/utils/pdfLayout.ts:463-477`
- **Kebutuhan:** `blob(): Blob`, `dataUrl(): string` memakai `pdf.output(...)`,
  tetap menulis footer dulu seperti `save()`.
- **Pakai untuk:** pratinjau kwitansi (10b), surat persetujuan cuti (12a),
  surat HR (12b) — ketiganya saat ini hanya bisa diunduh.
- **Catatan:** `save()` `:463` menulis footer lalu `pdf.save()`. Ekstrak langkah
  footer jadi method privat `stampFooter()` supaya `save`/`blob`/`dataUrl`
  tidak menduplikasi logika.

### G0.3 `PdfDoc.plotArea()`
- **File:** `src/utils/pdfLayout.ts`
- **Kebutuhan:** `plotArea(opts): PlotBox` — reserve kotak setinggi `hMm`, gambar
  judul + subjudul, sisakan ruang, kembalikan `{x, y, w, h}`. Kalau `hMm` tidak
  muat sisa halaman, pindah halaman lebih dulu (dokumen panjang tidak boleh
  menyisakan chart separuh di tepi bawah).

### G0.4 `utils/pdfChart.ts` — engine grafik
- **File baru.** Perkiraan 400–500 baris, nol dependency.
- Isi: `niceScale`, sumbu, legend, `bar`, `groupedBar`, `stackedBar`, `line`,
  `area`, `donut`, `hbarRank`, `pareto`.
- Label sumbu X **wajib** lewat `monthAxis()` (`monthAxis.ts:103`) agar konsisten
  dengan layar dan memenuhi item 3 & 14a.
- Warna dari `pdfLayout.ts:121-124` + palet aksen yang didefinisikan sekali di
  `pdfChart.ts` dan dipakai semua report (jangan deklarasikan ulang per modul —
  persis kesalahan yang sudah pernah terjadi pada daftar bulan, lihat `monthAxis.ts:20-29`).

### G0.5 Probe chart
- **File:** `scripts/pdf-probe.ts` (tambah ke `CASES` di `:100`)
- Yang diuji: dokumen dengan bar/line/donut/pareto benar-benar menghasilkan
  operasi gambar (ukuran `raw().output("arraybuffer").byteLength` naik dibanding
  dokumen teks-only), multi-halaman tetap benar, dan teks sumbu bulan ("Okt 2026")
  terbaca di stream.

### G0.6 Gerbang
- `npm run check` di `apps/web` = `tsc --noEmit` + `tsc -p tsconfig.scripts.json`
  + `probe:render` + `probe:pdf` (`package.json:11`)
- Commit: `feat(pdf): mesin grafik vektor + image/blob/plotArea di PdfDoc`

---

# Gelombang 1 — Dokumen persetujuan

> Sumber data sudah ada di store; yang belum ada adalah factory PDF-nya.

### G1.1 `suratPersetujuanCutiDoc()` — item 12a
- **Data:** `leaves` + `employees` (`store.tsx:75,99`)
- **Isi:** kop, nomor surat, data karyawan (nama/NIP/jabatan), jenis (cuti/izin),
  periode, jumlah hari, alasan, nama & tanggal pemberi persetujuan, dua blok
  tanda tangan (atasan + direksi)
- **Model:** `pdfDocs.ts` (dekat `suratHrDoc` `:458`), bukan `export.ts`
- **Pemicu:** `HR.tsx:762` `approveHrd` — setelah `update("leaves", …, {status:"Disetujui"})`
  sukses, generate dokumen, simpan hasilnya (blob URL tidak bisa disimpan
  permanen → simpan **payload PDF sebagai base64 di field `suratPersetujuan`**,
  atau simpan file lewat `upload.ts` kalau backend aktif)
- **Tampilan:** kolom baru di baris disetujui (`HR.tsx:1538-1547`) =
  tombol Pratinjau (pakai `DocumentPreviewModal` + `blob()`) dan Unduh

### G1.2 `beritaPersetujuanPoDoc()`
- **Data:** `purchaseOrders` (`store.tsx:81`), alur persetujuan di `Procurement.tsx`
- **Isi:** kop, nomor, referensi PO, vendor, rincian item, total, PPN, nilai
  kontrak, nama & tanggal approver, tanda tangan

### G1.3 `spkDoc()` — Surat Perintah Kerja
- **Data:** `workOrders` (`store.tsx:73`, seed `seeds.ts:11`)
- **Field yang sudah ada: `sub`, `project`, `scope`, `progress`, `status`,
  `targetDate`, `penaltyDays`, `penaltyAmount` (`Subcontractor.tsx:346,362,380`)
- **Isi:** kop, nomor SPK, identitas subkontraktor + NPWP/alamat, nomor & tanggal
  kontrak induk, scope pekerjaan, nilai, jadwal, syarat K3, tanda tangan: kepala
  pekerjaan + keuangan

### G1.4 `bastDoc()` — Berita Acara Serah Terima
- **Data:** `bast` (`store.tsx:108`), modal `ProjectDetail.tsx:1669` `showBast`
- Perlu juga jadi **syarat wajib** di pembayaran termin (lihat G3.5)

### G1.5 Audit isi, bukan bentuk berkas
- Tambah semua factory baru ke `scripts/pdf-probe.ts` `CASES` (`:100`)
- Probe memakai `compress: false` (`pdfLayout.ts:84`) supaya stream bisa dibaca
  dan isi dokumen benar-benar diperiksa — bukan cuma "PDF valid"

**Commit:** `feat(pdf): surat persetujuan cuti/izin, persetujuan PO, SPK, BAST`

---

# Gelombang 2 — Migrasi 4 report dari html2canvas

### G2.1 `dashboardDoc()` — item 1a
- **Lokasi:** `Dashboard.tsx:356-376`
- **Isi:** kop, ringkasan KPI (tabel), distribusi status proyek (bar/Donut),
  tren pendapatan 12 bulan (bar + line), proyek perlu perhatian (tabel),
  tanda tangan
- Setelah migrasi: `pdfMode` + blok kop PDF `Dashboard.tsx:173,357-374,456-484`
  dihapus, `exportPDF` import `:117` hilang
- Item 1a ("hilangkan preview, langsung download") terpenuhi otomatis: `.save()`

### G2.2 `analyticsDoc()` — item 14c
- **Lokasi:** `Analytics.tsx:773-805`
- **Isi:** kop, ringkasan KPI, **11 grafik sebagai vektor** memakai data yang
  sudah dihitung di `Analytics.tsx:219-467` (`axis`, `revDisp`, `marDisp`,
  `monthlyReal`, `typeDist`, `projectTypeDistReal`, `revenueByBranchReal`,
  `inspDisp`, Pareto, pipeline per kuartal, variance), tabel drilldown,
  fishbone sebagai tabel, catatan insight (`Analytics.tsx:238`)
- Ini sekaligus menutup "informasi gak keluar" yang sekarang terjadi karena
  blok print `Analytics.tsx:1468-1625` **tidak memuat** axisLabel (`:220,857`),
  3 donut (`:251,396,415`), chart ke-7 (`:434`), pipeline (`:472`), variance
  (`:388`), inspeksi (`:330`), Pareto (`:516`), fishbone (`:1546-1550`), notes
  (`:238`), utilisasi (`:1393`)
- Setelah migrasi: blok `:1468-1625` dihapus, `catch {}` `:798` jadi
  `catch (e) { toast(...e.message) }`
- `chartAnim()` import `:50` dihapus

### G2.3 `laporanDoc()` — item 15a / 15b / 15c
- **Lokasi:** `Laporan.tsx:375-383`, 3 mode (`/projects`, `:307` mode excel
  terpisah; tombol `:393,395,396`)
- **Isi:** kop (letterhead `:473-478` dipakai ulang), KPI (`:482-487,587-592,638-657`),
  progres proyek (`:499-519`), NCR + insiden (`:520-547`), distribusi donut
  (`:548-580`), P&L (`:603-612`), pajak (`:613-625`), WBS (`:665-688`),
  NCR per proyek (`:689-712`), aktivitas (`:713-728`), endorsement (`:733-740`)
- **Ini jawaban langsung untuk "generate tampilan pdf baru, bukan page view":**
  dokumen disusun dari data, bukan dari markup yang sedang tampil. `.truncate`
  di `:535` & `:676` tidak relevan lagi karena tidak ada HTML yang perlu dibuka.
- `.truncate` boleh tetap di layar; yang hilang adalah `{inPlace:true}` yang
  tidak pernah dipanggil dan `printAvoid:47` yang tidak berpengaruh pada canvas.

### G2.4 `laporanProyekDoc()`
- **Lokasi:** `ReportSection.tsx:91`
- Pemanggil `exportPDF(elementId, …)` dengan elementId dinamis — pola yang paling
  rapuh karena bergantung pada DOM yang harus sudah ter-layout.

### G2.5 `rekapPayrollDoc()` + `thrDoc()`
- **Data:** `payroll` (`store.tsx:94`)
- **Konteks:** `Payroll.tsx:833` rekap absensi→Excel, `:848` THR→Excel,
  `:924` slip gaji sudah native `pdfDocs.ts:311`. Yang belum ada: dokumen PDF
  untuk rekap payroll bulanan dan THR.

### G2.6 Pensiunkan html2canvas
- Hapus `export.ts:86-429` (PDF) + import `:2`, sisakan Excel
- `package.json`: hapus `html2canvas`
- Hapus `isAnimationActive={chartAnim()}` di `Dashboard.tsx:857-859,933` +
  `Analytics.tsx:888-889,928,940-941,1030-1032`
- Hapus `data-export-hide` `Dashboard.tsx:478`
- Hapus blok print `Analytics.tsx:1468-1625`, `pdfMode` `Dashboard.tsx:173,357-374`
- `export.ts` cara atau nama file: pertahankan nama supaya ±25 call site Excel
  tidak ikut berubah

**Verifikasi:** `npm run check`; probe baru untuk keenam factory report di
`pdf-probe.ts`; cek manual file hasil unduh.

**Commit:** `refactor(pdf): 4 report + payroll ke PdfDoc vektor, html2canvas dibuang`

---

# Gelombang 3 — 23 poin modul

## G3.1 Highlight dari kartu dashboard ke 10 modul — item 1c
- **Gejala:** `?highlight=` hanya dibaca 3 modul —
  `CRM.tsx:666`, `Finance.tsx:911`, `QCSafety.tsx:195` (semuanya lewat
  `useDeepLinkTarget`). Padahal `Dashboard.tsx:441-444` mengirim
  `?alert=<key>&highlight=<rowId>` ke **13** tujuan `moduleAlerts.ts:25-39`.
  Hasilnya: banner muncul, **tidak satu baris pun berkedip** di 10 modul.
- **Perbaikan:** hook baru tanpa parameter tab di `components/useDeepLink.ts`
  (modul tanpa tab), dipasang di 10 halaman; ganti ternary highlight buatan
  dengan `rowHighlightClass` (`components/rowHighlight.ts:49`) supaya
  `.notif-hl` tidak hilang dan animasinya sama dengan notifikasi
  (`index.css:130-175`).
- **Situs yang harus diganti:**
  `Projects.tsx:305` · `Documents.tsx:527` · `Equipment.tsx:1592` ·
  `Inventory.tsx:2011` · `Procurement.tsx:1421,1516,1731` ·
  `Payroll.tsx:1060,1171` · `Subcontractor.tsx:1171` · `HR.tsx:1504` ·
  `Vessels.tsx:396` · `Drydock.tsx:729,936`
- **Syarat eksplisit client:** highlight dari dashboard **tidak boleh**
  menghapus notifikasi warning yang sudah ada → `rowHighlightClass:56-59`
  sudah dirancang untuk itu, jangan pakai kelas manual.

## G3.2 Label Monitoring — item 6 (satu baris)
- `i18n/n_prj.ts:567` `monModeAtt: "Hanya Perhatian"` → `"Proyek Butuh Perhatian"`
- `i18n/n_prj.ts:1151` EN → `"Projects Needing Attention"`
- Konsumen tunggal `Monitoring.tsx:212`
- Bila client maksud juga judul kartu: `n_prj.ts:568` `monAttTitle` ikut diubah

## G3.3 Deskripsi survei CRM — item 2
- **File:** `CRM.tsx:121-125,1220-1246,1271` · satu-satunya tempat render di repo
- **Cacat 1 — Deskripsi pendek lolos tanpa tombol:** `CRM.tsx:1230`
  `open || !long ? note : note.slice(0,90)+"…"` dan `:1234` `{long && <button …>}`
  → catatan ≤90 karakter tampil utuh dan **tidak ada tombol expand**.
  Client minta deskripsi **tidak** langsung ditampilkan. Hapus guard `long &&`;
  tombol selalu ada.
- **Cacat 2 — Hanya 3 catatan terakhir yang bisa dibaca:** `:1220` `.slice(-3)`
  tanpa affordance "lihat semua". Hapus, atau jadikan bagian dari
  `expandedSurvey` yang sudah ada.
- **Cacat 3 — Label hardcoded Indonesia** di `:1227,1236,1244,1271`
  (membuat locale EN rusak). Key `surveyDescPh` sudah ada di
  `i18n/n_crm.ts:135` & `:606` tapi **tidak terpakai** — bug yang diam.
  Tambah key `satNoDesc`, `satShow`, `satClose`, `satExpandAll` di kedua blok.

## G3.4 Tombol Excel → Detail + modal — item 5c
- **Lokasi:** `ProjectDetail.tsx:1382-1384` (per dokumen) ·
  `ReportSection.tsx:142` + handler `:96-118` (3 sheet) · `BoQSection.tsx:282`
- **Belum ada modal detail sama sekali** di kedua halaman (semua modal yang ada
  adalah create/edit/confirm).
- **Perbaikan:** tombol jadi "Detail" (`FileDown` → ikon `Eye`/`Info`), isi modal
  read-only: `ProjectDetail.tsx:1384` sudah menyusun 9 baris key-value — pindahkan
  ke modal. `ReportSection.tsx:97-111` sudah menyusun sheet "Ringkasan" — sama.
- **i18n:** `n_prj.ts:11` `excelBtn` + `:595` EN dipakai bersama oleh 3 tempat;
  tambah `detailBtn`. `n_prj.ts:189` `detExportAria` masih berbunyi
  "Ekspor {a} ke Excel" — harus ikut berubah.
- **Putuskan:** apakah `BoQSection.tsx:282` juga masuk lingkup.

## G3.5 Termin wajib invoice + BAST — item 10b
- **Yang sudah ada:** kwitansi native `pdfDocs.ts:519-558`, pemanggil
  `Subcontractor.tsx:539-607` `printKwitansi`, tombol `:1232-1243`
- **Yang belum ada:** validasi invoice & BAST.
  `confirmBuktiTerm` `Subcontractor.tsx:629-637` hanya memeriksa tanggal (`:631`),
  nomor referensi (`:632`), dan ambang-director (`:634-637`, `APPROVE_TERMIN:283`).
- **Bug semantik:** field `invoiceNo` & `bastNo` **tidak pernah ditulis di repo
  mana pun**. Checklist `:1185` `done: Boolean(p.invoiceNo ?? p.withholdingRef)`
  memakai nomor bukti potong PPh sebagai pengganti invoice, dan `:1186`
  memakai `releaseBA` (BA pelepasan retensi) sebagai pengganti BAST. Jadi
  checklistInvoice/BAST selalu atau salah-terbaca "✓".
- **Perbaikan:**
  1. Field `invoiceNo`/`invoiceUrl`/`bastNo`/`bastUrl` di modal bayar `:1656-1702`,
     grup "Dokumen pendukung", pakai `FileUploadButton` seperti
     `ServiceNotes.tsx:157-160`
  2. `confirmBuktiTerm`: tolak bila `invoiceNo` atau `bastNo` kosong, sebelum `:631`
  3. Simpan keduanya di `update("termins", …)` `:647-652`
  4. Checklist `:1185-1186` → `Boolean(p.invoiceNo)` / `Boolean(p.bastNo)`,
     tambah baris baru "Bukti potong PPh" (`withholdingRef`) dan "BA retensi" (`releaseBA`)
  5. Kwitansi **terbit otomatis** di akhir `confirmBuktiTerm`, bukan harus diklik terpisah
  6. Nomor kwitansi berurut dari `utils/sb.ts:59` (`maxSeq`), bukan dari id termin

## G3.6 Equipment "Catat Servis" harus lewat modal — item 9a
- **Gejala:** `Equipment.tsx:1888` `onClick={() => void advanceMaintStatus(r.raw, to)}`
  langsung menutup siklus jadi `Selesai` — potong stok (`:1058-1097`), ubah
  status equipment (`:1104-1112`), toast "selesai" (`:1127-1133`) — **tanpa
  catatan servis**. Handler `:1021` bahkan sudah menerima parameter `note?` dan
  menulisnya ke `history[].note` (`:1042`), tapi tidak ada satu pun call site
  yang mengirimnya.
- **Jadi:** buka modal dulu. `ServiceNotesModal`
  (`components/ServiceNotes.tsx:74-221`) **sudah lengkap** — textarea observasi
  (`:138-145`), lampiran (`:148-162`), riwayat (`:171-204`), hapus (`:210-218`) —
  tapi hanya dipasang di tab Register (`Equipment.tsx:1673-1682` + `:2767-2776`).
  Reuse, jangan tulis ulang.
- **Call site kedua** yang perlu revisi: `Equipment.tsx:1654` juga memanggil
  `advanceMaintStatus(cycle.raw, "Selesai")` langsung.
- **Komenting basi:** `:1770-1772` mengklaim tombol "Catat Servis" sudah diganti
  jadi Ubah/Riwayat/Hapus — tidak sesuai kode (tombolnya masih di `:1893`).
  Hapus agar tidak menyesatkan audit berikutnya.

## G3.7 Input jam strict 24H — item 9b (sudah 90%, tersisa 2)
- Tidak ada input AM/PM di repo; `type="time"` dipakai di `Equipment.tsx:2619-2620`,
  `Absensi.tsx:501,504`, `KaryawanDetail.tsx:858,861`. Semua sudah 24H.
- **Sisa 1 — clamp diam-diam:** `Equipment.tsx:132-133` `norm24` mengubah
  `"25:00"` → `"23:00"` alih-alih menolak. Karena `toMinutes` (`:147-155`) sudah
  menolak >23 tapi dipanggil **setelah** `norm24`, validasi strict tidak pernah aktif.
  Ubah: tolak + toast, jangan diam-diam diubah.
- **Sisa 2 — heatmap bypass:** `Equipment.tsx:260-261` masih mem-parse `b.jam`
  mentah (`/(\d{1,2}):/`) tanpa `norm24`, sehingga booking legacy `"7:00 PM"`
  masuk kolom 7, bukan 19.

## G3.8 Alur alokasi/booking — item 9c
- **Alur sekarang:** booking aktif (`:1711-1735`) + deteksi bentrok (`:1736-1760`)
  → modal (`:2602-2631`) → `saveBooking:1241-1284` (wajib equipment/proyek/tanggal/jam
  `:1243`, `b > a` `:1249`, tolak equipment Maintenance `:1255`, tolak kalibrasi
  expired `:1261`, cek clash `:1267`) → confirm gusur (`:1270-1272`) →
  `confirmGusur:1286-1306` → **`remove("bookings", c.id)` permanen di `:1291`** →
  `persistBooking:1226-1239`.
- **Cacat:** tidak ada edit/reschedule/batal. Booking yang tanggal/jamnya salah
  harus dihapus lewat jalur gusur atau dibiarkan selamanya.
- **Cacat:** gusur menghapus semua booking bentrok tanpa pilihan — data hilang
  permanen, tidak ada audit.
- **Cacat:** `saveBooking:1249` menolak `b <= a` tanpa opsi shift, jadi booking
  lintas tengah malam mustahil; `durationHours` (`:178-183`) jadi 0.
- **Cacat:** `conflictList` (`:1749-1757`) read-only, tanpa tombol "perbaiki".
- **Perbaikan:** tambah status `Dibatalkan` + alur batal + ubah; gusur downgrade
  ke `Dibatalkan` (bukan hapus) dengan alasan tersimpan; tombol perbaiki yang
  membuka modal dengan jam terisi ulang.

## G3.9 Tab "Biaya" Equipment — item 9d
- **Struktur:** 4 Card di `:2038-2173` — Biaya per Proyek (`:2040-2069`),
  HPP (`:2079-2138`), Riwayat booking selesai (`:2139-2153`), Biaya BBM (`:2154-2171`)
- **Hilang:** tidak ada pencarian teks (padahal Register punya `eqQ` +
  `FilterPopover` di `:1550-1573`, sudah di-import `:44`), tidak ada filter
  periode/proyek/equipment/status, tidak ada paginasi di 2 card list, tidak ada
  export HPP (`exportCost:1458-1466` hanya 4 kolom), tidak ada export PDF.
- **Detail:** header tabel HPP `:2091-2093` tidak bisa diurut (callback
  `:2099-2102` hanya mendukung `r`/`c`); tabel pertama punya baris total (`:2068`),
  tabel HPP tidak.
- **Perbaikan:** baris filter di atas card pertama (reuse `FilterPopover`),
  paginator untuk card 3 & 4, perluas `exportCost`, tambah tombol PDF native.

## G3.10 Termin & K3 Subkontraktor — item 10a
- **Termin** `:1142-1280`: **tanpa filter, pencarian, dan paginasi** — hanya sort
  kolom (`:1162-1167`). Bandingkan tab Subkontraktor yang punya `FilterPopover`
  (`:981-1001`) + `subQ` (`:148`). FlowStrip sudah menghitung jumlah per tahap
  (`:1147-1152`) tapi angkanya **tidak bisa diklik** jadi tidak jadi filter.
- **Kolom tanggal ambigu:** `:1181` menampilkan `{p.date}` (tanggal pengajuan),
  padahal `paidAt`/`paidMethod`/`paidRef` ada di data tapi tidak pernah ditampilkan.
- **Jejak persetujuan tidak ada:** `Diajukan → Disetujui` (`:609-627`) hanya
  `update status` (`:624`), tanpa siapa/memberi kapan — padahal Lunas butuh
  Director (`needsTermDirector:287`).
- **K3** `:1386-1423`: grade `k3` **hanya bisa diisi saat registrasi** (`:302`,
  select `:1436-1439`). **Tidak ada jalur update sama sekali** di seluruh file —
  tidak ada ubah grade, tidak ada upload SMK/sertifikat, tidak ada catatan audit.
  Tidak ada filter, tidak ada KPI (jumlah K3 rendah, masa berlaku sertifikat).
- **Perbaikan:** toolbar filter + KPI stage + kolom tanggal bayar di `:1142`;
  aksi ubah grade K3 + upload dokumen di `:1397`.

## G3.11 Layout periode pajak baru — item 4c
- **Blok:** `Finance.tsx:3685-3730` — semua dalam satu baris `flex flex-wrap items-end gap-2`
- **Cacat 1 — input tidak sejajar:** `Field` merender hint sebagai baris tambahan
  (`ui.tsx:855`). Field Periode baru (`:3691`) punya hint, Field Periode
  (`:3686`) tidak → dengan `items-end` keduanya duduk di tinggi berbeda.
- **Cacat 2 — grup kanan tidak bisa wrap:** `:3719` `ml-auto flex gap-2` **tanpa
  `flex-wrap`**, sedangkan induknya punya. Empat tombol di dalamnya
  (`:3720-3727`) jadi satu klaster kaku yang meluber viewport.
- **Cacat 3 — badge meleset baseline:** `:3715` `self-center` di tengah sibling
  yang bottom-aligned.
- **Cacat 4 — aksi destruktif bersebelahan:** hapus (`:3711-3713`) tepat setelah
  "Periode Baru" (`:3694-3710`), dipisah `gap-2`.
- **Cacat 5 — tanpa pengelompokan:** tidak ada Card/FormGrid, padahal
  `ui.tsx:860-862` `FormGrid` sudah dipakai di `SptFilingForm` (`:514,527,538,551,565,605`).
- **Cacat 6 — indentasi rusak:** `:3705-3708` (seluruh badan `try`), `:3720`, `:3722`
  kurang spasi dari sibling-nya. Tanda kode yang dirapikan tangan.
- **Perbaikan:** tulis ulang blok `:3685-3730` jadi dua kelompok berlabel
  (kontrol periode | aksi ekspor/lapor), kedua Field tinggi sama, grup kanan
  `ml-auto flex flex-wrap justify-end`, badge `self-end`, `min`/`max`/`required`
  pada input tanggal (`:3692`).
- **Related — label kontradiktif:** `n_fin.ts:323` & `:966` `newPeriodLabel`
  masih berbunyi **"Periode baru (YYYY-MM)"** padahal kontrolnya `type="date"`
  (`:3692`) yang butuh `YYYY-MM-DD`. Nilai disimpan `YYYY-MM` (`:3697`) sehingga
  hint `taxDateHint` (`n_fin.ts:643`) yang BENAR, tapi label yang terlihat salah.
  Ganti label, jangan andalkan hint 11px.

## G3.12 Filter historis Kas & Bank / Buku Besar / Neraca / Laba Rugi — item 4b
- **Fasilitas bersama sudah ada:** `Finance.tsx:75-86` `HistMode`/`matchHist`,
  `:87-95` `matchHistPeriod`, `:98-127` `HistFilterBar` (dirender 4× di
  `:2804,3163,3275,3540`), `monthAxis.ts:262-269` sudah menyediakan `yearsIn()`
- **Cacat 1 — TIDAK ADA filter Tahun di mana pun:** `:101-105` daftar `modes`
  hanya `Semua / Bulan / Hari`; `:96-97` komentarnya menyebut "Mode Tahun
  disengaja tidak ditampilkan". Matcher tahun **sudah ada** (`:84`), jadi ini
  murni celah UI. Tambahkan mode Tahun + `yearsIn()` untuk dropdown, + key i18n
  di `n_fin.ts:543-549` & `:1186-1192`.
- **Cacat 2 — filter hari berbohong di Laba Rugi & Neraca:** keduanya memakai
  `matchHistPeriod` (`:3323` & `:3536`) yang cabang `Hari`-nya
  (`:91`) membandingkan `s === f.hari.slice(0,7)` → memilih **2026-08-15
  mengembalikan SELURUH Agustus 2026**. Bukan bug tampilan, data yang salah.
- **Cacat 3 — tidak ada kolom tanggal di Neraca & Laba Rugi:**
  Neraca 5 tabel tanpa kolom tanggal (`:3563,3580-3584,3604-3608,3631-3636,3654-3659`),
  Laba Rugi hanya `Periode` `YYYY-MM` (`:3320,3325`).
- **Cacat 4 — `plMonthly` membuang granularitas hari:** `:1388-1408` hanya
  membucket ke `YYYY-MM` (`:1391`), jadi filter hari mustahil tanpa menyimpan
  key `YYYY-MM-DD` berdampingan.
- **Cacat 5 — tabel snapshot tanpa stempel periode:** Kas snapshot `:2812-2820`
  dan Buku Besar trial balance `:3179-3184` berisi saldo **akhir** periode,
  tapi keduanya `true` kapan pun `asOf.slice(0,7) === "2026-08"` (`:951,3138`).
  Pilih Hari = 2026-08-15 → saldo akhir bulan tampil berdampingan dengan mutasi
  satu hari. Tambah kolom periode, atau keluarkan kolom snapshot saat mode ≠ Semua.
- **Cacat 6 — `liveAsOf` hardcode:** `:322` `return "2026-08-31"` saat mode
  `Semua` → setiap tab melaporkan 2026-08 walau jurnal terbaru beda.
- **Cacat 7 — kebocoran i18n tepat di kolom tanggal yang benar:**
  `:2908` & `:3242` hardcode `"Tanggal"`, `"Dokumen"`, `"Uraian"`, `"Nominal"`
  alih-alih `S.colTanggal` (`n_fin.ts:200`/`:843`).
- **Data dasarnya memang bertanggal** (`seeds.ts:223`, `financeExcel.ts:351-362`),
  jadi semua ini bisa diperbaiki tanpa mengubah skema.

## G3.13 Label status "Dalam Proses" — item 5a
- **Gejala:** `Dashboard.tsx:761` `order` memuat `["Sedang Berjalan","Tertunda",
  "Terlambat","Batal","Selesai"]` — **tidak ada "Dalam Proses"**, padahal itu
  status **default proyek baru** (`ProjectAddModal.tsx:26`) dan dipakai 3 proyek
  seed (`data/index.ts:90,166,181`). Jumlahnya hilang diam-diam dari strip
  distribusi, dan badge barisnya jatuh ke cabang default.
- Client minta semua status **kecuali "Selesai"** — jadi tambahkan "Dalam Proses".
- **4 lokasi wajib:**
  - `Dashboard.tsx:761` — masukkan ke `order`
  - `Dashboard.tsx:762-763` — `toneFor` (eksplisit, bukan catch-all)
  - `Dashboard.tsx:788` — badge baris
  - `Projects.tsx:59` `statusOptions` — **tanpa ini** pill
    `/proyek?status=Dalam%20Proses` dari `Dashboard.tsx:765` ditolak `:111` dan
    filter diam-diam reset ke "Semua"
  - `ProjectDetail.tsx:49` `STATUS` — **tanpa ini** `<select>` status `:888-895`
    merender kosong untuk proyek-proyek itu
- Nada sudah ada di `ui.tsx:174-175`

## G3.14 List equipment di proyek — item 5e
- **Sudah ada tapi tersembunyi:** `ProjectDetail.tsx:1248-1278` (booking) dan
  `:1281-1306` (maintenance), kartu `:1201-1205`
- **Cacat 1 — booking non-billable dibuang:** `projectCost.ts:30-32`
  `isBillableBooking` hanya menerima `Selesai`/`Terpakai` (`:27`), jadi `BK-004`
  status `Terjadwal` (`seeds.ts:71`) dan booking baru (`Equipment.tsx:1232`)
  **tidak pernah muncul** — padahal itu justru "equipment yang di-booking".
- **Cacat 2 — kartu hilang saat tanpa biaya:** `:1215` `!equipHasCost` menyembunyikan
  seluruh kartu, jadi proyek yang hanya punya booking terjadwal tampil kosong.
- **Cacat 3 — status maintenance tidak ditampilkan:** `projectCost.ts:158`
  menghitung `r.status`, `:1290-1292` hanya menampilkan turunan
  "Terbebankan"/"Berjalan".
- **Cacat 4 — tidak ada di tab Service:** `SparepartServiceSection.tsx` nol
  referensi ke `bookings`/`maintenances`/`equipment`. `data.services`
  (`data/index.ts:519-537`) tidak punya field equipment, jadi sumbernya wajib
  `maintenances` (`seeds.ts:541-560`).
- **Cacat 5 — semua label hardcode `locale === "en" ? … : …`** (`:1207,1211-1212,
  1218-1219,1225-1243,1253-1257,1291-1298,1311-1312`); `n_prj.ts` nol key
  equipment/booking.
- **Perbaikan:** pisahkan `bookingRowsAll` (semua status) dari `bookingRows`
  (billable); render daftar di luar guard biaya; tampilkan status mentah; tambah
  key i18n.

## G3.15 Warning inventori per kategori — item 8b
- **Sudah ada:** `inventoryWarn.ts:52-96` `CATEGORY_RULES`, `:153-179` `warnLevelOf`,
  `:214-268` `categoryWarnings`; UI `Inventory.tsx:2729-2801` (kartu per kategori),
  `:1886-1914` (chip), `:2004-2006` (badge baris), `:2195-2205` (badge gudang);
  `moduleAlerts.ts:115-124` sudah memakai `warnLevelOf`.
- **Cacat 1 — pusat notifikasi masih pakai aturan lama:** `alerts.ts:63-65`
  `filter((i) => Number(i.stock) <= Number(i.minStock))` → `"{n} material di bawah
  minimum"`. Sumber ini mengisi lonceng `AppShell.tsx:139` dan daftar
  `/notifikasi` `Notifikasi.tsx:115-129`, jadi **angka di pusat notifikasi
  bertentangan dengan badge di Katalog**. Item jasa/layanan dengan stok 0
  (dikesampingkan `ignoresMin` `inventoryWarn.ts:92-93`) masih ikut terhitung,
  dan rasio kritis per kategori diabaikan.
- **Cacat 2 — `CATEGORY_RULES` tidak menutup kategori yang dipakai aplikasinya:**
  dropdown `Inventory.tsx:2951` = `["Baja","Mesin","Pipa","Listrik","Cat",
  "Fastener","Rigging","Perlindungan","Lainnya"]`, seed menambah "Umum"
  (`data/index.ts:448-458`). Rule ada di `inventoryWarn.ts:74-95` untuk
  `baja`, `pipa`, `rigging`, `kelistrikan`, `cat`, `sparepart`, `service`, `jasa`, …
  → `"listrik"`, `"mesin"`, `"fastener"`, `"perlindungan"`, `"umum"`, `"besi"`,
  `"henrik"` **tidak match apa pun** dan jatuh ke `default` (`:95`).
  Matcher substring juga rapuh arah sebaliknya: kategori yang teksnya memuat
  `"cat"` akan ikut tertangkap rule `cat`.
- **Perbaikan:** `alerts.ts:64` → pakai `warnLevelOf` + sebut nama kategori
  (cermin `moduleAlerts.ts:115-124`); perluas `CATEGORY_RULES` dengan alias
  berbasis kategori nyata, bukan substring buta.

## G3.16 Preview drawing langsung + lampiran bisa diisi — item 11a
- **Cacat 1 — masih butuh 1 klik:** `QCSafety.tsx:230` `openDrwId` default `""`,
  gate `:1463` `{isOpen && …}`. tombol `:1448-1457` sudah diubah jadi "Pratinjau",
  tapi client minta langsung tampil tanpa klik tombol.
- **Cacat 2 — modal ubah drawing tidak punya field berkas:** `:2256-2259` hanya
  `title` + `holder`, `saveDrwEdit:878` hanya menyimpan dua field itu — padahal
  kartu di `:1443` menulis "Belum ada dokumen - tekan Ubah lalu unggah PDF/gambar",
  dan seed `seeds.ts:474-475` tidak punya `fileUrl`. Percakapan dengan user
  mentok: tidak ada cara memasang dokumen pada drawing lama.
- Lihat juga `todo.md` E1: `VesselDetail.tsx:174` `saveCert` hanya
  `{name, issued, expires}` → cabang pratinjau sertifikat `:1809-1812` adalah
  **dead code** ("Belum ada file sertifikat - hubungi QA").

## G3.17 Cuti & izin — lampiran + surat persetujuan — item 12a
- **Sudah:** preview unggahan instan `HR.tsx:1951-1967`
- **Cacat 1 — lampiran dikunci saat pending:** `HR.tsx:1519-1537` hanya
  `DocumentPreviewCell` bila `status === "Disetujui"`, selain itu `<Lock/> "Tertutup"`.
  `KaryawanDetail.tsx:722-732` sama. Client minta **saat masih diajukan,
  pengaju/atasan bisa melihat lampirannya**.
  Form sendiri mengiklankan pembatasan ini di `:1940-1941` — jadi harus
  diubah di kedua tempat (teks form ikut).
- **Cacat 2 — surat persetujuan tidak ada sama sekali:** `approveHrd`
  `HR.tsx:762-806` hanya `update status` (`:762`) + sinkronisasi absensi.
  `pdfDocs.ts` punya 9 factory (`poDoc:83` … `kwitansiDoc:519`) dan **tidak satu
  pun untuk cuti/izin** — pencarian `leaveDoc|cutiDoc|izinDoc|suratPersetujuan`
  = 0 hit.
- **Perbaikan:** factory `suratPersetujuanCutiDoc()` (G1.1) + buka gate lampiran.

## G3.18 Surat & impor — generate & preview, bukan teks — item 12b
- **Gejala:** pratinjau arsip = `<pre>` teks murni `HR.tsx:2223-2238` (dipicu
  `:1753-1755`, modal `:2211-2217`); form juga `<pre>` `:2184-2189`.
  Generator `suratHrDoc` (`:1054-1076`) **hanya dipakai untuk unduh**
  (`pdfDocs.ts:458`, tombol `:2179-2181`), hasilnya tidak pernah diunggah, jadi
  `fileUrl` baris arsip tetap `""` (`:1747-1749` "tanpa pindai - teks saja").
- **Perbaikan:** pakai `blob()` (G0.2) → `DocumentPreviewPanel` di kedua tempat.
  Blok `<pre>` tetap ada sebagai kolom sekunder "teks asli", bukan digantikan.

## G3.19 Preview & unduh Dokumen — item 13
- **Gejala sebenarnya bukan bug tombol:** **tidak ada satu pun file di seed.**
  `seeds.ts:319-334` 9 dokumen tanpa `fileUrl`/`fileName`; `docAttachment.ts:73-81`
  mengembalikan `url: ""`; `DocumentPreview.tsx:381` merender `-`.
  Jadi tombol Pratinjau + Unduh **benar-benar tidak ada** untuk semua baris.
  Jalur kodenya sendiri sudah benar (lihat buktinya di bawah).
- **Bukti jalur sudah benar:**
  `Documents.tsx:543-550` cell → `DocumentPreview.tsx:390` `setOpen(true)` →
  `:413` modal → `:230-238` panel → `:146-151` auto-load → `files.ts:22-28,77-99`
  `toAbsoluteUrl` (bawa `Authorization`) → unduh `files.ts:170-194`
  `downloadFileUrl` → blob + `a.download`; kontrak backend
  `services/api/src/routes/files.ts:159` mengembalikan `{url:"/files/<bulan>/<nama>"}`,
  `:107-109` mewajibkan auth
- **Cacat 1 — mode lokal memblokir unggah:** tanpa `.env`, `Documents.tsx:252` &
  `:645` menolak + toast, `upload.ts:43` melempar `UploadNotConfigured`. URL relatif
  yang diketik manual lalu resolve ke origin Vite → 404 (`files.ts:26`).
- **Cacat 2 — lampiran tak bisa dikosongkan:** `Documents.tsx:126-127`
  `attachFields("")` mengembalikan `{}` jadi `update` `:288-293` **mempertahankan
  URL lama** (sudah tercatat sebagai B6 di `todo.md`).
- **Cacat 3 — nama berkas (non-URL) ditolak tanpa affordance:** `:662-668`
- **TEMUAN PENTING — `data/` di backend TIDAK pernah ter-deploy.**
  `services/api/.gitignore:3` mengabaikan `data/`; `git ls-files
  services/api/data/uploads` = **0 berkas**. Jadi lampiran sample yang ditaruh di
  `services/api/data/uploads/` **akan hilang saat deploy** dan `seeds.ts` akan
  menunjuk URL yang 404 — persis hasil yang dilarang di
  `todo.md` E2. `.gitignore` root juga punya `*.pdf` yang cocok di semua direktori.
- **Temuan kedua — data-URL PDF tidak akan ter-preview sekarang.**
  `toAbsoluteUrl` mengembalikan `data:` apa adanya (`files.ts:25`) dan `fetch`
  mengambasnya jadi blob — **tapi** `fileKindOf` (`files.ts:31-44`)
  menebak jenis dari **ekstensi**, sedangkan `data:application/pdf;base64,…` tidak
  berakhiran `.pdf` → hasilnya `other` → `DocumentPreview.tsx:116` & `:266`
  masuk status `unsupported` (`:196-200`), bukan `<iframe>` PDF (`:219`).
- **Perbaikan:** dua arah sesuai keputusan —
  1. **benahi deteksi jenis dulu (prasyarat):** `fileKindOf` di `files.ts:31-44`
     membaca awalan MIME `data:` (`/^data:(image|application\/pdf|text)\//`)
     sebelum menebak ekstensi. Tanpa ini, semua opsi lampiran sample di bawah
     gagal saat pratinjau.
  2. **lampiran sample — pilih satu:**
     - **(2a) data-URL inline di seed (disarankan).** PDF teks satu halaman
       ±1–2 KB; 9 dokumen ≈ 25 KB base64 di `seeds.ts` + cermin
       `services/api/src/seedFeMirror.ts`. Jalan di mode lokal maupun server,
       tidak perlu berkas, tidak ada yang bisa 404.
     - **(2b) berkas di path yang ter-track.** Bukan `data/` — butuh aturan
       pengecualian di `.gitignore`, atau folder baru yang di-mount sebagai static di
       `services/api/src/routes/files.ts`. Lebih banyak langkah deploy.
  3. **benahi logika:** `attachFields` mengembalikan `{fileUrl:"",fileName:""}`
     saat dikosongkan; fallback object-URL saat `!isBackendConfigured()` (bukan
     data-URL, karena `upload.ts:43` menolak unggah di mode lokal); ganti `-` di
     `DocumentPreview.tsx:381` dengan "Belum ada lampiran" yang jujur.

## G3.20 Kelengkapan grafik & export Analytics — item 14a/14b/14c
- **14a sudah** (`Analytics.tsx:219,279-299,327,331-339,435-452`, semua
  `XAxis dataKey="bln"`), tinggal dipastikan ikut terbawa ke PDF vektor (G0.4).
- **14b — Excel kurang lengkap:** `Analytics:757-766` hanya 8 sheet
  (KPI, Drilldown, Forecast, Skenario, Profit, Preskriptif, Utilisasi, Inventory).
  **Data bulanan grafik tidak ikut** — padahal sudah dihitung di `:219-467`.
  Tambah sheet: pendapatan & margin per bulan, distribusi tipe & cabang,
  tren inspeksi, Pareto, pipeline per kuartal, variance, fishbone.
- **14c — PDF:** sudah diselesaikan oleh G2.2 (mesin vektor). Sisa yang harus ikut:
  hapus `catch {}` `:798` → tampilkan `e.message`; hapus blok `:1468-1625`;
  hapus `chartAnim()`.

## G3.21 Export Laporan — item 15a/15b/15c
- **15b sudah** (`export.ts:397` `pdf.save`, tanpa window.open/iframe/modal).
- **15a & 15c** diselesaikan oleh G2.3. Konkret yang hilang saat ini:
  target `Laporan.tsx:472` adalah **live page DOM** (bukan section print);
  `.truncate` `:535,:676` tidak pernah dibuka; `{inPlace}` tidak pernah
  dipakai sehingga elemen yang sedang tampil dikunci `position:fixed`
  (`export.ts:332-337`) → halaman sisanya runtuh, scroll meloncat;
  input pencarian `:503,:523,:692` bocor ke PDF; `findCleanCutY` menyisakan
  halaman nyaris kosong; `catch {}` `:380-382` menyembunyikan pesan asli.

## G3.22 Scrollbar notifikasi — item 16a (sisa 3 situs)
- Sudah benar di `index.css:106-120` (`.scroll-flush`, `.scroll-flush-5`) dan
  dipakai `AlertBanner.tsx:150`, `Notifikasi.tsx:337`, `Laporan.tsx:504,693`,
  `Dashboard.tsx:902`.
- **Sisa:** `Laporan.tsx:524` (pola identik `:504` tapi tanpa `scroll-flush`) ·
  `Finance.tsx:2671` · `Finance.tsx:3968` (sudah tercatat `todo.md` F1)
- `todo.md` F2: `scrollbar-gutter` baru ada di `AlertBanner.tsx:150`; lonceng
  `AppShell.tsx:633` dan `/notifikasi` `:337` tidak punya → klik "tampilkan
  semua" menggeser baris ~15px.

## G3.23 Konsistensi bahasa — item 16b
- **Wiring sudah benar:** `i18n/LanguageContext.tsx:26-49`, `useT():48`,
  locale di `localStorage "isms.locale"` (`:8,30-37`).
- **Celah tipe:** `i18n/types.ts:6-15` `Dict` = 8 `Record<string,string>` →
  **key yang hilang di `en` bukan compile error**. Itu sebabnya sudah ada
  fallback `??` di `AlertBanner.tsx:172,177` dan `Notifikasi.tsx:171`.
  Tambahkan gate parity di `probe:render`.
- **String hardcoded di file yang saya audit (20 baris, 1 benar-benar Inggris):**
  - `Dashboard.tsx` — `:372` toast, `:508,509,512,520,525` teks kosong-target,
    `:653,667,679` title, `:757` aria, `:765,766,789` label, `:826` caption
  - `Monitoring.tsx` — `:142` fallback, `:169-171` header Excel
  - `AppShell.tsx` — `:507` aria, **`:600` `${n} offline` (bahasa Inggris di
    locale ID, di kedua cabang)**
  - `Notifikasi.tsx` — `:239-248` header Excel (isi berkas, bukan UI)
- **Lengkap (dari `todo.md` D1–D6, belum dikerjakan):** `i18n/status.ts`
  hanya 23 dari 54 nilai status; `utils/alerts.ts` (16 template `text:`) dan
  `utils/moduleAlerts.ts` (~25 string) tanpa `switch locale`;
  `utils/notifRead.ts:64-71` `relMinutes()` mem-parse token Indonesia;
  `monthAxis` bocor di `Absensi.tsx:333`, `pdfLayout.ts:75`, `data/index.ts:938`.

---

# Verifikasi

## Gerbang otomatis (wajib, tiap gelombang)
```bash
cd apps/web
npm run check     # tsc --noEmit + tsc -p tsconfig.scripts.json + probe:render + probe:pdf
```
- `probe:render` merender 28 halaman lewat `react-dom/server` — menangkap kelas
  bug TDZ yang lolos build (`README.md:114`)
- `probe:pdf` merakit dokumen dengan `compress:false` supaya **isi** stream bisa
  dibaca, bukan hanya bentuk berkasnya (`pdfLayout.ts:84`, `pdf-probe.ts:13`)
- **Belum ada satu pun file test** di repo → probe logika murni (`node --test`,
 sudah tercatat di `todo.md` bagian Verifikasi) layak ditambahkan untuk `niceScale`,
  `rowHighlightClass`, `splitHighlight`

## Yang TIDAK bisa diverifikasi tanpa browser
1. **Tampilan grafik vektor** — probe hanya bisa memastikan operasi gambar
   terjadi, bukan apakah tampilannya benar. Butuh cek mata.
2. **Kesesuaian panjang tabel** — wrap & page-break terlihat benar di teks tapi
   kolom sempit bisa membuat tabel balancer membosankan. Cek beberapa lebar.
3. **`blob()` di browser** — `pdf.output("blob")` pernah gagal di Safari
   lawas; pastikan ada fallback `dataUrl()`.
4. **Ukuran berkas** — raster PNG 2x mahal; vektor harus tetap di bawah ~2MB
   untuk laporan panjang.
5. **Item 1c** — highlight hanya terlihat di mode remote (`todo.md` A1).

## Checklist manual per modul (setelah tiap gelombang)
| Modul | Yang dicek |
|---|---|
| Dashboard | ekspor PDF → file berisi KPI + status + tren; **tanpa** jendela preview; 4 kartu → tab benar + semua baris berkedip |
| Analytics | ekspor PDF → 11 grafik ada, bulan berjalan di ujung kanan; Excel → sheet bulanan baru ada |
| Laporan | ekspor PDF di 3 mode → **tidak ada** baris terpotong, tidak ada input pencarian di dokumen, footer halaman benar |
| Report Proyek | ekspor PDF proyek → lengkap |
| Proyek | tombol Excel → "Detail" + modal; daftar equipment booking **Termasuk Terjadwal** |
| Keuangan | filter Tahun ada di 4 section; filter Hari di Laba Rugi/Neraca **hanya** mengembalikan 1 hari; layout periode rapi |
| Equipment | "Catat Servis" → modal catatan → baru status Selesai; `25:00` ditolak; booking bisa dibatalkan/diubah; tab Biaya punya filter |
| Subkontraktor | bayar termin tanpa invoice/BAST → ditolak; dengan keduanya → kwitansi terbit otomatis |
| SDM | lampiran cuti terlihat saat pending; setelah disetujui → surat persetujuan bisa dipratinjau & diunduh; surat HR bisa dipratinjau sebagai PDF |
| QC | drawing langsung tampil saat dibuka; bisa mengunggah berkas ke drawing lama |
| Dokumen | ikon mata → pratinjau; Unduh benar-benar turun; lampiran bisa dikosongkan |
| Inventori | angka `/notifikasi` cocok dengan badge Katalog per kategori |
| Semua | buka 20 modul, tidak ada `NaN`/`undefined` di layar |

---

# Risiko

| Risiko | Mitigasi |
|---|---|
| `PdfChart` salah skala → sumbu tidak mulai dari 0 atau tick tidak bulat | `niceScale` dipakai sendiri oleh semua jenis chart; probe mengecek tick |
| Migrasi 4 report sekaligus = diff besar sulit direview | Migrasi **satu per commit** di Gelombang 2 (G2.1 → G2.5), bukan satu commit besar |
| Menghapus html2canvas sedangkan simbol `exportPDF` masih dipakai tak terduga | Grep ulang `exportPDF|html2canvas|pdfExporting|chartAnim|data-export-hide` sebelum G2.6 |
| Tabel PDF sangat panjang melelahkan | Batas baris per tabel dengan catatan "… dan N baris lain"; set `stickyRowsCount` |
| Dokumen PDF jadi tidak sinkron dengan tampilan layar setelah ada perubahan UI | Justru sebaliknya: dokumen disusun dari **data**, bukan markup — perubahan tampilan tidak pernah membuat PDF basi |
| `probe:pdf` hanya menguji builder, tidak pernah interaksi DOM | Jangan menyimpulkan "PDF sudah benar" hanya karena probe hijau |

---

# Rollback

```bash
cd /srv/www/production/galangan
sudo git revert --no-edit <commit> && sudo git push origin main
# lalu ulangi blok deploy
```

`revert` lebih aman daripada `reset --hard` di VPS yang sudah berjalan. Satu
commit per sub-tugas (G2.1…G2.5, G3.1…G3.23) membuat rollback granular —
jangan menggabungkan seluruh gelombang dalam satu commit.