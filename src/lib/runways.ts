import type { Aircraft, Airport } from './types';
import { angleDiff, bearing, distanceNm, toRad, type LonLat } from './geo';

/** [lowEndIdent, lat, lon, highEndIdent, lat, lon, lengthFt] — from OurAirports */
export type RunwayRow = [string, number, number, string, number, number, number];

type End = { ident: string; thr: LonLat; heading: number; idx: number };

export function runwayEnds(rws: RunwayRow[]): End[] {
  const out: End[] = [];
  rws.forEach((r, idx) => {
    const lo: LonLat = [r[2], r[1]];
    const hi: LonLat = [r[5], r[4]];
    out.push({ ident: r[0], thr: lo, heading: bearing(lo, hi), idx });
    out.push({ ident: r[3], thr: hi, heading: bearing(hi, lo), idx });
  });
  return out;
}

/**
 * Which runways are in use, worked out from live traffic: aircraft low, close in and lined up with a
 * runway's extended centreline are landing on it (if descending towards the threshold) or departing.
 */
export function inferRunways(list: Aircraft[], ap: Airport, rws: RunwayRow[]) {
  const ends = runwayEnds(rws);
  const land = new Map<string, number>();
  const dep = new Map<string, number>();
  const active = new Set<number>();
  for (const a of list) {
    if (a.ground || a.alt == null || a.trk == null) continue;
    const agl = a.alt - ap.elev;
    const p: LonLat = [a.lon, a.lat];
    if (agl > 5000 || distanceNm(p, [ap.lon, ap.lat]) > 14) continue;
    let best: { e: End; xt: number } | null = null;
    for (const e of ends) {
      if (angleDiff(a.trk, e.heading) > 18) continue;
      const d = distanceNm(e.thr, p);
      const xt = Math.abs(Math.sin(toRad(bearing(e.thr, p) - e.heading)) * d);
      if (xt > 1.2) continue;
      if (!best || xt < best.xt) best = { e, xt };
    }
    if (!best) continue;
    const { e } = best;
    const beforeThreshold = angleDiff(bearing(e.thr, p), e.heading + 180) < 35;
    const vr = a.vr ?? 0;
    if (beforeThreshold && vr < -150 && agl < 4500) {
      land.set(e.ident, (land.get(e.ident) ?? 0) + 1);
      active.add(e.idx);
    } else if (!beforeThreshold && vr > 150) {
      dep.set(e.ident, (dep.get(e.ident) ?? 0) + 1);
      active.add(e.idx);
    }
  }
  const sortIdents = (m: Map<string, number>) => [...m.entries()].sort((x, y) => y[1] - x[1]).map(([k]) => k.replace(/^0(?=\d)/, ''));
  return { landing: sortIdents(land), departing: sortIdents(dep), active: [...active] };
}
