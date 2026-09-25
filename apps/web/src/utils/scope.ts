// Ruang lingkup proyek: array objek {service, lokasi, deskripsi}.
// Data lama (string[]) dinormalisasi saat baca agar tidak rusak.
export interface ScopeItem {
  service: string;
  lokasi?: string;
  deskripsi?: string;
}

export function scopeList(scope: unknown): ScopeItem[] {
  if (!Array.isArray(scope)) return [];
  const out: ScopeItem[] = [];
  for (const s of scope) {
    if (typeof s === "string") {
      if (s.trim()) out.push({ service: s.trim() });
      continue;
    }
    if (s && typeof s === "object") {
      const o = s as Record<string, unknown>;
      const service = String(o.service ?? o.name ?? "").trim();
      if (!service) continue;
      out.push({
        service,
        ...(String(o.lokasi ?? "").trim() ? { lokasi: String(o.lokasi).trim() } : {}),
        ...(String(o.deskripsi ?? o.desc ?? "").trim() ? { deskripsi: String(o.deskripsi ?? o.desc).trim() } : {}),
      });
    }
  }
  return out;
}

/** Nama service untuk pencocokan (Dashboard Sea Trial, filter, dsb). */
export function scopeNames(scope: unknown): string[] {
  return scopeList(scope).map((s) => s.service);
}

/** Normalisasi prioritas lama: "Kritis" dihapus → "Tinggi". */
export function canonPrioritas(p: unknown): string {
  return String(p ?? "Sedang") === "Kritis" ? "Tinggi" : String(p ?? "Sedang");
}
