// Navigasi lintas modul: buka tab tertentu lalu kedipkan baris target.
//
// Pola ini sebelumnya diduplikasi di tiga modul (QCSafety, Finance, CRM) dan
// ketiganya punya bug yang sama: useEffect memakai dep array [deepParams],
// sehingga callback setTimeout menangkap nilai `tab` SEBELUM setTab
// berjalan. Akibatnya pickNotif memutuskan tab berdasarkan tab lama lalu
// menimpanya - kartu Dashboard berlabel "tab Kontrak" mendarat di tab
// "Penawaran", dan "tab Piutang (AR)" mendarat di "Invoice".
//
// Hook ini menutup bug itu di satu tempat dengan urutan eksplisit:
//
//   1. setTab lebih dulu, sehingga tab dijamin sudah terpasang saat resolve
//   2. resolve dijalankan pada tick berikutnya, bukan lewat setTimeout yang
//      menangkap tab lama
//   3. timer dibersihkan saat unmount supaya tidak ada setState setelah
//      komponen dilepas
//
// PARAMETER `highlight` BISA BERISI BANYAK ID (dipisah koma).
//
// Kartu Dashboard menghitung kelompok ("NCR Terbuka" = 5 baris), jadi
// meneruskan satu id saja membuat kartu berbohong: dari lima baris yang
// tertunjuk, hanya satu yang terlihat berkedip. Sekarang semua id ikut
// diteruskan dan resolve menerimanya sekaligus, sehingga halaman tujuan
// menyorot seluruh kelompok tanpa perlu tahu mana yang "utama".
import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";

export interface DeepLinkParams {
  tab: string;
  /** Nilai mentah param `highlight` (bisa berisi koma). */
  highlight: string;
  /** Id-id target yang harus disorot, sudah dipisah + dibersihkan. */
  ids: string[];
}

/** Baca ?tab= dan ?highlight= tanpa efek samping. */
export function useDeepLinkParams(): DeepLinkParams {
  const [params] = useSearchParams();
  const highlight = params.get("highlight") ?? "";
  return {
    tab: params.get("tab") ?? "",
    highlight,
    ids: splitHighlight(highlight),
  };
}

/**
 * Pecah `highlight` menjadi daftar id unik yang tidak kosong.
 * Id bisa mengandung koma? Tidak - id store memakai pola PRJ-/INV-/NCR-/
 * QT- yang bebas koma, jadi koma aman dipakai sebagai pemisah.
 */
export function splitHighlight(highlight: string): string[] {
  return [...new Set(
    String(highlight ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s !== ""),
  )];
}

/**
 * Jalankan resolve(ids) setelah tab deep-link terpasang.
 *
 * resolve harus membaca state tab terbaru, karena closure-nya dibuat ulang
 * setiap render. runRef dipakai supaya resolve tidak perlu masuk ke dep array
 * (yang bisa membuat efek berjalan ulang saat paginasi berubah).
 */
export function useDeepLinkTarget(
  tab: string,
  highlight: string,
  setTab: (next: string) => void,
  resolve: (ids: string[]) => void,
  deps: unknown[] = [],
): void {
  const doneKey = useRef<string>("");
  const resolveRef = useRef(resolve);
  resolveRef.current = resolve;

  useEffect(() => {
    // Tab saja TANPA highlight juga sah: kartu Dashboard mengirim
    // ?tab=Kontrak Even ketika tidak ada baris yang bisa disorot (mis. semua
    // invoice sudah lunas). Dulu `if (!highlight) return` membuat klik pada
    // kartu bernomor "0" tidak melakukan apa-apa sama sekali - bahkan tab
    // tujuannya tidak dibuka.
    if (!tab && !highlight) return;
    const key = `${tab}|${highlight}`;
    if (doneKey.current === key) return;
    doneKey.current = key;

    if (tab) setTab(tab);
    // Tick berikutnya sudah memakai tab baru, jadi resolve melihat state
    // yang benar dan tidak menimpanya kembali.
    const ids = splitHighlight(highlight);
    if (ids.length === 0) return;
    const timer = window.setTimeout(() => resolveRef.current(ids), 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, highlight, setTab, ...deps]);
}