// Draft lokal per halaman — localStorage agar draf tidak hilang saat tab ditutup.
// Kunci: `isms.draft.*`. Muat malas (lazy) + simpan via effect di tiap halaman.

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

export function loadDraft<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw !== null) return JSON.parse(raw) as T;
  } catch {
    /* abaikan, pakai fallback */
  }
  return fallback;
}

export function useDraftState<T>(key: string, initial: T | (() => T)): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    const base = typeof initial === "function" ? (initial as () => T)() : initial;
    return loadDraft(key, base);
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage penuh — abaikan */
    }
  }, [key, value]);
  return [value, setValue];
}
