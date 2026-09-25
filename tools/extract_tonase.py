"""Transkrip TABLE TONASE PLAT.jpg -> services/api/seed-data/tonase.json (Fase 0.4).

Dibaca langsung dari gambar. Satuan berat per lembar/batang (kg) + kg/m bila ada.
Roundbar: pasangan (batang 6m, kg/m) lolos cek red*6~=black; dua sel merah
tak terbaca penuh (6", 10") diisi turunan = black/6 + flag approx:true.
Rumus acuan: berat = P*L*T*7.85e-6 (plat), roundbar kg/m = 0.006165*d_mm^2.
Jalankan dari root repo:  python tools/extract_tonase.py
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "services" / "api" / "seed-data" / "tonase.json"

DATA = {
    "plat_5x20": [
        ["Plat 4,5 mm x 5' x 20'", 328], ["Plat 5 mm x 5' x 20'", 365],
        ["Plat 6 mm x 5' x 20'", 438], ["Plat 7 mm x 5' x 20'", 510],
        ["Plat 8 mm x 5' x 20'", 583], ["Plat 9 mm x 5' x 20'", 656],
        ["Plat 10 mm x 5' x 20'", 729], ["Plat 12 mm x 5' x 20'", 875],
        ["Plat 13 mm x 5' x 20'", 948], ["Plat 14 mm x 5' x 20'", 1021],
        ["Plat 15 mm x 5' x 20'", 1094], ["Plat 16 mm x 5' x 20'", 1167],
        ["Plat 19 mm x 5' x 20'", 1386], ["Plat 20 mm x 5' x 20'", 1458],
        ["Plat 22 mm x 5' x 20'", 1604], ["Plat 25 mm x 5' x 20'", 1823],
        ["Plat 30 mm x 5' x 20'", 2187], ["Plat 40 mm x 5' x 20'", 2916],
        ["Plat 50 mm x 5' x 20'", 3645], ["Plat 60 mm x 5' x 20'", 4376],
        ["Plat 65 mm x 5' x 20'", 4740], ["Plat 70 mm x 5' x 20'", 5105],
        ["Plat 75 mm x 5' x 20'", 5470],
    ],
    "plat_6x20": [
        ["Plat 4,5 mm x 6' x 20'", 394], ["Plat 5 mm x 6' x 20'", 438],
        ["Plat 6 mm x 6' x 20'", 525], ["Plat 8 mm x 6' x 20'", 700],
        ["Plat 9 mm x 6' x 20'", 788], ["Plat 10 mm x 6' x 20'", 875],
        ["Plat 12 mm x 6' x 20'", 1050], ["Plat 13 mm x 6' x 20'", 1138],
        ["Plat 14 mm x 6' x 20'", 1225], ["Plat 15 mm x 6' x 20'", 1313],
        ["Plat 16 mm x 6' x 20'", 1400], ["Plat 19 mm x 6' x 20'", 1663],
        ["Plat 20 mm x 6' x 20'", 1750], ["Plat 22 mm x 6' x 20'", 1925],
        ["Plat 25 mm x 6' x 20'", 2188], ["Plat 28 mm x 6' x 20'", 2450],
        ["Plat 30 mm x 6' x 20'", 2626], ["Plat 40 mm x 6' x 20'", 3500],
        ["Plat 50 mm x 6' x 20'", 4376], ["Plat 60 mm x 6' x 20'", 5251],
        ["Plat 65 mm x 6' x 20'", 5689], ["Plat 75 mm x 6' x 20'", 6564],
        ["Plat 100 mm x 6' x 20'", 8750],
    ],
    "plat_bordes_4x8": [
        ["Plat 2,3 mm x 4' x 8'", 59], ["Plat 3,0 mm x 4' x 8'", 75],
        ["Plat 3,2 mm x 4' x 8'", 79.6], ["Plat 4,5 mm x 4' x 8'", 110],
        ["Plat 6,0 mm x 4' x 8'", 145], ["Plat 8,0 mm x 4' x 8'", 192],
        ["Plat 9,0 mm x 4' x 8'", 215],
    ],
    "hbeam": [
        ["100 x 100 x 6,0 x 8 mm x 12 M", 206, 17.167],
        ["125 x 125 x 5,0 x 7 mm x 12 M", 222, 18.5],
        ["125 x 125 x 6,5 x 9 mm x 12 M", 286, 23.833],
        ["150 x 150 x 7,0 x 10 mm x 12 M", 378, 31.5],
        ["175 x 175 x 7,0 x 11 mm x 12 M", 482, 40.167],
        ["200 x 200 x 8,0 x 12 mm x 12 M", 599, 49.917],
        ["250 x 250 x 9,0 x 14 mm x 12 M", 869, 72.417],
        ["300 x 300 x 10,0 x 15 mm x 12 M", 1128, 94],
        ["350 x 350 x 12,0 x 19 mm x 12 M", 1644, 137],
        ["400 x 400 x 13,0 x 21 mm x 12 M", 2064, 172],
        ["194 x 150 x 6,0 x 9 mm x 12 M", 360, 30],
        ["294 x 200 x 8,0 x 12 mm x 12 M", 670, 55.833],
        ["390 x 300 x 10,0 x 16 mm x 12 M", 1260, 105],
        ["440 x 300 x 11 x 18 x 12 M", 1452, 121],
        ["900 x 300 x 18,0 x 28 mm x 12 M", 2880, 240],
    ],
    "siku_a": [
        ["Siku 20 x 20 x 3 x 6 M", 5.31], ["Siku 25 x 25 x 3 x 6 M", 6.72],
        ["Siku 25 x 25 x 5 x 6 M", 10.60], ["Siku 30 x 30 x 3 x 6 M", 8.16],
        ["Siku 40 x 40 x 3 x 6 M", 11.00], ["Siku 40 x 40 x 4 x 6 M", 14.50],
        ["Siku 40 x 40 x 5 x 6 M", 18.00], ["Siku 45 x 45 x 4 x 6 M", 16.44],
        ["Siku 45 x 45 x 5 x 6 M", 20.50], ["Siku 50 x 50 x 4 x 6 M", 18.40],
        ["Siku 50 x 50 x 5 x 6 M", 22.50], ["Siku 50 x 50 x 6 x 6 M", 27.58],
        ["Siku 60 x 60 x 5 x 6 M", 27.42], ["Siku 60 x 60 x 6 x 6 M", 32.52],
        ["Siku 65 x 65 x 6 x 6 M", 35.46], ["Siku 70 x 70 x 6 x 6 M", 38.28],
        ["Siku 70 x 70 x 7 x 6 M", 44.28], ["Siku 75 x 75 x 6 x 6 M", 41.22],
        ["Siku 75 x 75 x 7 x 6 M", 47.64], ["Siku 75 x 75 x 8 x 6 M", 54.18],
        ["Siku 80 x 80 x 6 x 6 M", 43.02], ["Siku 80 x 80 x 8 x 6 M", 57.96],
        ["Plat 12 mm x 150 x 6 M", 85.0],
    ],
    "siku_b": [
        ["Siku 90 x 90 x 8 x 6 M", 65.4], ["Siku 90 x 90 x 9 x 6 M", 73.2],
        ["Siku 90 x 90 x 10 x 6 M", 79.8], ["Siku 100 x 100 x 8 x 6 M", 73.2],
        ["Siku 100 x 100 x 10 x 6 M", 90.6], ["Siku 120 x 120 x 11 x 6 M", 119.4],
        ["Siku 120 x 120 x 12 x 6 M", 130.0], ["Siku 125 x 125 x 12 Mx 6 M", 140.0],
        ["Siku 130 x 130 x 9 x 6 M", 107.1], ["Siku 130 x 130 x 12 x 6 M", 140.1],
        ["Siku 150 x 150 x 12 x 6 M", 164.0], ["Siku 150 x 150 x 15 x 6 M", 202.0],
        ["Siku 200 x 200 x 15 x 6 M", 272.0], ["Siku 200 x 200 x 20 x 6 M", 358.0],
        ["Siku 200 x 200 x 25 x 6 M", 442.0], ["Siku 250 x 250 x 25 x 6 M", 562.0],
        ["Siku 100 x 75 x 7 x 6 M", 56.0], ["Siku 100 x 75 x 10 x 6 M", 78.0],
        ["Siku 125 x 75 x 7 x 6 M", 64.2], ["Siku 125 x 75 x 10x 6 M", 90.0],
        ["Siku 150 x 90 x 9 x 6 M", 98.4], ["Siku 150 x 90 x 12 x 6 M", 129.0],
    ],
    "strip": [
        ["Plat 3 mm x 19 mm x 6 mtr", 2.4, 0.400],
        ["Plat 3 mm x 25 mm x 6 mtr", 3.3, 0.550],
        ["Plat 3 mm x 30 mm x 6 mtr", 4.0, 0.667],
        ["Plat 4 mm x 19 mm x 6 mtr", 3.3, 0.550],
        ["Plat 4 mm x 25 mm x 6 mtr", 4.4, 0.733],
        ["Plat 4 mm x 30 mm x 6 mtr", 5.4, 0.900],
        ["Plat 4 mm x 38 mm x 6 mtr", 6.6, 1.100],
        ["Plat 5 mm x 19 mm x 6 mtr", 4.6, 0.767],
        ["Plat 5 mm x 25 mm x 6 mtr", 6.0, 1.000],
        ["Plat 5 mm x 30 mm x 6 mtr", 7.1, 1.183],
        ["Plat 5 mm x 38 mm x 6 mtr", 9.0, 1.500],
        ["Plat 5 mm x 50 mm x 6 mtr", 12.0, 2.000],
        ["Plat 6 mm x 150 mm x 6 mtr", 44.0, 7.333],
        ["Plat 8 mm x 38 mm x 6 mtr", 14.4, 2.400],
        ["Plat 9 mm x 125 mm x 6 mtr", 53.5, 8.917],
        ["Plat 9 mm x 150 mm x 6 mtr", 63.6, 10.600],
        ["Plat 10 mm x 50 mm x 6 mtr", 23.5, 3.917],
        ["Plat 10 mm x 75 mm x 6 mtr", 35.0, 5.833],
        ["Plat 10 mm x 100 mm x 6 mtr", 47.0, 7.833],
        ["Plat 10 mm x 125 mm x 6 mtr", 60.0, 10.000],
        ["Plat 10 mm x 150 mm x 6 mtr", 71.0, 11.833],
        ["Plat 12 mm x 100 mm x 6 mtr", 56.5, 9.417],
        ["Plat 12 mm x 150 mm x 6 mtr", 85.0, 14.167],
    ],
    "roundbar": [
        {"size": '1/2"', "batang6m": 6, "kgm": 1.0},
        {"size": '5/8"', "batang6m": 9.5, "kgm": 1.58},
        {"size": '3/4"', "batang6m": 13.7, "kgm": 2.28},
        {"size": '7/8"', "batang6m": 18.63, "kgm": 3.11},
        {"size": '1"', "batang6m": 24.3, "kgm": 4.05},
        {"size": '1 1/4"', "batang6m": 40, "kgm": 6.67},
        {"size": '1 1/2"', "batang6m": 56.3, "kgm": 9.30},
        {"size": '1 3/4"', "batang6m": 76, "kgm": 12.6},
        {"size": '2"', "batang6m": 100, "kgm": 16.6},
        {"size": '2 1/4"', "batang6m": 125, "kgm": 20.8},
        {"size": '2 1/2"', "batang6m": 153, "kgm": 25.5},
        {"size": '3"', "batang6m": 222, "kgm": 37},
        {"size": '3 1/2"', "batang6m": 305, "kgm": 50.8},
        {"size": '4"', "batang6m": 397, "kgm": 66.1},
        {"size": '5"', "batang6m": 635, "kgm": 105},
        {"size": '6"', "batang6m": 989, "kgm": 164.8, "approx": True},
        {"size": '8"', "batang6m": 1530, "kgm": 255},
        {"size": '10"', "batang6m": 2390, "kgm": 398.3, "approx": True},
    ],
}


def main():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(DATA, ensure_ascii=False, indent=1), encoding="utf-8")
    n = sum(len(v) for v in DATA.values())
    print(f"OK {n} entri -> {OUT}")


if __name__ == "__main__":
    main()
