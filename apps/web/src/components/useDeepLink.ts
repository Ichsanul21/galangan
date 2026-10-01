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
import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";

export interface DeepLinkParams {
  tab: string;
  highlight: string;
}

/** Baca ?tab= dan ?highlight= tanpa efek samping. */
export function useDeepLinkParams(): DeepLinkParams {
  const [params] = useSearchParams();
  return {
    tab: params.get("tab") ?? "",
    highlight: params.get("highlight") ?? "",
  };
}

/**
 * Jalankan resolve(rowId) setelah tab deep-link terpasang.
 *
 * resolve harus membaca state tab terbaru, karena closure-nya dibuat ulang
 * setiap render. runRef dipakai supaya resolve tidak perlu masuk ke dep array
 * (yang bisa membuat efek berjalan ulang saat paginasi berubah).
 */
export function useDeepLinkTarget(
  tab: string,
  highlight: string,
  setTab: (next: string) => void,
  resolve: (rowId: string) => void,
  deps: unknown[] = [],
): void {
  const doneKey = useRef<string>("");
  const resolveRef = useRef(resolve);
  resolveRef.current = resolve;

  useEffect(() => {
    // Highlight saja tanpa tab juga sah: resolve() milik modul yang tahu
    // tab mana yang memegang baris itu, jadi ia boleh memindahkannya sendiri.
    if (!highlight) return;
    const key = `${tab}|${highlight}`;
    if (doneKey.current === key) return;
    doneKey.current = key;

    if (tab) setTab(tab);
    // Tick berikutnya sudah memakai tab baru, jadi resolve melihat state
    // yang benar dan tidak menimpanya kembali.
    const timer = window.setTimeout(() => resolveRef.current(highlight), 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, highlight, setTab, ...deps]);
}