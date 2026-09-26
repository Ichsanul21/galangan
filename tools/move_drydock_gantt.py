"""Sekali jalan: pindah Card Gantt Drydock ke bawah tabel slot.
Jalankan dari root repo:  python tools/move_drydock_gantt.py
"""
from pathlib import Path

P = Path(__file__).resolve().parent.parent / "apps" / "web" / "src" / "pages" / "drydock" / "Drydock.tsx"
lines = P.read_text(encoding="utf-8").split("\n")

start = next(i for i, l in enumerate(lines) if l == "      <Card>")
assert "Gantt Penjadwalan Docking" in lines[start + 2], lines[start + 2]
end = next(i for i in range(start + 1, len(lines)) if lines[i] == "      </Card>")
block = lines[start:end + 1]
del lines[start:end + 1]
# Sisip setelah Card tabel slot (penutup '        </Card>' pertama setelah {pager.bar}).
pbar = next(i for i, l in enumerate(lines) if "{pager.bar}" in l)
close = next(i for i in range(pbar + 1, len(lines)) if lines[i] == "        </Card>")
lines[close + 1:close + 1] = ["", *block]

P.write_text("\n".join(lines), encoding="utf-8")
print("OK: gantt pindah bawah tabel slot")
