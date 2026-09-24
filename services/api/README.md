# ISMS API

Fastify 5 + TypeScript backend. Storage: SQLite (dev, `better-sqlite3`) or MySQL (`mysql2`).
Generic envelope store: each collection is a table `(id VARCHAR(128) PK, branch TEXT, data TEXT JSON, updated_at TEXT)`.

Env: `JWT_SECRET` is **required** — the API throws at boot when it is missing or
empty (no dev fallback). `WEB_ORIGINS` is a comma-separated CORS allowlist
(falls back to single `WEB_ORIGIN`; `"*"` in non-prod when unset). Auth is
JWT header-based (`Authorization: Bearer <token>`), so no CORS credentials.
`GET /files/*` requires auth (401 anon). `GET /health` returns
`{ status, auditErrors }` where `auditErrors` counts best-effort audit-write
failures (also logged via `console.error`). DDL is MySQL-compatible:
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

Health: `GET http://localhost:3000/health` → `{ "ok": true, "data": { "status": "ok" } }`.

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
  (defaults are handled in code inserts). `002_init.sql` adds
  `users.is_active`; `002_audit_log.sql` creates `audit_log`
  (`VARCHAR(128)` PK, no `TEXT DEFAULT`s, `actor` column).
  Delete local `./data/isms.db` and re-run `npm run migrate` to pick up DDL changes.

## Scripts

- `npm run dev` — `tsx watch src/index.ts` (migrates on boot, then listens on `PORT`)
- `npm run migrate` — `tsx src/migrate.ts`
- `npm run seed` — `tsx src/seed.ts` (4 dev users, idempotent)
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
| PATCH | `/api/<table>/:id` | body `{ branch?, data? }`; `data` is merged shallow server-side (`{...old, ...patch}`) |
| DELETE | `/api/<table>/:id` | 404 when missing |

## Project WBS & team (`src/routes/wbs.ts`, auth required)

| Method | Endpoint | Body |
|---|---|---|
| GET/PUT | `/api/projects/:id/wbs` | `{ wbs: [...] }` |
| GET/PUT | `/api/projects/:id/team` | `{ memberIds: ["EMP-002", ...] } |

Missing rows read back as `[]`; `PUT` upserts.

## Admin seed (`src/routes/admin.ts`, `src/seedData.ts`)

- `POST /api/admin/seed` with header `x-setup-token: <SETUP_TOKEN>` (else 403).
  Bulk-inserts settings (36 rows), full COA (98 accounts), and 1–2 example rows
  per other collection; existing ids are skipped. Returns `{ inserted, skipped }`.

## Users (`src/routes/users.ts`, Direktur/Developer only)

| Method | Endpoint | Notes |
|---|---|---|
| GET | `/api/users` | list tanpa password hash |
| POST | `/api/users` | `{ username, name, role, password≥6, email? }`, 409 bila duplikat |
| PATCH | `/api/users/:id` | nama/role/email/isActive; password hanya via endpoint khusus |
| POST | `/api/users/:id/password` | ganti/reset (`:id` bisa `me`); self wajib password lama |
| DELETE | `/api/users/:id` | nonaktif (`is_active=0`), tak pernah hapus fisik |

Login menolak akun nonaktif (403). Tabel `users` tidak ikut CRUD generik.

## Audit log & files

- `GET /api/audit?table=&limit=&offset=` — log siapa-ubah-apa (user, aksi, diff, IP, waktu server), terbaru dulu.
- `POST /api/files` (multipart field `file`, png/jpg/pdf/xlsx/csv ≤10MB) → `{ url: "/files/..." }`; `GET /files/*` requires `Authorization: Bearer <token>` (401 anon).

## Rate limit & 403

- Login 20/mnt/IP, seed 20/mnt, tulis (POST/PATCH/PUT/DELETE) 300/mnt/IP — 429 + header `Retry-After`.
- 403 membawa alasan (`Butuh peran Direktur / Developer`); FE menampilkannya dan tidak menulis lokal.

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
