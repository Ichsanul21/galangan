# ISMS API

Fastify 5 + TypeScript backend. Storage: SQLite (dev, `better-sqlite3`) or MySQL (`mysql2`).
Generic envelope store: each collection is a table `(id VARCHAR(128) PK, branch TEXT, data TEXT JSON, updated_at TEXT)`.

Env: `JWT_SECRET` is **required** — the API throws at boot when it is missing or
empty (no dev fallback). All env vars are validated at boot with a clear
error (`PORT` 1–65535, `DB_DIALECT` sqlite|mysql, `SQLITE_PATH` non-empty,
`MYSQL_URL` required for mysql, `UPLOADS_DIR` non-empty, `NODE_ENV`
development|test|production, `TRUST_PROXY`/`ALLOW_SEED_LOGIN` true|false,
`WEB_ORIGINS` http(s) URLs or `*`). `WEB_ORIGINS` is a comma-separated CORS allowlist
(falls back to single `WEB_ORIGIN`; `"*"` in non-prod when unset). Auth is
JWT header-based (`Authorization: Bearer <token>`), so no CORS credentials.
`TRUST_PROXY=true` is required before `x-forwarded-for` is honored for
rate-limit/audit IPs. `ALLOW_SEED_LOGIN=true` is required for demo seed
accounts to log in in production. `UPLOADS_DIR` (default `./data/uploads`)
is created at boot and writability-checked by `/health`. `GET /files/*` requires auth (401 anon). `GET /health` returns
`{ status, auditErrors, db, uploads, uptimeSec, version, dialect }` where `auditErrors` counts best-effort audit-write
failures (also logged via `console.error`), `db` is `ok`/`error` (`SELECT 1`),
`uploads` is `{ writable }`, `version` comes from `package.json` (currently
`0.2.0`), and `status` is `degraded` when db/uploads fail. DDL is MySQL-compatible:
`VARCHAR(128)` PKs, no `TEXT DEFAULT`s, `audit_log.actor` (`user` is reserved).

## Setup (SQLite, default)

```powershell
cd services/api
Copy-Item .env.example .env
npm install
npm run migrate
npm run seed
npm run dev
```

Health: `GET http://localhost:3000/health` → `{ "ok": true, "data": { "status": "ok", "db": "ok", ... } }`.
Version: `GET http://localhost:3000/api/version` → `{ "ok": true, "data": { "api": "0.2.0", "minWeb": "0.2.0" } }`.

## Logging & correlation id

Structured pino logs go to stdout (keep). Secrets are redacted via the
Fastify `redact` option (`[Redacted]`): `Authorization` header,
`x-setup-token` header, `password`/`pass_hash`/`*token*` body fields, and
`MYSQL_URL`. Every request accepts/echoes `X-Request-Id` (client-supplied
or generated) for correlation; it is also exposed for CORS.

## Setup (MySQL)

```powershell
$env:DB_DIALECT="mysql"
$env:MYSQL_URL="mysql://user:pass@localhost:3306/isms"
npm run migrate
npm run dev
```

Create the database first (`CREATE DATABASE isms;`). The same `001_init.sql` DDL runs on both dialects.

## Migrations

- `migrations/001_init.sql` is the baseline (fresh project, no prod data):
  `VARCHAR(128)` PKs for MySQL compat, no `TEXT DEFAULT ...` defaults
  (defaults are handled in code inserts), plain `CREATE INDEX` (MySQL has no
  `IF NOT EXISTS` for indexes — reruns tolerate `ER_DUP_KEYNAME`/already-exists). `002_init.sql` adds
  `users.is_active`; `002_audit_log.sql` creates `audit_log`
  (`VARCHAR(128)` PK, no `TEXT DEFAULT`s, `actor` column).
  Delete local `./data/isms.db` and re-run `npm run migrate` to pick up DDL changes.

## Scripts

- `npm run dev` — `tsx watch src/index.ts` (migrates on boot, then listens on `PORT`)
- `npm run migrate` — `tsx src/migrate.ts`
- `npm run seed` — `tsx src/seed.ts` (4 dev users, idempotent)
- `npm run backup [-- --out ./backups/<name>]` — `tsx src/backup.ts`
- `npm run restore -- --from ./backups/<name>` — `tsx src/restore.ts`
- `npm run build` — `tsc` → `dist/`
- `npm start` — `node dist/index.js`

## Auth

- `POST /api/auth/login` `{ username, password }` → `{ ok, data: { token, user } }` (20/min per IP)
- `GET /api/auth/me` with `Authorization: Bearer <token>` (8h JWT)

Dev users (from `src/auth.ts`):

| username | password | name | role |
|---|---|---|---|
| demo@galangan.com | password@123 | Client Viewer | viewer |
| dev@alk.id | KucingTerbang | Developer | developer |
| direktur@galangan.com | direktur123 | Direktur | direktur |
| manager@galangan.com | manager123 | Manager | manager |

## Generic CRUD

Every envelope collection (`projects`, `vessels`, `drydocks`, `dockSlots`, `inventory`,
`movements`, `equipment`, `bookings`, `subcontractors`, `workOrders`, `termins`,
`employees`, `invoices`, `payables`, `ncr`, `incidents`, `inspections`, `purchaseOrders`,
`requisitions`, `vendors`, `quotations`, `clients`, `documents`, `surveys`, `activities`,
`services`, `spareparts`, `boq`, `branches`, `attendance`, `payroll`, `taxPeriods`, `rfqs`,
`changeOrders`, `risks`, `leaves`, `trainings`, `timesheets`, `drawings`, `toolbox`,
`warranties`, `calibrations`, `communications`, `contracts`, `bast`, `trials`, `requests`,
`clientPos`, `settings`, `coa`, `journals`, `assets` — 52 tables) is served by
`src/routes/crud.ts`. All routes require `Authorization: Bearer <token>`.
Writes (`POST`/`PATCH`/`DELETE`) are open to any authenticated user, except
`settings` and `coa` which require role `direktur`/`developer`.

Row shape: `{ id, branch, data, updated_at }` — `data` is the parsed JSON payload.
Client ↔ FE `StoreItem` mapping: `{ id, branch, ...data }`.

| Method | Endpoint | Notes |
|---|---|---|
| GET | `/api/<table>?branch=&q=&limit=&offset=` | `branch` exact filter; `q` substring search inside `data` JSON (`instr` on sqlite, `LOCATE` on mysql); `limit` default 200, max 1000 (clamped); `offset` default 0; returns `{ rows, total, limit, offset }` where `rows` are `{ id, branch, data, updated_at }` |
| GET | `/api/<table>/:id` | 404 `NOT_FOUND` when missing |
| POST | `/api/<table>` | body `{ id?, branch?, data }`; honors a unique client `id`, else generates `<PREFIX>-<UUID8>`; duplicate → 409 `CONFLICT`; → 201 |
| PATCH | `/api/<table>/:id` | body `{ branch?, data?, baseUpdatedAt? }`; `data` is merged shallow server-side (`{...old, ...patch}`); when `baseUpdatedAt` is present and differs from the current row `updated_at` → 409 `STALE` with the current row in `data` (FE should prompt refresh/overwrite) |
| DELETE | `/api/<table>/:id` | 404 when missing |

## Backup & restore (`src/backup.ts`, `src/restore.ts`)

- `npm run backup [-- --out ./backups/<name>]` (default `./backups/<ISO-timestamp>`)
  writes `<out>/manifest.json` (`timestamp`, `dialect`, `tablesCount`, plus
  table list / artifact names) alongside the DB snapshot and an `uploads/` copy:
  - sqlite (default): `VACUUM INTO <out>/isms.db` (consistent snapshot) + copy of
    `UPLOADS_DIR` (`./data/uploads` by default).
  - mysql (`DB_DIALECT=mysql` + `MYSQL_URL`): spawns `mysqldump
    --single-transaction --quick --lock-tables=false <db> > <out>/dump.sql` +
    copy of `UPLOADS_DIR`. **Requirement:** the `mysqldump` binary must be
    installed and on `PATH`; credentials come from `MYSQL_URL` (password is
    passed via `MYSQL_PWD`, never on the command line).
- `npm run restore -- --from ./backups/<name>` reads `<dir>/manifest.json`:
  - sqlite: copies `<dir>/isms.db` over `SQLITE_PATH` (`./data/isms.db` by
    default) and replaces `UPLOADS_DIR` with `<dir>/uploads` (when present).
    Stop the API first so the DB file is not open mid-copy.
  - mysql: pipes `<dir>/dump.sql` into the `mysql` client derived from
    `MYSQL_URL`. **Requirement:** the `mysql` client must be on `PATH`.
    The target database must already exist (`CREATE DATABASE isms;`).

RPO/RTO notes:

- RPO (how much data you can lose) = time since the last successful `npm run
  backup`. These are manual point-in-time snapshots, not continuous WAL/binlog
  shipping — schedule them (e.g. cron/Task Scheduler, daily or denser for busy
  sites) to tighten RPO. Uploads are copied at backup time, so files uploaded
  after the snapshot are not covered.
- RTO (how fast you come back) is minutes on sqlite: stop API → `npm run
  restore -- --from <dir>` → `npm run migrate` (safety) → start API. On mysql
  add dump-import time (grows with DB size) plus re-running `migrate`.
- Keep at least one backup off-host (copy the whole `<dir>` elsewhere) and
  periodically test restores on a scratch `SQLITE_PATH` — an untested backup
  is not a backup. Manifest `tablesCount` is a quick sanity check that the
  snapshot came from a migrated DB.

## Project WBS & team (`src/routes/wbs.ts`, auth required)

| Method | Endpoint | Body |
|---|---|---|
| GET/PUT | `/api/projects/:id/wbs` | `{ wbs: [...] }` |
| GET/PUT | `/api/projects/:id/team` | `{ memberIds: ["EMP-002", ...] } |

Missing rows read back as `[]`; `PUT` upserts.

## Admin seed (`src/routes/admin.ts`, `src/seedData.ts`)

- `POST /api/admin/seed` with header `x-setup-token: <SETUP_TOKEN>` (else 403).
  The token is compared with `timingSafeEqual`; both denied and successful
  calls are written to `audit_log` (`admin.seed_denied` / `admin.seed_success`).
  `SETUP_TOKEN` should be ≥32 chars — the API warns at boot when it is
  missing or short, but the route stays fail-closed.
  Bulk-inserts settings (36 rows), full COA (98 accounts), and 1–2 example rows
  per other collection; existing ids are skipped. Returns `{ inserted, skipped }`.

## Users (`src/routes/users.ts`, kelola: Direktur/Manager/Developer)

| Method | Endpoint | Notes |
|---|---|---|
| GET | `/api/users` | list tanpa password hash, termasuk `employeeId` |
| POST | `/api/users` | `{ username, name, role, password≥6, email?, employeeId? }`, 409 bila duplikat, 422 bila karyawan tak ada |
| PATCH | `/api/users/:id` | nama/role/email/isActive/employeeId (null = lepas tautan); password hanya via endpoint khusus |
| POST | `/api/users/:id/password` | ganti/reset (`:id` bisa `me`); self wajib password lama |
| DELETE | `/api/users/:id` | nonaktif (`is_active=0`), tak pernah hapus fisik |

Login menerima username, email, atau NIK karyawan (cocok `employees.data.username` → akun tertaut).
Akun tertaut via `employee_id` (migrasi 003; seed: direktur → EMP-001).

Login menolak akun nonaktif (403). Tabel `users` tidak ikut CRUD generik.
Password baru min 6 / maks 72 chars (bcrypt, cost 12); login menerima maks
72 chars (tanpa min selain 1, untuk cegah CPU-DoS via payload raksasa).
Di production, akun demo seed tidak bisa login kecuali
`ALLOW_SEED_LOGIN=true` (403 `Akun demo dinonaktifkan`).

## Audit log & files

- `GET /api/audit?table=&limit=&offset=` — log siapa-ubah-apa (user, aksi, diff, IP, waktu server), terbaru dulu.
- `POST /api/files` (multipart field `file`, png/jpg/pdf/xlsx/csv ≤10MB) → `{ url: "/files/..." }`; isi file
  divalidasi magic bytes sesuai ekstensi (PNG/JPG/PDF/ZIP-PK; csv/txt harus teks UTF-8 valid tanpa NUL);
  `GET /files/*` requires `Authorization: Bearer <token>` (401 anon) dan disajikan sebagai
  `attachment` + `X-Content-Type-Options: nosniff`.
- `GET /api/ocr/status` → `{ available }` (apakah tesseract terinstal).
  `POST /api/ocr` (multipart field `file`, png/jpg/jpeg ≤10MB, auth) → `{ text, chars, filename }`;
  501 `OCR_UNAVAILABLE` bila tesseract belum ada (`apt install tesseract-ocr tesseract-ocr-ind`);
  PDF ditolak 400 (konversi ke gambar dulu). Dieksekusi via `execFile` tanpa shell,
  file temp acak selalu dihapus, timeout 60 dtk.

## RBAC tulis (`src/rbac.ts` — ditegakkan server)

- direktur/developer/admin: semua koleksi + kelola users + settings/coa.
- manager: semua operasional + kelola users (tanpa settings/coa).
- Operasional per kata kunci (qc, gudang, procurement, finance, hr, sales, proyek, drydock, equipment):
  tulis hanya koleksinya; baca semua koleksi tetap `requireAuth`.
- viewer/client/tamu + peran tak dikenal: read-only. Tulis yang ditolak → 403
  `Peran X tidak boleh mengubah Y` (FE menampilkannya jujur, tanpa tulis lokal).
- Tulis referensi yatim → 422 (`field "id" tidak ada di tabel`); akun CoA tak dikenal → 422.
  Hapus baris yang masih dirujuk → 409 + daftar pemakai (tanpa cascade).
  WBS/team PUT wajib proyek + anggota valid (422).

## Rate limit & 403

- Login 20/mnt/IP, seed 20/mnt, tulis (POST/PATCH/PUT/DELETE) 300/mnt/IP — 429 + header `Retry-After`.
  `x-forwarded-for` hanya dipercaya bila `TRUST_PROXY=true` (default: `req.ip`); bucket kedaluwarsa
  disapu tiap 60 detik.
- 403 membawa alasan (`Butuh peran Direktur / Manager / Developer`, `tidak boleh mengubah <koleksi>`);
  FE menampilkannya dan tidak menulis lokal.

## curl examples

```powershell
$base = "http://localhost:3000"
$login = Invoke-RestMethod "$base/api/auth/login" -Method Post `
  -ContentType "application/json" `
  -Body '{"username":"manager@galangan.com","password":"manager123"}'
$tok = $login.data.token
$h = @{ Authorization = "Bearer $tok" }

# list with filters
Invoke-RestMethod "$base/api/projects?branch=Samarinda&q=Maju&limit=50" -Headers $h

# create with custom id (201) — or omit id for server-generated PRJ-<UUID8>
Invoke-RestMethod "$base/api/projects" -Method Post -Headers $h `
  -ContentType "application/json" `
  -Body '{"id":"NB-2026-001","branch":"Samarinda","data":{"vessel":"TB Maju Jaya 09","client":"PT Samudra Jaya Perkasa","budget":48000000000}}'

# read / patch (shallow merge) / delete
Invoke-RestMethod "$base/api/projects/NB-2026-001" -Headers $h
Invoke-RestMethod "$base/api/projects/NB-2026-001" -Method Patch -Headers $h `
  -ContentType "application/json" -Body '{"data":{"progress":18}}'
Invoke-RestMethod "$base/api/projects/NB-2026-001" -Method Delete -Headers $h

# WBS + team
Invoke-RestMethod "$base/api/projects/NB-2026-001/wbs" -Method Put -Headers $h `
  -ContentType "application/json" -Body '{"wbs":[{"task":"Hull Assembly","start":"2026-05","end":"2026-08","progress":45,"weight":12}]}'
Invoke-RestMethod "$base/api/projects/NB-2026-001/wbs" -Headers $h
Invoke-RestMethod "$base/api/projects/NB-2026-001/team" -Method Put -Headers $h `
  -ContentType "application/json" -Body '{"memberIds":["EMP-002","EMP-004"]}'
Invoke-RestMethod "$base/api/projects/NB-2026-001/team" -Headers $h

# admin seed (needs SETUP_TOKEN env on the server)
Invoke-RestMethod "$base/api/admin/seed" -Method Post `
  -Headers @{ "x-setup-token" = "test-token" }
```
