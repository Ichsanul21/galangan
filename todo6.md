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
| T6-ETC4 | Procurement multi-vendor: item tak tersedia → vendor lain | **BELUM** | RFQ multi-quote ada; split fulfillment belum |
| T6-ETC5 | RFQ track record harga | **SELESAI** | Card RFQ menampilkan track record harga item sama dari PO/RFQ lampau (maks 5 terbaru) |
| T6-ETC6 | RFQ: hapus "sistem tender vendor"; komparasi harga tetap | **SEBAGIAN** | Komparasi quote ada; winner/tender masih ada (`confirmWin`) |
| T6-ETC7 | Pagination di bawah tabel | **SELESAI (Procurement)** | Audit modul lain opsional |

---

# 2. MANAJEMEN PROYEK

| ID | Permintaan | Status | Bukti / gap |
|---|---|---|---|
| T6-P*/D* | Seluruh permintaan proyek di notes2 = notes.txt | **REF** | todo5 69/69 |
| T6-PRJ1 | Sparepart: nama selectable dari inventori + stok available | **SELESAI** | EntityPicker inventory; stok di hint; pick isi name/partNumber/cost |
| T6-PRJ2 | WBS: assign pengerja internal / subkon eksternal | **BELUM** | Tidak ada "assign" di ProjectDetail WBS |
| T6-PRJ3 | Dokumen BoQ: perbaiki tampilan berantakan | **SEBAGIAN** | Sinkron D6 ada; duplikasi ReportSection vs kartu dokumen belum dirapikan |

---

# 3. MONITORING PROYEK (prioritas client)

| ID | Permintaan | Status | Bukti / gap |
|---|---|---|---|
| T6-MON1 | Update proyek + foto; fungsi monitoring pekerjaan | **SEBAGIAN** | Foto WBS ada; Monitoring masih view-only kanban |
| T6-MON2 | RBAC berbeda per role | **BELUM** | Monitoring tidak bedakan role |
| T6-MON3 | Label "perhatian khusus" merah | **SELESAI** | `monAttTitle` = "Perhatian Khusus ({n})"; ikon+teks merah di Monitoring |
| T6-MON4 | Back nav: Monitoring↔Detail vs Manajemen↔Detail | **SELESAI** | `location.state.from`; Projects → `manajemen`, Monitoring → `monitoring` |
| T6-MON5 | Highlight sidebar di sub-route | **SELESAI** | NavLink `/proyek` tanpa `end` lagi |

---

# 4. DRYDOCK & KAPASITAS

| ID | Permintaan | Status | Bukti / gap |
|---|---|---|---|
| T6-DD1 | Keterangan maks docking (ukuran) | **SELESAI** | `dock.capacity` di UI |
| T6-DD2 | Mapping slot clickable → detail; hapus panel lama | **SEBAGIAN** | Modal slot ada; panel terpisah (utilisasi/slot per area) belum dihapus |
| T6-DD3 | Rencana docking tahunan → waiting list dock | **BELUM** | Tidak ada "waiting list" |
| T6-DD4 | Booking: date picker (bukan day-index); area selectable; auto-fill jadwal proyek | **BELUM** | `bookForm.from/to` masih `NumInput` 0–90 |
| T6-DD5 | Maintenance: jadwalkan + date form; alasan di bawah | **BELUM** | `maintForm.from/to` masih day-index |

---

# 5. INVENTORI & MATERIAL

| ID | Permintaan | Status | Bukti / gap |
|---|---|---|---|
| T6-INV1 | Hapus tombol "Muat ulang"; auto-fetch | **SELESAI** | Tombol dihapus; C2 pull periodik tetap |
| T6-INV2 | Katalog: highlight kategori; hapus teks impor, kolom ABC, kolom bin; pindah select ke samping scan; hapus teks detail status | **SELESAI** | Kolom ABC+bin dihapus; teks "perlu PR" dihapus; impor sebaris dgn scan; hint kolom disembunyikan |
| T6-INV3 | Form material: "eceran"; hapus min stok gudang; konversi muncul saat pilih kategori | **SELESAI** | Label "Eceran"; field minWh disembunyikan; form konversi (uom2/konversi/preset) selalu tampil di form material |
| T6-INV4 | BOM ↔ procurement; terima checklist; masuk procurement/additional; keluar list+checklist; retur tanpa vendor | **SEBAGIAN** | Tab BOM lama; struktur checklist/procurement belum |
| T6-INV5 | Pergerakan: 2 grafik tren masuk/keluar; kolom Dari/Ke | **SELESAI** | Dua AreaChart (in/out) + nilai stok; label filter "Dari / Ke" |
| T6-INV6 | Keluar eceran/pcs + potongan plat + liter/drum/ton | **BELUM** | Butuh spesifikasi bisnis |
| T6-INV7 | Surat Jalan di-hide | **SELESAI** | Tab "Tonase & Surat Jalan" dihapus dari Tabs |
| T6-INV8 | Hapus tab Analisis; slow moving + dead stock → Pergerakan | **SELESAI** | Tab Analisis dihapus; card slow+dead dirender di Pergerakan |

---

# 6. EQUIPMENT (restruktur)

| ID | Permintaan | Status | Bukti / gap |
|---|---|---|---|
| T6-EQ1 | Rename/hidden form (cabang default Samarinda, tahun unit, tahun akuisisi, PJ unit, merk, estimasi utilisasi, umur pakai bulan, keterangan, harga barang; hide tarif+bbm) | **BELUM** | Form masih serial/model/pic/rate/fuelPrice |
| T6-EQ2 | Tabel disesuaikan form | **BELUM** | |
| T6-EQ3 | Tab **Daftar Equipment** saja; hapus Alokasi/Booking, Sedang Dipakai, Maintenance, Kalibrasi, Biaya, Utilisasi | **SELESAI** | Tabs kini hanya `["Daftar Equipment"]`; body tab lama tidak dirender |
| T6-EQ4 | Card analisis: Total / Sedang terpakai / Dalam maintenance (kalibrasi+service) | **BELUM** | |
| T6-EQ5 | Delegasi peminjaman per unit; maintenance di dalam delegasi | **BELUM** | Tidak ada "delegasi" |

> Catatan: E1–E5 todo5 (logika servis, jam 24H, biaya) **tetap dipakai**; notes2 minta restruktur UI/tab.

---

# 7. SUBKONTRAKTOR

| ID | Permintaan | Status | Bukti / gap |
|---|---|---|---|
| T6-SK1 | Hapus evaluasi kinerja | **SELESAI** | Card evalChart + EvalTooltip dihapus dari UI |
| T6-SK2 | WO detail: proyek + kapal + subkon | **BELUM** | |
| T6-SK3 | Filter hanya status; semua status tampil | **BELUM** | |
| T6-SK4 | Update progress WO: foto + historikal | **BELUM** | |
| T6-SK5 | SPK tidak bisa diubah (hanya procurement) | **BELUM** | Edit WO masih bisa (kecuali Selesai) |
| T6-SK6 | Tabel termin: proyek, subkon, WO, nilai, retensi, neto, status | **SEBAGIAN** | Kolom pph/tanggal masih; nama proyek belum |
| T6-SK7 | Skema termin (%, dp/termin, kontan) | **BELUM** | |
| T6-SK8 | Field "pajak" (pilih %) ganti pph | **SELESAI** | Label form termin = "Pajak (%)"; nilai tetap `pphPct` di store |
| T6-SK9 | Hapus tab Timesheet | **SELESAI** | Tabs tanpa Timesheet |

---

# 8. QC & SAFETY

| ID | Permintaan | Status | Bukti / gap |
|---|---|---|---|
| T6-QC1 | Hapus tab Drawing | **SELESAI** | Tabs QC tanpa Drawing |
| T6-QC2 | Inspeksi: list proyek → pekerjaan → subkon/pekerja → kuesioner + skoring | **BELUM** | Tabel inspeksi flat |
| T6-QC3 | HSE: kuesioner ke pekerja | **BELUM** | HSE = JSA + toolbox |
| T6-QC4 | Detail teknis | **AMBIGU** | "Dibahas dengan K3 Kapal" |

---

# 9. SDM & KARYAWAN

| ID | Permintaan | Status | Bukti / gap |
|---|---|---|---|
| T6-SDM1 | Edit baris: posisi tetap; tambah di bawah | **BELUM** | |
| T6-SDM2 | Tipe karyawan: training/kontrak/tetap/outsourcing + kontrak terakhir | **SEBAGIAN** | TIPE_KARYAWAN ada Tanpa "Training"; kontrak terakhir belum |
| T6-SDM3 | Skill matrix + persentase | **SEBAGIAN** | Skill = string array; % belum |
| T6-SDM4 | Kolom "dibuat" → "terakhir diupdate" | **BELUM** | |
| T6-SDM5 | Sertifikat: file, nomor, berlaku hingga, diterbitkan | **BELUM** | certForm hanya name+expires |
| T6-SDM6 | Cuti/izin: form mandiri karyawan via barcode | **BELUM** | |
| T6-SDM7 | Hapus tab Mutasi + Org Chart | **BELUM** | Kedua tab masih ada |
| T6-SDM8 | Surat: kontrak baru/perpanjang + historikal, SP, preview + kop | **BELUM** | SURAT_JENIS masih SP1/2/3/Mutasi |
| T6-SDM9 | Foto karyawan, KTP, ijazah | **BELUM** | |
| T6-SDM10 | Jabatan dropdown; pendidikan selectable; kawin/tanggungan/jk | **BELUM** | |

---

# 10. ABSENSI

| ID | Permintaan | Status | Bukti / gap |
|---|---|---|---|
| T6-ABS1 | Status hari ini otomatisasi alat | **AMBIGU** | Integrasi alat absensi? |
| T6-ABS2 | Rekap langsung sebulan | **SELESAI** | Tab Rekap bulanan ada |
| T6-ABS3 | Filter bulan + tahun | **SEBAGIAN** | Filter bulan ada; tahun belum |
| T6-ABS4 | Hilangkan shift | **SELESAI** | Select shift dihapus; internal tetap "Pagi" |
| T6-ABS5 | Lembur otomatis >8 jam + skema maksimal | **BELUM** | Sekarang manual, cap 8 jam |
| T6-ABS6 | Hapus tren kehadiran | **SELESAI** | Card tren di-hide dari render |

---

# 11–14. MODUL LAIN

| ID | Permintaan | Status | Bukti / gap |
|---|---|---|---|
| T6-VSL1 | Data kapal tampilkan detail | **AMBIGU** | Field detail apa saja? |
| T6-AN1 | Rentang bulan date picker | **BELUM** | Preset [6,12,18,24] |
| T6-AN2 | Hapus tab Prediktif + Preskriptif | **SELESAI** | Tabs Analytics: Deskriptif, Diagnostik, Profitabilitas |
| T6-DSH1 | Report perlu perhatian: pilih kategori | **BELUM** | Hanya group by level |
| T6-PROC | Section Procurement di notes2 | **KOSONG** | Belum ada isi |
| T6-FIN | Section Keuangan di notes2 | **KOSONG** | Belum ada isi |

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
| **W6** | QC2/3; DSH1; AN1 |
| **W7** | Push + deploy + QA 2 device |

---

# PERTANYAAN KE CLIENT

1. T6-INV6: rumus eceran/potongan plat & satuan resmi?  
2. T6-QC4: spesifikasi inspeksi/HSE dari K3 kapan?  
3. T6-EQ3: data booking/maintenance/biaya yang dihapus tab — tetap di store atau pindah modul?  
4. T6-SDM6: arah barcode cuti (HR generate → karyawan scan, atau sebaliknya)?  
5. T6-ABS1: "otomatisasi alat" = fingerprint/API atau hitung checkIn/out?  
6. Section Procurement & Keuangan di notes2 kosong — ada revisi lanjutan?  
7. T6-VSL1: field detail kapal yang wajib?  
8. T6-PRJ2: siapa yang boleh assign WO (PM only?)?  

---

# METODE

- Real check terhadap kode setelah todo5 (`7fe2900`+).
- Status REF = todo5 SELESAI, bukan diulang.
- Bukti file:line saat implementasi W0+ diperbarui di tabel.
- Probe/build wajib sebelum commit tiap gelombang.
