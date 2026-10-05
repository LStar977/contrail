import 'server-only';
import data from '../../../public/data/airports.json';
import runwayData from '../../data/runways.json';
import type { Airport } from '../types';
import type { RunwayRow } from '../runways';

type Row = [string, string, string, string, string, number, number, 1 | 2, number];

const AIRPORTS: Airport[] = (data as Row[]).map(([icao, iata, name, city, country, lat, lon, size, elev]) => ({ icao, iata, name, city, country, lat, lon, size, elev }));

export function findAirport(code: string): Airport | undefined {
  const c = code.toUpperCase();
  return AIRPORTS.find((a) => a.iata === c) ?? AIRPORTS.find((a) => a.icao === c);
}

export function runwaysFor(icao: string): RunwayRow[] {
  return (((runwayData as unknown) as Record<string, RunwayRow[]>)[icao] ?? []).filter((r) => r[6] >= 2500);
}
