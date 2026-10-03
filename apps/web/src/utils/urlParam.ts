/* State yang hidup di URL query, bukan di komponen.
 *
 * Kenapa: memilih "Juni 2026" di Kas & Bank lalu me-reload akan mengembalikan
 * tampilan ke "Semua", dan tidak ada tautan yang bisa dikirim ke rekan untuk
 * melihat angka yang sama. Laporan historikal justru dipakai persis di
 * situasi itu - "tolong cek kas per Juni" - jadi filter yang hilang saat
 * reload menghapus objek dari pembicaraan.
 *
 * URL adalah SATU-SATUN sumber kebenaran; tidak ada state bayangan yang bisa
 * tidak sinkron dengan address bar. Itu juga membuat tautan dari luar
 * (chat, bookmark) langsung bekerja tanpa efek tambahan.
 *
 * Setter memakai `replace`, bukan `push`: mengubah filter bukan langkah
 * navigasi yang perlu bisa di-undur, dan `push` menumpuk riwayat sehingga
 * tombol "kembali" di browser memunculkan filter lama berulang kali.
 */
import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

export interface UrlParamCodec<T> {
  /** Parse nilai mentah dari URL. Nilai tak valid harus mengembalikan default. */
  parse: (raw: string | null) => T;
  /** Encode nilai untuk ditulis ke URL. String kosong berarti hapus param. */
  format: (value: T) => string;
}

export function useUrlParam<T>(key: string, codec: UrlParamCodec<T>): [T, (next: T) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get(key);
  const value = useMemo(() => codec.parse(raw), [raw, codec]);

  const set = useCallback(
    (next: T) => {
      const encoded = codec.format(next);
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (encoded === "") p.delete(key);
          else p.set(key, encoded);
          return p;
        },
        { replace: true },
      );
    },
    [key, codec, setParams],
  );

  return [value, set];
}