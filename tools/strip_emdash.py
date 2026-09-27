"""Sekali jalan: ganti em-dash/en-dash/minus Unicode -> hyphen biasa.
KECUALI 2 regex yang memang parse input user (Finance.tsx:234, Equipment.tsx:28).
Jalankan dari root repo:  python tools/strip_emdash.py
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
KEEP = {
    "apps/web/src/pages/keuangan/Finance.tsx": {234},
    "apps/web/src/pages/equipment/Equipment.tsx": {28},
}

total = 0
files = sorted(ROOT.glob("apps/web/src/**/*.tsx")) + sorted(ROOT.glob("apps/web/src/**/*.ts"))
for f in files:
    rel = f.relative_to(ROOT).as_posix()
    lines = f.read_text(encoding="utf-8").split("\n")
    keep = KEEP.get(rel, set())
    n = 0
    for i, ln in enumerate(lines):
        if i + 1 in keep:
            continue
        new = ln.replace("—", "-").replace("–", "-").replace("−", "-")
        if new != ln:
            lines[i] = new
            n += len(re.findall(r"[—–−]", ln))
    if n:
        f.write_text("\n".join(lines), encoding="utf-8")
        print(f"{rel}: {n}")
        total += n
print("TOTAL:", total)
