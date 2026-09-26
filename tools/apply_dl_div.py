"""Sekali jalan: tempel class dl-div ke semua <dl> vertikal (kecuali grid).
Jalankan dari root repo:  python tools/apply_dl_div.py
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FILES = [
    "apps/web/src/pages/dokumen/Documents.tsx",
    "apps/web/src/pages/drydock/Drydock.tsx",
    "apps/web/src/pages/inventori/BomDetail.tsx",
    "apps/web/src/pages/inventori/Inventory.tsx",
    "apps/web/src/pages/kapal/VesselDetail.tsx",
    "apps/web/src/pages/payroll/Payroll.tsx",
    "apps/web/src/pages/proyek/ProjectDetail.tsx",
    "apps/web/src/pages/qc/QCSafety.tsx",
    "apps/web/src/pages/sdm/KaryawanDetail.tsx",
]

for rel in FILES:
    p = ROOT / rel
    lines = p.read_text(encoding="utf-8").split("\n")
    n = 0
    for i, ln in enumerate(lines):
        if "<dl className=" in ln and "grid" not in ln and "dl-div" not in ln:
            ln2 = re.sub(r"space-y-2\.5 |space-y-2 |space-y-1\.5 ", "", ln)
            ln2 = ln2.replace('<dl className="', '<dl className="dl-div ', 1)
            lines[i] = ln2
            n += 1
    if n:
        p.write_text("\n".join(lines), encoding="utf-8")
        print(f"{rel}: {n} dl")
