"""Sekali jalan: daftar string Inggris hardcode di luar t.* (tampil saat locale=id).
Jalankan dari root repo:  python tools/audit_en_hardcode.py
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WORDS = ["Create", "Save", "Cancel", "Delete", "Search", "Loading", "Settings",
         "Details", "Export", "Download", "Print", "Close", "Back", "Next",
         "Submit", "Update", "Clear", "Expand", "Collapse", "View", "Add"]

for f in sorted((ROOT / "apps" / "web" / "src").rglob("*.tsx")):
    for i, line in enumerate(f.read_text(encoding="utf-8").split("\n"), 1):
        s = line.strip()
        if not s or s.startswith("import") or s.startswith("//") or s.startswith("*"):
            continue
        if re.search(r"t\.\w+", s):
            continue
        for w in WORDS:
            if re.search(r"[>\"' (]" + w + r"[ <\"')]", s):
                print(f.relative_to(ROOT / "apps" / "web" / "src"), i, s[:85])
                break
