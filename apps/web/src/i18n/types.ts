// Struktur kamus i18n. Prinsip: LABEL UI boleh 2 bahasa; NILAI DATA
// (status, stage, tipe) tetap Bahasa Indonesia sebagai canonical —
// mengganti nilai data merusak filter, state machine & API.
export type Locale = "id" | "en";

export interface Dict {
  common: Record<string, string>;
  nav: Record<string, string>;
  auth: Record<string, string>;
  toast: Record<string, string>;
  filter: Record<string, string>;
  notif: Record<string, string>;
  session: Record<string, string>;
  status: Record<string, string>;
}
