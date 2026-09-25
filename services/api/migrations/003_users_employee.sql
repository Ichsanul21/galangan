-- Link akun login ke data karyawan (employees.id). Nullable: akun sistem
-- (demo/dev) boleh tanpa karyawan. Dihapus? employees tidak dihapus
-- (nonaktif saja), jadi tanpa FK cascade — validasi di API (422 bila yatim).
ALTER TABLE users ADD COLUMN employee_id VARCHAR(128) NULL;
