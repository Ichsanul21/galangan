"""Sekali jalan: reorder tab Procurement + pindah chart ke bawah tabel.
- Tabs: PR -> RFQ -> PO Besar -> PO Kecil -> Vendor; default tab PR.
- Grid chart PO Besar pindah ke bawah tabel (dalam kondisional yang sama).
Jalankan dari root repo:  python tools/reorder_procurement.py
"""
from pathlib import Path

P = Path(__file__).resolve().parent.parent / "apps" / "web" / "src" / "pages" / "procurement" / "Procurement.tsx"
lines = P.read_text(encoding="utf-8").split("\n")

# 1. Default tab -> PR.
i = next(i for i, l in enumerate(lines) if 'useState("PO Besar (Kantor)")' in l)
lines[i] = lines[i].replace('useState("PO Besar (Kantor)")', 'useState("PR")')

# 2. Urutan label Tabs.
i = next(i for i, l in enumerate(lines) if "<Tabs tabs=" in l)
assert "PO Besar (Kantor)" in lines[i], lines[i]
lines[i] = '        <Tabs tabs={["PR", "RFQ", "PO Besar (Kantor)", "PO Kecil (Workshop)", "Vendor"]} active={tab} onChange={setTab} />'

# 3. Pindah grid chart (div.grid ... </div> penutup) ke bawah {bigPager.bar}.
start = next(i for i, l in enumerate(lines) if '<div className="grid grid-cols-1 gap-4 lg:grid-cols-3">' in l)
# akhir grid: baris '</div>' pertama setelah start yang indentasinya sama (14 spasi)
end = next(i for i in range(start + 1, len(lines)) if lines[i] == "              </div>")
block = lines[start:end + 1]
del lines[start:end + 1]
anchor = next(i for i, l in enumerate(lines) if "{bigPager.bar}" in l)
lines[anchor + 1:anchor + 1] = block

P.write_text("\n".join(lines), encoding="utf-8")
print("OK: default PR, tabs reorder, chart pindah bawah tabel")
