import type { Aircraft, Airport, FlightRoute } from './types';
import { bearing, compassWords, distanceNm, wrap360, type LonLat } from './geo';
import { nearestAirport } from './airports';
import { subsolar, sunElevation } from './sun';

// Rough bounding boxes for naming open water. Checked in order (small seas first) and only used when the
// aircraft is far from any airport, which is a decent proxy for "over the sea".
const WATERS: [string, number, number, number, number][] = [
  ['Gulf of Mexico', -98, 18, -80, 30.5], ['Caribbean Sea', -88, 9, -59, 21.5], ['Labrador Sea', -64, 53, -44, 66],
  ['Hudson Bay', -95, 51, -76, 66], ['North Sea', -4, 51, 9, 61], ['Norwegian Sea', -10, 62, 15, 72],
  ['Bay of Biscay', -10, 43, -1.5, 48], ['Mediterranean Sea', -6, 30, 36, 46], ['Black Sea', 27, 40.5, 42, 47],
  ['Baltic Sea', 10, 53, 30, 66], ['Red Sea', 32, 12, 44, 30], ['Persian Gulf', 47, 23, 57, 31],
  ['Arabian Sea', 50, 5, 75, 25], ['Bay of Bengal', 80, 5, 95, 22], ['South China Sea', 105, 0, 121, 23],
  ['Philippine Sea', 121, 5, 140, 30], ['Sea of Japan', 128, 33, 142, 52], ['Tasman Sea', 148, -48, 175, -28],
  ['Coral Sea', 142, -28, 165, -10], ['Gulf of Alaska', -160, 50, -130, 61], ['Bering Sea', 160, 52, 200, 66],
  ['North Atlantic', -80, 0, -6, 66], ['South Atlantic', -60, -60, 20, 0], ['Indian Ocean', 20, -60, 120, 25],
  ['North Pacific', 120, 0, 260, 66], ['South Pacific', 140, -60, 290, 0],
];

function waterAt(lon: number, lat: number): string | null {
  if (lat > 75) return 'Arctic Ocean';
  if (lat < -60) return 'Southern Ocean';
  for (const [name, w, s, e, n] of WATERS) {
    const L = lon < w ? lon + 360 : lon; // boxes may extend past 180
    if (lat >= s && lat <= n && L >= w && L <= e) return name;
  }
  return null;
}

const place = (a: Airport) => a.city || a.name.replace(/ (International )?Airport$/, '');

export function describeFlight(ac: Aircraft, route: FlightRoute | null, airports: Airport[] | null, now = new Date()): string {
  const pos: LonLat = [ac.lon, ac.lat];
  const dest = route?.destination;
  const origin = route?.origin;
  const dDest = dest ? distanceNm(pos, [dest.lon, dest.lat]) : Infinity;
  const dOrig = origin ? distanceNm(pos, [origin.lon, origin.lat]) : Infinity;
  const vr = ac.vr ?? 0;
  const alt = ac.alt ?? 0;

  if (ac.ground) {
    const at = dDest < 5 ? dest : dOrig < 5 ? origin : null;
    const name = at ? `${at.city || at.name} (${at.iata || at.icao})` : 'the airport';
    if (at === dest && dest) return `Landed at ${name}${(ac.gs ?? 0) > 5 ? ', taxiing to the gate' : ''}.`;
    return (ac.gs ?? 0) > 5 ? `Taxiing at ${name}.` : `On the ground at ${name}.`;
  }
  if (dest && dDest < 45 && alt < 12000 && vr < -200) {
    return `On approach to ${dest.city || dest.name} (${dest.iata || dest.icao}), ${Math.max(1, Math.round(dDest))} nm out.`;
  }
  if (origin && dOrig < 60 && alt < 18000 && vr > 300) {
    return `Climbing out of ${origin.city || origin.name}, through ${(Math.round(alt / 100) * 100).toLocaleString('en-US')} ft.`;
  }

  // Sun: is the aircraft racing the terminator?
  const sub = subsolar(now);
  const elev = sunElevation(ac.lon, ac.lat, now, sub);
  const hourAngle = ((((ac.lon - sub[0]) % 360) + 540) % 360) - 180; // >0 afternoon, <0 morning
  const trk = ac.trk != null ? wrap360(ac.trk) : null;
  const westbound = trk != null && trk > 200 && trk < 340;
  const eastbound = trk != null && trk > 20 && trk < 160;
  let lead = vr > 500 ? 'Climbing' : vr < -500 ? 'Descending' : 'Cruising';
  if (elev > -2 && elev < 5 && !ac.ground && alt > 15000) {
    if (hourAngle > 0 && westbound) lead = 'Chasing the sunset';
    else if (hourAngle > 0 && eastbound) lead = 'Flying into the night';
    else if (hourAngle < 0 && eastbound) lead = 'Flying into the sunrise';
    else if (hourAngle < 0 && westbound) lead = 'Leaving the sunrise behind';
  }

  if (!airports?.length) return `${lead}.`;
  const near = nearestAirport(airports, pos);
  if (!near) return `${lead}.`;
  const { airport, dist } = near;
  if (dist < 20) return `${lead} over ${place(airport)}.`;
  const dir = compassWords(bearing([airport.lon, airport.lat], pos));
  const water = dist > 110 ? waterAt(ac.lon, ac.lat) : null;
  const where = `${Math.round(dist / 5) * 5} nm ${dir} of ${place(airport)}`;
  return water ? `${lead} over the ${water}, ${where}.` : `${lead}, ${where}.`;
}
