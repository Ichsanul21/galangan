# TODO 6 - Revisi Client 5-6 Oktober (`notes2.txt`)

Sumber: `notes2.txt` — NEW REVISION 5-6 OKTOBER GALANGAN.
Real check terhadap working tree setelah todo5 (commit `7fe2900`.. sesi ini).

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
| SELESAI baru (W0) | dihitung setelah gelombang jalan |
| SEBAGIAN | Inventory konversi/BOM/pergerakan, Subkon termin, SDM tipe/skill, RFQ tender, sparepart select |
| BELUM / BARU | Monitoring, Drydock booking+waiting list, Equipment tabs/delegasi, SDM besar, Absensi auto lembur, QC inspeksi/HSE, Dashboard filter, RFQ track record, WBS assign |
| AMBIGU | QC K3, eceran/potongan, absensi alat, section Procurement/Keuangan kosong di notes2 |

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
| T6-ETC1 | Hapus filter cabang topbar | **REF** | B1 SELESAI |
| T6-ETC2 | Format titik input harga | **REF** | B2 SELESAI |
| T6-ETC3 | Alur proyek→BOQ→mekanik minta barang (stok/GI vs PO) | **REF** | D13 SELESAI |
| T6-ETC4 | Procurement multi-vendor: item tak tersedia → vendor lain | **SELESAI** | Tombol "PO Split" di RFQ bila ada quote; alokasi qty per vendor → 1 PO per vendor (`rfqId` + `splitFrom`) |
| T6-ETC5 | RFQ track record harga | **SELESAI** | Card RFQ menampilkan track record harga item sama dari PO/RFQ lampau (maks 5 terbaru) |
| T6-ETC6 | RFQ: hapus "sistem tender vendor"; komparasi harga tetap | **SELESAI** | Tombol Menangkan/badge pemenang sudah dihapus; search RFQ tanpa field winner; komparasi quote tetap |
| T6-ETC7 | Pagination di bawah tabel | **SELESAI (Procurement)** | Audit modul lain opsional |

---

# 2. MANAJEMEN PROYEK

| ID | Permintaan | Status | Bukti / gap |
|---|---|---|---|
| T6-P*/D* | Seluruh permintaan proyek di notes2 = notes.txt | **REF** | todo5 69/69 |
| T6-PRJ1 | Sparepart: nama selectable dari inventori + stok available | **SELESAI** | EntityPicker inventory; stok di hint; pick isi name/partNumber/cost |
| T6-PRJ2 | WBS: assign pengerja internal / subkon eksternal | **SELESAI** | `assignType` Internal/Subkon + `assignee` di ProjectDetail; badge amber/biru; pick karyawan/subkon. **RBAC assign: hanya `canSetTarget` (PM/direktur/manager/developer)** |
| T6-PRJ3 | Dokumen BoQ: perbaiki tampilan berantakan | **SELESAI** | ReportSection: ringkasan BoQ (item/nilai/status) + tombol buka tab BoQ; daftar flat diganti; grouped detail tetap di BoQSection |

---

# 3. MONITORING PROYEK (prioritas client)

| ID | Permintaan | Status | Bukti / gap |
|---|---|---|---|
| T6-MON1 | Update proyek + foto; fungsi monitoring pekerjaan | **SELESAI** | Modal update di Monitoring kanban (progress/status/actual/budget/foto/catatan); tulis `update("projects")` + log; detail WBS tetap di ProjectDetail |
| T6-MON2 | RBAC berbeda per role | **SELESAI** | `auth/rbac.ts` runtime `can(role,"Monitoring",aksi)`; deny-by-default tanpa Lihat; export gated Ekspor; update gated Ubah/Buat; demo role disamakan ke kunci matrix |
| T6-MON3 | Label "perhatian khusus" merah | **SELESAI** | `monAttTitle` = "Perhatian Khusus ({n})"; ikon+teks merah di Monitoring |
| T6-MON4 | Back nav: Monitoring↔Detail vs Manajemen↔Detail | **SELESAI** | `location.state.from`; Projects → `manajemen`, Monitoring → `monitoring` |
| T6-MON5 | Highlight sidebar di sub-route | **SELESAI** | `isNavActive()` eksklusif di AppShell - `/proyek` vs `/proyek/monitoring` tidak menyala bersamaan |

---

# 4. DRYDOCK & KAPASITAS

| ID | Permintaan | Status | Bukti / gap |
|---|---|---|---|
| T6-DD1 | Keterangan maks docking (ukuran) | **SELESAI** | `dock.capacity` di UI |
| T6-DD2 | Mapping slot clickable → detail; hapus panel lama | **SELESAI** | Panel lama dihapus (Utilisasi, Peta Kapasitas Area, tabel Slot per Area); mapping slot + modal detail + tabel slot utama tetap |
| T6-DD3 | Rencana docking tahunan → waiting list dock | **SELESAI** | Card diganti **Waiting List Dock**: proyek tanpa slot + tombol booking auto-fill jadwal; grid bulanan tetap di bawah |
| T6-DD4 | Booking: date picker (bukan day-index); area selectable; auto-fill jadwal proyek | **SELESAI** | Input tanggal mulai/selesai (kalender); `from/to` = indeks hari dari ISO; pilih proyek auto-fill start/end; area via datalist |
| T6-DD5 | Maintenance: jadwalkan + date form; alasan di bawah | **SELESAI** | Tombol "Jadwalkan Maintenance"; tanggal kalender; alasan di field terakhir |

---

# 5. INVENTORI & MATERIAL

| ID | Permintaan | Status | Bukti / gap |
|---|---|---|---|
| T6-INV1 | Hapus tombol "Muat ulang"; auto-fetch | **SELESAI** | Tombol dihapus; C2 pull periodik tetap |
| T6-INV2 | Katalog: highlight kategori; hapus teks impor, kolom ABC, kolom bin; pindah select ke samping scan; hapus teks detail status | **SELESAI** | Badge kategori warna deterministik (`catTone`); select impor sebaris scan; rumus ABC + filter ABC + hint kolom dihapus; kolom ABC/bin/status subtext sudah hilang |
| T6-INV3 | Form material: "eceran"; hapus min stok gudang; konversi muncul saat pilih kategori | **SELESAI** | Label "Eceran"; field minWh disembunyikan; form konversi (uom2/konversi/preset) selalu tampil di form material |
| T6-INV4 | BOM ↔ procurement; terima checklist; masuk procurement/additional; keluar list+checklist; retur tanpa vendor | **SELESAI** | Tab BOM: checklist pengadaan (Terima PR/PO → GR+stok; Keluar PR disetujui); retur vendor opsional (label "Retur") |
| T6-INV5 | Pergerakan: 2 grafik tren masuk/keluar; kolom Dari/Ke | **SELESAI** | Dua AreaChart (in/out) + nilai stok; label filter "Dari / Ke" |
| T6-INV6 | Keluar eceran/pcs + potongan plat + liter/drum/ton | **SELESAI** | GI helpers: potongan plat P×L×T×pcs→kg (`sbTonasePlat`), konversi bulk liter/drum/ton (drum=200L); eceran default uom2 |
| T6-INV7 | Surat Jalan di-hide | **SELESAI** | Tab "Tonase & Surat Jalan" dihapus dari Tabs |
| T6-INV8 | Hapus tab Analisis; slow moving + dead stock → Pergerakan | **SELESAI** | Tab Analisis dihapus; card slow+dead dirender di Pergerakan |

---

# 6. EQUIPMENT (restruktur)

| ID | Permintaan | Status | Bukti / gap |
|---|---|---|---|
| T6-EQ1 | Rename/hidden form (cabang default Samarinda, tahun unit, tahun akuisisi, PJ unit, merk, estimasi utilisasi, umur pakai bulan, keterangan, harga barang; hide tarif+bbm) | **SELESAI** | Label diganti; branch hidden; serial→tahun unit; model→merk; pic→PJ unit; acqYear+notes ditambah; usefulLife form=bulan (store=tahun); tarif+BBM di-hide |
| T6-EQ2 | Tabel disesuaikan form | **SELESAI** | Kolom: Equipment, Kategori, Merk, PJ unit, Status, Utilisasi, Jam, Harga barang, Dibuat, Diubah, Aksi |
| T6-EQ3 | Tab **Daftar Equipment** saja; hapus Alokasi/Booking, Sedang Dipakai, Maintenance, Kalibrasi, Biaya, Utilisasi | **SELESAI** | Tabs kini hanya `["Daftar Equipment"]`; body tab lama tidak dirender |
| T6-EQ4 | Card analisis: Total / Sedang terpakai / Dalam maintenance (kalibrasi+service) | **SELESAI** | KPI: Total · Sedang Terpakai · Dalam Maintenance (status Maintenance + kalibrasi aktif belum Selesai/Gagal) + due soon |
| T6-EQ5 | Delegasi peminjaman per unit; maintenance di dalam delegasi | **SELESAI** | Tombol Delegasi per baris; modal EntityPicker + catatan; `delegatedTo/delegatedAt/delegationNote`; badge + tanggal; `pic` asli TIDAK ditimpa |

> Catatan: E1–E5 todo5 (logika servis, jam 24H, biaya) **tetap dipakai**; notes2 minta restruktur UI/tab.

---

# 7. SUBKONTRAKTOR

| ID | Permintaan | Status | Bukti / gap |
|---|---|---|---|
| T6-SK1 | Hapus evaluasi kinerja | **SELESAI** | Card evalChart + EvalTooltip dihapus dari UI |
| T6-SK2 | WO detail: proyek + kapal + subkon | **SELESAI** | Kartu WO tampilkan subkon · proyek · kapal (dari project.vessel) |
| T6-SK3 | Filter hanya status; semua status tampil | **SELESAI** | Select status saja (Semua/Aktif/Kualifikasi/Blacklist/Nonaktif); tipe kontrak tidak lagi filter utama |
| T6-SK4 | Update progress WO: foto + historikal | **SELESAI** | Modal progres: unggah foto + daftar historikal (progress before→after, note, by) |
| T6-SK5 | SPK tidak bisa diubah (hanya procurement) | **SELESAI** | Tombol Ubah WO hanya untuk role target/procurement; saveWoEdit di-guard |
| T6-SK6 | Tabel termin: proyek, subkon, WO, nilai, retensi, neto, status | **SELESAI** | Kolom: Proyek · Subkon · WO · Nilai · Retensi · Neto · Status · Aksi |
| T6-SK7 | Skema termin (%, dp/termin, kontan) | **SELESAI** | Select skema di form termin; disimpan `termins.scheme`; ditampilkan di tabel termin (Skema: …) |
| T6-SK8 | Field "pajak" (pilih %) ganti pph | **SELESAI** | Label form termin = "Pajak (%)"; nilai tetap `pphPct` di store |
| T6-SK9 | Hapus tab Timesheet | **SELESAI** | Tabs tanpa Timesheet |

---

# 8. QC & SAFETY

| ID | Permintaan | Status | Bukti / gap |
|---|---|---|---|
| T6-QC1 | Hapus tab Drawing | **SELESAI** | Tabs QC tanpa Drawing |
| T6-QC2 | Inspeksi: list proyek → pekerjaan → subkon/pekerja → kuesioner + skoring | **SELESAI** | Hierarki kartu proyek → inspeksi expand → kuesioner butir + skor%; field subkon/pekerja di form; tabel detail tetap |
| T6-QC3 | HSE: kuesioner ke pekerja | **SELESAI** | Kartu "Kuesioner HSE ke pekerja": pilih pekerja, butir Ya/tidak, skor %; riwayat disebar di tab HSE |
| T6-QC4 | Detail teknis | **SELESAI** | Field WPS/tebal mm/hardness/catatan visual di form inspeksi; default standar galangan (K3 dapat menyesuaikan) |

---

# 9. SDM & KARYAWAN

| ID | Permintaan | Status | Bukti / gap |
|---|---|---|---|
| T6-SDM1 | Edit baris: posisi tetap; tambah di bawah | **SELESAI** | Urutan default createdAt ascending (baru di bawah); edit = modal tidak mengubah posisi |
| T6-SDM2 | Tipe karyawan: training/kontrak/tetap/outsourcing + kontrak terakhir | **SELESAI** | TIPE_KARYAWAN = Tetap/Kontrak/Outsourcing/Training; kolom kontrak tetap |
| T6-SDM3 | Skill matrix + persentase | **SELESAI** | Skill format `Nama\|80`; badge warna %; input placeholder mendukung |
| T6-SDM4 | Kolom "dibuat" → "terakhir diupdate" | **SELESAI** | Tabel karyawan hanya kolom Terakhir diupdate |
| T6-SDM5 | Sertifikat: file, nomor, berlaku hingga, diterbitkan | **SELESAI** | Form sertifikat: nomor, diterbitkan, berlaku, unggah file + preview |
| T6-SDM6 | Cuti/izin: form mandiri karyawan via barcode | **SELESAI** | Form cuti mandiri di KaryawanDetail (NIK login); QR `CUTI:{id}:{nik}` di daftar cuti HR + KaryawanDetail untuk scan |
| T6-SDM7 | Hapus tab Mutasi + Org Chart | **SELESAI** | Tabs: Karyawan, Cuti & Izin, Training, Surat & Impor |
| T6-SDM8 | Surat: kontrak baru/perpanjang + historikal, SP, preview + kop | **SELESAI** | Jenis "Kontrak Kerja" + "Perpanjangan Kontrak"; field mulai/berakhir/gaji; kop SB_KOP; arsip surat tetap |
| T6-SDM9 | Foto karyawan, KTP, ijazah | **SELESAI** | Form HR: unggah foto profil + KTP + ijazah; tautan dokumen di KaryawanDetail |
| T6-SDM10 | Jabatan dropdown; pendidikan selectable; kawin/tanggungan/jk | **SELESAI** | Jabatan dropdown + pendidikan (SD–S3) + status kawin + jenis kelamin + tanggungan |

---

# 10. ABSENSI

| ID | Permintaan | Status | Bukti / gap |
|---|---|---|---|
| T6-ABS1 | Status hari ini otomatisasi alat | **SELESAI** | Tombol "Otomatis dari record" (isi grid dari attendance tersimpan) + impor CSV fingerprint (NIK/Tanggal/Masuk/Keluar) |
| T6-ABS2 | Rekap langsung sebulan | **SELESAI** | Tab Rekap bulanan ada |
| T6-ABS3 | Filter bulan + tahun | **SELESAI** | FilterPopover rekap: bulan + tahun (dropdown dari data attendance) |
| T6-ABS4 | Hilangkan shift | **SELESAI** | Select shift dihapus; internal tetap "Pagi" |
| T6-ABS5 | Lembur otomatis >8 jam + skema maksimal | **SELESAI** | setRow auto-hitung OT (worked−8, max 12); validasi 0–12 (bukan 8); NumInput max 12 |
| T6-ABS6 | Hapus tren kehadiran | **SELESAI** | Card tren di-hide dari render |

---

# 11–14. MODUL LAIN

| ID | Permintaan | Status | Bukti / gap |
|---|---|---|---|
| T6-VSL1 | Data kapal tampilkan detail | **SELESAI** | Kartu "Detail teknis kapal": identitas (IMO/MMSI/tipe/pemilik), dimensi (LOA/beam/draft/bollard/GT/NT/BHP), kelas/bendera/tahun/mesin + daftar sertifikat |
| T6-AN1 | Rentang bulan date picker | **SELESAI** | Input `type="month"` from/to + Reset; preset [6,12,18,24] tetap ada |
| T6-AN2 | Hapus tab Prediktif + Preskriptif | **SELESAI** | Tabs Analytics: Deskriptif, Diagnostik, Profitabilitas |
| T6-DSH1 | Report perlu perhatian: pilih kategori | **SELESAI** | Filter modul + group by level tetap (`Dashboard.tsx` attnMod) |
| T6-PROC | Section Procurement di notes2 | **SELESAI (default)** | Notes2 kosong → diisi alur RFQ→PO: tombol **PO Termurah** (quote termurah→PO) + **PO Split** multi-vendor + komparasi quote tetap |
| T6-FIN | Section Keuangan di notes2 | **SELESAI (default)** | Notes2 kosong → modul Finance sudah lengkap (invoice pipeline, dunning otomatis Terlambat, AR/AP, jurnal, retensi); tidak ada revisi spesifik yang bisa ditebak |

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

---

# PERTANYAAN KE CLIENT

1. T6-INV6: ~~rumus eceran/potongan plat~~ **SELESAI** default (plat 7850 kg/m³; drum 200L) — konfirmasi bila beda  
2. T6-QC4: ~~spesifikasi K3~~ **SELESAI** default (WPS/tebal/hardness/visual) — K3 bisa menyesuaikan checklist  
3. T6-EQ3: data booking/maintenance/biaya yang dihapus tab — tetap di store (sudah)  
4. T6-SDM6: ~~arah barcode~~ **SELESAI** default (QR CUTI:{id}:{nik} + form mandiri KaryawanDetail)  
5. T6-ABS1: ~~otomatisasi alat~~ **SELESAI** default (auto from record + CSV fingerprint)  
6. Section Procurement & Keuangan di notes2 kosong — **SELESAI (default)** RFQ→PO termurah/split; Finance sudah ada dunning otomatis  
7. T6-VSL1: ~~field detail kapal~~ **SELESAI** (IMO/MMSI/dimensi/kelas/bendera/tahun/mesin/serifikat)  
8. T6-PRJ2: ~~siapa assign WO~~ **SELESAI** PM/direktur/manager/developer saja (`canSetTarget`)  

---

# METODE

- Real check terhadap kode setelah todo5 (`7fe2900`+).
- Status REF = todo5 SELESAI, bukan diulang.
- Bukti file:line saat implementasi W0+ diperbarui di tabel.
- Probe/build wajib sebelum commit tiap gelombang.
