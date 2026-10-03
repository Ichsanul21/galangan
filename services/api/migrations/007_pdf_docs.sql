-- Snapshot model render PDF: sumber tunggal untuk cetak ulang.
--
-- KEPUTUSAN (revisi client 2 Oktober): berkas PDF tidak boleh menumpuk di
-- storage server, tapi "cetak ulang" tidak boleh berarti "render ulang dari
-- data terbaru" - kalau baris kwitansi sudah dikoreksi setelah dicetak,
-- render ulang diam-diam menghasilkan dokumen berbeda dari yang diarsipkan,
-- dan tidak ada cara membuktikan mana yang benar.
--
-- Yang disimpan karena itu bukan PDF-nya, melainkan MODELnya: input final
-- factory setelah semua baris DB dibaca server (nomor, nama, nominal, item,
-- tanggal). Cetak ulang = rakit ulang dari model ini, sehingga hasilnya
-- identik dengan cetakan pertama walau tabelnya sudah berubah. Bytes PDF
-- tetap dialirkan ke klien dan tidak pernah menyentuh disk.
--
-- Kolom `model` sengaja TEXT: bentuknya JSON hasil factory, dan skema
-- per jenis dokumen berbeda (kwitansi punya breakdown, surat jalan punya
-- SJ/TT, dsb) - kolom JSON dengan skema mengikat akan memaksa semua factory
-- memakai satu bentuk yang salah untuk yang lain.
--
-- Bentuk kolom lain mengikuti 002_audit_log.sql (VARCHAR PK + TEXT non-indexed)
-- supaya jalan di SQLite dan MySQL tanpa cabang khusus.
CREATE TABLE IF NOT EXISTS pdfDocs (
  id VARCHAR(128) PRIMARY KEY,
  kind VARCHAR(64) NOT NULL,
  entity_field VARCHAR(128) NOT NULL,
  entity_id VARCHAR(128) NOT NULL,
  locale VARCHAR(8) NOT NULL,
  branch VARCHAR(64),
  model TEXT NOT NULL,
  pages INT NOT NULL,
  bytes INT NOT NULL,
  engine VARCHAR(32) NOT NULL,
  font VARCHAR(16) NOT NULL,
  actor TEXT NOT NULL,
  created_at VARCHAR(32) NOT NULL
);
CREATE INDEX idx_pdf_docs_entity ON pdfDocs(kind, entity_id);
CREATE INDEX idx_pdf_docs_created ON pdfDocs(created_at);