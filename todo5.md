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
| Selesai | 25 |
| Sebagian | 15 |
| Belum | 29 |
| Ambigu | 4 |
| **Total item** | **72** |

Perubahan dari audit awal (+3 Selesai, -2 Sebagian): S3b, H1b, dan DK2.
Item C1-2 dan loop push 401 masuk C1 yang sudah dihitung SEBAGIAN, jadi
tidak menambah baris baru - tapi bunyinya berubah, lihat CATATAN REVISI.

Perubahan dari Gelombang 3: H3 naik ke SELESAI (10 field PIC memakai
`EntityPicker`), A2 naik dari BELUM ke SEBAGIAN. Angka lain tidak bergerak:
A2 keluar dari BELUM masuk SEBAGIAN, H3 keluar dari SEBAGIAN masuk SELESAI.

Catatan: jumlah status di atas berjumlah 73, bukan 72. Selisih itu sudah ada
sejak audit awal dan tidak ditutup dengan menebak - penyebabnya sepertinya satu
item tercatat di dua bagian (C1-2 muncul di C1 dan juga disebut di C2), jadi
tidak ada cara terbukti untuk menentukan item mana yang dobel.
terbukti untuk menentukan item mana yang dobel.

## Lima yang paling penting dan harus didahulukan

| # | Item | Kenapa |
|---|---|---|
| 1 | **C1 sinkronisasi 2 device** | Client melaporkan data hilang setelah POST sukses. Semua jalur yang ditemukan sudah ditutup: `backendMode` beku, loop push 401, pagination OFFSET, livelock baris racun, overrun request, trigger dibuang, dan penimpaan diam-diam WBS/team. Sisa risiko: `PATCH` koleksi biasa masih shallow merge, jadi dua perangkat yang mengedit baris sama masih last-writer-wins |
| 2 | **D5 BoQ per nomor surat** | Client tandai "sangat krusial". Butuh ubah skema + API + seed + PDF, bukan edit UI |
| 3 | **I2 filter Inventory 2 tingkat** | Permintaan eksplisit yang sebelumnya dibalik secara sadar, dan alasan bisnisnya tidak tercatat |
| 4 | **B2 format titik input harga** | 150 `NumInput` tanpa pemisah ribuan; `type="number"` tidak bisa menampilkan `1.000.000` |
| 5 | ~~**S3 modal milestone per WO**~~ | **SELESAI** di `37321db` - modal kini memakai milestone WO, sama dengan sumber validasi |

---

# 1. CORE DAN ETC LINTAS MODUL

## A1 - Seeder harga, tidak ada yang 0, riset harga real - **SEBAGIAN**

**Terbukti:** `apps/web/src/utils/rates.ts:29-55` memuat 3 tarif riset dengan
sumber dan tanggal berlaku (Solar Industri B40 18.950, MFO 18.900, UMP Kaltim
3.680.000). `data/index.ts:487` dan `data/seeds.ts:15` menurunkan harga dari
modul itu, bukan angka literal.

**Yang sudah:** tidak ada harga 0 di seed. Pencarian seluruh key bermuatan
`price`, `rate`, `cost`, `amount`, `nilai`, `harga`, `tarif`, `budget`, atau
`nominal` bernilai `0` menghasilkan nol di `seeds.ts` dan `data/index.ts`.
Sisa 49 angka `0` semuanya non-harga: `openAwal` (15), `downtime` dan `pay2`,
rincian PPh 21 sampai 26 (18), rincian PPN (10), `retensi`, `bpjsKes`, `bpjsTk`,
`fuelLiters`, `deductions`.

**Kurang:**
1. Hanya 2 dari 3 tarif yang benar-benar dipakai data. `MFO_LOW_SULPHUR` nol
   konsumen.
2. Sebagian besar harga tetap angka tanpa sumber: `equipment.rate`,
   `acquisitionCost`, `inventory.cost`, `dockSlots.ratePerDay`,
   `TARIF_LISTRIK_KWH`, `TARIF_AIR_M3`. Tidak ada yang memaksa tarif ini
   traceable.
3. `seedReprice.ts` hanya menutup 4 koleksi. Invoice, PO, inventory, dan
   payroll tidak pernah di-reprice.

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

**Finance dan Procurement belum tuntas.** Finance punya 28 tabel di 13 tab;
16 sudah diberi search (AR, AP, Kas & Bank utama + mutasi, Jadwal Bayar,
Buku Besar snapshot + voucher, Laba Rugi, Neraca AP/AR live + audit, Aset,
Jurnal). Sisa tanpa search: aging AR, kas recap, adjustments, LR histori,
overhead, P&L bulanan, Neraca ringkasan, P&L jurnal - semuanya ringkasan
pendek yang tidak mungkin panjang. Procurement belum diaudit per-tab.
Klaim "semua tabel punya search" **tidak bisa dipertahankan** berdasarkan
bukti yang ada, tapi celah yang tersisa bukan lagi tabel panjang.

## B1 - Filter cabang di top bar dihapus - **BELUM**

`layouts/AppShell.tsx:547-564` masih ada `<select>` cabang di topbar, aktif
sebagai filter global (`store.tsx:937-941`) dan persisten di localStorage.

## B2 - Format titik pada semua input angka harga - **BELUM**

`components/ui.tsx:1554-1580` `NumInput` memakai `type="number"`, yang secara
teknis tidak bisa menampilkan `1.000.000`. Browser membuang `.` sebagai
pemisah. Tidak ada parser pembalik di `utils/format.ts` (hanya `fmtRupiah` untuk
tampilan).

150 pemakaian `<NumInput>` di 22 file, plus 5 `type="number"` mentah, total 24
file. Contoh field uang tanpa format: `Equipment.tsx:671-672` (`rate` dan
`fuelPrice`, field yang justru kita riset), `ClientModal.tsx:103`,
`ProjectAddModal.tsx:245`.

Butuh komponen input baru (`type="text"` plus masking) dan parser saat commit.

## C1 - Delay sinkronisasi data antar device - **SEBAGIAN** (penting)

**Yang benar-benar sudah diperbaiki:**
- `store.tsx:736-760` `applyPulled()`. Aturan "server menang untuk id yang
  dikenal, id lokal saja dipertahankan" menutup akar "baris hilang setelah
  POST sukses".
- `store.tsx:860-862` `bumpEpoch()` di setiap mutasi sukses. `pullNeedsMerge`
  (`:768-771`) membuat tarikan yang mulai sebelum POST ber-merge, bukan
  replace.
- `store.tsx:1616-1637` `update()` tidak lagi `return` diam-diam di 409 STALE.
  Sebelumnya UI toast "Maintenance dimulai" padahal tidak ada yang berubah.
- `store.tsx:1407-1419` early-return `dirty.size === 0` yang membuat listener
  `online` dan timer 45 detik tidak pernah terdaftar. Ini penyebab "harus force
  refresh + login ulang".
- Rate limit diubah dari per-IP ke per-user (`rateLimit.ts:48-61`). Sebelumnya
  semua tablet di NAT yang sama berbagi satu bucket 300 per menit, penyebab
  "status gagal di perangkat saya tapi masuk di device lain".

**Yang masih bisa menghasilkan gejala yang sama:**
1. **Pagination OFFSET di atas sort key yang berubah** -
   `routes/crud.ts:275-276` memakai `ORDER BY updated_at ASC, id ASC LIMIT ?
   OFFSET ?`. Setiap penulisan menaikkan `updated_at`, menggeser baris ke ekor
   list ASC. Contoh 10 baris dengan limit 5: halaman 1 dapat `1-5`; baris `2`
   ditulis, urutan berubah; halaman 2 (offset 5) dapat
   `7,8,9,10,2`. **Baris `6` tidak pernah dikembalikan.**
   `repositories.ts:125-136` hanya dedupe duplikat, tidak bisa memulihkan baris
   yang terlewat.
2. **`backendMode` dihitung sekali lalu tidak pernah dievaluasi ulang** -
   `store.tsx:836` memakai `useState(() => isBackendConfigured() ...)`. JWT
   hidup di **sessionStorage** (`http.ts:37,48-51`). Kalau sessionStorage hilang
   (tab restore, browser mobile eviction), `remoteActive()`
   (`store.tsx:695-697`) jadi false: penulisan ambil cabang lokal (`:1562`,
   `:1659`, `:1688`), `resync` langsung return (`:996`), tapi badge topbar
tetap hijau karena `backendMode` tidak pernah berubah. Toast "berhasil" tetap
muncul, padahal tidak ada yang sync.
3. **Network, 401, dan 429 menghasilkan toast sukses palsu** -
   `store.tsx:1646-1649` `degrade(err)` return `false` untuk ketiganya, lalu
   jatuh ke cabang offline dan promise-nya resolve. `Equipment.tsx:1140-1146` toast
   "Maintenance dimulai" padahal server tidak pernah menerimanya.
4. **Status di 2 device: last-writer-wins dengan kehilangan senyap** - PATCH
   server adalah shallow merge tak bersyarat (`crud.ts:351`). Perangkat B dapat
   409 STALE, lalu `store.tsx:1623-1635` **menimpa baris lokal B dengan versi
   server** lalu replay patch B, menimpa perubahan A tanpa warning. Setelah A
   menarik data, A melihat status B.
5. **WBS dan team tanpa token konkurensi sama sekali** - `routes/wbs.ts:44-53`
   dan `:62-77` memakai `ON DUPLICATE KEY UPDATE data = VALUES(data)` untuk
   seluruh array.
6. **`acceptPull` hanya menjaga `settings`** - `store.tsx:728-731`. Respons
   `rows: []` yang sesaat untuk 53 koleksi lain masih mengganti daftar lokal
   dengan kosong.

## C2 - Sinkronisasi offline/online, gap tak terlalu jauh, tanpa overrun - **SEBAGIAN**

**Yang sudah:** antrean offline (dirty set plus tombstone, tanpa TTL -
`store.tsx:325,334-353`), retry 429 menghormati `Retry-After`
(`store.tsx:1298-1313`), konkurensi `updated_at`.

**Yang hilang:**
1. **Tidak ada delta sync sama sekali.** Pencarian `etag`, `version`, `cursor`,
   `If-None-Match`, `since` menghasilkan nol di luar `/api/version`.
   `routes/crud.ts:244-279` hanya menerima `branch`, `q`, `limit`, `offset`.
   Setiap tarikan adalah baca penuh tabel (`repositories.ts:139` limit 5000).
   Tidak ada cursor untuk di-overrun, tapi juga tidak ada cara mengukur gap.
2. **Tidak ada tarikan periodik.** `useModuleSync` jalan saat mount dan saat
   `deps` berubah (`useModuleSync.ts:180-182`). Interval 45 detik
   (`store.tsx:1430-1434`) hanya push. Data dari device lain hanya masuk saat
   pindah route atau remount modul.
3. **Koleksi dirty dikecualikan dari setiap tarikan, selamanya.**
   `store.tsx:1007,1121` memakai `if (dirty.has(key)) return;`. Dengan
   `PUSH_ROWS_PER_RUN = 200` (`:1171`) dan `movements` sekitar 18.937 baris
   (`:944`), menguras satu koleksi besar butuh sekitar 95 run kali 45 detik
   (kira-kira 71 menit) tanpa menerima satu pun update server.
4. **Livelock baris racun plus overrun berulang.** `store.tsx:1358-1374`: kalau
   satu baris dari window 200 gagal, `ok = false`, cursor tidak maju dan
   `clearDirty` tidak dipanggil. Window yang sama dikirim ulang tiap 45 detik
   selamanya, dan semua baris setelah baris gagal tidak pernah terkirim.
5. **Badai 429 yang pasti, dengan push lock dipegang.** `store.tsx:1185`
   mengiterasi semua koleksi dirty, masing-masing 200 baris, jadi sampai 10.800
   request tulis per run melawan `WRITE_LIMIT = 300` per menit
   (`app.ts:42-43,214-221`). Retry tidur 30 detik di dalam run (`:1301`),
   sementara `pushingRef` (`:1175,:1380`) membuat semua trigger lain (timer 45
   detik, `online`, `visibilitychange`, tombol manual) menjadi no-op senyap.
   Trigger yang datang saat push berjalan dibuang, bukan ditunda.
6. **Device ter-background menumpuk gap tanpa jalur catch-up.**
   `store.tsx:1432` memakai `if (document.hidden) return;`. Tablet terkunci dua
   jam tidak punya cara catch-up selain pindah route.
7. **Tombstone dibuang diam-diam** - `TOMBSTONE_CAP_PER_COL = 500` (`:329`),
   load dan save hanya menyimpan 500 terakhir (`:368,:381`).

## C3 - Export PDF: langsung download, generate dari data bukan tampilan - **SEBAGIAN**

**Sudah:** generate server-side selesai total. `routes/pdf.ts:111-114`
menjalankan `recipe.prepare`, lalu `buildFromModel`, lalu `render`. Filter
di-allowlist 8 kunci (`:256-276`). `ctx.branch` diambil dari baris DB
(`:74-82`). Tidak ada html2canvas di repo. **19 pemanggilan PDF, 18 memakai
`open = false`** (langsung download).

**Kurang:** ada satu jalur preview yang masih hidup -
`pages/sdm/HR.tsx:282` memakai `open = true` plus modal `<iframe>` di
`HR.tsx:2253-2299`. Melanggar "jangan menampilkan preview". Semua export lain
download.

---

# 2. MODUL MANAJEMEN PROYEK - bagian 1 (card, filter, form)

| # | Permintaan | Status | Bukti dan Kekurangan |
|---|---|---|---|
| P1 | Notifikasi warning maksimal 3, "perkecil" jadi "tampilkan semua" | **BELUM** | `AlertBanner.tsx:143` masih `PREVIEW_N = 5` per level, jadi bisa 15 item. Label masih "Perkecil" (`i18n/id.ts:124`). Kunci `showAll: "Tampilan semua"` ada tapi tidak dipakai banner modul. |
| P2 | Kasih nomor pada kolom | **BELUM** | `Projects.tsx:308-325` header tanpa kolom index. `pager.slice()` sudah menyediakan indeks, tidak dirender. |
| P3 | Card total: label selesai dan sedang berjalan; card sedang berjalan: label tertunda | **BELUM** | `Projects.tsx:218-219` tidak ada breakdown. Card "Sedang Berjalan" hanya punya delta "{n} terlambat" (`n_prj.ts:25`). Masalah semantik: `Projects.tsx:170` menghitung `status !== "Selesai"` sehingga card itu juga menghitung `Batal` dan `Terlambat`. |
| P4 | Card status diberi gradient, grafik di card dihapus | **BELUM** | `.card` masih `bg-white` (`index.css:66-67`), gradient hanya di tile ikon (`ui.tsx:308`). Grafik masih ada: `ui.tsx:281-327`, keempat card Projects mengirim `spark`. |
| P5 | Filter popup jadi tampil deret dengan animasi slide | **BELUM** | `components/FilterPopover.tsx:47-49` masih `fixed inset-0` plus `absolute left-full`. Tidak import `framer-motion`. Dipakai 14 modul. |
| P6 | Kelola detail dipindahkan ke aksi jadi button "detail" | **BELUM** | Link masih di sel Tahap (`Projects.tsx:358-364`). Sel Aksi (`Projects.tsx:386-394`) hanya tombol "Hapus". |
| P7 | Default data menampilkan 25 | **BELUM** | `Projects.tsx:188` memakai `usePager(list.length)` tanpa size, jadi default 100 (`ui.tsx:1382`). Angka 25 hanya opsi dropdown. Hanya 3 dari 27 call site lewat size eksplisit. |
| P8 | Progres proyek harus disesuaikan lagi | **AMBIGU** | Target tidak jelas. Inkonsistensi yang ada: rata-rata list tidak berbobot (`Projects.tsx:172`) sementara progress per proyek berbobot WBS (`ProjectDetail.tsx:307-311`); proyek tanpa WBS memakai angka seed beku; bobot tidak dinormalisasi 100; tidak ada planned versus actual di detail. |
| P9 | Proyek terbaru tampil paling atas | **BELUM** | `Projects.tsx:96` sort `{key:null, dir:"asc"}`. Kolom `createdAt` ada tapi klik pertama menghasilkan **asc** (terlama dulu), berlawanan. |
| P10 | Form cabang diganti rencana lokasi docking | **BELUM** | `ProjectAddModal.tsx:214-218` masih `<select>` cabang. Pencarian `rencana lokasi docking` menghasilkan nol. Catatan: `branch` juga kunci scope RBAC (`store.tsx` `inBranch`), jadi penghapusan berarti keputusan scoping baru. |
| P11 | Select untuk kapal, klien, dan PM | **BELUM** | `ProjectAddModal.tsx:173-176` kapal masih `<input list>` plus datalist, bukan searchable. Klien (`:180-187`) dan PM (`:220-225`) memakai `<select>` biasa. `EntityPicker` ada (`ui.tsx:972-1034`) tapi tidak dipakai di form ini. |
| P12 | Status dihapus dari form proyek baru | **SEBAGIAN** | Default sudah benar `"Dalam Proses"` (`:26,:113`), dan ganti status tersedia di detail. Tapi field select masih ada (`:202-208`). |
| P13 | Hapus teks "(otomatisnya)" | **BELUM** | `ProjectDetail.tsx:950` masih `"Terlambat (otomatis)"`, `:948` title, `:197` toast. Ketiganya hardcoded Indonesia, tidak di i18n. |
| P14 | Card progres: tambah detail saat terlambat | **BELUM** | `ProjectDetail.tsx:990` hanya menukar teks delta. `KpiCard` tidak punya elemen interaktif. Detail keterlambatannya ada di Monitoring (`:275-298`), bukan di detail. |

---

# 3. MODUL MANAJEMEN PROYEK - bagian 2 (tab detail)

| # | Permintaan | Status | Bukti dan Kekurangan |
|---|---|---|---|
| D1 | Ganti "Desain & Class Approval" dengan "Log Penawaran dan Tagihan" | **BELUM** | Blok masih ada utuh (`ProjectDetail.tsx:1018-1044`, `n_prj.ts:125`). Pencarian `penawaran` bersama `tagihan` menghasilkan nol di kode. Peringatan: blok ini juga mengunci transisi `Desain` ke `Produksi` sampai Class Approval disetujui (`:257-263`). Menghapusnya diam-diam menghapus kontrol yang berfungsi. |
| D2 | Milestone menyeluruh, 7 hari jadi 1 bulan, list saja | **SEBAGIAN** | "List saja" sudah terpenuhi (`:1058-1069`). Masih H-7 hari (`:437`) dan nilai itu terikat ke setting global `ALERT_MILESTONE_DAYS`, jadi mengubahnya memengaruhi juga mesin alert. Milestone yang sudah selesai difilter (`:440`). |
| D3 | Update progress WBS: material ikut inventori, histori, dan foto | **BELUM** | `saveWbsTask` (`:859-892`) hanya tulis WBS plus progress. Material masih input teks (`:2118`). Tidak ada baca `data.inventory`, tidak ada `add("movements")`. `WbsItem` hanya punya `photoUrl` dan `photoNote` tunggal yang ditimpa tiap simpan (`:876-877`) dan tidak pernah dirender di tabel WBS (`:1100-1127`). |
| D4 | Gantt mini: detail bulan di bawah indikator | **SEBAGIAN** | Gantt mini ada (`:1129-1152`) dengan bar dan `progress%`. Tidak ada tick bulan sama sekali. `utils/monthAxis.ts` tidak di-import di ProjectDetail. |
| D5 | **BoQ: satu nomor surat bisa beberapa pekerjaan, hanya total/status/dokumen/aksi, klik untuk detail** | **BELUM** (krusial) | Model data sekarang satu baris sama dengan satu pekerjaan (`BoQSection.tsx:108`). `BoQItem` di `data/index.ts:924-941` tidak punya field nomor surat maupun revisi. Server juga: `services/api/src/refs.ts:64` satu FK, tanpa dokumen induk. Tabel flat 13 kolom (`:356-484`), tanpa baris induk, expand, atau drawer. Fitur revisi yang ada adalah riwayat harga per baris (`:50,:394-402`), bukan status revisi per surat. Butuh ubah skema, API, seed, dan PDF. |
| D6 | Dokumen BoQ masuk tab Dokumen dan Laporan | **SEBAGIAN** | Lampiran BoQ (`boq[].fileUrl`) hanya dirender di tab BoQ (`:409-411`), tidak masuk `data.documents`. Masalah tampilan lain: dokumen yang sama dirender dua kali di satu tab, yaitu daftar kartu (`:1422-1495`) lalu `ReportSection.tsx:252-287` yang menduplikasi dokumen sama dalam alur approval. |
| D7 | Change Order harus lewat approval dulu dan terkoneksi BoQ | **SEBAGIAN** | Rantai approval ada: create dengan status `"Diajukan"` (`:462-465`), apply hanya dari `"Disetujui"` (`:1666-1668`). Tidak ada kaitan BoQ sama sekali. `setCoStatus` (`:474-482`) hanya tulis status, tidak membuat atau merevisi baris BoQ. "Diterapkan" juga tidak menyentuh budget atau nilai kontrak. |
| D8 | Hapus table risiko | **AMBIGU** | Risk list sudah jadi kartu (`:1715-1731`). Tapi matriks 5 kali 5 masih `<table>` (`:1689-1714`). Perlu client tegaskan yang mana. |
| D9 | "Commissioning & Sea Trial" jadi "Commisioning & Trial" | **BELUM** | `n_prj.ts:238` (ID) dan `:825` (EN). Murni ganti string. |
| D10 | Form Trial: checklist dari WBS, catatan, dan kondisi | **BELUM** | `trialForm` (`:300`) hanya 4 field. `saveTrial` (`:792-807`) tidak baca WBS, tidak ada array checklist, tidak ada enum kondisi. Pencarian `perlu diperbaiki` menghasilkan nol. |
| D11 | Garansi dari WBS, kartu garansi per pekerjaan | **BELUM** | `createWarranty` (`:485-498`) membuat satu garansi per proyek, dari tombol manual yang muncul saat `project.status === "Selesai"` (`:1768-1770`), dengan `months` hardcode 12 (`:491`). Tidak ada referensi WBS. Tidak ada trigger dari `w.progress >= 100`. |
| D12 | Tab Service: list dari WBS, teknisi pilihan, biaya terkait BoQ | **BELUM** | List dari koleksi `services` (`:154-159`), `wbsFor` tidak di-import. Teknisi masih input teks (`:549`). Biaya angka biasa (`:551`). Nol referensi `boq`. |
| D13 | Sparepart wajib via PO dan stok; Service wajib approval procurement | **BELUM** | Sparepart ditulis langsung (`:292-299`), service juga langsung (`:327`). Alur PO, stok, dan approval lengkap sudah ada di `Procurement.tsx:41-57,105-125,1052`, hanya tidak dikabelkan di sini. |
| D14 | Tab Tim terkoneksi dengan SDM dan karyawan | **SEBAGIAN** | Sudah satu arah: picker dari `data.employees` (`:375,:2188-2194`), anggota wajib ada di SDM. Tidak sebaliknya: HR dan KaryawanDetail tidak pernah baca `teamByProject`. `utils/usages.ts:73-78` tidak menghitung keanggotaan tim saat menghitung referensi, jadi hapus karyawan diam-diam melepaskannya dari semua project team. |
| D15 | Tambah section subkon | **BELUM** | Tidak ada di tab list (`:995`). `data.subcontractors` nol referensi di ProjectDetail. WO hanya list `id`, `sub`, `progress%` di tab Terkait (`:1745-1752`), tanpa nilai kontrak, scope, termin, atau drill-down. |

---

# 4. MODUL EQUIPMENT, SUBKONTRAKTOR, QC AND SAFETY, DOKUMEN

| # | Permintaan | Status | Bukti dan Kekurangan |
|---|---|---|---|
| E1 | "Catat servis" membuka modal catatan dulu | **SEBAGIAN** | Modal ada (`Equipment.tsx:2050`, finish setelah simpan di `:954-964`). Tapi catatan tidak diwajibkan (`:823-876`), judul modal masih "Ubah Maintenance" bukan "isi hasil servis", dan ada jalur bypass di tab Register (`:1677-1684`) yang langsung `Selesai` sekali klik tanpa modal, persis yang dikeluhkan. |
| E2 | Input jam strict 24H di semua browser dan modul | **BELUM** | Helper `norm24` ada (`utils/time24.ts:27`), dipakai 4 file. Total input jam cuma 6, di 3 halaman, semuanya JSX salin-tempel (`Equipment.tsx:2773-2774`, `Absensi.tsx:512,515`, `KaryawanDetail.tsx:872,875`). Tidak ada komponen bersama. `lang="id-ID"` tidak memaksa 24H: Chrome dan Firefox merender `input[type=time]` mengikuti locale browser, bukan atribut `lang`. Komentar `Equipment.tsx:155-156` menyatakan klaim yang salah. |
| E3 | Historis data booking selesai di tab Alokasi | **SELESAI** | `Equipment.tsx:432` plus card di `:1786-1837`. Kekurangan kecil: tidak ada stempel waktu selesai (yang tampil `b.date` adalah tanggal booking), filter `status === "Selesai"` exact-match tanpa normalisasi. |
| E4 | Riwayat booking selesai pindah dari Biaya ke Alokasi | **SELESAI** | Render di tab Alokasi (`:1734` lalu `:1786-1837`). Tab Biaya hanya agregat. |
| E5 | Card biaya per proyek dengan tombol detail | **BELUM** | Card `Equipment.tsx:2211-2240` header 4 kolom tanpa kolom Aksi (`:2219`); tiap `<tr>` (`:2228-2233`) tanpa tombol. Modul ini tidak punya modal detail biaya sama sekali. Data yang diminta sudah ada di `utils/projectCost.ts:40` dan sudah dirinci di card Riwayat Booking (`:1800-1833`), tapi tidak dipasangkan. |
| S1 | Kwitansi PDF konten terpotong | **SELESAI** | Akar masalah dihapus (`pdf/documents/kwitansi.ts:1-9`, anchor `align:"right"`), sekarang lewat kolom tabel (`:69`). Paginasi two-pass dengan header berulang (`pdf/blocks.ts:486-491,534-557`). Gate: `pdf-probe.ts:312-331`. |
| S2 | Requirement BAST, invoice, dan bukti bayar | **SELESAI** | `Subcontractor.tsx:649-650` `invoiceNo` dan `bastNo` wajib, `proof.ref` wajib (`:643`). Catatan: keduanya berupa nomor teks, bukan unggah dokumen. Kalau maksud client melampirkan file, itu belum ada. |
| S3 | Milestone per WO dengan popup modal | **SEBAGIAN** | Util lengkap (`utils/woMilestones.ts:21-27,73-136`), termin wajib milestone (`Subcontractor.tsx:561-569`), gate `wo-probe.ts:30-98`. Tapi tidak ada modal tambah milestone per WO. `saveMilestone` hanya tulis ke koleksi `subcontractors` (`:346-357`); WO baru dibuat tanpa `milestones` (`:379`). Milestone WO hanya bisa dari seed. |
| S3b | Bug yang ditemukan audit | **SELESAI** (`37321db`) | Modal progres ber-judul per-WO tapi checklist-nya dirender dari `milestonesOf(sub)` - milestone **SOW**, bukan milestone WO. `saveWoProgress` memvalidasi terhadap `woMilestonesOf(woProg)`. Kalau judul SOW beda, centang diabaikan diam-diam dan progres tersimpan 0 persen. Sekarang render memakai `woMilestonesOf(woProg)`, sama persis dengan sumber validasi; teks "SOW milestones" di modal ikut diselaraskan jadi "WO milestones". |
| Q1 | Drawing view pakai modal popup | **SELESAI** | `QCSafety.tsx:1467` memanggil `setDrwPreview`, modal di `:2239`. Tidak ada preview inline. |
| Q2 | Sub-tipe dokumen terhubung tab Sertifikat QC | **SEBAGIAN** | Sumber tunggal lengkap di `utils/docTypes.ts:50-118`, dipakai form Dokumen (`Documents.tsx:24,175,341,694-738`) dan form Proyek (`ProjectDetail.tsx:38,2258-2262`). Tapi tab Sertifikat di QC tidak menyentuh `docTypes.ts` sama sekali, hanya memfilter `/sertifikat/i` pada `d.type` lalu merender id dan judul. Keterkaitan satu arah saja. |
| DOC1 | Kolom pratinjau dihapus, pratinjau hanya di Aksi | **SELESAI** | Header `Documents.tsx:599` berisi 9 kolom tanpa pratinjau. Sel Aksi `:621-641` hanya Detail plus `preview={false}`. |

---

# 5. MODUL SDM, CRM, DASHBOARD, MONITORING, ANALYTICS, LAPORAN

| # | Permintaan | Status | Bukti dan Kekurangan |
|---|---|---|---|
| H1a | Preview lampiran tidak dikunci saat diajukan | **SEBAGIAN** | Gate lama dihapus di HR (`HR.tsx:1543-1572`), preview terbuka untuk semua status kecuali `Ditolak`. Tapi `KaryawanDetail.tsx:737-746` masih mengunci saat `status === "Disetujui"`; saat `Diajukan` sel menampilkan `-`. |
| H1b | Auto-preview setelah upload | **SELESAI** (`b4f15d4`) | `HR.tsx` mount panel otomatis saat `fileUrl` terisi. `KaryawanDetail.tsx` form ubah cuti sebelumnya tidak punya preview sama sekali - sekarang memakai `DocumentPreviewPanel` dengan `autoLoad`. Hint di `HR.tsx` yang masih "Pratinjau baru tampil di tabel setelah pengajuan disetujui final" ikut diselaraskan: pratinjau terbuka begitu ada lampiran, hanya status Ditolak yang mengunci. |
| H1c | Surat persetujuan cuti saat disetujui | **SEBAGIAN** | Recipe server lengkap (`pdf/registry.ts:275-311`, `pdf/documents/hr.ts:85-152`): nama, NIK, jabatan, unit, tipe, periode, durasi, alasan, tanda tangan. Tapi on-demand, bukan otomatis saat approval. `approveHrd` (`:783-831`) tidak membuat baris `letters`, tidak ada arsip atau thumbnail. PDF baru terbit saat tombol ditekan. |
| H2 | Surat: preview PDF bukan teks | **SELESAI** | `HR.tsx:1786` memanggil `pdfDoc.request` dengan `kind:"suratHr"`, modal `<iframe>` di `:2269-2299` plus Unduh dan Buka di tab baru. Preview form yang belum disimpan masih `<pre>` (`:2217-2222`), bisa dipertanggungjawabkan karena baris belum ada. |
| H3 | Penanggung jawab searchable dari data pegawai | **SELESAI** (`016abab`) | Dua field yang sudah ada sebelumnya (`Documents`, `ProjectDetail`) kini memakai `utils/employeeOptions.ts` yang sama - sebelumnya masing-masing membangun daftarnya sendiri dengan format hint berbeda. Sepuluh field teks bebas lain diubah ke `EntityPicker`: PIC Equipment, tiga PIC Inventory (mutasi, gudang, edit mutasi), PIC BOM, tiga PIC QC (JSA, TBM, Patrol), PIC Dock. 24 pemeriksaan di `scripts/employee-probe.ts`. Sisa `<select>` (manager proyek, PIC negosiasi, teknisi, inspector) **di purposely tidak diubah: sudah terbatas ke daftar karyawan/PM, jadi tidak bisa salah ketik. Catatan desain: `isKnownEmployee` dipakai sebagai peringatan visual (border + `aria-invalid`), bukan pemblokir simpan - berbeda dari `Documents` yang memang menolak nama di luar master karena kolom "oleh" di revisi dokumen adalah jawaban hukum. PIC bisa awak kapal atau subkontraktor yang tidak ada di master. |
| C1 | Deskripsi survei expand dan collapse | **SELESAI** | `CRM.tsx:124-127,1231,1253-1261` dengan `aria-expanded`. Catatan: saat tertutup masih tampil dipangkas 90 karakter (`:1239`), bukan disembunyikan penuh. |
| D1 | Dashboard PDF dari data, bukan tampilan | **SELESAI** | `Dashboard.tsx:406-417` memakai `kind:"analitik"`; server hitung ulang KPI dari baris DB (`pdf/registry.ts:1061-1103`). Kekurangan: saat backend tidak aktif tetap toast "PDF berhasil diekspor" tanpa mengunduh apa pun (`:407-410`). |
| M1 | Filter "hanya perhatian" jadi "proyek butuh perhatian" | **SELESAI** | `Monitoring.tsx:211` plus `n_prj.ts:573` yang berisi "Proyek Butuh Perhatian". |
| AN1 | Export Excel Analytics lengkap | **SEBAGIAN** | 17 sheet sudah ada (`Analytics.tsx:808-826`). Yang tampil tapi tidak diekspor: distribusi tipe proyek dari donut tiga bucket (`:939-955`, sheet memakai sumber berbeda `:780-785`), pendapatan per cabang (`:1031-1050`), kolom NCR Terbuka (`:1203-1217`), jumlah proyek per cabang di Diagnostik (`:1240`), delta KPI (`:913-916`), annotations per tab (`:1487-1502`). |
| AN2 | PDF tidak terpotong dan garis opacity dibold | **SEBAGIAN** | Paginasi tabel sudah benar (`pdf/blocks.ts:492`). Masih terpotong: `pdf/chart.ts:506` memakai `slice(0,12)` membuang sisanya tanpa catatan; `chart.ts:484` daftar nilai donut berhenti di `ctx.bottom`; `registry.ts:932` `slice(0,25)`, `:1050` `slice(0,8)`, `reports.ts:645-648` `limit=5`. Garis bold belum ada sama sekali: tidak ada logika opacity ke lineWidth. Gridline masih `STROKE.hair` 0,15mm (`chart.ts:334,545`); visibilitas dibenahi lewat warna, bukan tebal. `chart.ts` belum disentuh sejak commit mesin PDF (`055d560`). |
| L1 | Laporan PDF baru, bukan capture tampilan | **SELESAI** | `Laporan.tsx:383-414` memakai `kind:"laporanProyek"` atau `"laporan"`; dokumen dirakit di `pdf/documents/laporan.ts:147,249`. |
| DOC2 | Tombol dan kolom pratinjau dihapus | **SELESAI** | Sama dengan DOC1. |
| PD1 | Proyek: jangan auto-preview setelah upload | **SELESAI** | `ProjectDetail.tsx:1426-1437`, `isOpen` hanya saat `openDocId` cocok. Preview hanya saat ikon mata diklik. |
| PD2 | Ikon view membuka modal popup dengan download di dalam | **BELUM** | `ProjectDetail.tsx:1468-1487` ikon mata masih expand inline (`:1480-1487`), bukan modal; tombol download justru berdiri di samping ikon (`:1478`). Komentar `:157-161` menyatakan ini sengaja membatalkan permintaan lama. Modal Detail (`:2006-2061`) sudah punya preview dan Unduh, tapi dipicu tombol Detail bukan ikon view. |
| PD3 | Ganti tombol Excel dengan tombol Detail dan modal | **SELESAI** | Tombol Excel per-dokumen hilang; diganti Detail (`:1455-1457`) yang membuka modal `:2006-2080` dengan preview, lampiran, dan riwayat revisi. Excel tetap sebagai aksi kedua di footer modal (`:2014-2022`). |

---

# 6. MODUL DRYDOCK, INVENTORY, KEUANGAN

| # | Permintaan | Status | Bukti dan Kekurangan |
|---|---|---|---|
| DK1 | Card mapping slot area dibuat grafikal | **SELESAI** | `Drydock.tsx:702-764`: tile per area, lebar diskalakan per jumlah slot (`:723,:737,:747`), badge jumlah slot (`:742`), terisi (`:751`), kapal berbeda (`:752`), konflik (`:753`). Area tanpa slot tetap digambar (`:718-721`). |
| DK2 | Peta fasilitas skala panjang (pekerjaan F2) | **SELESAI** (`48368f9`) | `components/FacilityMap.tsx` SVG skala tunggal, pita kapal, outline merah. Keterbatasan yang dulu tercatat - hanya kapal pertama per fasilitas yang digambar lewat `.find()` - sudah ditutup: semua kapal kini digambar satu jalur masing-masing, dan `problems` digabung dari seluruh kapal. Intinya dipindah ke `vesselsForFacility` di `utils/facilityMap.ts` supaya bisa diuji, dengan 8 assertion baru di `scripts/facility-probe.ts`. |
| I1 | Filter "perlu perhatian" per status, bukan kategori | **SELESAI** | `Inventory.tsx:641` memakai `warnLevelOf(...).level === warnF`; select berlabel "Status" (`:1943-1960`) dengan hitungan live (`:770`); sort pakai `warnRankOf` (`:656`). |
| I2 | Tombol [jumlah][status] membuka dropdown [jumlah][kategori] | **BELUM** | Nol tombol per-status. Yang ada: dua `<select>` terpisah (`Inventory.tsx:1907-1985`), yaitu Kategori dengan teks breakdown inline (`:1924-1932`), dan Status dengan hitungan (`:1946-1960`), plus chip non-klikabel (`:1970-1983`). Komentar `:1900-1906` menyatakan ini dibalik secara sadar: "baris tombol [jumlah][status] digantikan dropdown kategori". Alasan bisnisnya tidak tercatat. |
| F1 | Semua tabel Finance dapat tanggal plus sort, dan tanggal hapus | **SEBAGIAN** | Sort sudah luas: 23 dari 28 tabel memakai `SortTh` (109 header sortable di `Finance.tsx`). Tapi kolom tanggal hanya ada di **satu** tabel: invoice (`:3383-3384`, `S.colCreated` dan `S.colUpdated`). 27 tabel lain tidak punya kolom tanggal per baris. Tanggal hapus nol di seluruh UI: pencarian `deletedAt` atau "dihapus pada" menghasilkan nol di `src`. Util `utils/audit.ts:58,77` plus API `routes/audit.ts:37-58` ada, tapi pemanggilnya nol di luar modul (hanya `forgetDeleteDates` saat logout, `auth.tsx:150`). Kemampuan baca tanggal hapus sudah dibangun tapi tidak pernah ditampilkan. |
| F2 | Kas Bank, Buku Besar, Neraca, dan Laba Rugi tambah tanggal | **SEBAGIAN** | Keempat punya `HistFilterBar` (mode Semua, Per bulan, Per tanggal, Per tahun di `:156-194`) plus badge as-of (`:3129-3131`, `:3476-3478`, `:3849-3851`, `:3591-3593`). Tapi nol dari keempat punya kolom tanggal per baris di tabel utamanya. Saldo, trial balance, AP AR live, dan LR trial semuanya tanpa tanggal. Klien masih tidak bisa menelusuri satu baris ke tanggal asalnya. |

---

# 7. HAL YANG PERLU DITANYAKAN KE CLIENT

| # | Item | Kenapa tidak bisa diputuskan sendiri |
|---|---|---|
| 1 | **I2** filter Inventory dua tingkat | Permintaan eksplisit yang sebelumnya dibalik. Perlu tahu alasan balikannya sebelum dibalik lagi. |
| 2 | **D1** hapus "Desain & Class Approval" | Blok itu juga mengunci transisi stage Desain ke Produksi (`ProjectDetail.tsx:257-263`). Perlu tahu apa yang menggantikannya. |
| 3 | **D8** hapus table risiko | Risk list sudah jadi kartu, tapi matriks 5 kali 5 masih `<table>`. Yang dimaksud yang mana? |
| 4 | **P8** progres proyek disesuaikan lagi | Target tidak dinyatakan. |
| 5 | **S2** requirement BAST dan invoice | Sekarang berupa nomor teks wajib, bukan unggah dokumen. |
| 6 | **I1 versus I2** dua permintaan filter Inventory | I1 (per status) sudah selesai; I2 (tombol plus dropdown) belum dan bertentangan secara UX. |

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

**Gelombang 4 - butuh keputusan client dulu:**
14. D1, D8, P8, S2, I2

**Gelombang 5 - kerja skema besar:**
15. D5 (BoQ per nomor surat, krusial), D3, D10, D11, D12, D13, D15
16. B2 (komponen input uang berformat titik, menyentuh sekitar 150 field)
17. F1 (27 tabel Finance plus tanggal hapus di UI)

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

**Peringatan soal nomor baris:** dokumen ini diaudit terhadap `bd975c3`.
Sejak itu ada beberapa commit yang menyentuh `store.tsx`, `HR.tsx`,
`Subcontractor.tsx`, dan `FacilityMap.tsx`, jadi beberapa `file:line` di
bagian 1-6 sudah bergeser. Rujukan yang ditulis sebagai `store.tsx` tanpa
nomor baris sengaja dibiarkan begitu karena sudah tidak berlaku.

---

# CATATAN METODE

- Audit read-only terhadap `bd975c3`. Tidak ada file aplikasi yang diubah saat
  menyusun dokumen ini. Gelombang 1, 2, dan 3 baru dikerjakan setelah itu, pada
  `37321db` sampai `89c981f` - lihat CATATAN REVISI.
- Semua angka (jumlah tabel, jumlah call site, jumlah file) dihitung dengan
  enumerasi, bukan estimasi.
- Probe tidak dijalankan selama audit karena butuh menulis build cache. Status
  "SELESAI" berarti kode memenuhi permintaan, bukan berarti terverifikasi di
  browser.
- Yang tetap belum bisa dibuktikan tanpa browser: jarak visual, animasi,
  perilaku sync nyata antar dua device, dan kebenaran angka PDF.
