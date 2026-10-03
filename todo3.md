# TODO 3 — Revisi Client 2 Oktober: Sinkronisasi & Rewrite Modul PDF

Status: **dalam pengerjaan**. Referensi: `todo.md` (audit commit `1dd963a`),
`todo2.md` (revisi 02 September). Dokumen ini **menggantikan** sebagian
rencana `todo2.md` yang arahnya sudah berubah.

Audit: 5 auditor paralel read-only terhadap `apps/web` + `services/api` @ `1dd963a`.

## Yang sudah selesai

| Commit | Isi |
|---|---|
| `cfbab00` | Sinkronisasi: epoch merge, retry STALE, rate limit per user, pagination |
| `58d873e` | Quick wins UI: label status, monitoring, survey collapse, scroll-flush |
| `8909f39` | Seeder harga equipment/dock/booking/maintenance/inventory/settings |
| `bdb02e4` | Mesin PDF server: theme/font/measure/blocks/chart/document + probe geometri |
| `c90dcef` | Route `POST /api/pdf/render`, factory kwitansi, klien + hook FE |
| `e88b926`, `79b9882` | 13 factory dokumen resmi + registry tertutup |
| `7cf924f`, `3ef3fd0` | Migrasi 10 pemanggil transaksional ke server-side rendering |
| `9d6c00b` | Keselarasan entitas, snapshot model + cetak ulang, 3 pemanggil baru, 2 probe |
| `f8d9729` | Slip gaji: nama field yang sebenarnya ditulis aplikasi |
| `055d560` | Report factory server (laporan/analitik/rekap) + 4 pemanggil dimigrasikan |
| (batch ini) | PO/SPT/slip/HR ke field yang sebenarnya ditulis aplikasi; mesin PDF lama dihapus |

Belum selesai: item modul & fitur 2 Oktober (lihat bagian bawah).

---

## Keputusan yang dikunci (sudah dikonfirmasi client)

| # | Keputusan | Konsekuensi |
|---|---|---|
| 1 | **Mesin PDF di server** (`services/api/src/pdf/`) | FE kehilangan `jspdf` + `html2canvas`. Dokumen resmi dirakit dari DB server sehingga tidak bisa dipalsukan klien |
| 2 | **PDF tidak pernah menyentuh disk** | Yang disimpan adalah *model input* factory (bukan `blocks[]` yang tidak bisa diserialisasi) untuk audit + cetak ulang identik - lihat "Model penyimpanan" |
| 3 | **Font TTF di-embed** + CJK kondisional | Font belum ada di repo; sampai masuk, mesin jatuh ke standard-14 |
| 4 | **Sekaligus semua** | 1 branch, checkpoint per batch, hapus total metode lama |
| 5 | Online tanpa jeda; offline optimistic + flush otomatis | Tidak ada jeda buatan saat online |

---

# TEMUAN KRITIS 1 — Sinkronisasi: data hilang, bukan delay

Keluhan client: "jadwalkan maintenance berhasil POST tapi beberapa detik
kemudian datanya hilang; di device lain masuk. Harus force refresh + login
ulang. Status change gagal di perangkat saya tapi berhasil di device lain."

## Akar masalah (terverifikasi di kode)

```
t0  Masuk /equipment → useModuleSync menarik maintenances (store.tsx:1034)
t1  User submit → POST 201, baris masuk state, toast "berhasil" (store.tsx:1375-1384)
    ↑ markDirty TIDAK dipanggil → koleksi "bersih" → nol perlindungan
t2  GET yang berangkat di t0 selesai → store.tsx:1052 setData({...prev, ...pulled})
    ↑ pulled tidak punya baris itu → BARIS DIHAPUS, tanpa error, tanpa toast
t3  Persist effect menulis koleksi tanpa baris itu ke IndexedDB
```

| # | Lokasi | Defect |
|---|---|---|
| S1a | `store.tsx:1032` + `:1052` | Cek `dirty` **sebelum** fetch; apply **replace tanpa syarat** |
| S1b | `store.tsx:1268` | `if (dirtyRef.current.size === 0) return` **sebelum** mendaftarkan listener `online` + interval 45 dtk → queue offline tidak pernah terpasang selama sesi itu |
| S1c | `store.tsx:1199-1217` | Offline edit selalu mengirim `baseUpdatedAt` basi → 409 STALE → baris lokal ditimpa versi server → `clearDirty` tetap jalan → **edit hilang permanen tanpa retry** |
| S1d | `store.tsx:1434-1451` | `update()` **menelan 409 STALE**: revert baris lalu `return` (resolve normal) → `Equipment.tsx:1127` tetap toast sukses |
| S1e | `store.tsx:1168-1221` | Satu baris yang selalu ditolak membekukan **seluruh** koleksi dirty (tanpa skip per-baris, tanpa batas percobaan) → semua pull berikutnya dilewati → perangkat selamanya basi |
| S1f | `app.ts:41-45,183-190` | `WRITE_LIMIT=300/menit` per **IP** → semua perangkat di Wi-Fi galangan satu NAT berbagi bucket → satu antrean macet memblokir device lain |
| S1g | `crud.ts:261-262` + `repositories.ts:120-139` | `ORDER BY id ASC LIMIT/OFFSET` dengan id acak → saat ada insert di tengah paginasi, baris **hilang dan duplikat** tanpa error |
| S1h | `useModuleSync.ts:116-154` + `AppShell.tsx:375-391` | Tiap pindah rute memicu **dua** pull (batch modul + resync 55 koleksi); `runningRef` membuang sync yang overlap |
| S1i | `store.tsx:937-943` | `resync()` menelan kegagalan per-koleksi dengan `catch {}`; `acceptPull:712-716` menerima array kosong → bisa menghapus koleksi utuh |

## Perbaikan

| # | Perbaikan | Lokasi |
|---|---|---|
| S1a | **Epoch per koleksi** + merge per-baris saat apply. Baris lokal yang tidak dikenal pull (dibuat/rekaman setelah fetch mulai) tidak boleh dihapus | `store.tsx:1021-1062`, `928-1012` |
| S1b | Listener `online` + interval **selalu** terpasang; flush langsung saat reconnect & setelah login | `store.tsx:1266-1291` |
| S1c | STALE: ganti `baseUpdatedAt` dengan versi server lalu **retry**, tandai `attempts`; tidak hapus edit lokal | `store.tsx:1169-1217` |
| S1d | STALE di `update()`: retry 1× dengan base segar; kalau tetap konflik → **lempar** sehingga pemanggil menampilkan toast gagal | `store.tsx:1432-1452` |
| S1e | Skip per-baris + batas percobaan + backoff + hormati `Retry-After`; baris gagal keras diBuang dengan toast blocking | `store.tsx:1168-1236` |
| S1f | Rate limit **per user** (JWT sub), bukan per IP | `app.ts:41-45`, `rateLimit.ts` |
| S1g | Paginasi: urutkan `updated_at, id` + deteksi drift `total` + de-dup per halaman | `crud.ts:261-262`, `repositories.ts:120-139` |
| S1h | Tandai batch **sebelum** mulai (`inFlight`), batalkan pull ganda, antrekan 1 re-run | `useModuleSync.ts:116-154,190-217`, `AppShell.tsx:375-391` |
| S1i | `resync()` laporkan ke `publishFailed`; pull kosong tidak boleh menghapus koleksi yang punya baris | `store.tsx:937-943`, `712-716` |

**Jaminan UX:** online = write langsung tampil, tanpa pull tambahan setelah write
sukses, tanpa jeda. Offline = optimistic + badge "menunggu sinkron", flush otomatis
saat online lagi. Konflik = toast peringatan, bukan diam-diam overwrite.

---

# TEMUAN KRITIS 2 — PDF terpotong ada di mesin kita sendiri

## Akar masalah kwitansi terpotong

`pdfLayout.ts:406`:
```ts
const tx = this.marginMm + indentMm;        // selalu margin KIRI
this.pdf.text(line, tx, this.y, { align }); // align hanya menggeser anchor
```
`align:"right"` menganchor **tepi kanan** di margin kiri → teks mulai dari
x = 15 − 40 mm. **63% baris nominal tercetak di luar kertas.** Satu-satunya call
site `align:"right"` di repo adalah `pdfDocs.ts:544` — baris jumlah kwitansi.

| # | Lokasi | Defect |
|---|---|---|
| P1 | `pdfLayout.ts:406` | `align` menggeser anchor tanpa memindahkan `tx` |
| P2 | `pdfLayout.ts:200-210` | `wrap()` mengukur dengan font yang **sedang aktif**, bukan font yang akan menggambar (`:274`, `:344`, `:401`) |
| P3 | `pdfLayout.ts:190` | `need()` dicek sekali sebelum `newPage()`; blok lebih dari satu halaman digambar melewati margin bawah (`kv:273`, `table:348`, `signatures:432`) |
| P4 | `pdfLayout.ts:221,375,410` | Trailing gap 1.5–3 mm tidak pernah di-reserve; `kop()` reserve hardcode 24 mm padahal tinggi sebenarnya dihitung dari wrap |
| P5 | `pdfLayout.ts:255,260,279,421,449` | Primitive yang melewati `wrap()` bisa meluber horizontal (label `kv`, nilai `paraKV`, `title`, nama tanda tangan) |
| P6 | `pdf-probe.ts` | Tidak pernah memeriksa **koordinat** — probe hijau padahal kwitansi tercetak keluar kertas |
| P7 | `Analytics.tsx:1505-1523` | Gridline `#e9eff4` kontras 1,06:1 → hilang total di JPEG; `axisLine={false}` |

---

# ARSITEKTUR PDF BARU — server-side, dua fase

```
services/api/
├── assets/fonts/*.ttf          ← subset hasil pyftsubset (~25 KB/weight)
├── src/pdf/
│   ├── theme.ts                token: halaman, margin, palet, skala tipografi, spasi
│   ├── font.ts                 registri font (VFS + metrik), subset default, CJK kondisional
│   ├── measure.ts              ukur teks dengan (font,size) EKSPLISIT + cache + pemotong token
│   ├── blocks.ts               heading · paragraph · keyValue · table · callout · divider
│   │                           bullets · image · signatures (atomik) · chart
│   ├── chart.ts                vektor: bar · groupedBar · stackedBar · line · area · combo
│   │                           donut · hbar · pareto · sparkline · heatmap
│   ├── document.ts             blocks → ukur → paginasikan → gambar; furnish header/footer
│   ├── overflow.ts             guard: tak ada tinta di luar content box
│   └── documents/*.ts          satu factory per dokumen (data → blocks), tanpa DOM
├── src/routes/pdf.ts           POST /api/pdf/render · GET /api/pdf/:id[/print] · usage
└── migrations/007_pdfdocs.sql
```

## Aturan emas

1. **Tidak ada yang digambar sebelum halamannya diketahui.** Fase 1 ukur semua blok
   pada lebar final; fase 2 paginasikan; fase 3 gambar.
2. **Pengukuran eksplisit** — `measure(text, font, size)`. Tidak bergantung pada
   state font (P2).
3. **Koordinat absolut dari kotak kolom** — tidak ada string `align` (P1).
4. **Blok hanya terpotong bila dideklarasikan splittable.** Baris tabel atomik;
   tabel splittable dengan header berulang; tanda tangan atomik.
5. **Table two-pass** — ukur semua tinggi baris → partisi → gambar.
6. **Token panjang dipecah**, tidak pernah meluber.
7. **Chart = warga layout** — punya kotak eksplisit, vektor, tanpa raster kecuali
   gambar/foto.
8. **Guard di setiap `draw()`** — `margin ≤ x`, `x+w ≤ pageW-margin`,
   `y ≤ pageH-margin`. Melanggar = throw di dev & probe.
9. **PdfDoc tidak pernah melihat DOM.**

## Model penyimpanan (tanpa ledakan storage)

Server **tidak** menyimpan PDF, dan **tidak** menyimpan `blocks[]` juga -
`blocks[]` berisi closure `plan()`/`draw()`, jadi tidak bisa diserialisasi tanpa
menjadi dokumen yang tidak lagi bisa dirakit ulang. Yang disimpan adalah
**model input factory** setelah server membaca barisnya sendiri.

Implementasinya (`pdf/registry.ts`): tiap recipe dipecah dua tahap.

| Tahap | Fungsi | Hasil |
|---|---|---|
| 1 | `prepare(id, ctx)` | input factory: nomor, nama, nominal, item, tanggal - JSON biasa |
| 2 | `assemble(model, ctx)` | `Document` (blok + geometri), tanpa menyentuh DB |

Cetakan pertama: `prepare` → simpan model ke `pdfDocs` → `assemble`.
Cetak ulang: `assemble` dari model tersimpan, **`prepare` tidak dijalankan lagi**.

Konsekuensi yang dibayar dengan sengaja: kalau baris kwitansi dikoreksi setelah
dicetak, cetakan ulang tetap berisi nominal yang benar-benar dibayarkan waktu itu,
dan `prepare` ulang (render dari data terbaru) tetap tersedia untuk dokumen yang
sudah dikoreksi - dua hal yang tidak bisa dibedakan tanpa menyimpan model.

| | Simpan PDF | Simpan model input |
|---|---|---|
| Ukuran | 60-480 KB/dokumen | **2-15 KB/dokumen** |
| Cetak ulang | perlu file | identik dengan cetakan pertama |
| Jejak audit | file mengambang | query-able: siapa cetak apa, kapan, dari entitas mana, berisi apa |
| Storage/tahun | **~5 GB di disk** | **~50-120 MB di DB** |

- **Report** (Dashboard/Analytics/Laporan/Payroll/Proyek): tanpa snapshot, hanya
  baris audit berisi `filters` + hash -> **0 byte tersimpan**.
- **Dokumen resmi**: tabel `pdfDocs` = `id` + `kind` + `entity_field` +
  `entity_id` + `locale` + `branch` + `model` + `pages` + `bytes` + `engine` +
  `font` + `actor` + `created_at` (migrasi `007_pdf_docs.sql`).

### Keputusan DB

- `007_pdf_docs.sql`: `pdfDocs.model` = `TEXT`. Bentuknya berbeda per jenis
  dokumen (kwitansi punya `breakdown`, surat jalan punya `sj*`), jadi kolom JSON
  berskema akan memaksa semua factory memakai satu bentuk yang salah.
- **BELUM dikerjakan**: menaikkan `documents.data` ke `MEDIUMTEXT`. MySQL
  `TEXT` = 65.535 byte, jadi `documents.data` yang besar akan terpotong di
  MySQL. `ALTER TABLE ... MODIFY` tidak portabel SQLite, jadi butuh cabang
  per-dialek di `migrate.ts` - tidak diambil dengan jalan pintas di sini.

## Pipa font

1. **TTF di-embed bila ada** di `services/api/assets/fonts/` (`regular.ttf`,
   `bold.ttf`, `italic.ttf`). Tanpa file itu mesin jatuh ke standard-14 dengan
   peta karakter di luar WinAnsi.
2. Pendaftaran font **diulang per instance `jsPDF`**. Versi pertama menyimpan
   hasil registrasi di modul-global, sehingga dokumen kedua dan seterusnya
   memakai nama font yang tidak ada di instance-nya - semua teks jatuh ke
   Helvetica tanpa satu pun galat (lihat `font.ts`).
3. Font TTF **belum ada di repo**. Sampai file-nya masuk, dokumen resmi
    - butiran huruf Mandarin dan simbol non-Latin akan tetap kotak kosong.
4. CJK kondisional - `font.ts` mendeteksi codepoint CJK; tidak ada -> subset
   kecil; ada -> tambahkan font CJK penuh ke dokumen itu saja.

## Kontrak API

```
POST /api/pdf/render            { kind, id, locale? }
  -> 200 application/pdf (stream)
     header X-Doc-Kind, X-Doc-Pages, X-Doc-Embedded-Font, X-Doc-Model-Id
GET  /api/pdf/render/:modelId   -> PDF dari model tersimpan (cetak ulang, bukan regenerate)
GET  /api/pdf/kinds             -> daftar kind yang didukung
```

Server **tidak** menerima payload bebas - `kind` enum tertutup + `id` entitas,
server memuat sendiri dari DB.

`GET /api/pdf/:id/print` (rencana) menjadi `GET /api/pdf/render/:modelId`:
kuncinya adalah id snapshot, bukan id entitas, karena dua cetakan atas satu
entitas boleh berbeda isinya.

---

# DAFTAR DOKUMEN

| Dokumen | Format | Sumber data | Pemanggil sekarang |
|---|---|---|---|
| Dashboard | laporan | `reportDashboard.ts` (baru) | `Dashboard.tsx:369` |
| Analytics | laporan | `reportAnalytics.ts` (baru) | `Analytics.tsx:796` |
| Laporan | laporan | `reportLaporan.ts` (baru) | `Laporan.tsx:377` |
| Laporan Proyek | laporan | agregat proyek | `ReportSection.tsx:91` |
| Rekap Payroll · THR | laporan | `payroll` | baru |
| PO | transaksi | `purchaseOrders` | `Procurement.tsx:894` |
| Kop Penawaran | transaksi | `quotations` | `QuotationDetail.tsx:236` |
| Delivery Order | transaksi | `movements` | `Inventory.tsx:509` |
| Surat Jalan · Tanda Terima | transaksi | `movements` | `Inventory.tsx:2541,2615` |
| Slip Gaji | transaksi | `payroll` | `Payroll.tsx:882` |
| Transmittal | transaksi | `drawings` | `QCSafety.tsx:936` |
| SPT | transaksi | `taxPeriods` + `journals` | `Finance.tsx:2386` |
| Surat HR | transaksi | `letters` | `HR.tsx:1054` |
| Kwitansi | transaksi | `termins` | `Subcontractor.tsx:582` |
| Surat Persetujuan Cuti | transaksi | `leaves` + `employees` | baru |
| Berita Persetujuan PO | transaksi | `purchaseOrders` | baru |
| SPK | transaksi | `workOrders` | baru |
| BAST | transaksi | `bast` | baru |

## Refactor paksa: agregat keluar dari komponen

Agregat harus hidup di modul murni agar bisa dipakai server (pola yang sudah
dipakai `seedMirror.ts:10-13`):

| Dari | Ke |
|---|---|
| `Analytics.tsx:219-467` | `src/data/reportAnalytics.ts` |
| `Dashboard.tsx:207-310` | `src/data/reportDashboard.ts` |
| `Laporan.tsx:441-762` | `src/data/reportLaporan.ts` |
| `utils/projectCost.ts`, `monthAxis.ts`, `format.ts`, `alerts.ts`, `moduleAlerts.ts`, `financeExcel.ts` | sudah murni ✓ |

## Yang dihapus

`src/utils/pdfLayout.ts` · `src/utils/pdfDocs.ts` ·
`exportPDF`/`planSlices`/`findCleanCutY`/`svgToImg`/`chartAnim`/`pdfExporting`
(`export.ts:86-429`) · blok print `Analytics.tsx:1468-1625` · state `pdfMode`
`Dashboard.tsx:173,357-374` · `data-export-hide` · `scripts/pdf-probe.ts`
(diganti probe server) · `isAnimationActive={chartAnim()}` · dependency FE
`jspdf` + `html2canvas`

---

# ITEM MODUL PER REVISI 2 OKTOBER

| # | Item | Status awal | Batch |
|---|---|---|---|
| 1c | Highlight dari kartu dashboard ke 10 modul (hanya 3 modul baca `?highlight=`) | parsial | 5 |
| 2 | CRM: deskripsi survei expand & collapse | parsial (`long &&` guard, `.slice(-3)`, label hardcoded) | 2 |
| 3 | Dashboard PDF regenerate | html2canvas | 4 |
| 4 | Finance: tanggal historikal di Kas&Bank, Buku Besar, Neraca, Laba Rugi | belum | 5 |
| 5a | Label "Tertunda" di card analisis status proyek berjalan | belum | 2 |
| 5b | Dokumen & Laporan: **hapus auto-preview**, ikon view → **modal pop up** + download | perlu dibalik | 5 |
| 5c | Tombol Excel → **Detail** + modal | belum | 5 |
| 5d | Tab baru: list equipment di-booking + dipakai untuk service | parsial | 6 |
| 5e | Sub-tipe dokumen + link ke Sertifikat QC | belum | 6 |
| 5 | Monitoring: "hanya perhatian" → "proyek butuh perhatian" | belum (`n_prj.ts:567`) | 2 |
| 6 | Drydock: card mapping slot **grafis** (jumlah slot & kapal per area) | belum | 6 |
| 7 | Inventory: tombol status `[jumlah][status]` → dropdown kategori | belum | 6 |
| 8a | Equipment: "catat servis" → modal catatan | belum (`Equipment.tsx:1888`) | 5 |
| 8b | 24H strict **semua browser & semua modul** | parsial | 5 |
| 8c | Booking history di tab Alokasi; card Riwayat pindah dari Biaya | belum | 6 |
| 8d | Biaya per Proyek: tombol Detail | belum | 6 |
| 9a | Kwitansi PDF terpotong | **root cause P1** | 4 |
| 9b | Requirement BAST, invoice, bukti bayar | belum (`Subcontractor.tsx:629`) | 5 |
| 10 | QC Drawing: ikon view → modal pop up | perlu dibalik | 5 |
| 11 | HR cuti: preview tetap otomatis, pending **terbuka**, surat persetujuan | sebagian | 5 |
| 12 | HR surat: generate + preview PDF | belum (`<pre>` teks) | 4/5 |
| 12 | Dokumen: **hapus kolom pratinjau**, pratinjau hanya di aksi | belum | 5 |
| 13 | Analytics: Excel lengkap + PDF tidak terpotong + garis bold | sebagian | 4 |
| 14 | Laporan: generate tampilan PDF baru | html2canvas | 4 |
| ETC | Seeder harga 0 → nilai | belum | 3 |

---

# URUTAN EKSEKUSI

| Batch | Isi | Alasan urutan |
|---|---|---|
| **1** | S1a–S1i sinkronisasi | Kerugian data, paling tinggi karena kecil & terukur |
| **2** | Quick wins (label, i18n, CRM survey, scrollbar, Finance tanggal) | Murah, langsung terlihat client |
| **3** | Seeder harga + `seed:mirror` | Harus **sebelum** PDF diregenerate, kalau tidak PDF mengabadikan Rp 0 |
| **4** | Rewrite PDF server-side + 15 dokumen + hapus html2canvas | dependensi Batch 3 |
| **5** | Item modul (modal pratinjau, detail, termin, QC, HR, 24H) | butuh PDF baru untuk preview |
| **6** | Fitur baru (sub-tipe, drydock grafis, status inventori, booking history) | tidak bergantung Batch 4 |

---

# VERIFIKASI

| Batch | Gerbang |
|---|---|
| 1 | `apps/web npm run check` + `services/api npm run build` + test logika merge/epoch |
| 2 | `npm run check` |
| 3 | `seed:mirror` + `npm run seed` + cek invarian (totalPrice, grandTotal, PO↔AP) |
| 4 | probe server `npm run probe:pdf` — **geometri** (semua tinta dalam content box) + **isi** + **struktur** (header berulang, blok taller dari halaman) + font ter-embed |
| 5–6 | `npm run check` + probe |

## Yang tidak bisa dibuktikan tanpa browser
Tampilan grafik vektor, kontras garis di layar, perilaku `DocumentPreviewModal`
setelah pindah, dan unduhan di Safari.

---

# RISIKO

| Risiko | Mitigasi |
|---|---|
| Batch 4 diff sangat besar | 11 checkpoint di satu branch; commit sebelum delivery selalu tersedia untuk `git revert` |
| Ekstraksi agregat menyentuh halaman besar | Modul murni terpisah JSX; `tsc` + `probe:render` menangkap regresi |
| Font subset mungkin tak mencakup semua karakter | Deteksi CJK kondisional + glyph fallback dicatat; ukuran final diukur setelah aset diunduh |
| `documents.data` TEXT→MEDIUMTEXT menyentuh 112 tabel | Satu migrasi idempoten (`IF NOT EXISTS`/`MODIFY`) |
| Rate limit per user butuh identitas di limiter | JWT sudah membawa sub; `rateLimit.ts` diberi keyFn |
| Perubahan harga bergerak pada semua angka (HPP, margin, ABC, nilai stok) | Angka & dampaknya diidakuahkan di commit message; invarian diuji |