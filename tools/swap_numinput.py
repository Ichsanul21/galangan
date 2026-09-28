"""Sekali jalan: <input type="number" -> <NumInput + tambah import NumInput.
Jalankan dari root repo:  python tools/swap_numinput.py
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "apps" / "web" / "src"
UI_PATHS = ("../../components/ui", "../components/ui", "../ui", "./ui")

total_files = 0
total_tags = 0
for f in sorted(SRC.rglob("*.tsx")):
    if f.name == "ui.tsx":
        continue
    t = f.read_text(encoding="utf-8")
    n = t.count('<input type="number"')
    if not n:
        continue
    t = t.replace('<input type="number"', "<NumInput")

    def add_imp(m: re.Match) -> str:
        names, path = m.group(1), m.group(2)
        if "NumInput" in names:
            return m.group(0)
        return "import {" + names.rstrip() + "  NumInput,\n} from \"" + path + "\""

    new_t, cnt = re.subn(
        r'import \{([^}]*)\} from "(' + "|".join(re.escape(p) for p in UI_PATHS) + r')"',
        add_imp, t, count=10,
    )
    t = new_t
    f.write_text(t, encoding="utf-8")
    total_files += 1
    total_tags += n
    print(f"{f.relative_to(ROOT)}: {n}")
print("FILES:", total_files, "TAGS:", total_tags)
