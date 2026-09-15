import { exp } from "../DetMath";
import { GameMapType } from "../game/Game";

// Geography-weighted oil yield. Real major oil-producing regions (lat/lon,
// general knowledge) score tiles near them higher, via a per-map affine
// pixel->lat/lon transform bootstrapped from each map's own nation-label
// coordinates (map-generator/assets/maps/<id>/info.json) paired with their
// real-world lat/lon. This is a genuine calibration from real coordinates,
// not a true GIS projection - every map's crop/projection differs slightly,
// and the affine transform ignores the sphere entirely, so treat yield as
// "geographically informed", not survey-accurate.
//
// Only maps where this actually matters are calibrated (World + the
// Middle-East/Africa-heavy regionals); everything else - abstract maps,
// small arenas, maps with no meaningful oil geography - falls back to a
// flat multiplier of 1. Extending coverage to another map is just adding a
// MAP_CALIBRATION entry with 3 more (pixel, real lat/lon) anchor pairs
// pulled from that map's own info.json.

interface Anchor {
  px: number;
  py: number;
  lat: number;
  lon: number;
}

interface OilField {
  name: string;
  lat: number;
  lon: number;
  /** Relative real-world output/reserve weight, roughly 0-1. */
  weight: number;
}

// A small hand-compiled table of real major oil fields/regions. Weights are
// a rough real-world-output ordering, not a precise statistic.
const OIL_FIELDS: OilField[] = [
  { name: "Ghawar / Persian Gulf core", lat: 25.4, lon: 49.6, weight: 1.0 },
  { name: "Rumaila (Iraq)", lat: 30.5, lon: 47.4, weight: 0.55 },
  { name: "Zakum (UAE)", lat: 24.8, lon: 53.5, weight: 0.4 },
  { name: "West Siberian Basin", lat: 61.0, lon: 76.0, weight: 0.7 },
  { name: "Permian Basin (US)", lat: 31.8, lon: -102.5, weight: 0.65 },
  { name: "Gulf of Mexico", lat: 27.0, lon: -90.0, weight: 0.4 },
  { name: "Orinoco Belt (Venezuela)", lat: 8.5, lon: -62.0, weight: 0.6 },
  { name: "Niger Delta (Nigeria)", lat: 5.0, lon: 6.0, weight: 0.45 },
  { name: "North Sea", lat: 58.0, lon: 2.0, weight: 0.35 },
  { name: "Tengiz (Kazakhstan)", lat: 46.0, lon: 53.5, weight: 0.35 },
];

// Anchors are (pixel coordinates from that map's info.json "nations" array)
// paired with that nation's approximate real lat/lon. 3 well-spread anchors
// per map, matching NationCreation.ts's use of those same raw coordinates
// as direct tile positions (no rescaling between info.json and the runtime
// "Normal"-size map).
const MAP_CALIBRATION: Partial<Record<GameMapType, [Anchor, Anchor, Anchor]>> =
  {
    [GameMapType.World]: [
      { px: 925, py: 186, lat: 51.5, lon: -0.13 }, // United Kingdom (London)
      { px: 1710, py: 290, lat: 35.7, lon: 139.7 }, // Japan (Tokyo)
      { px: 1075, py: 707, lat: -29.0, lon: 24.0 }, // South Africa (central)
    ],
    [GameMapType.MiddleEast]: [
      { px: 973, py: 296, lat: 33.3, lon: 44.4 }, // Kingdom of Iraq (Baghdad)
      { px: 1880, py: 1353, lat: 23.6, lon: 58.5 }, // Sultanate of Muscat
      { px: 100, py: 781, lat: 30.0, lon: 31.2 }, // Kingdom of Egypt (Cairo)
    ],
    [GameMapType.Mena]: [
      { px: 257, py: 82, lat: 40.4, lon: -3.7 }, // Spain (Madrid)
      { px: 1280, py: 389, lat: 26.8, lon: 30.8 }, // Egypt (central)
      { px: 2134, py: 654, lat: 21.0, lon: 57.0 }, // Oman (central)
    ],
    [GameMapType.Africa]: [
      { px: 1362, py: 290, lat: 26.8, lon: 30.8 }, // Egypt (central)
      { px: 726, py: 794, lat: 9.1, lon: 8.7 }, // Nigeria (central)
      { px: 1144, py: 1894, lat: -25.7, lon: 28.2 }, // South Africa (central)
    ],
  };

interface AffineCoefficients {
  // lat = latA*px + latB*py + latC ; lon = lonA*px + lonB*py + lonC
  latA: number;
  latB: number;
  latC: number;
  lonA: number;
  lonB: number;
  lonC: number;
}

function det3(m: readonly (readonly number[])[]): number {
  return (
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
  );
}

// Solves the 3x3 linear system M*x = b via Cramer's rule.
function solve3x3(m: readonly (readonly number[])[], b: readonly number[]): number[] {
  const d = det3(m);
  const mx = [
    [b[0], m[0][1], m[0][2]],
    [b[1], m[1][1], m[1][2]],
    [b[2], m[2][1], m[2][2]],
  ];
  const my = [
    [m[0][0], b[0], m[0][2]],
    [m[1][0], b[1], m[1][2]],
    [m[2][0], b[2], m[2][2]],
  ];
  const mz = [
    [m[0][0], m[0][1], b[0]],
    [m[1][0], m[1][1], b[1]],
    [m[2][0], m[2][1], b[2]],
  ];
  return [det3(mx) / d, det3(my) / d, det3(mz) / d];
}

function computeAffine(anchors: [Anchor, Anchor, Anchor]): AffineCoefficients {
  const m = anchors.map((a) => [a.px, a.py, 1]);
  const [latA, latB, latC] = solve3x3(
    m,
    anchors.map((a) => a.lat),
  );
  const [lonA, lonB, lonC] = solve3x3(
    m,
    anchors.map((a) => a.lon),
  );
  return { latA, latB, latC, lonA, lonB, lonC };
}

const affineCache = new Map<GameMapType, AffineCoefficients | null>();

function getAffine(mapType: GameMapType): AffineCoefficients | null {
  const cached = affineCache.get(mapType);
  if (cached !== undefined) return cached;
  const anchors = MAP_CALIBRATION[mapType];
  const computed = anchors ? computeAffine(anchors) : null;
  affineCache.set(mapType, computed);
  return computed;
}

const DECAY_DEGREES = 12;
const MAX_MULTIPLIER = 5;
const MIN_MULTIPLIER = 0.5;

function yieldMultiplierFromLatLon(lat: number, lon: number): number {
  let best = 0;
  for (const field of OIL_FIELDS) {
    const dLat = lat - field.lat;
    // Flat lat/lon Euclidean distance, no cos(lat) longitude-convergence
    // correction: every calibrated map and oil field sits well clear of the
    // poles, so the distortion is minor, and it keeps this core-sim
    // computation free of Math.cos (engine-dependent rounding - see the
    // exp() import note below).
    const dLon = lon - field.lon;
    const dist = Math.sqrt(dLat * dLat + dLon * dLon);
    // Uses DetMath's exp(), not Math.exp(): core-sim values must be
    // bit-identical across every client's JS engine (see DetMath.ts) -
    // Math.exp is only spec'd as "implementation approximated".
    const contribution = field.weight * exp(-dist / DECAY_DEGREES);
    if (contribution > best) best = contribution;
  }
  const multiplier = 1 + best * (MAX_MULTIPLIER - 1);
  return Math.min(MAX_MULTIPLIER, Math.max(MIN_MULTIPLIER, multiplier));
}

/**
 * Yield multiplier (applied to the flat base extraction rate) for a tile at
 * pixel (px, py) on the given map - already normalized back to "Normal"
 * map-size pixel space by the caller (GameMapSize.Compact halves tile
 * coordinates; this module's anchors are all in un-halved, Normal-size
 * pixel space). Returns a flat 1 for any map without a MAP_CALIBRATION
 * entry.
 */
export function oilYieldMultiplier(
  mapType: GameMapType,
  px: number,
  py: number,
): number {
  const coef = getAffine(mapType);
  if (coef === null) {
    return 1;
  }
  const lat = coef.latA * px + coef.latB * py + coef.latC;
  const lon = coef.lonA * px + coef.lonB * py + coef.lonC;
  return yieldMultiplierFromLatLon(lat, lon);
}
