# Font untuk embedding PDF

Mesin PDF memakai **font standard-14 jsPDF** (Helvetica) kalau folder ini
kosong. Set itu hanya punya himpunan karakter WinAnsi, jadi nama vendor atau
karyawan berhuruf Mandarin tercetak jadi **kotak kosong** tanpa error —
untuk dokumen resmi yang tidak layak.

## Mengaktifkan embedding

Taruh tiga file di folder ini:

| File | Weight | Wajib |
|---|---|---|
| `regular.ttf` | teks biasa | ya |
| `bold.ttf` | tebal | opsional (fallback ke Helvetica bold) |
| `italic.ttf` | miring | opsional |

Atau arahkan ke folder lain tanpa menyalin file ke repo:

```bash
PDF_FONTS_DIR=/usr/share/fonts/galangan npm start
```

Lihat `src/env.ts` (`PDF_FONTS_DIR`, default `assets/fonts` relatif
`process.cwd()`) dan `src/pdf/font.ts`.

Verifikasi:

```bash
npm run probe:pdf   # baris terakhir melaporkan status font
```

```
Font: TTF ter-embed dari ...            # embedding aktif
Font: TIDAK ada TTF di ... - standard-14 # perlu font
```

## Kenapa font tidak ikut di-commit

`.gitignore` mengecualikan `*.ttf`/`*.otf`/`*.ttc` di folder ini. Font
Arial/Calibri/Segoe milik Monotype dan Microsoft - menyalinnya ke repo
menydistributed lisensi yang tidak diizinkan. Font yang layak di-commit
harus bebas: **Noto Sans**, **DejaVu Sans**, atau **Carlito** (SIL OFL /
Bitstream Vera), semuanya mencakup Latin + simbol yang dipakai dokumen ini.

Untuk huruf Mandarin dibutuhkan font CJK (mis. **Noto Sans CJK SC**,
lisensi OFL, ~16 MB) - taruh di server lewat `PDF_FONTS_DIR`, jangan di repo.

## Ukuran berkas

Embedding menambah beberapa ratus KB per PDF karena program font ikut
masuk. Kalau itu terlalu besar untuk laporan yang diunduh sering, subset
font dulu sehingga hanya karakter yang benar-benar dipakai yang tertanam:

```bash
pyftsubset NotoSans-Regular.ttf --text-file charset.txt \
  --output-file=regular.ttf --flavor=ttf
```

Subset butuh `fonttools` (`pip install fonttools`). Hasilnya ditaruh di
folder ini seperti biasa.