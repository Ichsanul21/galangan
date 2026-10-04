import { useMemo } from "react";
import { sameName } from "../utils/names";
import {
  facilityOf,
  niceScaleDistance,
  ribbonFor,
  scaleFor,
  vesselDimOf,
  violations,
  type Facility,
  type VesselDim,
  type Violation,
} from "../utils/facilityMap";

/* Peta fasilitas drydock: tampak atas, satu skala untuk semua baris.
 *
 * Yang membuat peta ini berguna, bukan hiasan, adalah dua hal: panjang
 * fasilitas digambar proporsional sehingga drydock 120 m terlihat jauh lebih
 * panjang dari slipway 80 m, dan kapal yang tidak muat memakai outline merah
 * alih-alih diperkecil supaya muat. Tanpa itu, peta hanya hiasan.
 *
 * All fallback disengaja: dimensi yang tidak diketahui tidak dikarang, dan
 * facilities yang panjangnya tidak terbaca tidak digambar sama sekali.
 */

export interface FacilityMapRow {
  facility: Facility;
  vessel: VesselDim | null;
  ribbon: ReturnType<typeof ribbonFor>;
  problems: Violation[];
}

const KIND_LABEL: Record<Facility["kind"], string> = {
  graving: "Graving dock",
  slipway: "Slipway",
  berth: "Berth",
};

const PAD_L = 132;
const PAD_R = 16;
const ROW_H = 56;
const BAR_H = 26;
const MAP_W = 640;
const SCALE_BAR_PX = 120;

/** Lebar piksel untuk seluruh baris: satu skala, bukan satu per baris. */
function buildRows(
  docks: Facility[],
  vesselOfSlot: Map<string, VesselDim>,
  slotsByDock: Map<string, string[]>,
): { rows: FacilityMapRow[]; scale: number; maxLength: number } {
  const maxLength = docks.reduce((m, f) => Math.max(m, f.lengthM), 0);
  const scale = scaleFor(maxLength, MAP_W - PAD_L - PAD_R);

  const rows = docks.map((facility) => {
    const names = slotsByDock.get(facility.id) ?? [];
    const vessel = names.map((n) => vesselOfSlot.get(n.toLowerCase())).find((v) => v !== undefined) ?? null;
    return {
      facility,
      vessel,
      ribbon: ribbonFor(facility, vessel ?? { name: "", loa: null, beam: null, draft: null }, scale),
      problems: vessel === null ? [] : violations(facility, vessel),
    };
  });

  return { rows, scale, maxLength };
}

export default function FacilityMap({
  docks,
  slotFacilities,
  vesselsByName,
}: {
  docks: Facility[];
  /** Nama kapal yang sedang occupy tiap fasilitas (id fasilitas -> nama kapal). */
  slotFacilities: Map<string, string[]>;
  /** Dimensi kapal dari master, sudah dinormalisasi jadi name -> dimensi. */
  vesselsByName: Map<string, VesselDim>;
}) {
  const { rows, scale } = useMemo(
    () => buildRows(docks, vesselsByName, slotFacilities),
    [docks, slotFacilities, vesselsByName],
  );

  if (docks.length === 0 || !(scale > 0)) return null;

  const height = rows.length * ROW_H + 30;
  const tickM = niceScaleDistance(SCALE_BAR_PX, scale);
  const problems = rows.flatMap((r) => r.problems);

  return (
    <div>
      <svg
        viewBox={`0 0 ${MAP_W} ${height}`}
        className="w-full"
        role="img"
        aria-label="Peta fasilitas drydock, skala panjang"
      >
        {rows.map((row, i) => {
          const y = i * ROW_H;
          const f = row.facility;
          const bad = row.problems.length > 0;
          const boxW = f.lengthM * scale;
          const boxH = Math.min(BAR_H, Math.max(12, f.widthM * scale));
          const top = y + (ROW_H - boxH) / 2;
          /* Pita kapal digambar pada panjang aslinya; kalau lebih panjang dari
             fasilitas, pita itu membanjiri ke kanan melewati ujung facilities. */
          const ribbonW = row.ribbon.known ? Math.max(3, row.ribbon.widthPx) : 0;
          const ribbonX = PAD_L + 2;

          return (
            <g key={f.id}>
              <text x={0} y={y + 12} className="fill-navy-900 text-[11px] font-semibold">
                {f.name.length > 20 ? `${f.name.slice(0, 19)}…` : f.name}
              </text>
              <text x={0} y={y + 26} className="fill-steel-400 text-[10px]">
                {KIND_LABEL[f.kind]} · {f.lengthM} m{f.depthM === null ? "" : ` × ${f.depthM} m`}
              </text>

              {/* Facilities */}
              <rect
                x={PAD_L}
                y={top}
                width={boxW}
                height={boxH}
                rx={3}
                className={bad ? "fill-rose-50 stroke-rose-500" : "fill-surface stroke-steel-300"}
                strokeWidth={bad ? 2 : 1}
              />

              {/* Pita kapal */}
              {ribbonW > 0 && (
                <rect
                  x={ribbonX}
                  y={top + 4}
                  width={ribbonW}
                  height={Math.max(6, boxH - 8)}
                  rx={2}
                  className={bad ? "fill-rose-400/70 stroke-rose-600" : "fill-ocean-500/70 stroke-ocean-700"}
                  strokeWidth={1}
                />
              )}

              {/* Label panjang facilities di ujungnya */}
              <text
                x={PAD_L + boxW + 6}
                y={top + boxH / 2 + 3}
                className="fill-steel-500 text-[10px]"
              >
                {f.lengthM} m
              </text>

              {row.vessel !== null && (
                <text x={PAD_L} y={y + 50} className="fill-steel-500 text-[10px]">
                  {row.vessel.name || "?"}
                  {row.vessel.loa === null ? " · LOA tidak diketahui" : ` · LOA ${row.vessel.loa} m`}
                  {row.ribbon.overflowPx > 0 ? ` · mel-over ${(row.ribbon.overflowPx / scale).toFixed(1)} m` : ""}
                </text>
              )}
              {row.vessel === null && (
                <text x={PAD_L} y={y + 50} className="fill-steel-400 text-[10px]">
                  Tidak ada kapal di slot facility
                </text>
              )}
            </g>
          );
        })}

        {/* Skala panjang: 1, 2, atau 5 x 10^n, supaya angkanya berarti. */}
        <g transform={`translate(${PAD_L} ${height - 14})`}>
          <line x1={0} y1={0} x2={tickM * scale} y2={0} className="stroke-navy-800" strokeWidth={2} />
          <line x1={0} y1={-4} x2={0} y2={4} className="stroke-navy-800" strokeWidth={2} />
          <line
            x1={tickM * scale}
            y1={-4}
            x2={tickM * scale}
            y2={4}
            className="stroke-navy-800"
            strokeWidth={2}
          />
          <text x={tickM * scale + 8} y={4} className="fill-navy-800 text-[10px]">
            {tickM} m
          </text>
        </g>
      </svg>

      {problems.length > 0 && (
        <ul className="mt-2 space-y-1">
          {problems.map((p, i) => (
            <li key={`${p.kind}-${i}`} className="text-[11px] font-medium text-rose-700">
              {p.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Kumpulan baris siap gambar, dipakai halaman Drydock. */
export function facilityRowsFor(
  drydockRows: Record<string, unknown>[],
  slotRows: Record<string, unknown>[],
  vesselRows: Record<string, unknown>[],
): {
  docks: Facility[];
  slotFacilities: Map<string, string[]>;
  vesselsByName: Map<string, VesselDim>;
} {
  const docks: Facility[] = [];
  for (const d of drydockRows) {
    const f = facilityOf(d);
    if (f !== null) docks.push(f);
  }

  const vesselsByName = new Map<string, VesselDim>();
  for (const v of vesselRows) {
    const name = String(v.name ?? "").trim();
    if (name === "") continue;
    /* vesselDimOf yang menormalisasi: angka 0 atau negatif jadi null, bukan 0
       meter. Tanpa ini, kapal tanpa LOA dapat pita selebar 0 px. */
    vesselsByName.set(name.toLowerCase(), vesselDimOf(v));
  }

  const slotFacilities = new Map<string, string[]>();
  for (const s of slotRows) {
    const dockId = String(s.dockId ?? "").trim();
    const vessel = String(s.vessel ?? "").trim();
    if (dockId === "" || vessel === "") continue;
    const list = slotFacilities.get(dockId) ?? [];
    list.push(vessel);
    slotFacilities.set(dockId, list);
  }

  return { docks, slotFacilities, vesselsByName };
}

/** Cocokkan nama kapal master dengan nama di slot (toleran kapital/spasi). */
export function matchVessel(name: unknown, vessels: Record<string, unknown>[]): Record<string, unknown> | null {
  const target = String(name ?? "").trim();
  if (target === "") return null;
  return vessels.find((v) => sameName(v.name, target)) ?? null;
}
