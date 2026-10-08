# TODO 7 - Full Re-Audit `notes2.txt` (post `ee57818`)

Sumber: `notes2.txt` — NEW REVISION 5-6 OKTOBER GALANGAN.
Real-check **seluruh 130 baris** terhadap working tree setelah todo6 (W0–W8, commit `7fe2900`..`ee57818`).
todo5/todo6 **tidak dipercaya mentah** — setiap baris dicek ulang di kode HEAD.

Status:
- **SELESAI** = memenuhi permintaan (kode terverifikasi)
- **SEBAGIAN** = ada tapi belum penuh / ada bug interaksi
- **BELUM** = belum ada / logic rusak
- **REF** = todo5/todo6 SELESAI + re-audit mengonfirmasi — jangan dikerjakan ulang
- **AMBIGU** = butuh klarifikasi client
- **CLEANUP** = dead code / hantu — opsional bersih-bersih

Item baru memakai kode **T7-**. Rujukan lama: todo5/todo6.

---

# RINGKASAN

| Status | Jumlah (approx) |
|---|---|
| REF (todo5/6 + konfirmasi ulang) | ~70% baris notes2 |
| SEBAGIAN / BELUM → jadi T7-* | 10 gap nyata |
| CLEANUP (dead code) | 8 paket |
| AMBIGU (client/K3) | 3 |

## Lima prioritas

| # | ID | Kenapa |
|---|---|---|
| 1 | T7-PRJ1 | Progress proyek ditimpa dua sumber (Monitoring manual vs WBS auto) — data tidak konsisten |
| 2 | T7-PRJ2 | Tabel risiko masih tampil — notes2 eksplisit minta hilangkan |
| 3 | T7-EQ2 | Deep-link `?tab=` masih bisa membuka tab Equipment yang tersembunyi |
| 4 | T7-PRJ3 | Teknisi service free-text — notes2 minta pilihan dari data |
| 5 | T7-DD1 | Mapping slot area belum clickable — notes2 minta klik → detail |

---

# 0. ETC LINTAS MODUL

| ID | Permintaan notes2 | Status | Bukti / gap |
|---|---|---|---|
| T7-ETC1 | Topbar: filter cabang dihapus | **REF** | AppShell.tsx:563-571 (cabang hanya chip lock) |
| T7-ETC2 | Semua input harga → format titik | **REF** | ui.tsx:1877-1895 MoneyInput; parseIdNumber format.ts:63-113 (commit ee57818) |
| T7-ETC3 | Alur proyek→BOQ→mekanik minta barang (stok vs PO) | **REF** | SparepartServiceSection.tsx:328-331 (D13) |
| T7-ETC4 | Procurement multi-vendor: tak tersedia → vendor lain | **REF** | PO Split Procurement.tsx:752-830 |
| T7-ETC5 | RFQ track record harga | **REF** | Procurement.tsx:1703-1740 |
| T7-ETC6 | RFQ: hapus tender vendor; komparasi harga tetap | **SEBAGIAN** | UI menangkan/badge hilang (1785-1794). **Sisa:** `winnerVendor`/`winnerPrice` masih ditulis `createPoFromCheapest` :784; RFQ create masih tulis `winner:""` :695 → CLEANUP-8 |
| T7-ETC7 | Pagination di bawah tabel | **SEBAGIAN** | Projects:483, Inventory:2297/2811, HR:1583, Subkon WO:211 OK. **Subkon termin :1233-1241 belum ada pager** → T7-SK1 |

---

# 1. MANAJEMEN PROYEK (baris 6-37)

| ID | Permintaan notes2 | Status | Bukti / gap |
|---|---|---|---|
| T7-P1 | Notif warning maks 3; "perkecil"→"tampilkan semua" | **REF** | todo5; Monitoring/Projects alerts |
| T7-P2 | Nomor pada kolom | **REF** | Projects.tsx kolom # |
| T7-P3 | Card status: label selesai + berjalan + tertunda | **REF** | Projects status cards |
| T7-P4 | Card status gradient; chart di card dihapus | **REF** | todo5 |
| T7-P5 | Filter pop-up → deret + animasi slide | **REF** | FilterPopover ui |
| T7-P6 | "Kelola detail" → aksi button "detail" | **REF** | Projects aksi kolom |
| T7-P7 | Default tampil 25 | **REF** | usePager default 25 |
| T7-P8 | **Progres proyek disesuaikan** | **SEBAGIAN** | Auto WBS-weighted ProjectDetail.tsx:344-384. **Bug:** Monitoring set manual (225-243) **ditimpa** efek auto saat data berubah; proyek tanpa WBS stuck manual/0 → **T7-PRJ1** |
| T7-P9 | Proyek terbaru di atas | **REF** | sort createdAt desc |
| T7-P10 | Form cabang → "Rencana Lokasi Docking" | **REF** | ProjectAddModal.tsx:236-243 |
| T7-P11 | EntityPicker kapal/klien/PM | **REF** | ProjectAddModal.tsx:191-252 |
| T7-P12 | Proyek baru: status hilang; default "Dalam Proses"; ganti status di detail | **REF** | default status :31; tanpa select status di form |
| T7-P13 | Detail: teks "(otomatisnya)" dihapus dari terlambat | **REF** | label tanpa otomatis |
| T7-P14 | Card progres tambah detail status terlambat/dll | **REF** | badge status di card progres |
| T7-P15 | Tab ringkasan: "desain & class approval" → log penawaran & tagihan | **REF** | ReportSection |
| T7-P16 | Milestone 7 hari → 1 bulan, list saja | **SEBAGIAN** | List 30 hari :488-494 OK. **Inkonsisten:** gen risiko masih default **7** hari :389 + Projects.tsx:166 → **T7-PRJ4** |
| T7-P17 | WBS: progress material ikut inventori; histori + foto muncul | **REF** | foto upload + histori WBS |
| T7-P18 | Gantt mini: label bulan di bawah indikator | **REF** | ProjectDetail.tsx:1413-1444 |
| T7-P19 | BoQ: 1 nomor surat = beberapa pekerjaan; klik → detail; status revisi krusial | **REF** | BoQSection grouped by nomor surat |
| T7-P20 | Dokumen BoQ masuk Dokumen & Laporan; rapi | **REF** | boqDocsSync + ReportSection:185-216 |
| T7-P21 | Change order harus lewat owner; terkoneksi BoQ | **REF** | canSetTarget gate :573-578; BoQ fields :590-641 |
| T7-P22 | **Hilangkan table risiko** | **BELUM** | Risiko 5×5 + list masih dirender :1996-2043 → **T7-PRJ2** |
| T7-P23 | Tab terkait: "Commissioning & Sea Trial" → "Commisioning & Trial" | **REF** | label rename |
| T7-P24 | Trial: checklist dari WBS + catatan + kondisi | **REF** | D10 :946-955, render :2229-2245 |
| T7-P25 | Garansi dari WBS; muncul saat selesai | **REF** | createWarranty :2142-2154 |
| T7-P26 | Service: list dari pekerjaan/WBS; teknisi pilihan; biaya dari BoQ | **SEBAGIAN** | List dari WBS OK; biaya BoQ OK. **Teknisi masih free-text** :714 → **T7-PRJ3** |
| T7-P27 | Service/sparepart: mekanik minta via PO; perlu approval procurement | **REF** | alur PO inventori D13 |
| T7-P28 | Tim terkoneksi SDM & karyawan | **REF** | teamByProject + pick karyawan |
| T7-P29 | Section subkontraktor per proyek | **REF** | ProjectDetail:2047-2101 |
| T7-P30 | Sparepart: select inventori + stok available; stok kosong→PO, ada→GI | **REF** | SparepartServiceSection:598-625 |
| T7-P31 | WBS aksi assign internal / subkon eksternal | **REF** | assignType + canSetTarget (PRJ2 todo6) |

---

# 2. MONITORING (baris 39-44)

| ID | Permintaan | Status | Bukti |
|---|---|---|---|
| T7-MON1 | Update + foto; monitoring pekerjaan | **REF** | Monitoring.tsx:225-250 |
| T7-MON2 | RBAC per role | **REF** | rbac.ts; Monitoring:74-79 |
| T7-MON3 | Label "perhatian khusus" merah | **REF** | Monitoring:299-312 |
| T7-MON4 | Back nav: Monitoring↔Detail vs Manajemen↔Detail | **REF** | state.from ProjectDetail:112-117 |
| T7-MON5 | Highlight sidebar sub-route | **REF** | isNavActive AppShell:413-423 |
| T7-MON6 | *(interaksi)* status Monitoring tanpa default "Dalam Proses" | **CLEANUP** | Monitoring:451 opsinya kurang default → opsional |

---

# 3. DRYDOCK (baris 46-51)

| ID | Permintaan | Status | Bukti |
|---|---|---|---|
| T7-DD1 | Keterangan maks docking (ukuran) | **REF** | Drydock:952,1231 |
| T7-DD2 | Mapping slot clickable → detail; hapus panel lama | **SEBAGIAN** | Panel lama hapus; **FacilityMap.tsx:103-217 SVG read-only — tidak ada onClick** → **T7-DD1-fix (klik area)** |
| T7-DD3 | Rencana tahunan → waiting list dock | **REF** | Drydock:403-409,1003-1049 |
| T7-DD4 | Booking: date picker; area selectable; auto-fill jadwal proyek | **REF** | Drydock:1216-1223 + move modal date picker |
| T7-DD5 | Maintenance: jadwalkan + date form; alasan di bawah | **REF** | Drydock:1264-1290 |

---

# 4. INVENTORI (baris 53-62)

| ID | Permintaan | Status | Bukti |
|---|---|---|---|
| T7-INV1 | Hapus "muat ulang"; auto-fetch | **REF** | useModuleSync; tombol hilang |
| T7-INV2 | Katalog: highlight kategori; hapus impor-teks/ABC/bin; select di samping scan; hapus teks detail status | **REF** | Inventory:2064-2144,2249 |
| T7-INV3 | Form material: "eceran"; hide min stok gudang; konversi saat pilih kategori | **SEBAGIAN** | Eceran + minWh hide OK; **konversi field selalu tampil** (3385-3390), coupling hanya di save → **COSMETIC** (opsional) |
| T7-INV4 | BOM ↔ procurement; terima checklist; masuk procurement/additional; keluar list+checklist; retur tanpa vendor | **REF** | Inventory:2506-2534; BomDetail |
| T7-INV5 | Pergerakan: 2 grafik tren masuk/keluar; kolom Dari/Ke | **REF** | Inventory:2670-2692 |
| T7-INV6 | Keluar eceran/pcs + potongan plat + liter/drum/ton | **REF** | Inventory:3488-3581 |
| T7-INV7 | Surat Jalan di-hide | **SEBAGIAN** | Tab hilang; **branch ghost :2865-3130 masih di file** → CLEANUP |
| T7-INV8 | Hapus tab Analisis; slow+dead → Pergerakan | **REF** | cards di Pergerakan |

---

# 5. EQUIPMENT (baris 64-69)

| ID | Permintaan | Status | Bukti / gap |
|---|---|---|---|
| T7-EQ1 | Form rename (cabang default, tahun unit, akuisisi, PJ, merk, util est, umur bulan, keterangan, harga barang; hide tarif+bbm) | **REF** | Equipment:2620-2650 |
| T7-EQ2 | Tabel disesuaikan form | **SEBAGIAN** | Kolom utama OK; **belum ada kolom serial + tahun unit/akuisisi** yang form kumpulkan → **T7-EQ1-tabel** |
| T7-EQ3 | Tab "Daftar Equipment" saja; hapus 6 tab lain | **SEBAGIAN** | Tabs hanya 1; **6 branch dead code masih ada** (:1833,:1940,:2020,:2231,:2311,:2445); **deep-link `?tab=` tanpa whitelist masih bisa buka** → **T7-EQ2-deeplink** |
| T7-EQ4 | Card analisis: total / terpakai / maintenance | **REF** | Equipment:1628-1641 |
| T7-EQ5 | Delegasi peminjaman per unit; maintenance di dalam delegasi | **REF** | Equipment:1776-1785,2654-2695 |

---

# 6. SUB KONTRAKTOR (baris 71-81)

| ID | Permintaan | Status | Bukti / gap |
|---|---|---|---|
| T7-SK1 | Evaluasi kinerja dihapus | **REF** | Subcontractor:500,1039 |
| T7-SK2 | WO detail: proyek + kapal + subkon | **REF** | :1145-1149 |
| T7-SK3 | Filter hanya status; semua status | **REF** | :1052-1055 |
| T7-SK4 | Update progress WO: foto + historikal | **REF** | :1673-1705 |
| T7-SK5 | SPK tidak diubah (hanya procurement) | **REF** | :174-177,441-456 |
| T7-SK6 | Tabel termin: proyek, subkon, WO, nilai, retensi, neto, status | **SEBAGIAN** | Kolom OK; **tanpa pager** :1233-1241 → **T7-SK1-pager** |
| T7-SK7 | Skema termin (%, dp/termin, kontan) | **REF** | :611,:1253 |
| T7-SK8 | Form pph → pajak (% pilih) | **REF** | :1798-1807 |
| T7-SK9 | Hapus tab Timesheet | **SEBAGIAN** | Tab hilang; **branch ghost :1368-1459 masih di file** → CLEANUP |

---

# 7. QC & SAFETY (baris 83-87)

| ID | Permintaan | Status | Bukti / gap |
|---|---|---|---|
| T7-QC1 | Hapus tab Drawing | **SEBAGIAN** | Tab hilang dari Tabs; **branch Drawing + CRUD masih di file** (:1669-1765, saveDrawing :972) → CLEANUP |
| T7-QC2 | Inspeksi: list proyek → pekerjaan → subkon/pekerja → kuesioner + skoring | **REF** | :1374-1476 |
| T7-QC3 | HSE: kuesioner ke pekerja | **REF** | :1845-1935 |
| T7-QC4 | Detail teknis WPS/tebal/hardness | **REF** | :2303-2316 (AMBIGU: K3 bisa ganti checklist) |

---

# 8. SDM & KARYAWAN (baris 89-101)

| ID | Permintaan | Status | Bukti / gap |
|---|---|---|---|
| T7-SDM1 | Edit: posisi tetap; tambah di bawah | **REF** | HR:399-411 |
| T7-SDM2 | Tipe: training/kontrak/tetap/outsourcing + kontrak terakhir | **REF** | HR:52,1528 |
| T7-SDM3 | Skill matrix + persentase | **REF** | KaryawanDetail:211-235 |
| T7-SDM4 | Kolom dibuat → terakhir diupdate | **REF** | HR:1531 |
| T7-SDM5 | Sertifikat: file, nomor, berlaku hingga, diterbitkan | **REF** | KaryawanDetail:919-927 |
| T7-SDM6 | Cuti/izin: form mandiri karyawan via barcode | **REF** | QR CUTI + Ajukan Cuti KaryawanDetail:421-468 |
| T7-SDM7 | Hapus tab Mutasi + Org Chart | **SEBAGIAN** | Tab hilang; **dead branch :1761/:1797 + tombol "Mutasi Baru" :1444,:1792 masih hidup** → **T7-SDM1-hide-mutasi** (tombol disembunyikan, code disimpan) |
| T7-SDM8 | Surat: kontrak baru/perpanjang + historikal, SP, preview + kop | **REF** | HR:59-61,1118-1173 |
| T7-SDM9 | Foto karyawan, KTP, ijazah | **REF** | HR:2055-2060 |
| T7-SDM10 | Jabatan dropdown; pendidikan selectable; kawin/tanggungan/jk | **REF** | HR:1996-2052 |

---

# 9. ABSENSI (baris 103-109)

| ID | Permintaan | Status | Bukti / gap |
|---|---|---|---|
| T7-ABS1 | Status otomatis alat | **REF** | CSV fingerprint + auto from record Absensi:153-226 |
| T7-ABS2 | Rekap langsung sebulan | **REF** | tab Rekap |
| T7-ABS3 | Filter bulan + tahun | **REF** | :385-394 |
| T7-ABS4 | Hilangkan shift | **REF** | + sync KaryawanDetail |
| T7-ABS5 | Lembur otomatis >8 jam + maksimal | **REF** | auto-OT cap 12 :126-136 |
| T7-ABS6 | Hapus tren kehadiran | **SEBAGIAN** | Card hide; **memo trend masih dihitung tiap render** :448-480 → CLEANUP |

---

# 10-14. MODUL LAIN

| ID | Permintaan | Status | Bukti |
|---|---|---|---|
| T7-VSL1 | Data kapal detail | **REF** | VesselDetail:406-467 |
| T7-AN1 | Rentang bulan date picker | **REF** | Analytics type=month |
| T7-AN2 | Hapus Prediktif + Preskriptif | **SEBAGIAN** | Tab hilang; **branch ghost + forecast memo masih jalan** → CLEANUP |
| T7-DSH1 | Report perlu perhatian: pilih kategori | **REF** | Dashboard:483-496 |
| T7-PROC | Section procurement (kosong di notes2) | **REF** | RFQ→PO termurah/split |
| T7-FIN | Section keuangan (kosong di notes2) | **REF** | Finance lengkap |

---

# T7 GAP LIST (kerja implementasi)

| ID | Judul | Prioritas | File utama |
|---|---|---|---|
| T7-PRJ1 | Aturan progress: Manual (Monitoring) vs WBS-weighted — jangan ditimpa diam-diam. `progressSource: "manual"` dari Monitoring; auto-WBS hanya bila source `"wbs"` | **tinggi** | **W1 SELESAI** ProjectDetail.tsx:375-391 skip manual; saveWbs* tulis progressSource:"wbs"; Monitoring.tsx:232-236 tulis "manual" |
| T7-PRJ2 | Sembunyikan/hapus tabel risiko di Perubahan & Risiko | **tinggi** | **W0 SELESAI** ProjectDetail.tsx render `{false && …}` (data risks store tetap) |
| T7-PRJ3 | Teknisi service → select dari `data.employees` | **tinggi** | **W1 SELESAI** SparepartServiceSection.tsx service + sparepart form teknisi = select karyawan |
| T7-PRJ4 | Samakan default ALERT_MILESTONE_DAYS (7 vs 30 → pilih 30) | sedang | **W1 SELESAI** ProjectDetail.tsx:389 + Projects.tsx:166 default 30 |
| T7-DD1 | FacilityMap: area/slot clickable → modal detail | sedang | **W2 SELESAI** FacilityMap.tsx onFacilityClick/onVesselClick; Drydock.tsx mapFacilityId modal + openMapVessel |
| T7-EQ1 | Tabel Equipment: tambah kolom nomor seri + tahun unit/akuisisi | sedang | **W1 SELESAI** Equipment.tsx:1696-1708 kolom serial + acqYear + sort |
| T7-EQ2 | `useDeepLinkTarget` Equipment: whitelist `["Daftar Equipment"]` | **tinggi** | **W0 SELESAI** Equipment.tsx:689 |
| T7-SK1 | Pager pada tabel termin & pembayaran | rendah | **W0 SELESAI** Subcontractor.tsx:236 termPager + bar setelah tabel |
| T7-SDM1 | Sembunyikan tombol "Mutasi Baru" (code & modal disimpan) | sedang | **W0 SELESAI** HR.tsx:1444 & 1797 `{false && …}` |
| T7-INV1 | (opsional) Form konversi muncul saat pilih kategori eceran | rendah | Inventory.tsx:3385 |

# CLEANUP (opsional, gelombang terpisah)

| ID | Paket | Status |
|---|---|---|
| T7-CLEAN1 | QC Drawing dead branch + CRUD | **W3 SELESAI** QCSafety.tsx: tab, modal, saveDrawing/revise/step/transmittal, "drawings" di QC_COLS dihapus |
| T7-CLEAN2 | Equipment 6 tab hantu | **W3 SELESAI** Equipment.tsx: 6 tab + 21 fungsi + 33 state + 9 modal + 24 memo dihapus (3219→~1500 baris) |
| T7-CLEAN3 | Subkon Timesheet ghost | **W3 SELESAI** Subcontractor.tsx: tab, modal timesheet, saveTimesheet/approve/edit/del, rate form dihapus; timesheets collection tetap (progress WO) |
| T7-CLEAN4 | Inventory Tonase & SJ + Analisis ghost | **W3 SELESAI** Inventory.tsx: 2 branch + DO modal + states/helpers (~−647 baris) |
| T7-CLEAN5 | Analytics Prediktif/Preskriptif + memo forecast | **W3 SELESAI** Analytics.tsx: 2 tab branch + scenario CRUD UI dihapus; forecast/scenarios tetap untuk Excel export |
| T7-CLEAN6 | HR Mutasi/OrgChart dead tabs | **SKIP** (keputusan user: tombol di-hide, code disimpan) |
| T7-CLEAN7 | RFQ winner residual fields | **W3 SELESAI** Procurement.tsx: `winner`/`winnerVendor`/`winnerPrice` dihapus dari payload |
| T7-CLEAN8 | Absensi attendanceTrend memo | **W3 SELESAI** Absensi.tsx: memo + chart block + unused imports dihapus |

---

# PERTANYAAN KE CLIENT

1. T7-PRJ1: progress manual Monitoring vs auto-WBS — mana yang jadi sumber kebenaran saat bentrok?
2. T7-QC4: checklist K3 (WPS/tebal/hardness/visual) sudah default — konfirmasi atau ganti checklist K3 Kapal?
3. T7-INV6: konversi plat 7850 kg/m³ / drum 200L — konfirmasi rumus default.

---

# GELOMBANG IMPLEMENTASI

| Gelombang | Fokus |
|---|---|
| **W0** | T7-EQ2 deeplink whitelist; T7-SDM1 hide tombol mutasi; T7-SK1 pager termin; T7-PRJ2 hilangkan tabel risiko | **SELESAI** (build lulus) |
| **W1** | T7-PRJ1 progress rule; T7-PRJ3 teknisi select; T7-PRJ4 default milestone; T7-EQ1 kolom tabel | **SELESAI** (build lulus) |
| **W2** | T7-DD1 FacilityMap clickable | **SELESAI** (build lulus) |
| **W3 (opsional)** | CLEANUP paket 1-8 (dead code removal, build pasti lulus) | **SELESAI** (build lulus; CLEAN6 skip per keputusan user) |

---

# METODE

- Real-check penuh 130 baris notes2 terhadap HEAD `ee57818` (bukan salin todo6).
- Status REF = konfirmasi ulang kode; SEBAGIAN/BELUM → masuk T7 gap.
- Probe/build wajib sebelum commit tiap gelombang.
- Tulis bukti file:line saat implementasi diperbarui di tabel.
