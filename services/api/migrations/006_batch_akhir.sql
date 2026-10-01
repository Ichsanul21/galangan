-- Batch revisi terakhir: gudang, maintenance equipment, surat SDM.
--
-- Tiga koleksi ini sebelumnya hanya hidup di memori FE (useState / localStorage)
-- sehingga hilang saat reload dan tidak pernah sampai ke server:
--   - Gudang        : daftar gudang + kapasitas, sebelumnya JSON di settings.WAREHOUSE_CAP
--   - Maintenance   : seluruh siklus servis equipment (jadwal → proses → selesai),
--                     sebelumnya dijejalkan ke field equipment.{scheduledService,lastServiceMaterials}
--   - Surat         : arsip surat SDM, sebelumnya useDraftState("isms.draft.hr.arsipSurat")
--
-- Bentuk kolom sengaja sama seperti 001_init.sql (id/branch/data/updated_at) agar
-- routes/crud.ts generik langsung melayani tanpa cabang khusus.
CREATE TABLE IF NOT EXISTS warehouses (id VARCHAR(128) PRIMARY KEY, branch VARCHAR(64), data TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE INDEX idx_warehouses_branch ON warehouses(branch);
CREATE TABLE IF NOT EXISTS maintenances (id VARCHAR(128) PRIMARY KEY, branch VARCHAR(64), data TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE INDEX idx_maintenances_branch ON maintenances(branch);
CREATE TABLE IF NOT EXISTS letters (id VARCHAR(128) PRIMARY KEY, branch VARCHAR(64), data TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE INDEX idx_letters_branch ON letters(branch);
