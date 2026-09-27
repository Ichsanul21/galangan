"""Sekali jalan: audit konsistensi id.ts vs en.ts (paritas key + campur bahasa).
Jalankan dari root repo:  python tools/audit_i18n.py
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ID = (ROOT / "apps" / "web" / "src" / "i18n" / "id.ts").read_text(encoding="utf-8")
EN = (ROOT / "apps" / "web" / "src" / "i18n" / "en.ts").read_text(encoding="utf-8")

ID_WORDS = [" yang ", " dan ", " dengan ", " untuk ", " dari ", " tidak ", " sudah ",
            " belum ", " adalah ", " dapat ", " pada ", " tanggal ", " tambah ", " simpan ",
            " batal ", " hapus ", " ubah ", " cari ", " semua ", " keluar ", " decimal ",
            " kepada ", " oleh ", " sampai ", " tetap ", " laporan ", " proyek ", " kapal "]
EN_WORDS = [" the ", " and ", " with ", " from ", " save ", " cancel ", " delete ",
            " search ", " export ", " loading ", " settings ", " dashboard ", " report ",
            " project ", " vessel ", " payment ", " download ", " upload ", " print ",
            " filter ", " status ", " detail ", " edit ", " add ", " list ", " total "]


def pairs(src):
    return re.findall(r'(\w+):\s*"((?:[^"\\]|\\.)*)"', src)


id_map = dict(pairs(ID))
en_map = dict(pairs(EN))

print(f"key id={len(id_map)} en={len(en_map)}")
only_id = [k for k in id_map if k not in en_map]
only_en = [k for k in en_map if k not in id_map]
print("HANYA ID:", only_id)
print("HANYA EN:", only_en)

print("\n--- ID berisi Inggris? ---")
for k, v in id_map.items():
    low = f" {v.lower()} "
    if any(w in low for w in EN_WORDS):
        print(f"{k}: {v[:70]}")

print("\n--- EN berisi Indonesia? ---")
for k, v in en_map.items():
    low = f" {v.lower()} "
    if any(w in low for w in ID_WORDS):
        print(f"{k}: {v[:70]}")
