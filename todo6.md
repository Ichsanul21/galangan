# TODO 6 - Revisi Client 5-6 Oktober (`notes2.txt`)

Sumber: `notes2.txt` — NEW REVISION 5-6 OKTOBER GALANGAN.
Real check terhadap working tree setelah todo5 (commit `7fe2900`.. sesi ini).
**Update post-W7/W8:** gap SDM6 + PRJ2 + cleanup minor dikerjakan.

Status:
- **SELESAI** = memenuhi permintaan
- **SEBAGIAN** = ada tapi belum penuh
- **BELUM** = belum ada / belum disentuh
- **REF** = sudah SELESAI di todo5 — jangan dikerjakan ulang
- **AMBIGU** = butuh klarifikasi client / K3

Item baru memakai kode **T6-**. Item lama dirujuk ke todo5.

---

# RINGKASAN

| Status | Keterangan |
|---|---|
| REF (sudah todo5) | ~25+ baris (Proyek P/D, Equipment E, Subkon S, Inventori I, B1/B2, C1-C3, F1, A1, AN, H, Q, dll.) |
| SELESAI (W0–W8) | Seluruh item tabel di bawah terverifikasi TRUE di kode (real check) |
| Cleanup minor (opsional) | Dead code branch tab disembunyikan tetap ada di file (Timesheet, Drawing, Mutasi, Analisis) — tidak lagi bisa dibuka via deep-link |

## Lima prioritas

| # | Item | Kenapa |
|---|---|---|
| 1 | **T6-MON*** Monitoring | Client tandai "PERHATIAN KHUSUS TERAKHIR" |
| 2 | **T6-DD*** Drydock booking + waiting list | Alur operasional docking |
| 3 | **T6-EQ*** Equipment tabs/delegasi | Restruktur besar |
| 4 | **T6-INV*** + **T6-PRJ1** Inventori katalog/BOM + sparepart select | Alur material proyek |
| 5 | **T6-PRJ2** WBS assign + **T6-SK*** Subkon | Keterkaitan pekerjaan |

---

# 0. REFERENSI todo5 (JANGAN dikerjakan ulang)

| Permintaan notes2 | Status todo5 |
|---|---|
| Topbar hapus filter cabang | SELESAI (B1) |
| Input harga format titik | SELESAI (B2) |
| Proyek P1–P14 (notif, nomor kolom, card, filter slide, detail, default 25, sort, docking plan, EntityPicker, status hilang, otomatis, log penawaran, milestone 30 hari, WBS foto, Gantt bulan, BoQ grouped, dokumen BoQ sinkron, CO↔BoQ, risiko auto, Commisioning & Trial, trial checklist, garansi WBS, service BoQ, PO sparepart, tim SDM, subkon tab) | SELESAI |
| Equipment E1–E5 (servis modal, jam 24H, booking history, detail biaya) | SELESAI |
| Subkon S1–S3b (kwitansi PDF, BAST/invoice nomor, milestone WO) | SELESAI |
| Inventori I1–I2 (filter status→kategori) | SELESAI |
| Finance F1 + tanggal sumber | SELESAI |
| Sinkron C1–C3, A1 harga, AN1/AN2, H1–H3, Q1–Q2, DK1 | SELESAI |
| Alur sparepart PO/GI oleh sistem (D13) | SELESAI |
| Sinkron dokumen BoQ (D6) | SELESAI (tampilan rapi = T6-PRJ3) |

---

# 1. ETC LINTAS MODUL

| ID | Permintaan | Status | Bukti / gap |
|---|---|---|---|
| T6-ETC1 | Hapus filter cabang topbar | **REF** | B1 SELESAI · AppShell.tsx:536-571 |
| T6-ETC2 | Format titik input harga | **REF** | B2 SELESAI · ui.tsx MoneyInput:1871-1895 |
| T6-ETC3 | Alur proyek→BOQ→mekanik minta barang (stok/GI vs PO) | **REF** | D13 SELESAI · SparepartServiceSection.tsx:328-331 |
| T6-ETC4 | Procurement multi-vendor: item tak tersedia → vendor lain | **SELESAI** | Tombol "PO Split" di RFQ bila ada quote; alokasi qty per vendor → 1 PO per vendor (`rfqId` + `splitFrom`) · Procurement.tsx:753-832,1788 |
| T6-ETC5 | RFQ track record harga | **SELESAI** | Card RFQ menampilkan track record harga item sama dari PO/RFQ lampau (maks 5 terbaru) · Procurement.tsx:1703-1722 |
| T6-ETC6 | RFQ: hapus "sistem tender vendor"; komparasi harga tetap | **SELESAI** | Tombol Menangkan/badge pemenang sudah dihapus; search RFQ tanpa field winner; komparasi quote tetap · Procurement.tsx:449,1753-1773,1793 |
| T6-ETC7 | Pagination di bawah tabel | **SELESAI (Procurement)** | usePager bar setelah `</table>` · ui.tsx:1387-1428; Procurement.tsx:1553,1647,1916 |

---

# 2. MANAJEMEN PROYEK

| ID | Permintaan | Status | Bukti / gap |
|---|---|---|---|
| T6-P*/D* | Seluruh permintaan proyek di notes2 = notes.txt | **REF** | todo5 69/69 |
| T6-PRJ1 | Sparepart: nama selectable dari inventori + stok available | **SELESAI** | EntityPicker inventory; stok di hint; pick isi name/partNumber/cost · SparepartServiceSection.tsx:598-625 |
| T6-PRJ2 | WBS: assign pengerja internal / subkon eksternal | **SELESAI** | `assignType` Internal/Subkon + `assignee` di ProjectDetail; badge amber/biru; pick karyawan/subkon. **RBAC assign: hanya `canSetTarget`** — kini juga di **update path**: `saveWbsTask` hanya menulis assign bila `canSetTarget`; field assign di modal update hanya dirender untuk role target · ProjectDetail.tsx:1040-1045,1091,2623-2640 |
| T6-PRJ3 | Dokumen BoQ: perbaiki tampilan berantakan | **SELESAI** | ReportSection: ringkasan BoQ (item/nilai/status) + tombol buka tab BoQ · ReportSection.tsx:185-216 |

---

# 3. MONITORING PROYEK (prioritas client)

| ID | Permintaan | Status | Bukti / gap |
|---|---|---|---|
| T6-MON1 | Update proyek + foto; fungsi monitoring pekerjaan | **SELESAI** | Modal update di Monitoring kanban (progress/status/actual/budget/foto/catatan); tulis `update("projects")` + log · Monitoring.tsx:225-250,243-244 |
| T6-MON2 | RBAC berbeda per role | **SELESAI** | `auth/rbac.ts` runtime `can(role,"Monitoring",aksi)`; deny-by-default tanpa Lihat · rbac.ts:231-233; Monitoring.tsx:77-79 |
| T6-MON3 | Label "perhatian khusus" merah | **SELESAI** | `monAttTitle` = "Perhatian Khusus ({n})"; ikon+teks merah · Monitoring.tsx:299-302 |
| T6-MON4 | Back nav: Monitoring↔Detail vs Manajemen↔Detail | **SELESAI** | `location.state.from`; Projects → `manajemen`, Monitoring → `monitoring` · ProjectDetail.tsx:111-117 |
| T6-MON5 | Highlight sidebar di sub-route | **SELESAI** | `isNavActive()` eksklusif di AppShell · AppShell.tsx:413-423 |

---

# 4. DRYDOCK & KAPASITAS

| ID | Permintaan | Status | Bukti / gap |
|---|---|---|---|
| T6-DD1 | Keterangan maks docking (ukuran) | **SELESAI** | `dock.capacity` di UI · Drydock.tsx:952,1231 |
| T6-DD2 | Mapping slot clickable → detail; hapus panel lama | **SELESAI** | Panel lama dihapus; mapping slot + modal detail + tabel slot utama tetap · Drydock.tsx:726,805-894 |
| T6-DD3 | Rencana docking tahunan → waiting list dock | **SELESAI** | Card **Waiting List Dock**: proyek tanpa slot + tombol booking auto-fill · Drydock.tsx:402-408,992-1075 |
| T6-DD4 | Booking: date picker (bukan day-index); area selectable; auto-fill jadwal proyek | **SELESAI** | Input tanggal mulai/selesai (kalender); `from/to` = indeks hari dari ISO; pilih proyek auto-fill; area via datalist. **Modal geser slot kini juga date picker** · Drydock.tsx:57-64,1192-1225; move:589-612,1163-1177 |
| T6-DD5 | Maintenance: jadwalkan + date form; alasan di bawah | **SELESAI** | Tombol "Jadwalkan Maintenance"; tanggal kalender; alasan di field terakhir · Drydock.tsx:657,1251-1267 |

---

# 5. INVENTORI & MATERIAL

| ID | Permintaan | Status | Bukti / gap |
|---|---|---|---|
| T6-INV1 | Hapus tombol "Muat ulang"; auto-fetch | **SELESAI** | Tombol dihapus; C2 pull periodik tetap · Inventory.tsx:2011-2013 |
| T6-INV2 | Katalog: highlight kategori; hapus teks impor, kolom ABC, kolom bin; pindah select ke samping scan; hapus teks detail status | **SELESAI** | Badge kategori warna (`catTone`); select impor sebaris scan; ABC/bin/status subtext hilang · Inventory.tsx:82-89,2206-2261 |
| T6-INV3 | Form material: "eceran"; hapus min stok gudang; konversi muncul saat pilih kategori | **SELESAI** | Label "Eceran"; field minWh disembunyikan; form konversi selalu tampil · Inventory.tsx:3353-3426 |
| T6-INV4 | BOM ↔ procurement; terima checklist; masuk procurement/additional; keluar list+checklist; retur tanpa vendor | **SELESAI** | Tab BOM: checklist pengadaan; retur vendor opsional · Inventory.tsx:1259-1296,2587-2656 |
| T6-INV5 | Pergerakan: 2 grafik tren masuk/keluar; kolom Dari/Ke | **SELESAI** | Dua AreaChart (in/out) + nilai stok · Inventory.tsx:2663-2695 |
| T6-INV6 | Keluar eceran/pcs + potongan plat + liter/drum/ton | **SELESAI** | `sbTonasePlat`; konversi bulk liter/drum/ton (drum=200L); eceran default uom2 · sb.ts:100; Inventory.tsx:3487-3568 |
| T6-INV7 | Surat Jalan di-hide | **SELESAI** | Tab "Tonase & Surat Jalan" dihapus dari Tabs · Inventory.tsx:2057 |
| T6-INV8 | Hapus tab Analisis; slow moving + dead stock → Pergerakan | **SELESAI** | Tab Analisis dihapus; card slow+dead di Pergerakan · Inventory.tsx:2055-2057,2812-2859. Deep-link `?tab=` di-whitelist · Inventory.tsx:778 |

---

# 6. EQUIPMENT (restruktur)

| ID | Permintaan | Status | Bukti / gap |
|---|---|---|---|
| T6-EQ1 | Rename/hidden form (cabang default Samarinda, tahun unit, tahun akuisisi, PJ unit, merk, estimasi utilisasi, umur pakai bulan, keterangan, harga barang; hide tarif+bbm) | **SELESAI** | Label diganti; branch hidden; tarif+BBM di-hide · Equipment.tsx:309,2633-2650. Export register tanpa kolom BBM · Equipment.tsx:1569-1580 |
| T6-EQ2 | Tabel disesuaikan form | **SELESAI** | Kolom: Equipment, Kategori, Merk, PJ unit, Status, Utilisasi, Jam, Harga barang, Dibuat, Diubah, Aksi · Equipment.tsx:1694 |
| T6-EQ3 | Tab **Daftar Equipment** saja; hapus Alokasi/Booking, Sedang Dipakai, Maintenance, Kalibrasi, Biaya, Utilisasi | **SELESAI** | Tabs kini hanya `["Daftar Equipment"]` · Equipment.tsx:1648 |
| T6-EQ4 | Card analisis: Total / Sedang terpakai / Dalam maintenance (kalibrasi+service) | **SELESAI** | KPI: Total · Sedang Terpakai · Dalam Maintenance + due soon · Equipment.tsx:1629-1641 |
| T6-EQ5 | Delegasi peminjaman per unit; maintenance di dalam delegasi | **SELESAI** | Tombol Delegasi per baris; `delegatedTo/delegatedAt/delegationNote`; `pic` asli TIDAK ditimpa · Equipment.tsx:2655-2696 |

> Catatan: E1–E5 todo5 (logika servis, jam 24H, biaya) **tetap dipakai**; notes2 minta restruktur UI/tab.

---

# 7. SUBKONTRAKTOR

| ID | Permintaan | Status | Bukti / gap |
|---|---|---|---|
| T6-SK1 | Hapus evaluasi kinerja | **SELESAI** | Card evalChart + EvalTooltip dihapus dari UI · Subcontractor.tsx:499-500 |
| T6-SK2 | WO detail: proyek + kapal + subkon | **SELESAI** | Kartu WO tampilkan subkon · proyek · kapal · Subcontractor.tsx:1144-1148 |
| T6-SK3 | Filter hanya status; semua status tampil | **SELESAI** | Select status saja · Subcontractor.tsx:1052-1055 |
| T6-SK4 | Update progress WO: foto + historikal | **SELESAI** | Modal progres: unggah foto + daftar historikal · Subcontractor.tsx:502-527,1673-1705 |
| T6-SK5 | SPK tidak bisa diubah (hanya procurement) | **SELESAI** | Tombol Ubah WO hanya untuk role target/procurement · Subcontractor.tsx:174-177,441-456 |
| T6-SK6 | Tabel termin: proyek, subkon, WO, nilai, retensi, neto, status | **SELESAI** | 8 kolom · Subcontractor.tsx:1235 |
| T6-SK7 | Skema termin (%, dp/termin, kontan) | **SELESAI** | Select skema; `termins.scheme`; ditampilkan di tabel · Subcontractor.tsx:607-610,1789-1795 |
| T6-SK8 | Field "pajak" (pilih %) ganti pph | **SELESAI** | Label "Pajak (%)"; nilai tetap `pphPct` · Subcontractor.tsx:1797-1799 |
| T6-SK9 | Hapus tab Timesheet | **SELESAI** | Tabs tanpa Timesheet; deep-link di-whitelist · Subcontractor.tsx:1039,259 |

---

# 8. QC & SAFETY

| ID | Permintaan | Status | Bukti / gap |
|---|---|---|---|
| T6-QC1 | Hapus tab Drawing | **SELESAI** | Tabs QC tanpa Drawing; deep-link di-whitelist · QCSafety.tsx:1339,205 |
| T6-QC2 | Inspeksi: list proyek → pekerjaan → subkon/pekerja → kuesioner + skoring | **SELESAI** | Hierarki kartu proyek + kuesioner butir + skor% · QCSafety.tsx:489-495,1373-1471 |
| T6-QC3 | HSE: kuesioner ke pekerja | **SELESAI** | Kartu "Kuesioner HSE ke pekerja"; skor %; riwayat · QCSafety.tsx:1199-1224,1844-1956 |
| T6-QC4 | Detail teknis | **SELESAI** | Field WPS/tebal mm/hardness/catatan visual · QCSafety.tsx:2303-2316 |

---

# 9. SDM & KARYAWAN

| ID | Permintaan | Status | Bukti / gap |
|---|---|---|---|
| T6-SDM1 | Edit baris: posisi tetap; tambah di bawah | **SELESAI** | Urutan default createdAt ascending · HR.tsx:399-411 |
| T6-SDM2 | Tipe karyawan: training/kontrak/tetap/outsourcing + kontrak terakhir | **SELESAI** | TIPE_KARYAWAN = Tetap/Kontrak/Outsourcing/Training; kolom kontrak · HR.tsx:52,1528 |
| T6-SDM3 | Skill matrix + persentase | **SELESAI** | Skill format `Nama\|80`; badge warna % · KaryawanDetail.tsx:196-222,532-543 |
| T6-SDM4 | Kolom "dibuat" → "terakhir diupdate" | **SELESAI** | Tabel karyawan hanya kolom Terakhir diupdate · HR.tsx:1531-1532 |
| T6-SDM5 | Sertifikat: file, nomor, berlaku hingga, diterbitkan | **SELESAI** | Form sertifikat lengkap · KaryawanDetail.tsx:835-852 |
| T6-SDM6 | Cuti/izin: form mandiri karyawan via barcode | **SELESAI** | QR `CUTI:{id}:{nik}` di daftar cuti HR + KaryawanDetail; **form ajukan cuti baru di KaryawanDetail** (status Diajukan, validasi saldo/overlap/Sakit-Unpaid, unggah lampiran) · KaryawanDetail.tsx:421-470,776-784,1086-1138 |
| T6-SDM7 | Hapus tab Mutasi + Org Chart | **SELESAI** | Tabs: Karyawan, Cuti & Izin, Training, Surat & Impor; deep-link di-whitelist · HR.tsx:1474,453 |
| T6-SDM8 | Surat: kontrak baru/perpanjang + historikal, SP, preview + kop | **SELESAI** | Jenis "Kontrak Kerja" + "Perpanjangan Kontrak"; kop SB_KOP · HR.tsx:60-61,1118-1155 |
| T6-SDM9 | Foto karyawan, KTP, ijazah | **SELESAI** | Form HR: unggah foto profil + KTP + ijazah · HR.tsx:2054-2073 |
| T6-SDM10 | Jabatan dropdown; pendidikan selectable; kawin/tanggungan/jk | **SELESAI** | Jabatan dropdown + pendidikan + kawin + jk + tanggungan · HR.tsx:1995-2052 |

---

# 10. ABSENSI

| ID | Permintaan | Status | Bukti / gap |
|---|---|---|---|
| T6-ABS1 | Status hari ini otomatisasi alat | **SELESAI** | Tombol "Otomatis dari record" + impor CSV fingerprint · Absensi.tsx:152-230,596-603 |
| T6-ABS2 | Rekap langsung sebulan | **SELESAI** | Tab Rekap bulanan ada · Absensi.tsx:577,709+ |
| T6-ABS3 | Filter bulan + tahun | **SELESAI** | FilterPopover rekap: bulan + tahun · Absensi.tsx:772-799 |
| T6-ABS4 | Hilangkan shift | **SELESAI** | Select shift dihapus; internal tetap "Pagi" · Absensi.tsx:95,586-589. **Sync KaryawanDetail**: shift select dihapus, force Pagi · KaryawanDetail.tsx:336-343,992-1006 |
| T6-ABS5 | Lembur otomatis >8 jam + skema maksimal | **SELESAI** | setRow auto-hitung OT (worked−8, max 12); NumInput max 12 · Absensi.tsx:126-138,667. **Sync KaryawanDetail**: auto OT dari jam masuk/keluar, validasi 0–12 · KaryawanDetail.tsx:346-375,1007-1009 |
| T6-ABS6 | Hapus tren kehadiran | **SELESAI** | Card tren di-hide dari render · Absensi.tsx:718-719 |

---

# 11–14. MODUL LAIN

| ID | Permintaan | Status | Bukti / gap |
|---|---|---|---|
| T6-VSL1 | Data kapal tampilkan detail | **SELESAI** | Kartu "Detail teknis kapal" · VesselDetail.tsx:406-467 |
| T6-AN1 | Rentang bulan date picker | **SELESAI** | Input `type="month"` from/to + Reset; preset [6,12,18,24] · Analytics.tsx:180,946-983 |
| T6-AN2 | Hapus tab Prediktif + Preskriptif | **SELESAI** | Tabs Analytics: Deskriptif, Diagnostik, Profitabilitas · Analytics.tsx:930-932. Sheet Excel Preskriptif dihapus dari export · Analytics.tsx:860-866 |
| T6-DSH1 | Report perlu perhatian: pilih kategori | **SELESAI** | Filter modul + group by level · Dashboard.tsx:482-507,763-807 |
| T6-PROC | Section Procurement di notes2 | **SELESAI (default)** | Alur RFQ→PO: **PO Termurah** + **PO Split** + komparasi quote · Procurement.tsx:1785-1790,766-832 |
| T6-FIN | Section Keuangan di notes2 | **SELESAI (default)** | Modul Finance sudah lengkap; tidak ada revisi spesifik notes2 |

---

# POST-FIX SESI INI (gap penutup)

| Item | Fix | Bukti |
|---|---|---|
| T6-PRJ2 RBAC update path | `saveWbsTask` hanya menulis `assignType`/`assignee` bila `canSetTarget`; modal update render field assign hanya untuk role target | ProjectDetail.tsx:1040-1045,2623-2640 |
| T6-SDM6 form mandiri | Tombol "Ajukan Cuti" + modal create (`add("leaves")` status Diajukan) di KaryawanDetail; validasi saldo/overlap/ket | KaryawanDetail.tsx:421-470,1086-1138 |
| Deep-link tab whitelist | `useDeepLinkTarget` menerima `allowedTabs`; Inventory/QC/Subkon/HR di-whitelist agar branch mati tidak bisa dibuka via `?tab=` | useDeepLink.ts:68-99; Inventory.tsx:778; QCSafety.tsx:205; Subcontractor.tsx:259; HR.tsx:453 |
| Equipment export BBM | Kolom Harga BBM/Total BBM/Biaya BBM dihapus dari export register | Equipment.tsx:1569-1580 |
| KaryawanDetail absensi sinkron | Shift select dihapus; OT auto dari jam kerja, maks 12 | KaryawanDetail.tsx:336-375,992-1009 |
| Drydock move-slot date picker | Modal geser slot pakai `type="date"` dari/to + ISO → day-index | Drydock.tsx:589-612,1163-1177 |
| Analytics export | Sheet Excel "Preskriptif" dihapus | Analytics.tsx:860-866 |

---

# GELOMBANG IMPLEMENTASI

| Gelombang | Fokus |
|---|---|
| **W0** | Quick wins: MON3/4/5, INV1/2/7, EQ3 (hapus tab), SK1/9, QC1, AN2, ABS4/6, SK8 label pajak, ETC6 (hapus tender) |
| **W1** | PRJ1 sparepart select inventori; INV3/5/8; ETC5 track record RFQ |
| **W2** | DD3 waiting list; DD4/5 date picker booking+maintenance |
| **W3** | EQ1/2/4/5 restruktur Equipment + delegasi |
| **W4** | INV4/6 BOM+eceran; SK2–7; PRJ3 rapi dokumen BoQ |
| **W5** | SDM1–10; ABS1/3/5 |
| **W6-fix** | BUG: ABS5 OT cap 8→12; MON5 sidebar double-highlight; INV2 katalog; EQ4 KPI kalibrasi; EQ5 pic; SK7 scheme display; harga sort |
| **W7-monitoring** | MON1 update+foto di Monitoring; MON2 RBAC runtime `auth/rbac.ts`; gate export/update; role name sync |
| **W6 (sisa)** | QC2/3; SDM6/8/9/10 gaps; INV4 BOM checklist; INV6 (spec); PRJ3 duplikasi; ETC4/6 |
| **W7 (deploy)** | Push + deploy + QA 2 device |
| **W8 (post-fix)** | PRJ2 assign RBAC update path; SDM6 form cuti mandiri; deep-link tab whitelist; EQ export BBM; KaryawanDetail absensi sinkron; DD move date picker; Analytics export sheet |

---

# PERTANYAAN KE CLIENT

1. T6-INV6: ~~rumus eceran/potongan plat~~ **SELESAI** default (plat 7850 kg/m³; drum 200L) — konfirmasi bila beda  
2. T6-QC4: ~~spesifikasi K3~~ **SELESAI** default (WPS/tebal/hardness/visual) — K3 bisa menyesuaikan checklist  
3. T6-EQ3: data booking/maintenance/biaya yang dihapus tab — tetap di store (sudah)  
4. T6-SDM6: ~~arah barcode~~ **SELESAI** default (QR CUTI:{id}:{nik} + form mandiri KaryawanDetail + tombol Ajukan Cuti)  
5. T6-ABS1: ~~otomatisasi alat~~ **SELESAI** default (auto from record + CSV fingerprint)  
6. Section Procurement & Keuangan di notes2 kosong — **SELESAI (default)** RFQ→PO termurah/split; Finance sudah ada dunning otomatis  
7. T6-VSL1: ~~field detail kapal~~ **SELESAI** (IMO/MMSI/dimensi/kelas/bendera/tahun/mesin/serifikat)  
8. T6-PRJ2: ~~siapa assign WO~~ **SELESAI** PM/direktur/manager/developer saja (`canSetTarget`) — termasuk path update progres WBS  

---

# METODE

- Real check terhadap kode setelah todo5 (`7fe2900`+).
- Status REF = todo5 SELESAI, bukan diulang.
- Bukti file:line saat implementasi W0+ diperbarui di tabel.
- Probe/build wajib sebelum commit tiap gelombang.
- Post-fix W8: real check ulang gap SDM6/PRJ2 + cleanup minor; semua item tabel SELESAI terverifikasi TRUE di kode.
