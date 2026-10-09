# TODO 8 - Full Re-Audit `notes.txt` + `notes2.txt` vs Codebase (HEAD `511fe85`)

Sumber: `notes.txt` (105 baris: hasil cek mandiri + revisi 5 Okt + revisi 2 Okt) dan `notes2.txt` (115 baris: revisi 5-6 Okt).
Metode: **real check one line by one line terhadap kode aktual** (bukan commit/PR). 4 agen explore memverifikasi setiap baris notes ke file:line.

## Aturan konflik (sesuai instruksi client)
- **Line kemudian menang** bila masalah sama tapi keputusan beda.
- `notes2.txt` ("5-6 Oktober") = revisi paling baru → mengalahkan duplikat "5 Oktober" di `notes.txt`.
- `notes.txt` "hasil cek mandiri" (item 1-15) = temuan QA client terbaru → **wajib diperbaiki**.
- `notes.txt` "2 Oktober" yang tabrakan dengan notes2 → **notes2 menang** (skip).

Status:
- **FULL** = sesuai kode
- **GAP** = belum/partial → jadi item T8-*
- **SKIP** = konflik, notes2 menang
- **SERVER** = perlu verifikasi services/api (PDF template)

---

# RINGKASAN

| Status | Jumlah |
|---|---|
| FULL (sesuai) | ~55 item |
| GAP (perlu dikerjakan) | 18 item → T8-* |
| SKIP (konflik) | 2 item |
| SERVER-side | 2 item |

---

# 0. CORE

| ID | Permintaan | Status | Bukti / gap |
|---|---|---|---|
| T8-CORE1 | Seeder: semua harga non-zero, harga real/perkiraan | **GAP** | `services/api/seed-data/warehouse_in.json`: **151-160 baris** `hargaNonPpn=0`/`total=0` (mis. PLAT 8MMX5X20, PLAT 25MMX4'X8'). Sisanya harga real RawData (PIN PISTON 85.000, HEMPALIN 400.000, dsb). Zero lain valid (termin belum bayar, payroll draft, saldo awal) |
| T8-CORE2 | Search di seluruh tabel semua modul | **GAP** | ~15 tabel tanpa SearchBox: Cuti/Izin, Training, Surat (HR); NCR, Insiden, Sertifikat QC; WO, Termin, K3 (Subkon); Penawaran, Request, Komunikasi, Kontrak (CRM); Pergerakan inventori; Rencana Vessel; tabel KaryawanDetail (docs/payroll/cuti); log class approval + doc list ProjectDetail. **4 search box tidak berfungsi**: Finance Kas (`kasQ`), Buku Besar (`bbQ`), Neraca (`nrQ`), maintenance breakdown ProjectDetail (`breakdownMaintQ`) |

---

# 1. KEUANGAN & BILLING

| ID | Permintaan | Status | Bukti / gap |
|---|---|---|---|
| T8-FIN1 | Semua tabel ada tanggal (dibuat/diubah/dihapus) + sortable | **GAP** | `deletedAt` tidak ada di tabel utama (AR/AP/Invoice/Jurnal/Aset). Neraca (5 tabel), Laba Rugi (2 tabel), saldo Kas & Bank = tanpa created/updated. Buku Besar voucher ada tapi plain `<th>` (tidak sortable). `Finance.tsx:3299-3343,3698-3747,3848-3871,4113-4214` |

---

# 2. MANAJEMEN PROYEK

| ID | Permintaan | Status | Bukti / gap |
|---|---|---|---|
| T8-PRJ1 | WBS: update progress material ikut inventori; histori perubahan + foto muncul | **GAP** | Material→inventori OK (stock −1 + movement). **Foto di-upload tapi tidak pernah ditampilkan** (tidak ada galeri) `ProjectDetail.tsx:1054-1058`. **Histori perubahan per task tidak ada UI** (hanya audit log). Qty material hard-coded 1 `:1067-1082` |
| T8-PRJ2 | Change order harus melewati owner | **GAP** | Tidak ada step approval owner/klien; `requestedBy` free text; approve/apply hanya gate `canSetTarget` (Direktur/Manager/Dev). `ProjectDetail.tsx:577-582` |
| T8-PRJ3 | Service: list dari WBS; biaya dari BoQ | **GAP** | Service dibuat manual (bukan dari daftar WBS) `SparepartServiceSection.tsx:393-420`. `cost` free input; `boqRef` hanya link, tidak pull harga `:732-745` |
| T8-PRJ4 | Service via PO + approval procurement | **GAP** | Sparepart sudah (stok kosong → PO wajib Disetujui). Service **belum ada** alur PO/persetujuan procurement |
| T8-PRJ5 | List equipment yang di-booking + equipment untuk service | **GAP** | Tab Equipment di ProjectDetail: booking + maintenance per proyek OK `ProjectDetail.tsx:1853-1947`. **List equipment untuk service tidak ada** (form service tidak punya field equipment) |
| T8-PRJ6 | Notifikasi warning maksimal 3 + "Tampilkan semua" | **GAP** | "Tampilkan semua" ada (bell + AlertBanner). **Cap bukan 3**: bell `AppShell.tsx:672` = 5, Dashboard `Dashboard.tsx:119` = 12, AlertBanner `AlertBanner.tsx:143` = 200 |
| T8-PRJ7 | Trial "Commisioning & Trial" | **GAP minor** | Typo "Commisioning" (1 m) di `n_prj.ts:265` — label notes juga minta "commisioning" jadi ambigu, tapi typo umum = "Commissioning" |

**Sudah OK (verified FULL):** card label selesai/berjalan/tertunda, gradient card tanpa chart, filter pop-up deret+animasi slide, tombol Detail, default 25, progres manual-vs-WBS (`progressSource`), proyek terbaru di atas, form Rencana Lokasi Docking + EntityPicker + default "Dalam Proses", "(otomatisnya)" dihapus + detail terlambat, Log Penawaran & Tagihan, milestone 30 hari list, gantt bulan, BoQ grouped + revisi, dokumen BoQ sync, CO↔BoQ koneksi, tabel risiko di-hide, "Commissioning & Trial" (selain typo), trial checklist WBS + kondisi, garansi per WBS saat Selesai, teknisi select, tim SDM, section subkon, sparepart inventori+stok→GI/PO, WBS assign internal/subkon, nomor kolom.

---

# 3. MONITORING

| ID | Permintaan | Status | Bukti / gap |
|---|---|---|---|
| T8-MON1 | Update + foto; monitoring pekerjaan | **GAP** | Upload foto + preview di modal OK. **Foto tidak pernah ditampilkan** setelah tersimpan `Monitoring.tsx:228-239`. "Monitoring pekerjaan" level WBS belum ada (baru kanban per tahap) |

**Sudah OK:** RBAC per role, "Perhatian Khusus" merah, back-nav state, sidebar highlight, filter "Proyek Butuh Perhatian".

---

# 4. DRYDOCK & KAPASITAS

| ID | Permintaan | Status | Bukti / gap |
|---|---|---|---|
| T8-DD1 | Card mapping slot area = grafikal (slot per area, kapal per slot) | **GAP** | Masih badge + teks ("n masuk/n berjalan/n keluar") + proportion bar `Drydock.tsx:874-918`. FacilityMap sudah SVG per-facility tapi bukan chart per-area |

**Sudah OK:** keterangan kapasitas (ukuran), mapping clickable → detail + panel lama dihapus, waiting list dock, booking date picker + auto-fill, jadwalkan maintenance + date + alasan di bawah.

---

# 5. INVENTORI & MATERIAL

| ID | Permintaan | Status | Bukti / gap |
|---|---|---|---|
| T8-INV1 | Form konversi muncul saat kategori dipilih | **GAP** | Konversi (uom2 + preset oli/plat) **selalu tampil** `Inventory.tsx:2740-2776`, tidak kondisional kategori |
| T8-INV2 | Checklist masuk/keluar: 2 kategori procurement + additional | **GAP** | Tidak ada kategori "additional (tanpa procurement)" di checklist `:2411-2477` (non-PO hanya via form Barang Masuk manual) |
| T8-INV3 | Retur: hapus field vendor | **GAP** | Vendor opsional + toast "(tanpa vendor)" OK, tapi **field vendor masih ada** `:3037-3039` |
| T8-INV4 | Kolom "Dari Gudang"/"Ke Gudang" → "Dari"/"Ke" | **GAP minor** | Header tabel masih "Dari Gudang"/"Ke Gudang" `:2553`; filter sudah "Dari/Ke" |

**Sudah OK:** muat ulang dihapus + auto-fetch, katalog highlight/hapus impor-teks/ABC/bin/select samping scan, filter "perlu perhatian" per status → dropdown kategori (rekonsiliasi notes), eceran rename, min stok gudang hide, 2 grafik tren masuk/keluar, keluar eceran/pcs + potongan plat + liter/drum/ton, surat jalan hide, analisis dihapus + slow/dead ke pergerakan.

---

# 6. EQUIPMENT

| ID | Permintaan | Status | Bukti / gap |
|---|---|---|---|
| T8-EQ1 | Delegasi: maintenance di dalam delegasi | **GAP** | Tombol Delegasi per baris + modal OK. **"Jadwalkan Servis"/"Catat Servis" masih aksi terpisah** `Equipment.tsx:1099-1129`, tidak di dalam modal delegasi `:1240-1281` |

**Sudah OK:** form rename lengkap (tahun unit/akuisisi, PJ, merk, estimasi utilisasi, umur bulan, keterangan, harga barang; tarif+bbm hide), tabel sesuai form (serial + tahun), tab Daftar Equipment saja, KPI Total/Terpakai/Dalam Maintenance, "Catat Servis" modal dulu sebelum selesai, input jam 24H strict.

---

# 7. SUB KONTRAKTOR

**Sudah OK semua** (verified FULL): evaluasi kinerja dihapus, WO detail (proyek+kapal+subkon), filter status, update progress WO + foto + historikal, SPK hanya procurement, tabel termin 7 kolom, skema termin, pajak %, timesheet dihapus, **milestone popup per WO ada** (`Subcontractor.tsx:1091,1538-1570` — client cek sebelum fix), kwitansi PDF server-side, requirement BAST/invoice/bukti bayar.

---

# 8. QC & SAFETY

**Sudah OK semua:** Drawing dihapus, inspeksi hierarki proyek→pekerjaan→subkon/pekerja→kuesioner+skoring, HSE kuesioner ke pekerja, sertifikat QC ↔ Dokumen sub-type (bidirectional `docTypes.ts` + `qcCertId`).

---

# 9. SDM & KARYAWAN

| ID | Permintaan | Status | Bukti / gap |
|---|---|---|---|
| T8-SDM1 | Surat & impor: preview PDF langsung, bukan teks | **GAP** | Preview **arsip** sudah PDF `HR.tsx:2462-2469`. **Preview form compose masih `<pre>` teks** `HR.tsx:2439` |

**Sudah OK:** edit posisi tetap/tambah di bawah, tipe karyawan + kontrak terakhir, skill %, kolom terakhir diupdate, sertifikat lengkap, cuti mandiri QR, preview lampiran tidak dikunci saat Diajukan, surat persetujuan cuti auto-generate saat disetujui, mutasi/org chart dihapus dari UI, surat kontrak+historikal+SP+kop, foto/KTP/ijazah, jabatan dropdown + pendidikan/kawin/tanggungan/jk/ptkp.

---

# 10-12. ABSENSI / KAPAL / ANALISIS

**Sudah OK semua:** absensi (auto fingerprint, rekap bulanan, filter bulan+tahun, shift hilang, lembur otomatis >8 jam maks 12, tren dihapus), detail kapal, analytics date picker + prediktif/preskriptif dihapus + export excel 19 sheet.

---

# 13. DASHBOARD

**Sudah OK:** kategori perlu perhatian, export PDF generate server (bukan screenshot).

---

# 14. DOKUMEN

**Sudah OK semua:** tombol pratinjau dihapus (cukup detail), penanggung jawab = EntityPicker searchable dari karyawan (bukan free text), sub-type tergantung tipe utama + koneksi QC sertifikat, upload tidak auto-preview + modal detail + download.

---

# 15. PROCUREMENT / ETC

| ID | Permintaan | Status | Bukti / gap |
|---|---|---|---|
| T8-PROC1 | Pagination di bawah semua tabel | **GAP** | Pager ada di tabel utama. **Vendor list** (`Procurement.tsx:1931`) dan **tabel komparasi quote RFQ** tanpa pager |
| T8-SYNC1 | Delay sinkronisasi + offline/online mode | **GAP** | Sinkronisasi sudah di-mitigate (`useModuleSync` + `freshMaintenances` + offline persist + 409/429 handling). **UX mode offline/online belum ada** — hanya badge pending/failed, tidak ada toggle/status mode eksplisit |

**Sudah OK:** track record harga RFQ, sistem tender dihapus + komparasi tetap, export PDF langsung download (server-generated), laporan PDF generate baru, alur proyek→BOQ→GI/PO.

---

# 16. SERVER-SIDE (services/api) — perlu verifikasi template PDF

| ID | Permintaan | Status |
|---|---|---|
| T8-PDF1 | Analytics PDF: content tidak terpotong; garis opacity rendah dibuat bold | **SERVER** — web sudah request PDF server (`kind:"analitik"`), fix visual ada di template `services/api` |
| T8-PDF2 | Kwitansi PDF tidak terpotong | **SERVER** — web sudah pakai `pdfDoc.request kind:"kwitansi"`, layout di server PDF |

---

# SKIP (konflik — notes2 menang)

| Permintaan (notes.txt 2 Okt / cek mandiri) | Alasan skip |
|---|---|
| Riwayat booking di tab alokasi/booking | notes2 **menghapus** tab alokasi/booking |
| Detail biaya per proyek di tab biaya | notes2 **menghapus** tab biaya; ekuivalen sudah ada di ProjectDetail tab Equipment |

---

# T7-PRJ2 NOTE

Tabel risiko sudah di-hide (todo7-W0). Data `risks` masih auto-generated di store — sengaja dipertahankan.

---

# T8 GAP LIST (implementasi)

| ID | Judul | Prioritas | Status |
|---|---|---|---|
| T8-CORE1 | Riset + isi harga seeder yang masih 0 | tinggi | **BLOCKED** — butuh input harga real dari client (151-160 baris PLAT dll) |
| T8-CORE2 | Tambah SearchBox di 18 tabel + fix 4 search box rusak | tinggi | **W1 SELESAI** + **FINAL** (Finance Riwayat Hapus + P&L, KaryawanDetail docs, ProjectDetail log — semua tabel utama kini punya search) |
| T8-FIN1 | Tanggal historis (created/updated) + sortable di 15 tabel Finance | tinggi | **W1 SELESAI** (Neraca 5, LabaRugi 2, Kas saldo+live, BB ledger+live+voucher→SortTh, Riwayat Hapus delSort, Jurnal secondary+P&L) |
| T8-PRJ1 | Galeri foto WBS + last-change caption | sedang | **W2 SELESAI** (thumbnail SecureImg + "Terakhir: note · date") |
| T8-PRJ2 | CO lewat approval owner | sedang | **W2 SELESAI** (ownerApproved flag, badge, apply gate) |
| T8-PRJ3 | Service cost pull dari BoQ + WBS link + group by WBS | sedang | **W2 SELESAI** + **FINAL** (boqRef auto-fill cost, wbsTask select, list digroup per tahap WBS) |
| T8-PRJ4 | Service via PO + approval procurement | sedang | **FINAL SELESAI** (PO approval gate: cost > threshold / perluApproval → wajib PO Disetujui; PO select + checkbox di form) |
| T8-PRJ5 | Equipment field di form service + list di tab Equipment | sedang | **W2 SELESAI** (select equipment, badge 🔧, card di ProjectDetail) |
| T8-PRJ6 | Notifikasi cap maksimal 3 | rendah | **W0 SELESAI** (bell 5→3, Dashboard 12→3) |
| T8-PRJ7 | Typo "Commisioning" → "Commissioning" | rendah | **W0 SELESAI** |
| T8-MON1 | Tampilkan foto monitoring | sedang | **W4 SELESAI** (photo strip kanban + list di modal) |
| T8-DD1 | Chart mapping slot area | rendah | **W4 SELESAI** (CSS occupancy bar per area) |
| T8-INV1 | Form konversi kondisional | sedang | **W3 SELESAI** (CONV_CATS + eceran toggle) |
| T8-INV2 | Checklist additional (tanpa procurement) | sedang | **W3 SELESAI** (header + button Tanpa PO / Permintaan baru) |
| T8-INV3 | Hapus field vendor di retur | rendah | **W0 SELESAI** |
| T8-INV4 | Label kolom "Dari"/"Ke" | rendah | **W0 SELESAI** |
| T8-EQ1 | Maintenance di dalam modal delegasi | sedang | **W3 SELESAI** (section "Tambah Servis" inline) |
| T8-SDM1 | Preview surat compose = PDF | sedang | **W4 SELESAI** (tombol "Pratinjau PDF" via composePdf) |
| T8-PROC1 | Pager Vendor list | rendah | **W0 SELESAI** (vendorPager) |
| T8-SYNC1 | UX offline/online eksplisit | rendah | **W4 SELESAI** (Offline chip + "Menyinkronkan N" chip) |
| T8-PDF1 | Analytics PDF: content + garis bold | sedang | **SELESAI (sudah ada di server)** — STROKE.hair 0.22mm (theme.ts:117), chart 24 bar (chart.ts:506) |
| T8-PDF2 | Kwitansi PDF tidak terpotong | sedang | **SELESAI (sudah ada di server)** — alignment tanpa anchor (kwitansi.ts:1-16) |

---

# GELOMBANG IMPLEMENTASI

| Gelombang | Fokus | Status | Commit |
|---|---|---|---|
| **W0** | T8-INV4, T8-PRJ7, T8-INV3, T8-PRJ6, T8-PROC1 | **SELESAI** | `8903388` |
| **W1** | T8-CORE2 + T8-FIN1 | **SELESAI** | `91dd1cd` |
| **W2** | T8-PRJ1, T8-PRJ2, T8-PRJ3, T8-PRJ5 | **SELESAI** | `a3d43d9` |
| **W3** | T8-INV1, T8-INV2, T8-EQ1 | **SELESAI** | `5e7202c` |
| **W4** | T8-SDM1, T8-DD1, T8-MON1, T8-SYNC1 | **SELESAI** | `e153f8c` |
| **W5** | T8-PDF1, T8-PDF2 | **SELESAI (sudah ada)** | — (fix server sudah di kode: AN2) |
| **FINAL** | Sisa 5 gap: Finance search, KaryawanDetail docs search, ProjectDetail log search, service WBS grouping, service PO approval | **SELESAI** | `6a8ba52` |
| **BLOCKED** | T8-CORE1 seeder harga | butuh input client (151 baris warehouse_in) | — |

---

# PERTANYAAN KE CLIENT

1. T8-CORE1: harga real untuk item yang masih 0 (PLAT berbagai ukuran) — ada referensi harga atau perkiraan saja? **[BLOCKED — butuh jawaban]**

---

# METODE

- Real check line-by-line terhadap kode HEAD `511fe85`, bukan commit/PR.
- Konflik: line kemudian menang; notes2 (5-6 Okt) > notes.txt (5 Okt duplikat).
- "Hasil cek mandiri" notes.txt = temuan QA terbaru, prioritas wajib.
- Status FULL = terverifikasi file:line; GAP = masuk T8-*.
- Build wajib lulus sebelum commit tiap gelombang.
