"""Sekali jalan: Drydock full-width stack (Utilisasi > Slot > Gantt).
Jalankan dari root repo:  python tools/drydock_stack.py
"""
from pathlib import Path

P = Path(__file__).resolve().parent.parent / "apps" / "web" / "src" / "pages" / "drydock" / "Drydock.tsx"
lines = P.read_text(encoding="utf-8").split("\n")

# 1. Potong Card Utilisasi (dari '        <Card className="p-5">' s/d '        </Card>' penutupnya).
start = next(i for i, l in enumerate(lines) if l == '        <Card className="p-5">')
assert "utilTitle" in lines[start + 1], lines[start + 1]
end = next(i for i in range(start + 1, len(lines)) if lines[i] == "        </Card>")
block = lines[start:end + 1]
del lines[start:end + 1]

# 2. Grid 2 kolom -> tumpuk penuh.
i = next(i for i, l in enumerate(lines) if l == '      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">')
lines[i] = '      <div className="mt-5 grid grid-cols-1 gap-5">'

# 3. Sisip Utilisasi tepat sebelum grid (setelah baris kosong sebelumnya).
lines[i - 1:i - 1] = ["", *block]

P.write_text("\n".join(lines), encoding="utf-8")
print("OK: utilisasi atas full-width, slot+gantt stack")
