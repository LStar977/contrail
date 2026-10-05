'use client';

import type { Airport } from './types';
import { distanceNm, type LonLat } from './geo';

type Row = [string, string, string, string, string, number, number, 1 | 2, number];

let cache: Promise<Airport[]> | null = null;
let ready: Airport[] | null = null;

/** Lazily loads /data/airports.json (OurAirports, public domain). */
export function loadAirports(): Promise<Airport[]> {
  cache ??= fetch('/data/airports.json')
    .then((r) => r.json() as Promise<Row[]>)
    .then((rows) => (ready = rows.map(([icao, iata, name, city, country, lat, lon, size, elev]) => ({ icao, iata, name, city, country, lat, lon, size, elev }))));
  return cache;
}

export const airportsReady = () => ready;

export function findAirport(list: Airport[], code: string): Airport | undefined {
  const c = code.toUpperCase();
  return list.find((a) => a.iata === c) ?? list.find((a) => a.icao === c);
}

/** Nearest airport (large ones preferred unless a medium one is much closer). */
export function nearestAirport(list: Airport[], p: LonLat, opts: { largeOnly?: boolean } = {}): { airport: Airport; dist: number } | null {
  let best: Airport | null = null;
  let bestD = Infinity;
  for (const a of list) {
    if (opts.largeOnly && a.size !== 2) continue;
    // cheap pre-filter on latitude before the haversine
    if (Math.abs(a.lat - p[1]) * 60 > bestD) continue;
    const d = distanceNm(p, [a.lon, a.lat]);
    const score = a.size === 2 ? d : d * 1.35;
    if (score < bestD) { bestD = score; best = a; }
  }
  return best ? { airport: best, dist: distanceNm(p, [best.lon, best.lat]) } : null;
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export function searchAirports(list: Airport[], query: string, limit = 6): Airport[] {
  const q = norm(query.trim());
  if (q.length < 2) return [];
  const scored: { a: Airport; s: number }[] = [];
  for (const a of list) {
    let s = 0;
    if (a.iata.toLowerCase() === q) s = 100;
    else if (a.icao.toLowerCase() === q) s = 95;
    else if (q.length >= 3 && norm(a.city).startsWith(q)) s = 60;
    else if (q.length >= 3 && norm(a.name).includes(q)) s = 40;
    else if (q.length >= 4 && norm(a.city).includes(q)) s = 30;
    if (s) scored.push({ a, s: s + a.size * 5 });
  }
  return scored.sort((x, y) => y.s - x.s).slice(0, limit).map((x) => x.a);
}
