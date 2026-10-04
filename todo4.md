# TODO 4 — Audit 15 Sisa Requirement Client & Rencana Konsolidasi

Status: **F0-F7 selesai. Semua fase sudah diimplementasi dan ter-push.**
Referensi: `todo.md` (audit `1dd963a`), `todo2.md` (revisi 02 September),
`todo3.md` (revisi 2 Oktober + arsitektur PDF server-side). Dokumen ini
**meneruskan** `todo3.md` dan membetulkan klaim "selesai" di sana yang
ternyata tidak akurat.

Status per fase ada di tabel [STATUS FASE](#status-fase-terakhir-diperbarui).
Bagian PETA STATUS 15 ITEM di bawah sengaja dibiarkan apa adanya: itu rekaman
audit pada `9dd8d33`, bukan klaim status sekarang. Jangan dipakai sebagai
acuan - gunakan tabel fase.

Dasar: 4 auditor paralel read-only terhadap `apps/web` + `services/api`
@ `9dd8d33`, lalu verifikasi ulang langsung terhadap kode untuk item yang
statusnya beda.

---

# STATUS FASE (terakhir diperbarui)

Semua baris di bawah diverifikasi lewat `npm run check`, bukan berdasarkan
ingat. Probe yang disebut di setiap baris bisa gagal, dan setiap probe sudah
diuji dengan mutasi supaya tidak hijau tanpa alasan.

| Fase | Isi | Commit | Status |
|---|---|---|---|
| F0 | Fondasi: `SearchBox`, `EntityPicker`, `rowMatches`, timestamp sentral, tanggal hapus dari audit log, `utils/woMilestones.ts` | `2c4ceef` | selesai |
| F1 | Notifikasi 3 tingkat + dismiss per severity (session-only) | `2c4ceef`, `6939222` | selesai |
| F2 | Peta fasilitas drydock: skala panjang, pita kapal, outline merah | `b7e09ac` | selesai |
| F3 | Item 12, 14, 6, 9, 5 + label EN, regresi item 3 | `2c4ceef` | selesai |
| F4 | Item 8, 15, 13, 10, 7 | `2c4ceef` | selesai |
| F5 | Item 11 - milestone benar-benar per WO | `2c4ceef` | selesai |
| F6 | Search semua tabel + kolom tanggal 15 tabel utama | `9808097`, `9fa5c63` | selesai |
| F7 | Item 1 - tarif dari riset pasar + probe ketat | `9f32be2` | selesai |

## Gerbang verifikasi

`npm run check` di `apps/web` (28/28 render, 35/35 pemeriksaan, 6 probe) dan
`npm run build` di `services/api`.

| Probe | Mengunci apa |
|---|---|
| `probe:render` | 28 halaman render + kesetaraan sel tabel dari HTML nyata + peta fasilitas benar-benar muncul |
| `probe:price` | tarif seed persis sama dengan tarif riset; invarian biaya maintenance |
| `probe:foundation` | timestamp, `rowMatches`, `docTypes`, QC |
| `probe:alert` | severity + tutup banner per level, session-only |
| `probe:wo` | integritas milestone WO + termin |
| `probe:table` | urutan tanggal (kosong selalu di akhir), search nomor resmi, flatten array/objek |
| `probe:facility` | skala tunggal, pita proporsional, batas tidak-mu-at, kapal slot ada di master |
| `probe:pdf` + `probe:pdf-db` (API) | 161/161 dan 103/103 |

## Yang berubah dari rencana awal

- **F6 tanggal: 15 tabel, bukan +/-25.** Cakupan dikunci client sebagai
  "tabel utama saja". Sub-tabel modal, tabel di balik tab (`PO Kecil`, `RFQ`,
  `THR`), dan matriks izin Peran (selnya dari `.map()`) dikecualikan.
  `BomDetail` dan `ProjectDetail` juga dilewati: keduanya drill-down di dalam
  satu dokumen, semua baris dibuat bersamaan, jadi umur datanya tidak
  membantu.
- **`utils/computed.ts` tidak pernah dibuat.** Kebutuhan "nilai bisnis =
  kalkulasi dari komponen" dipenuhi `utils/rates.ts` (F7) plus invarian yang
  ditegakkan `probe:price`.
- **F7 mengubah angka yang tampil.** `laborRatePerDay` turun dari 1.100.000 ke
  622.256 (turunan UMP Kalimantan Timur 2026), jadi total biaya tenaga
  maintenance turun dari 5.500.000 ke 3.111.280, dan angka HPP di kartu Biaya
  serta PDF ikut turun. Kalau ternyata tidak sesuai, satu konstanta:
  `SKILL_MULTIPLIER.welder` di `apps/web/src/utils/rates.ts`.
- **F1 dismiss dirancang ulang dari rencana.** Rencana menyebut "dismiss session"
  secara singkat; yang diimplementasikan per tingkat severity dan bisa dibuka
  kembali, karena satu sakelar untuk seluruh banner akan menyembunyikan
  `kritis` hanya karena pengguna menutup `info` yang panjang.


---

## Ringkasan

Lima klaim "selesai" di `todo3.md` **tidak benar**. Klaim itu ditulis karena
saya mengingat pernah menulis kodenya, bukan karena memeriksa hasilnya. Pola
yang sama dengan bug magic bytes PDF (test hijau untuk format yang salah) dan
dengan price-probe (hijau padahal masih ada harga 0).

| Item | `todo3.md` menulis | Kenyataan di kode |
|---|---|---|
| Tab equipment di proyek | 5d "selesai" | Tab ada di modul **Equipment**, bukan `ProjectDetail`. Commit `50c0ad2` tidak menyentuh `ProjectDetail.tsx`. |
| Tombol Detail biaya proyek | 8d "selesai" | Tab Biaya + 2 tabel ada, tapi **tidak ada tombol Detail dan tidak ada modal**. `git log -S "eqCostDetail"` → nol hasil. |
| Preview lampiran cuti pending | 11 "selesai" | `HR.tsx:1524` masih mengunci preview saat pengajuan. |
| Preview surat HR | 12a "selesai" | PDF native ada (`HR.tsx:1073`), tapi pratinjau masih `<pre>` teks di `:2200` dan `:2236`. |
| Dokumen tanpa tombol Preview | 12b "selesai" | Kolom pratinjau memang dihapus, tapi **tombol pratinjau masih ada** di sel aksi (`Documents.tsx:615`) → dua ikon mata bersebelahan. |

Konsekuensi: 5 baris "selesai" di `todo3.md` harus diturunkan, dan
"semua item 2 Oktober selesai" tidak boleh dipakai sebagai acuan.

---

# KEPUTUSAN YANG DIKUNCI (sudah dikonfirmasi client)

| # | Keputusan | Konsekuensi |
|---|---|---|
| 1 | Harga eksternal = **nilai riset pasar**; nilai bisnis = **kalkulasi dari komponen** | Tidak ada angka tebakan. Total nilai kontrak/budget/quotation/termin dihitung dari komponen, bukan disimpan asal. |
| 2 | Search added hanya ke **tabel yang memang butuh** (~46), bukan 60 | Aggregate, matriks, dan isi modal dikecualikan — isinya 2–6 baris atau tidak punya identitas sendiri. |
| 3 | Tanggal (F4) cakupannya **semua modul** | ~25 tabel dapat kolom + sort. Fondasi sama, cakupannya melebar. |
| 4 | Penghapusan tetap **hard delete**; tanggal hapus dibaca dari **audit log** | Tidak ada perilaku delete yang berubah, tidak ada soft-delete guard, tidak ada reference yang ikut hilang. |
| 5 | Sub-tipe dokumen ditambahkan di form **Dokumen & Laporan** proyek | Skema diperbaiki lebih dulu: dua daftar tipe yang sudah berkhianat harus disatukan. |
| 6 | Milestone **benar-benar per WO** | Perubahan skema + tulis ulang kalkulasi progress. Bukan workaround seed. |

---

# PETA STATUS 15 ITEM

Status `belum` = tidak ada kodenya sama sekali. `sebagian` = ada tapi tidak
memenuhi kalimat lengkap dari client. `perlucek` = klaim lama ada, belum
diverifikasi ulang terhadap kode.

| # | Item client | Status | Temuan |
|---|---|---|---|
| 1 | Harga seeder → nilai real | **sebagian** | ~384 field harga di 12 modul. `seedBulk.ts` menulis **~150 harga 0** tanpa penjaga (`:214,216,264,277`). `laborCost:0` ×2, `fuelPrice:0` ×4. Probeaggregate hijau → buta terhadap nol. |
| 2 | Search semua tabel | **sebagian besar** | 78 tabel, **18 punya search (23%)**, 60 tidak. Tidak ada komponen search bersama — 30+ salinan tangan. 8 yang ada pun **tidak lengkap** (mis. tak bisa cari invoice by nomor dokumen). |
| 3 | CRM: survey expand & collapse | **selesai** | `CRM.tsx:1247` — regresi saja. |
| 4 | Finance: tanggal setiap tabel | **belum** | Tidak ada `createdAt`/`updatedAt`/`deletedAt` di FE. `updated_at` **ada** di server tapi **ditimpa saat edit pertama** → tanggal pembuatan benar-benar hilang. `remove()` = hard delete. 28 tabel di `Finance.tsx`, hanya ±8 yang datanya bisa diedit. |
| 5 | Card status: label "Tertunda" | **selesai (terbatas)** | `Dashboard.tsx:146-152` sudah punya label; card `:739-788` menghitung status raw, belum menafsirkan deadline. Label **hardcode Indonesia**, EN tidak ada. |
| 6 | Project: jangan auto-preview | **sebagian** | Auto-open masih menyala setelah simpan (`ProjectDetail.tsx:2007,2010`) dan setelah unggah (`Documents.tsx` alur upload). |
| 7 | Project: tab equipment (booking + service) | **belum** | Tidak ada tab equipment di `ProjectDetail`. Tab "Sedang Dipakai" ada di modul **Equipment** saja (`Equipment.tsx:1831`). |
| 8 | Project: sub-tipe + link QC | **sebagian** | `subType`/`qcCertId` **hanya** ada di `Documents.tsx`. Form proyek tidak punya keduanya. Daftar tipe sudah berkhianat → lihat Temuan 8. |
| 9 | Inventory: filter per **status** | **belum** | `Inventory.tsx:1885-1911` memfilter **kategori** (`cat`). `warnLevelOf()` di `utils/inventoryWarn.ts` sudah menyediakan 5 level lengkap — tinggal dipakai. |
| 10 | Project Biaya: tombol Detail | **belum** | Tab + 2 tabel ada; tombol Detail dan modal tidak pernah ada. |
| 11 | Subkontraktor: milestone | **sebagian** | Modal **ada**. Milestone menempel di `subcontractors`, bukan WO, dan **tidak ada satu pun milestone di seed** → selalu jatuh ke input angka biasa, sehingga yang client lihat "hilang". |
| 12 | HR cuti: preview lampiran saat pending | **belum** | `HR.tsx:1524` masih mengunci. |
| 13 | HR surat: preview PDF | **sebagian** | Factory native sudah ada; 2 jalur masih `<pre>` teks (`HR.tsx:2200,2236`). |
| 14 | Dokumen: hanya Detail | **sebagian** | Kolom pratinjau sudah dihapus; tombol pratinjau masih ada (`:615`). |
| 15 | Penanggung jawab searchable | **belum** | Free text + validasi exact-match (`HR.tsx:322`). **Tidak ada komponen combobox di seluruh repo.** `ProjectDetail.tsx:2001` juga masih `owner: "Anda"` hardcode. |

---

# TEMUAN TERVERIFIKASI

## Temuan 8 — dua daftar tipe dokumen sudah berkhianat

Ini akar item 8, dan lebih luas dari "tambah dropdown sub-tipe".

| Sumber | Tipe |
|---|---|
| `Documents.tsx:24` (11 tipe) | Kontrak, Drawing, Prosedur, Sertifikat, Laporan, Invoice, NCR, Penawaran, Dock Space, Surat Jalan, Tanda Terima |
| `ProjectDetail.tsx:2020` (8 tipe) | Laporan, Kontrak, **Kontrak Kerja**, Drawing, Prosedur, Sertifikat, Invoice, NCR |

Konsekuensi:

1. Dokumen **Penawaran / Dock Space / Surat Jalan / Tanda Terima** tidak bisa
   dibuat dari tab proyek sama sekali.
2. "Kontrak Kerja" ada di daftar proyek tapi **tidak ada** di `SUB_TYPES`
   (`Documents.tsx:39-46`). Kalau dropdown sub-tipe ditambah asal jadi,
   `subTypesOf("Kontrak Kerja")` mengembalikan `[]` dan dropdown tetap kosong.
   "Kontrak Kerja" harus jadi **sub-tipe dari `Kontrak`**, bukan tipe sendiri.
3. `TYPES` (`:24`) dan `NEEDS_QC_LINK` (`:59`) **tidak di-export**, jadi form
   proyek tidak bisa berbagi definisi tanpa menyalin — dan menyalinlah yang
   membuat keduanya berkhianat.

Perbaikan: export `TYPES`/`NEEDS_QC_LINK`, hapus daftar hardcode di proyek,
pindahkan "Kontrak Kerja" ke sub-tipe `Kontrak`, tambah `subType`+`qcCertId`
ke form, tampilkan badge sub-tipe + QC di kartu dokumen proyek (setara
`Documents.tsx:596-597`).

## Temuan 4 — tidak ada satu pun tanggal di FE

- Tidak ada `createdAt`/`updatedAt`/`deletedAt` di data store.
- `updated_at` server **ada**, tapi hanya jadi concurrency token dan **ditimpa
  pada edit pertama** → tanggal asli hilang permanen.
- `audit_log` sudah menyimpan payload lengkap pra-hapus, jadi **tanggal hapus
  tidak perlu kolom baru** — tapi harus bisa dikueri per entitas (lihat Risks).
- Semua tulis terpusat di `store.tsx:1503-1684` (`add`/`update`/`remove`), jadi
  timestamp cukup di-stamp sekali di satu tempat dan berlaku ke 13 modul.

## Temuan 1 — price probe buta terhadap nol

`price-probe` agregat per-sum. Dia hijau padahal masih ada field 0, karena
field yang ia periksa tidak sama dengan field yang ditulis `seedBulk`.
Sebagian besar harga di `apps/web/src/data/index.ts` + `seeds.ts`, dan
disalin ke DB lewat `services/api/src/seedFeMirror.ts` + `seedBulk.ts`.
Perbaikan: assert **per baris per field**, bukan per total.

## Temuan 11 — kenapa milestone terasa "hilang"

Modal sudah ada dan jalan; yang kosong adalah **datanya**. Milestone menempel
di `subcontractors`, dan seed tidak memuat satu pun milestone, sehingga form
termin selalu jatuh ke input angka biasa. Perbaikan bukan tambal seed — client
meminta milestone per WO, jadi skemanya dipindah.

---

# FONDASI (F0) — sekali, dipakai hampir semua item

Tujuh-an di bawah ini tidak ada di repo sekarang. Tanpa mereka, item 2 dan 15
akan jadi potongan `<input>` yang harus dibongkar lagi nanti.

| Fondasi | Dipakai oleh | Perkiraan baris |
|---|---|---|
| `<SearchBox>` — input + ikon + debounce | item 2, 15 | ~30 |
| `<EntityPicker>` — combobox searchable | item 15, 8, 11 | ~80 |
| Timestamp sentral di `add`/`update` + migrasi `created_at` | item 4 | ~80 |
| `utils/computed.ts` — nilai kontrak / total quotation / nilai termin dari komponen | item 1 | ~60 |
| Assert harga per-baris di `price-probe` | item 1 | ~60 |
| Query tanggal hapus dari audit log | item 4 | ~40 |

---

# URUTAN EKSEKUSI

Item 2 dan item 4 menyentuh **tabel yang sama di 13 modul**. Kalau dikerjakan
sebagai dua fase terpisah, setiap tabel dibuka dua kali dan konflik diff
meningkat. Karena itu keduanya digabung jadi satu *sweep per modul*.

| Fase | Isi | Alasan urutan |
|---|---|---|
| **F0** | Fondasi (6 baris di atas) | Harus pertama; F4, F5, F6 berdiri di atasnya |
| **F1** | Notifikasi: severity, banner, dismiss session, badge, `.notif-hl` | Sudah diputuskan; menyentuh Dashboard/AppShell yang juga dipakai item 9 |
| **F2** | Peta fasilitas Drydock: facility map, skala panjang, pita + outline merah | Sudah diputuskan; tidak menyambar apa pun di sini |
| **F3** | Murah: item 12, 14, 6, 9, 5 (+ label EN), regresi 3 | Murah + langsung terlihat client |
| **F4** | Sedang: item 8, 15, 13, 10, 7 | Semua di halaman yang sudah disentuh F3/F4 |
| **F5** | Item 11 — milestone per WO (skema) | Butuh F0 + `EntityPicker` |
| **F6** | Sweep per modul: search + kolom tanggal + sort | Pilot modul Proyek, validasi, replikasi |
| **F7** | Item 1 — riset harga pasar + seeding + probe ketat | Paling besar & paling lambat; tidak memblokir apa pun |

## Rincian F3

| Item | Perubahan | Baris |
|---|---|---|
| 12 | Buka lampiran cuti saat pending (`HR.tsx:1524`) | ~18 |
| 14 | Hapus tombol pratinjau di sel aksi (`Documents.tsx:615`) | ~10 |
| 6 | Hapus auto-open setelah simpan (`ProjectDetail.tsx:2007,2010`) | ~15 |
| 9 | Dropdown per status dari `warnLevelOf`, bukan per kategori | ~70 |
| 5 | Serialisasi label supaya ada versi EN | ~15 |
| 3 | Sudah ada — regresi saja | — |

## Rincian F4

| Item | Perubahan | Baris |
|---|---|---|
| 8 | Satukan `TYPES`, tambah sub-tipe + QC, badge di kartu | ~130 |
| 15 | `EntityPicker` untuk penanggung jawab, termasuk `owner: "Anda"` | ~70 |
| 13 | PDF native menggantikan sisa `<pre>` di 2 jalur | ~55 |
| 10 | Modal Detail biaya proyek | ~70 |
| 7 | Tab equipment di `ProjectDetail` | ~80 |

## Rincian F6 — cakupan

- **Search**: ~46 tabel yang memang butuh. 8 tabel yang sudah punya tapi
  tidak lengkap ikut diperbaiki (mis. invoice tidak bisa dicari by nomor dokumen).
- **Tanggal**: ~25 tabel mutable di 13 modul dapat `Dibuat` / `Diubah` + sort.
- Tabel static Excel, aggregate, dan tabel isi modal dikecualikan — timestamp
  di sana tidak berarti.
- Urutan modul: Proyek (pilot) → Finance → Inventori → CRM → HR → Dock/Sparepart.

---

# VERIFIKASI

Setiap fase harus lewat gerbang sebelum lanjut. Yang sudah membuktikan
pentingnya: price-probe dulu hijau padahal ada harga 0; probe magic bytes dulu
hijau untuk format PDF yang salah. Jadi setiap perubahan butuh **assert yang
bisa gagal**, bukan hanya "build hijau".

| Fase | Gerbang |
|---|---|
| F0 | `apps/web npm run check` + `services/api npm run build` + test timestamp (`add` isi `createdAt`, `update` isi `updatedAt`, `remove` tidak merusak) |
| F1 | `npm run check` + probe `buildModuleAlertItems` (level `undefined`/NaN, `since` invalid date) + cek manual banner di 13 modul |
| F2 | `npm run check` + probe peta (semua fasilitas punya blok, tidak ada slot orphan, `from`/`to` sebagai offset hari) + cek visual skala |
| F3 | `npm run check` + regresi item 3 + cek manual 9 filter status (5 level `warnLevelOf`) |
| F4 | `npm run check` + probe sub-tipe (tiplogo `SUB_TYPES` punya sub-tipe; "Kontrak Kerja" punya sub-tipe; `NEEDS_QC_LINK` menolak sertifikat tanpa QC) + cek manual modal Detail biaya |
| F5 | `npm run check` + probe progress WO (milestone per WO terhitung, bukan per sub) |
| F6 | `npm run check` + probe search (setiap tabel yang diditambah ada `SearchBox`; query benar-benar menyaring) + probe tanggal (baris lama tetap punya `createdAt` hasil backfill) |
| F7 | `seed:mirror` + `npm run seed` + `price-probe` **per-baris** + invarian (`totalPrice`, `grandTotal`, PO↔AP) |

## Yang tidak bisa dibuktikan tanpa browser
- Tampilan peta Drydock (skala panjang, pita merah, outline kapal).
- Kelakuan banner notifikasi setelah pindah halaman lalu kembali.
- Ikon mata ganda di `Documents.tsx` benar-benar hilang di semua viewport.
- Fokus keyboard + announce pada `EntityPicker` (combobox baru).
- Jalur unduhan di Safari.

---

# RISIKO

| Risiko | Mitigasi |
|---|---|
| F5 mengubah definisi progress WO — ripple ke BAST, termin, laporan | Keputusan dipindah ke branch sendiri + satu checkpoint revert; kalkulasi progress jadi fungsi murni yang bisa diuji terpisah |
| F6 menyentuh ~70 tabel di 13 modul — diff besar, konflik tinggi | Satu commit per modul, bukan satu commit besar; pilot Proyek harus hijau dulu sebelum replikasi |
| Migrasi `created_at` pada tabel yang sudah berisi dataproduksi | Kolom nullable + backfill eksplisit; baris lama tanpa sumber tanggal diisi dari field tanggal yang sudah ada (`updated`, `tanggal`, `berlaku`), sisanya `NULL` — bukan angka tebakan |
| Audit log belum bisa dikueri per entitas | Diverifikasi di awal F0; kalau belum ada, satu endpoint baca tambahan |
| Nilai bisnis tanpa dasar pasar di item 1 | Dihitung dari komponen; yang tidak punya komponen **tidak diisi** dan didaftar untuk client, bukan dikarang |
| Klaim "selesai" tanpa bukti berulang | Gerbang per fase + tabel status di atas yang bisa diuji ulang, bukan dipakai sebagai acuan |
| Migrasi checksum drift di VPS (`001`, `002`) | Belum diaudit; harus dibereskan sebelum migrasi F0/F5 dicoba di produksi |
| Font CJK belum ada di server | Tidak memblokir F0–F7; tetap blocker untuk PDF huruf CJK |

---

# BELUM SELESAI DI LUAR DOKUMEN INI

- Deploy ke VPS: commit `3598648`, `51027d4`, `9dd8d33` belum terkonfirmasi
  ter-deploy. PDF bug magic bytes masih ada di produksi sampai itu dikirim.
- Font CJK harus disetor ke `services/api/assets/fonts/`.
- `schema_migrations` punya checksum drift untuk `001_init.sql` dan
  `002_audit_log.sql` di VPS.
- Seed account majority tidak punya `employee_id`, jadi branch policy masih
  `SEMUA` untuk akun tersebut.
