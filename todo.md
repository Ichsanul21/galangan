# TODO — Perbaikan Sistem ISMS Galangan

Status: **belum dikerjakan.** File ini hanya catatan rencana.

Commit yang diaudit: `1dd963a` — sudah ter-deploy ke VPS `galangan.alk-tech.my.id`
Metode: 4 auditor paralel, read-only, terhadap `apps/web` @ `1dd963a` (working tree bersih)

---

## Ringkasan status per requirement

| Req | Status | Catatan |
|---|---|---|
| 1b Scrollbar di ujung kanan card | ✅ PASS | 5 call site jalan; 2 container saudara terlewat |
| 2 Analytics crash | ⚠️ PASS, belum bisa ditutup | Guard benar; klaim root cause perlu konfirmasi |
| 3 Kartu Dashboard | ❌ 3 bug dari commit sendiri | Fase A |
| 4 Direct preview | ⚠️ 3 cacat | Fase B + E |
| 1a State antar modul | ❌ 3 engine alert berbeda | Fase C |
| 1c Terminology ID | ❌ 23 dari 54 status kosong | Fase D |

---

## Fase A — Bug dari commit `1dd963a` (kirim ulang pertama)

### A1. Flash "Perlu Perhatian" di `/notifikasi` salah timing
- **File:** `src/pages/notifikasi/Notifikasi.tsx:219-236`
- **Penyebab:** `return () => clearTimeout(timer)` membatalkan timer sendiri,
  sementara `flashDoneRef` sudah di-set, jadi run berikutnya return awal.
  `items` ada di deps, dan `AppShell.tsx:364` trigger `resync()` tiap pindah
  route sehingga `items` berubah dan efek jalan ulang.
- **Dampak:** resync < 250ms → highlight tidak pernah muncul.
  resync > 250ms → highlight muncul tapi **tidak pernah hilang** (timer
  clear-nya yang dibatalkan). Di mode lokal kebetulan jalan karena
  `resync()` numbok di `remoteActive() === false`.
- **Perbaikan:** lepas pembatalan timer dari cleanup. Jadikan idempoten
  dengan benar: satu latch per URL, timer di-clear hanya saat unmount.
- **Verifikasi:** probe logika murni (lihat bagian Verifikasi) + cek manual
  di VPS mode remote.

### A2. Deep-link highlight mati di `npm run dev` (StrictMode)
- **File:** `src/components/useDeepLink.ts:75,87-88,96`
- **Penyebab:** `doneKey` di-set sebelum `setTimeout`, cleanup
  `clearTimeout`, run kedua kena latch sehingga `resolve` tidak pernah jalan.
  `main.tsx:75` memakai `React.StrictMode` yang memanggil efek dua kali saat dev.
- **Dampak:** produksi aman karena StrictMode dev-only, tapi seluruh kelas
  bug begini lolos ke produksi karena tidak pernah terlihat saat dev.
- **Perbaikan:** pakai ref kunci **id-set** (bukan `${tab}|${highlight}`).
  Timer di-clear saat unmount saja, bukan tiap re-run.
- **Verifikasi:** probe logika murni.

### A3. Kartu "Piutang Tertagih" tidak menyorot apa-apa di luar Samarinda
- **File:** `src/pages/Dashboard.tsx:221` vs `src/pages/keuangan/Finance.tsx:645-656`
- **Penyebab:** Dashboard pakai `inBranch(data.invoices)` yang jadi no-op karena
  invoice tidak punya field `branch`. Finance memfilter branch lewat project.
- **Dampak:** tab benar, 0 baris disorot, tapi kartu tetap menampilkan jumlah penuh.
- **Perbaikan:** satu predicate bersama di `src/utils/scope.ts`
  (mis. `branchVisibleInvoices(data, branch)`), dipanggil dua file.
  `CRM.tsx:179` dan `QCSafety.tsx:126` aman secara tidak sengaja (tab tidak
  difilter) — dokumentasikan, jangan biarkan aman kebetulan.
- **Verifikasi:** probe predicate murni dengan beberapa cabang.

---

## Fase B — perbaikan kecil prasyarat A

### B1. Warning `looksLikeUrl` saat unggah BoQ
- **File:** `src/pages/proyek/BoQSection.tsx:178` (simpan), `:511` (preview)
- **Ketidakkonsistenan:** Proyek (`ProjectDetail.tsx:1927-1931`) dan Dokumen
  (`Documents.tsx:662-669`) sudah punya gate + penjelasan, BoQ tidak.
  Ketik `kontrak.pdf` → tersimpan sebagai `fileUrl` → `docAttachment` menolak
  → kolom tampil `-` selamanya tanpa pesan.
- **Perbaikan:** pakai helper `attachFields` yang sudah ada di `Documents.tsx`.

### B2. Warning `looksLikeUrl` saat unggah QC Drawing
- **File:** `src/pages/qc/QCSafety.tsx:2240-2241` (preview), `:892` (simpan)
- **Perbaikan:** sama seperti B1.

### B3. Tombol eye di daftar "Sertifikat perlu perhatian"
- **File:** `src/pages/qc/QCSafety.tsx:1732,1742`
- **Ketidakkonsistenan:** baca `c.fileUrl` mentah, bukan `docUrlOf(c)`, dan
  tombol eye disembunyikan saat kosong. Padahal kartu per-kapal tepat di bawahnya
  melakukan sebaliknya, sehingga daftar ini tidak punya affordance apa pun.
- **Perbaikan:** samakan dengan `:1792`.

### B4. Badge "Baru diunggah" tidak bisa dihapus
- **File:** `src/pages/proyek/ProjectDetail.tsx:1375,1378` dan `:1390`
- **Penyebab:** badge berpacu `lastUploadedId`, tapi satu-satunya jalur reset
  (ikon mata) ada di dalam cabang `url !== ""`.
- **Perbaikan:** guard badge dengan `isNew && url !== ""`.

### B5. `docBaseName` tidak pernah mengembalikan `""`
- **File:** `src/pages/proyek/ProjectDetail.tsx:85`
- **Dampak:** baris `:1379` selalu mencetak `· lampiran: <judul dokumen>`
  walau dokumen tidak punya lampiran.
- **Perbaikan:** kembalikan `""`, biarkan pemanggil memutuskan.

### B6. Lampiran tidak bisa dikosongkan di Dokumen
- **File:** `src/pages/dokumen/Documents.tsx:127`
- **Penyebab:** `attachFields("")` menghasilkan `{}`, jadi mengosongkan field lalu
  simpan diam-diam mempertahankan URL lama.
- **Perbaikan:** kirim `fileUrl: ""` eksplisit saat input dikosongkan.

### B7. Upload format tak didukung → celah kosong senyap
- **File:** `src/components/DocumentPreview.tsx:303` (`unsupported` → `null`)
- **Dampak:** `FileUploadButton` default menerima `.xlsx/.xls` (`ui.tsx:1422`).
  Unggah xlsx → `isOpen` true tapi tidak ada yang tergambar → terbaca
  "preview rusak".
- **Perbaikan:** tampilkan pesan jujur, seperti `DocumentPreviewPanel:196`.

### B8. `.catch` hilang di pemanggil `openFileUrl`
- **File:** `src/pages/keuangan/Finance.tsx:2735,2737,2738` — `void openProof(...)`
- **Dampak:** `FileHttpError` jadi unhandled rejection tanpa toast.
- **Perbaikan:** pakai `AsyncButton` atau tambahkan `.catch` + toast.

---

## Fase C — satu sumber kebenaran alert (akar req 1a + 3)

### C1. Angka "Perlu Perhatian (N)" bohong
- **File:** `src/pages/Dashboard.tsx:432` vs `src/pages/notifikasi/Notifikasi.tsx:115`
- **Faktanya:**

  ```
  Dashboard  : buildModuleAlertItems()  -> per-baris, tanpa batas  -> ~70
  Notifikasi : computeAlerts()          -> agregat / capped       -> ~18
  ```

  Kartu bilang 70, halaman tujuan menyorot 18.
- **Perbaikan:** angka kartu dihitung dari list yang **benar-benar** disorot.

### C2. Tiga engine alert berbeda, ditampilkan berdampingan
- `src/utils/alerts.ts` → lonceng + `/notifikasi` (agregat, capped)
- `src/utils/moduleAlerts.ts` → banner modul + sidebar (per-baris)
- `src/utils/inventoryWarn.ts` `warnLevelOf` → badge stok
- Deviasi yang terbukti deterministik:
  - QC: `alerts.ts:94,98` selalu 2 baris, sedangkan `buildQc` =
    semua NCR terbuka + semua insiden
  - Keuangan: `alerts.ts:83` capped 5 invoice, `buildKeuangan:219` semua
  - Stok: `alerts.ts:64` memakai `stock <= minStock` mentah, mengabaikan
    `minStockByWarehouse` dan pengecualian Service/Jasa yang sengaja
    dikendalikan `inventoryWarn`
  - **Sertifikat `YYYY-MM`: `alerts.ts:134` menghitung akhir bulan,
    `moduleAlerts.ts:45` menghitung awal bulan → selisih sampai 30 hari**
- **Perbaikan arah:** jadikan `moduleAlerts` satu-satunya engine, lalu
  `alerts.ts` menjadi **tampilan agregat di atas** `buildModuleAlertItems`,
  bukan engine terpisah. Satu `daysUntil` bersama dengan aturan `YYYY-MM` sama.
- **Catatan:** 6 modul (crm, procurement, subkontraktor, equipment, payroll,
  dokumen) punya banner-only yang **tidak terlihat** di lonceng maupun
  `/notifikasi`.

### C3. Lonceng dan sidebar pakai dua read-model terpisah
- **File:** `src/layouts/AppShell.tsx:142-151` vs `:170-181`
- **Dampak:** namespace id berbeda (`alert-*` vs `mod-*`), persistensi berbeda
  (`isms.notifRead` vs `isms.modSeen`). Buka `/dokumen` → badge sidebar nol tapi
  lonceng masih merah, atau sebaliknya.
- **Perbaikan:** satu set id dan satu tempat simpan.

### C4. `computeAlerts` dihitung 4x per perubahan data
- **File:** `AppShell.tsx:139`, `:173`, `Dashboard.tsx:432`, `Notifikasi.tsx:115`
- Rule #7 (konflik dock) O(n²) di `alerts.ts:102` **dan** `moduleAlerts.ts:83`.
  `buildProyek` menjalankan seluruh engine 11-rule hanya untuk memfilter
  `/proyek*`, bertentangan dengan komentar `moduleAlerts.ts:4-5`.
- **Perbaikan:** memoize di provider, atau hitung sekali lalu dibagi ke semua.

---

## Fase D — terminologi Bahasa Indonesia

### D1. `src/i18n/status.ts` hanya menutup 23 dari 54 nilai status
- Nilai tanpa padanan ID → tampil mentah dalam mode EN.
- Nilai EN yang ada di data tapi tanpa padanan ID → tampil Inggris di mode ID:
  `Scheduled`, `Posted`, `Completed`, `In Progress`, `Pending`, `Approved`, `Done`.
- `statusTone` (`ui.tsx:225`) punya key `"Expired"` — peta nada mengenal nilai
  Inggris yang tidak bisa diterjemahkan `statusLabel`.

### D2. Seluruh layer notifikasi tanpa switch locale
- `src/utils/alerts.ts` (16 template `text:`) dan `src/utils/moduleAlerts.ts`
  (~25 string) adalah Indonesia mentah, dirender apa adanya di
  `AppShell.tsx:649`, `AlertBanner.tsx:157`, `Notifikasi.tsx:118-129`.
- `data.activities[].action/time` (`data/index.ts:702+`) juga mentah.
- **`src/utils/notifRead.ts:64-71` `relMinutes()` mem-parsing token Indonesia**
  (`menit|jam|hari|kemarin|baru saja`) untuk pengelompokan hari di `/notifikasi`,
  jadi pengelompokan terkunci ke bahasa Indonesia.

### D3. String campuran di dalam kamus ID
- `n_eqp.ts:340 "Hampir Expire"` · `:85 "Kalibrasi Expired"` ·
  `:230 "Expire <=90 hari"` · `:242 "Asuransi expired"`
- `n_dry.ts:202 "Segera expire - dalam {n} hari"`
- `n_qc.ts:110` · `:111` · `:313 "Sertifikat Segera Expire"`
- `QCSafety.tsx:1785` hardcode `"Hampir Expire"`, sementara `:1719` sudah
  benar di balik `locale`
- `AppShell.tsx:600` — cabang `locale === "en"` dan `"id"` **identik**

### D4. Sekitar 30 string Inggris di JSX yang tidak di balik `locale`
Prioritas komponen bersama dulu karena bocor ke seluruh aplikasi:
- `ui.tsx:554` `aria-label="Navigasi tab"` · `:778` `"Tutup"` (semua Modal) ·
  `:1097` dan `:1212` `"Baris per halaman"` (semua tabel)
- `main.tsx:90-123` — 24x `"... gagal dimuat"`
- `AppShell.tsx:507` `"Menu"`

### D5. String Indonesia hardcode yang melewati `locale` (sekitar 25 situs)
Membuat locale EN rusak. Daftar lengkap ada di hasil audit.

### D6. `monthAxis` bocor di 3 tempat
- `Absensi.tsx:333` mendeklarasi ulang daftar bulan EN secara inline,
  bertentangan dengan kontrak `monthAxis.ts:28-29`
- `pdfLayout.ts:75` punya array nama bulan penuh sendiri
- `data/index.ts:938` `M12` — seed data, masih ejaan ketiga yang seharusnya
  dihapus oleh `007b686`

---

## E — Sertifikat & lampiran seed (keputusan: lengkapi form + tambah seed)

### E1. Form Sertifikat tidak punya field berkas
- **File:** `src/pages/kapal/VesselDetail.tsx:174` (`saveCert` hanya menyimpan
  `{name, issued, expires}`)
- **Dampak:** cabang pratinjau di `src/pages/qc/QCSafety.tsx:1809-1812` adalah
  **dead code** — selalu menampilkan "Belum ada file sertifikat - hubungi QA."
- **Perbaikan:** tambah input unggah → tulis `fileUrl` → dibaca `docUrlOf(c)`
  (sudah dipakai di `:1792`).

### E2. Dokumen seed tidak punya lampiran sama sekali
- **File:** `src/data/seeds.ts:319-330` (12 dokumen),
  `src/data/index.ts:915-928` (6 item BoQ)
- **Dampak:** kolom Pratinjau `"-"`, jadi tombol Pratinjau + Unduh **tidak ada**
  untuk 100% baris yang sudah ada. Keluhan "tombolnya tidak berfungsi" masih
  secara harfiah benar untuk data lama; fix hanya berlaku untuk unggahan baru.
- **Perbaikan:** tambahkan `fileUrl` contoh pada sebagian dokumen dan item BoQ.
- **Ketentuan:** URL harus benar-benar ada di `services/api/data/uploads/`
  supaya tidak jadi 404 (dan pesan 404-nya jujur).

### E3. `useModuleAlert` menandai "seen" di setiap mount
- **File:** `src/components/AlertBanner.tsx:115-123`
- Ketidakkonsistenan dengan komentar `:1-3` yang mengklaim banner "muncul selama
  kondisi ada".

---

## F — Scrollbar (req 1b) sisanya

### F1. Dua container saudara terlewat
- `src/pages/laporan/Laporan.tsx:524`
- `src/pages/keuangan/Finance.tsx:2671` dan `:3968`
- Geometri identik dengan saudaranya yang sudah diperbaiki
  (`Card p-4` + `px-5 pb-5 pr-4`) tapi **tanpa** `scroll-flush`.

### F2. `scrollbar-gutter` belum merata
- Hanya ada di `AlertBanner.tsx:150`. Lonceng (`AppShell.tsx:633`) dan
  `/notifikasi` (`Notifikasi.tsx:337`) tidak punya → klik "tampilkan semua"
  memunculkan scrollbar dan re-wrap semua baris sekitar 15px.
- Perbaikan termurah: pindahkan deklarasi ke dalam kelas utilitas.

---

## Verifikasi — probe logika murni (keputusan)

Tambah test untuk logika yang bisa dibuktikan tanpa browser. Repo ini **belum
punya satu pun file test**.

Runner: `node --test` (bawaan Node 22, tanpa dependency baru), disisipkan ke
`npm run check` supaya gate deploy otomatis menangkap regresi.

| Target | File | Yang diuji |
|---|---|---|
| `splitHighlight` | `components/useDeepLink.ts` | id tunggal, banyak id, duplikat, kosong, spasi berlebih |
| `rowHighlightClass` | `components/rowHighlight.ts` | `.notif-hl` selalu ikut; kelompok vs tunggal; tabel vs kartu |
| `looksLikeUrl`, `docAttachment` | `utils/docAttachment.ts` | URL skema, path relatif, nama berkas polos ditolak, `YYYY-MM` bukan URL |
| `acceptPull` | `data/store.tsx` | tolak kosong untuk `settings`, terima untuk koleksi operasional |
| `daysUntil` | `utils/alerts.ts` + `utils/moduleAlerts.ts` | **sertifikat `YYYY-MM` harus sama di kedua engine** (deviasi 30 hari) |
| `pctChange`, `numOf` | `utils/series.ts` | pembagi nol, NaN, seri kosong |
| latch A1/A2 | logikareducer yang diekstrak | satu latch per URL; cleanup tidak membatalkan timer sendiri |

---

## Tidak bisa diverifikasi tanpa browser — perlu cek manual di VPS

1. **Apakah grafik PDF Analytics benar-benar tergambar.** Mekanismenya pasti
   (`animationDuration: 400/1500`, `isAnimationActive` aktif), tapi seberapa jauh
   animasi berjalan saat html2canvas memotret bergantung pada frame timing,
   font, dan kecepatan mesin. `probe:pdf` hanya menguji builder `utils/pdfDocs`,
   **tidak pernah** menyentuh jalur DOM.
2. **Apakah html2canvas menemukan `#analytics-pdf` yang sudah ter-layout.**
   `browser-shims.ts:74` `getElementById` mengembalikan `null` dan
   `ResizeObserver` no-op, jadi probe tidak bisa menjawab ini.
3. **Apakah symptom Analytics asli bisa direproduksi.** `revenueSeries`,
   `marginSeries`, `inspectionTrend` adalah literal 12-elemen hardcode di
   `data/index.ts`, jadi cerita "seed fallback kosong" **tidak mungkin terjadi**
   dari tiga array itu. Guard yang dipasang benar, tapi klaim root cause di
   commit message kemungkinan salah. Perlu reproduksi asli sebelum ditutup.
4. **Jalur `settings` terpakai** — butuh API hidup untuk menghapus baris.
5. **Fase A1 di mode remote** — di mode lokal kebetulan jalan.

---

## Checklist manual per modul (setelah Fase A dan B terkirim)

| Modul | Yang dicek |
|---|---|
| Analytics | buka, pindah 5 tab, tidak blank; ekspor PDF → buka filenya, grafik ada |
| Dashboard | 4 kartu → tab benar + semua baris berkedip; angka "Perlu Perhatian" cocok dengan jumlah baris yang disorot |
| Keuangan | kartu "Piutang Tertagih" dengan cabang bukan Samarinda → baris tetap disorot |
| Notifikasi | dari kartu Dashboard → semua baris alert berkedip **lalu hilang sendiri** setelah sekitar 3 detik |
| Dokumen | ikon mata → pratinjau langsung tanpa tombol kedua; Unduh benar-benar turun |
| BoQ | ikon mata → pratinjau; ketik nama berkas polos → muncul peringatan, bukan kolom kosong |
| QC Drawing | pratinjau inline + Unduh; ketik nama berkas polos → peringatan |
| QC Sertifikat | ikon mata → pratinjau inline tanpa popup; form Sertifikat bisa unggah file lalu bisa dipratinjau |
| Proyek | unggah → pratinjau inline dan bisa ditutup; badge "Baru diunggah" hilang setelah ditutup |
| Semua | buka 20 modul, tidak ada `NaN` atau `undefined` di layar |

---

## Catatan root cause yang perlu dikonfirmasi

Commit `1dd963a` menyatakan `lastRevPoint.bln` sebagai penyebab crash fatal.
Audit menemukan itu **sudah dijaga dengan benar** tetapi **tidak bisa memicu**
dari `revenueSeries`/`marginSeries`/`inspectionTrend` yang isinya hardcode
12 elemen. Kemungkinan yang sebenarnya:

- `ErrorBoundary` tidak pernah reset, jadi satu galat mengunci pola rute
  berikutnya. Ini menjelaskan "modul lain ikut crash", dan **sudah** diperbaiki.
- `resyncCollections` menghapus `settings`, jadi semua modul membaca default.
  Ini menjelaskan "data hilang", dan **sudah** diperbaiki.

Keduanya sudah diperbaiki. Tapi karena reproduksi aslinya belum pernah
dikonfirmasi, **jangan tutup requirement #2 sebagai selesai** sebelum cek browser.

---

## Rollback

```bash
cd /srv/www/production/galangan
sudo git revert --no-edit <commit> && sudo git push origin main
# lalu ulangi blok deploy
```

`revert` lebih aman daripada `reset --hard` di VPS yang sudah berjalan.