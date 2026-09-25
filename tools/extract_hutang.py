"""Ekstrak CONTOH HUTANG.xlsx -> services/api/seed-data/hutang.json (Fase 0.1).

Sumber: docs/RawData/Purchasing & Material/CONTOH HUTANG.xlsx (sheet ANEKA ASIA).
Header di baris 4 (1-indexed), data baris 6..53 (48 baris). Verifikasi: total = 5819581205.
Jalankan dari root repo:  python tools/extract_hutang.py
"""
import json
import openpyxl
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "docs" / "RawData" / "Purchasing & Material" / "CONTOH HUTANG.xlsx"
OUT = ROOT / "services" / "api" / "seed-data" / "hutang.json"


def num(v):
    if v is None:
        return 0
    if isinstance(v, (int, float)):
        return int(v)
    s = str(v).strip().replace(".", "").replace(",", "")
    return int(s) if s.lstrip("-").isdigit() else 0


def iso(v):
    if v is None:
        return ""
    if hasattr(v, "strftime"):
        return v.strftime("%Y-%m-%d")
    return str(v).strip()


def main():
    wb = openpyxl.load_workbook(SRC, read_only=True, data_only=True)
    ws = wb["ANEKA ASIA"]
    rows = list(ws.iter_rows(values_only=True))
    data = rows[5:53]  # baris 6..53
    assert len(data) == 48, f"baris data {len(data)} != 48"

    items = []
    for i, r in enumerate(data, start=1):
        items.append({
            "id": f"AP-RAW-{i:03d}",
            "vendor": "PT KALTIM LESTARI UNGGUL",
            "tglTagihan": iso(r[0]),
            "noPo": str(r[1] or "").strip(),
            "noInvoice": str(r[2] or "").strip(),
            "keterangan": str(r[3] or "").strip(),
            "jenisBarang": str(r[4] or "").strip(),
            "jumlah": num(r[5]),
            "pay1": num(r[6]),
            "pay1note": str(r[7] or "").strip(),
            "pay2": num(r[8]),
            "pay2note": str(r[9] or "").strip(),
        })

    total = sum(x["jumlah"] for x in items)
    assert total == 5819581205, f"total {total} != 5819581205"

    bank = {
        "bank": "BANK BCA",
        "acc": "027.0758.487",
        "an": "PT. KALTIM LESTARI UNGGUL",
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"bank": bank, "items": items}, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"OK {len(items)} baris, total {total} -> {OUT}")


if __name__ == "__main__":
    main()
