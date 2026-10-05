// Small spherical-geometry toolkit. Positions are [lon, lat] in degrees, distances in nautical miles.
export type LonLat = [number, number];

export const EARTH_NM = 3440.065;
const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

export const toRad = (d: number) => d * RAD;
export const toDeg = (r: number) => r * DEG;
export const wrap360 = (d: number) => ((d % 360) + 360) % 360;
/** Smallest angle between two bearings, 0–180°. */
export const angleDiff = (a: number, b: number) => {
  const d = Math.abs(wrap360(a) - wrap360(b)) % 360;
  return d > 180 ? 360 - d : d;
};
export const wrap180 = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;

export function distanceNm(a: LonLat, b: LonLat): number {
  const [l1, p1] = [a[0] * RAD, a[1] * RAD];
  const [l2, p2] = [b[0] * RAD, b[1] * RAD];
  const h = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin((l2 - l1) / 2) ** 2;
  return 2 * EARTH_NM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial great-circle bearing from a to b, degrees clockwise from true north. */
export function bearing(a: LonLat, b: LonLat): number {
  const [l1, p1] = [a[0] * RAD, a[1] * RAD];
  const [l2, p2] = [b[0] * RAD, b[1] * RAD];
  const y = Math.sin(l2 - l1) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(l2 - l1);
  return wrap360(Math.atan2(y, x) * DEG);
}

export function destination(p: LonLat, bearingDeg: number, distNm: number): LonLat {
  const d = distNm / EARTH_NM;
  const b = bearingDeg * RAD;
  const [l1, p1] = [p[0] * RAD, p[1] * RAD];
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
  const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return [wrap180(l2 * DEG), p2 * DEG];
}

/** Points along the great circle from a to b, longitudes unwrapped so the line never jumps across the antimeridian. */
export function greatCircle(a: LonLat, b: LonLat, maxStepNm = 40): LonLat[] {
  const total = distanceNm(a, b);
  const n = Math.max(2, Math.ceil(total / maxStepNm));
  const d = total / EARTH_NM;
  const [l1, p1] = [a[0] * RAD, a[1] * RAD];
  const [l2, p2] = [b[0] * RAD, b[1] * RAD];
  const out: LonLat[] = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    if (d < 1e-9) { out.push([a[0], a[1]]); continue; }
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(p1) * Math.cos(l1) + B * Math.cos(p2) * Math.cos(l2);
    const y = A * Math.cos(p1) * Math.sin(l1) + B * Math.cos(p2) * Math.sin(l2);
    const z = A * Math.sin(p1) + B * Math.sin(p2);
    out.push([Math.atan2(y, x) * DEG, Math.atan2(z, Math.sqrt(x * x + y * y)) * DEG]);
  }
  return unwrap(out);
}

/** Make longitudes continuous (e.g. 179 → -179 becomes 179 → 181). */
export function unwrap(path: LonLat[]): LonLat[] {
  if (!path.length) return path;
  const out: LonLat[] = [[path[0][0], path[0][1]]];
  for (let i = 1; i < path.length; i++) {
    const prev = out[i - 1][0];
    let lon = path[i][0];
    while (lon - prev > 180) lon -= 360;
    while (lon - prev < -180) lon += 360;
    out.push([lon, path[i][1]]);
  }
  return out;
}

/** Dead-reckon a position forward. */
export function advance(lon: number, lat: number, trackDeg: number, gsKt: number, seconds: number): LonLat {
  const distNm = (gsKt * seconds) / 3600;
  if (distNm <= 0) return [lon, lat];
  const t = trackDeg * RAD;
  const dLat = (distNm * Math.cos(t)) / 60;
  const cos = Math.max(0.05, Math.cos((lat + dLat / 2) * RAD));
  const dLon = (distNm * Math.sin(t)) / (60 * cos);
  return [lon + dLon, lat + dLat];
}

const POINTS16 = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
const WORDS: Record<string, string> = {
  N: 'north', NNE: 'north-northeast', NE: 'northeast', ENE: 'east-northeast', E: 'east', ESE: 'east-southeast',
  SE: 'southeast', SSE: 'south-southeast', S: 'south', SSW: 'south-southwest', SW: 'southwest', WSW: 'west-southwest',
  W: 'west', WNW: 'west-northwest', NW: 'northwest', NNW: 'north-northwest',
};
const POINTS8 = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];

export const compass16 = (deg: number) => POINTS16[Math.round(wrap360(deg) / 22.5) % 16];
export const compassWords = (deg: number) => WORDS[compass16(deg)];
export const compass8Words = (deg: number) => POINTS8[Math.round(wrap360(deg) / 45) % 8];

/** Fraction of the way from origin to destination, using along-route distances. */
export function routeProgress(origin: LonLat, dest: LonLat, pos: LonLat) {
  const flown = distanceNm(origin, pos);
  const left = distanceNm(pos, dest);
  const total = distanceNm(origin, dest);
  // A plausibility check: a position far off the great circle means the route guess is probably wrong.
  const detour = flown + left - total;
  return { flown, left, total, frac: Math.min(1, Math.max(0, flown / Math.max(1, flown + left))), plausible: detour < Math.max(150, total * 0.25) };
}

/** Circle polygon (for range rings) around a point. */
export function circle(center: LonLat, radiusNm: number, steps = 96): LonLat[] {
  const out: LonLat[] = [];
  for (let i = 0; i <= steps; i++) out.push(destination(center, (i / steps) * 360, radiusNm));
  return unwrap(out);
}

/** Move `distNm` from `from` along the great circle towards `to` (stops at `to`). */
export function moveToward(from: LonLat, to: LonLat, distNm: number): LonLat {
  const left = distanceNm(from, to);
  if (distNm >= left) return [to[0], to[1]];
  return destination(from, bearing(from, to), distNm);
}
