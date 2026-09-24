# SISTEM MANAJEMEN GALANGAN KAPAL TUGBOAT (ISMS)

**Integrated Shipyard Management System** untuk perusahaan galangan kapal yang berfokus pada pembuatan (new build) dan reparasi tugboat kelas internasional.

---

## Tentang Sistem

ISMS adalah sistem manajemen enterprise yang terintegrasi untuk mengelola seluruh aspek operasional galangan kapal secara lengkap, mulai dari penerimaan pesanan, desain, produksi, quality control, keuangan, hingga delivery. Sistem dirancang untuk mendukung operasi multi-branch dengan standar kualitas internasional.

## Tujuan Sistem

1. **Sentralisasi data** - Single source of truth untuk seluruh operasi
2. **Real-time visibility** - Dashboard & reporting real-time
3. **Optimasi sumber daya** - Drydock, equipment, workforce utilization
4. **Cost control** - Pengendalian biaya real-time
5. **Quality assurance** - Penjaminan kualitas standar internasional
6. **Compliance** - Kepatuhan regulasi maritim & perpajakan
7. **Scalability** - Siap untuk pertumbuhan multi-branch

---

## Modul Sistem

| # | Modul | Deskripsi | Dokumen |
|---|-------|-----------|---------|
| 1 | **Manajemen Proyek** | New Build, Repair, Modification lifecycle | [06-MODUL-PROJECT-MANAGEMENT.md](docs/06-MODUL-PROJECT-MANAGEMENT.md) |
| 2 | **Inventori & Material** | Material management, gudang, BOM | [07-MODUL-INVENTORI.md](docs/07-MODUL-INVENTORI.md) |
| 3 | **Keuangan & Billing** | Invoicing, cost control, pajak | [08-MODUL-FINANCE.md](docs/08-MODUL-FINANCE.md) |
| 4 | **SDM & Karyawan** | Kepegawaian, payroll, pelatihan | [09-MODUL-HR.md](docs/09-MODUL-HR.md) |
| 5 | **CRM & Klien** | Customer, quotation, contract | [10-MODUL-CRM.md](docs/10-MODUL-CRM.md) |
| 6 | **Procurement** | Purchasing, vendor management | [11-MODUL-PROCUREMENT.md](docs/11-MODUL-PROCUREMENT.md) |
| 7 | **Quality & Safety** | QC, NCR, sertifikasi, HSE | [12-MODUL-QC-SAFETY.md](docs/12-MODUL-QC-SAFETY.md) |
| 8 | **Reporting** | Dashboard, laporan, export | [13-MODUL-REPORTING.md](docs/13-MODUL-REPORTING.md) |
| 9 | **Analisis (Analytics)** | Analitik 4 level (deskriptif, diagnostik, prediktif, preskriptif) | [27-ANALITIK-SISTEM.md](docs/27-ANALITIK-SISTEM.md) |
| 10 | **Manajemen Drydock & Kapasitas** | Penjadwalan & utilisasi drydock | [23-MODUL-DRYDOCK-KAPASITAS.md](docs/23-MODUL-DRYDOCK-KAPASITAS.md) |
| 11 | **Manajemen Subkontraktor** | Subkontraktor & pihak ketiga | [24-MODUL-SUBKONTRAKTOR.md](docs/24-MODUL-SUBKONTRAKTOR.md) |
| 12 | **Rekam Jejak Kapal** | Riwayat survey/docking & dokumen kapal | [25-MODUL-REKAM-JEJAK-KAPAL.md](docs/25-MODUL-REKAM-JEJAK-KAPAL.md) |
| 13 | **Utilisasi Equipment** | Peralatan galangan & maintenance | [26-MODUL-EQUIPMENT-GALANGAN.md](docs/26-MODUL-EQUIPMENT-GALANGAN.md) |

---

## Dokumen Analisis

| No | Dokumen | Deskripsi |
|----|---------|-----------|
| 1 | [01-EXECUTIVE-SUMMARY.md](docs/01-EXECUTIVE-SUMMARY.md) | Ringkasan eksekutif sistem |
| 2 | [02-PROFIL-BISNIS.md](docs/02-PROFIL-BISNIS.md) | Profil bisnis & konteks perusahaan |
| 3 | [03-ANALISIS-PROSES-BISNIS.md](docs/03-ANALISIS-PROSES-BISNIS.md) | Analisis proses bisnis saat ini |
| 4 | [04-RUMUSAN-MASALAH-SOLUSI.md](docs/04-RUMUSAN-MASALAH-SOLUSI.md) | Rumusan masalah & solusi |
| 5 | [05-TUJUAN-RUANG-LINGKUP.md](docs/05-TUJUAN-RUANG-LINGKUP.md) | Tujuan & ruang lingkup sistem |
| 6 | [14-NON-FUNCTIONAL-REQUIREMENTS.md](docs/14-NON-FUNCTIONAL-REQUIREMENTS.md) | Kebutuhan non-fungsional |
| 7 | [15-ARSITEKTUR-SISTEM.md](docs/15-ARSITEKTUR-SISTEM.md) | Arsitektur sistem |
| 8 | [16-DATABASE-DESIGN.md](docs/16-DATABASE-DESIGN.md) | Desain database (ERD) |
| 9 | [17-USE-CASE-DIAGRAMS.md](docs/17-USE-CASE-DIAGRAMS.md) | Use case diagrams |
| 10 | [18-ACTIVITY-DIAGRAMS.md](docs/18-ACTIVITY-DIAGRAMS.md) | Activity diagrams |
| 11 | [19-DATA-FLOW-DIAGRAMS.md](docs/19-DATA-FLOW-DIAGRAMS.md) | Data flow diagrams |
| 12 | [20-TECHNOLOGY-STACK.md](docs/20-TECHNOLOGY-STACK.md) | Rekomendasi teknologi |
| 13 | [21-IMPLEMENTATION-ROADMAP.md](docs/21-IMPLEMENTATION-ROADMAP.md) | Roadmap implementasi |
| 14 | [22-RISK-ASSESSMENT.md](docs/22-RISK-ASSESSMENT.md) | Penilaian risiko |
| 15 | [23-MODUL-DRYDOCK-KAPASITAS.md](docs/23-MODUL-DRYDOCK-KAPASITAS.md) | Modul drydock & kapasitas |
| 16 | [24-MODUL-SUBKONTRAKTOR.md](docs/24-MODUL-SUBKONTRAKTOR.md) | Modul subkontraktor |
| 17 | [25-MODUL-REKAM-JEJAK-KAPAL.md](docs/25-MODUL-REKAM-JEJAK-KAPAL.md) | Modul rekam jejak kapal |
| 18 | [26-MODUL-EQUIPMENT-GALANGAN.md](docs/26-MODUL-EQUIPMENT-GALANGAN.md) | Modul utilisasi equipment |
| 19 | [27-ANALITIK-SISTEM.md](docs/27-ANALITIK-SISTEM.md) | Analisis 4 level |

---

## Proses Bisnis Utama

### New Build Tugboat
```
Inquiry → Quotation → Contract → Design → Procurement → Steel Fabrication → Hull Assembly → Outfitting → Painting → Commissioning → Sea Trial → Delivery
```

### Repair & Maintenance
```
Request → Scope Survey → Estimate → Approval → Drydock → Repair → QA Release → Delivery
```

### Modification & Retrofit
```
Assessment → Proposal → Class Approval → Contract → Procurement → Install → Survey → Delivery
```

---

## Teknologi

| Komponen | Teknologi |
|----------|-----------|
| Frontend | React + Vite + TailwindCSS (Next.js menyusul bila perlu SSR) |
| Mobile | React Native (Expo, rencana) |
| Backend | Node.js + Fastify + TypeScript (`services/api`, tersedia) |
| Database | SQLite (lokal) / MySQL (server); PostgreSQL 16 (rencana produksi) |
| Auth | JWT (bcrypt) + fallback demo lokal |

## Backend & Frontend Wiring

- Backend: `services/api` — Fastify, CRUD 52 koleksi + WBS/team, envelope `{ok,data}`, JWT 8 jam. Versi kontrak saat ini **API 0.2.0 / Web 0.2.0** (`GET /api/version` → `{api,minWeb}`); FE minor-tolerant — sinkronisasi diblokir (toast) hanya bila MAJOR backend berbeda.
- Log backend terstruktur (pino) ke stdout dengan redact secret (`Authorization`, `password`/`pass_hash`/`*token*`, `MYSQL_URL`); setiap request membawa/mengembalikan `X-Request-Id` untuk korelasi.
- `GET /health` memeriksa DB (`SELECT 1`), keterulisan `UPLOADS_DIR`, serta `uptime`/`version`/`dialect` (`status: degraded` bila DB/uploads gagal).
- Tanpa Docker: `DB_DIALECT=sqlite` (file `./data/isms.db`) untuk lokal, `DB_DIALECT=mysql` + `MYSQL_URL` untuk server. Semua env (`PORT`, `DB_DIALECT`, `SQLITE_PATH`, `MYSQL_URL`, `JWT_SECRET`, `WEB_ORIGINS`, `SETUP_TOKEN`, `UPLOADS_DIR`, `NODE_ENV`, `TRUST_PROXY`, `ALLOW_SEED_LOGIN`) divalidasi saat boot dengan pesan galat yang jelas — lihat `services/api/.env.example`.
- Jalankan: `cd services/api; npm install; npm run migrate; npm run seed; npm run dev` (port 3000).
- Frontend: isi `VITE_API_URL=http://localhost:3000` (lihat `apps/web/.env.example`) agar tersambung; kosong = mode lokal. Login otomatis memakai backend bila tersedia, impor seed sekali pakai dari `/pengaturan`.
- Sesi JWT 8 jam — kedaluwarsa otomatis diminta login ulang. Perubahan offline ditandai dan bisa didorong ulang via banner "Sinkronkan sekarang".
- Pengguna dikelola di `/pengaturan/peran` (Direktur/Developer); audit backend di `/api/audit`.
- Akun seed: `direktur@galangan.com/direktur123`, `manager@galangan.com/manager123`, `demo@galangan.com/password@123`, `dev@alk.id/KucingTerbang`.

---

## Estimasi Proyek

| Fase | Durasi | Scope |
|------|--------|-------|
| Foundation | 3 bulan | Core modules (prioritas 1) |
| Operations | 3 bulan | Full operational modules (prioritas 2) |
| Intelligence | 4–6 bulan | Analytics 4 level & BI |
| Integration | 2 bulan | Tax, banking, deployment |
| **Total** | **12–15 bulan** | Full production |

> Rincian per modul lihat [00-SUMMARY-FITUR-ALUR.md](docs/00-SUMMARY-FITUR-ALUR.md) (versi PDF: [summary-fitur-alur.pdf](docs/summary-fitur-alur.pdf))

Estimasi biaya: **Rp 3.5 - 4 Miliar**

---

## Struktur Proyek

```
galangan/
├── docs/                      # Dokumentasi analisis sistem (di-ignore git)
├── apps/
│   └── web/                  # Frontend web app (React + Vite)
└── services/
    └── api/                  # Backend Fastify (SQLite/MySQL, JWT)
```

---

*Dokumen ini merupakan ringkasan dan navigasi untuk seluruh analisis sistem ISMS.*
