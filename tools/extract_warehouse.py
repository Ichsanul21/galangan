"""Ekstrak REPORT WAREHOUSE 2024.xlsx -> services/api/seed-data/warehouse_*.json (Fase 0.2).

Sumber: docs/RawData/Purchasing & Material/REPORT WAREHOUSE(SANTI & RASYID) 2024.xlsx
Sheet KODE (barang+supplier), STOCK ALL, IN JAN-DES (compact: buang baris kosong),
OUT JAN-DES (buang baris legenda tanpa kode barang).
Jalankan dari root repo:  python tools/extract_warehouse.py
"""
import json
import openpyxl
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "docs" / "RawData" / "Purchasing & Material" / "REPORT WAREHOUSE(SANTI & RASYID) 2024.xlsx"
OUTDIR = ROOT / "services" / "api" / "seed-data"


def s(v):
    return "" if v is None else str(v).strip()


def num(v):
    if v is None:
        return 0
    if isinstance(v, (int, float)):
        return v
    t = str(v).strip().replace(".", "").replace(",", "")
    try:
        return int(t)
    except ValueError:
        try:
            return float(str(v).strip())
        except ValueError:
            return 0


def iso(v):
    if v is None:
        return ""
    if hasattr(v, "strftime"):
        return v.strftime("%Y-%m-%d")
    return str(v).strip()


def main():
    wb = openpyxl.load_workbook(SRC, read_only=True, data_only=True)

    # ---- KODE ----
    ws = wb["KODE"]
    rows = list(ws.iter_rows(values_only=True))[2:]  # lewati 2 baris judul/header
    barang, supplier = [], []
    for r in rows:
        if s(r[1]):
            barang.append({"kode": s(r[1]), "nama": s(r[2])})
        if s(r[5]):
            supplier.append({"kode": s(r[5]), "nama": s(r[6])})

    # ---- STOCK ALL ----
    ws = wb["STOCK ALL"]
    rows = list(ws.iter_rows(values_only=True))[2:]
    stock = []
    for r in rows:
        if not s(r[0]):
            continue
        stock.append({
            "kode": s(r[0]), "nama": s(r[1]),
            "awal": num(r[2]), "masuk": num(r[3]),
            "keluar": num(r[4]), "akhir": num(r[5]),
        })

    # ---- IN (compact) ----
    ws = wb["IN JAN-DES"]
    rows = list(ws.iter_rows(values_only=True))[1:]
    masuk = []
    for r in rows:
        if not s(r[0]) or not s(r[1]):
            continue
        masuk.append({
            "tanggal": iso(r[0]), "kode": s(r[1]), "nama": s(r[2]),
            "supKode": s(r[3]), "supNama": s(r[4]),
            "jumlah": num(r[5]), "satuan": s(r[6]),
            "hargaNonPpn": num(r[7]), "pajak": num(r[8]), "total": num(r[9]),
            "vendor": s(r[10]), "purpose": s(r[11]),
        })

    # ---- OUT (buang baris kosong/legenda; kode boleh kosong — nama tetap data) ----
    ws = wb["OUT JAN-DES"]
    rows = list(ws.iter_rows(values_only=True))[1:]
    keluar = []
    for r in rows:
        if not s(r[2]) and not s(r[3]):
            continue
        keluar.append({
            "tanggal": iso(r[0]), "purpose": s(r[1]), "kode": s(r[2]),
            "nama": s(r[3]), "jumlah": num(r[4]), "satuan": s(r[5]),
            "pic": s(r[6]), "keterangan": s(r[7]),
        })

    OUTDIR.mkdir(parents=True, exist_ok=True)
    (OUTDIR / "warehouse_kode.json").write_text(
        json.dumps({"barang": barang, "supplier": supplier}, ensure_ascii=False, indent=1), encoding="utf-8")
    (OUTDIR / "warehouse_stock.json").write_text(
        json.dumps(stock, ensure_ascii=False, indent=1), encoding="utf-8")
    (OUTDIR / "warehouse_in.json").write_text(
        json.dumps(masuk, ensure_ascii=False, indent=1), encoding="utf-8")
    (OUTDIR / "warehouse_out.json").write_text(
        json.dumps(keluar, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"KODE barang={len(barang)} supplier={len(supplier)} | STOCK={len(stock)} | IN={len(masuk)} | OUT={len(keluar)}")


if __name__ == "__main__":
    main()
