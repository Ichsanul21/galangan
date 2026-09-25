// Perbandingan nama antar-koleksi yang toleran (trim + case-insensitive).
// Dipakai di titik join NAMA (WO.sub, bookings.equip, vessel, owner,
// inspector, vendor, client) agar beda kapital/spasi tidak memutus rantai.
// Join ID-exact tetap diutamakan di tiap pemanggil.
export function sameName(a: unknown, b: unknown): boolean {
  return String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();
}

/** Cocokkan nama kapal termasuk slot ganda "A + B" (Drydock vesselFull). */
export function vesselMatch(slotVessel: unknown, vesselName: unknown): boolean {
  if (sameName(slotVessel, vesselName)) return true;
  return String(slotVessel ?? "")
    .split("+")
    .some((part) => sameName(part, vesselName));
}
