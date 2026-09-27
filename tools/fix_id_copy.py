"""Sekali jalan: Inggris hardcode -> Indonesia (mode id).
Aman: hanya teks tampilan, tanpa logika.
Jalankan dari root repo:  python tools/fix_id_copy.py
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "apps" / "web" / "src"

jobs: list[tuple[str, list[tuple[str, str]]]] = [
    ("i18n/id.ts", [
        ('expand: "Expand"', 'expand: "Bentangkan"'),
        ('minimize: "Minimize"', 'minimize: "Perkecil"'),
    ]),
    ("pages/kapal/VesselDetail.tsx", [
        ('toast("Next due wajib diisi"', 'toast("Jatuh tempo wajib diisi"'),
        ("Next due: {fmtTanggal(d.nextDue)}", "Jatuh tempo: {fmtTanggal(d.nextDue)}"),
    ]),
    ("pages/pengaturan/Peran.tsx", [
        ('"Export"]', '"Ekspor"]'),
        ('"Export",', '"Ekspor",'),
    ]),
]

# Export X -> Ekspor X di banyak file (label tombol saja).
for rel in [
    "pages/absensi/Absensi.tsx",
    "pages/Analytics.tsx",
    "pages/audit/Audit.tsx",
    "pages/crm/CRM.tsx",
    "pages/dokumen/Documents.tsx",
    "pages/keuangan/Finance.tsx",
    "pages/laporan/Laporan.tsx",
    "pages/payroll/Payroll.tsx",
]:
    jobs.append((rel, [
        ("Export Excel", "Ekspor Excel"),
        ("Export Forecast", "Ekspor Forecast"),
        ("Export Laporan", "Ekspor Laporan"),
        ("Export CSV e-Faktur", "Ekspor CSV e-Faktur"),
        ("Export Excel SPT", "Ekspor Excel SPT"),
        ("Export Rekap", "Ekspor Rekap"),
        ("Export THR & Bonus", "Ekspor THR & Bonus"),
        ("Export Hasil", "Ekspor Hasil"),
    ]))

for rel, pairs in jobs:
    p = SRC / rel if not rel.startswith("i18n") else SRC / rel
    p = ROOT / "apps" / "web" / "src" / rel
    t = p.read_text(encoding="utf-8")
    n = 0
    for old, new in pairs:
        c = t.count(old)
        if c:
            t = t.replace(old, new)
            n += c
    if n:
        p.write_text(t, encoding="utf-8")
        print(f"{rel}: {n}")
