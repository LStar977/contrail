import type { Aircraft, FlightRoute, FlightTrace } from './types';
import { angleDiff, bearing, distanceNm, routeProgress, type LonLat } from './geo';

export type FlightModel = {
  progress: ReturnType<typeof routeProgress> | null;
  /** epoch ms, estimated landing */
  eta: number | null;
  /** epoch ms of takeoff (from the trace), or null when we only saw the flight already airborne */
  takeoff: number | null;
  firstSeen: number | null;
  /** altitude over time: [epochMs, feet] */
  flownProfile: [number, number][];
  predictedProfile: [number, number][];
  phase: 'ground' | 'climb' | 'cruise' | 'descent';
  /** position is an estimate because the aircraft left receiver coverage */
  estimated: boolean;
};

const APPROACH_MIN = 14;

/**
 * Callsign → route databases go stale. When the trace starts on the ground (we saw the takeoff),
 * it has to start at the published origin, otherwise the route belongs to some other flight.
 */
export function routeMatchesTrace(route: FlightRoute | null | undefined, trace: FlightTrace | null | undefined): boolean {
  if (!route?.origin || !trace?.pts.length) return true;
  const first = trace.pts[0];
  if (first[3] > 3000) return true; // first seen already airborne: can't tell
  return distanceNm([first[2], first[1]], [route.origin.lon, route.origin.lat]) < 40;
}

/**
 * Callsign databases often hold some other leg of the flight number. Away from both airports an aircraft
 * flies roughly toward its destination, so a track pointing well away from it means the route is wrong.
 */
export function routeFitsTrack(route: FlightRoute | null | undefined, ac: Aircraft | null | undefined): boolean {
  if (!route?.origin || !route.destination || !ac || ac.ground || ac.trk == null || (ac.gs ?? 0) < 120) return true;
  const pos: LonLat = [ac.lon, ac.lat];
  const dest: LonLat = [route.destination.lon, route.destination.lat];
  // climbing out, or being vectored in for landing: any heading is fine
  if (distanceNm(pos, dest) < 150 || distanceNm(pos, [route.origin.lon, route.origin.lat]) < 80) return true;
  return angleDiff(ac.trk, bearing(pos, dest)) < 100;
}

export function modelFlight(ac: Aircraft, route: FlightRoute | null, trace: FlightTrace | null, now: number): FlightModel {
  const pos: LonLat = [ac.lon, ac.lat];
  const vr = ac.vr ?? 0;
  const phase: FlightModel['phase'] = ac.ground ? 'ground' : vr > 400 ? 'climb' : vr < -400 ? 'descent' : 'cruise';

  let progress: FlightModel['progress'] = null;
  let eta: number | null = null;
  if (route?.origin && route.destination) {
    progress = routeProgress([route.origin.lon, route.origin.lat], [route.destination.lon, route.destination.lat], pos);
    if (!routeMatchesTrace(route, trace) || !routeFitsTrack(route, ac)) progress = { ...progress, plausible: false };
    if (progress.plausible && !ac.ground) {
      const gs = Math.max(ac.gs ?? 420, 160);
      const approach = progress.left > 120 ? APPROACH_MIN : (progress.left / 120) * APPROACH_MIN;
      eta = now + ((progress.left / gs) * 60 + approach) * 60_000;
    }
  }

  const flownProfile: [number, number][] = [];
  let takeoff: number | null = null;
  let firstSeen: number | null = null;
  if (trace?.pts.length) {
    let wasGround = trace.pts[0][3] < 0;
    firstSeen = (trace.start + trace.pts[0][0]) * 1000;
    for (const p of trace.pts) {
      const t = (trace.start + p[0]) * 1000;
      const alt = p[3] < 0 ? 0 : p[3];
      if (wasGround && p[3] >= 0 && alt > 0 && takeoff == null) takeoff = t;
      if (p[3] < 0) wasGround = true;
      flownProfile.push([t, alt]);
    }
    if (!ac.ground && ac.alt != null) flownProfile.push([now, ac.alt]);
  }

  const predictedProfile: [number, number][] = [];
  if (eta && ac.alt != null && !ac.ground) {
    const descentMin = Math.min(34, Math.max(10, ac.alt / 1300));
    const topOfDescent = eta - descentMin * 60_000;
    predictedProfile.push([now, ac.alt]);
    if (phase !== 'descent' && topOfDescent > now) predictedProfile.push([topOfDescent, ac.alt]);
    predictedProfile.push([eta, 0]);
  }

  return { progress, eta, takeoff, firstSeen, flownProfile, predictedProfile, phase, estimated: now - ac.t > 90_000 };
}
