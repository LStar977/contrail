'use client';

// Airline reference data (OpenFlights, ODbL) plus a few brand tints for airline tiles.
export type Airline = { icao: string; iata: string; name: string; callsign: string; country: string };

let cache: Promise<Airline[]> | null = null;
let ready: Airline[] | null = null;

export function loadAirlines(): Promise<Airline[]> {
  cache ??= fetch('/data/airlines.json')
    .then((r) => r.json() as Promise<string[][]>)
    .then((rows) => (ready = rows.map(([icao, iata, name, callsign, country]) => ({ icao, iata, name, callsign, country }))));
  return cache;
}

export const airlinesReady = () => ready;

export const airlineByIcao = (list: Airline[] | null, icao: string) => list?.find((a) => a.icao === icao);
export const airlineByIata = (list: Airline[] | null, iata: string) => list?.find((a) => a.iata === iata);

const TINTS: Record<string, [string, string]> = {
  BAW: ['#22407c', '#ffffff'], VIR: ['#6f1630', '#ffffff'], AAL: ['#2a3a52', '#d8e1ee'], UAL: ['#0f2a5a', '#ffffff'],
  DAL: ['#5b1526', '#ffffff'], JBU: ['#123b7a', '#9fd0ff'], SWA: ['#203a7a', '#ffcf3f'], ASA: ['#0f3358', '#7fd1c8'],
  ACA: ['#4d1414', '#ffffff'], WJA: ['#0f4b56', '#ffffff'], DLH: ['#0e1f3f', '#f4c542'], AFR: ['#0b1f4d', '#ffffff'],
  KLM: ['#0b4f86', '#ffffff'], ICE: ['#1f5aa6', '#ffffff'], EIN: ['#12432f', '#bff0d4'], RYR: ['#0f2b5c', '#f2c53d'],
  EZY: ['#6b2a0c', '#ffb37f'], IBE: ['#6b1418', '#f6c142'], TAP: ['#0f4a33', '#ffffff'], SWR: ['#6b0f15', '#ffffff'],
  AUA: ['#6b0f15', '#ffffff'], SAS: ['#14285a', '#ffffff'], FIN: ['#163a74', '#ffffff'], THY: ['#8a1218', '#ffffff'],
  UAE: ['#7a1517', '#ffffff'], QTR: ['#4b1530', '#ffffff'], ETD: ['#5c4a2c', '#ffffff'], SIA: ['#1c2f5c', '#f1c26a'],
  CPA: ['#0f4840', '#ffffff'], QFA: ['#7a1112', '#ffffff'], ANA: ['#13306b', '#ffffff'], JAL: ['#7d0f17', '#ffffff'],
  KAL: ['#1f5f8e', '#ffffff'], AZA: ['#0d4a3a', '#ffffff'], WZZ: ['#4a1748', '#ffffff'], NKS: ['#4a4a12', '#f6e45c'],
  FDX: ['#3c1a63', '#ff9a4d'], UPS: ['#3a2716', '#f2c23d'],
};

export function airlineTile(icao: string, iata?: string): { label: string; bg: string; fg: string } {
  const [bg, fg] = TINTS[icao] ?? ['#1a2230', '#c9d1dc'];
  return { label: iata || icao.slice(0, 3) || '—', bg, fg };
}

/** "BAW179" → "BA 179" when we know the airline's IATA code. */
export function flightLabel(callsign: string, airlines: Airline[] | null, iataFlight?: string): string {
  if (iataFlight) {
    const m = iataFlight.match(/^([A-Z0-9]{2})(\d+[A-Z]?)$/);
    if (m) return `${m[1]} ${m[2]}`;
  }
  const m = callsign.match(/^([A-Z]{3})(\d+[A-Z]*)$/);
  if (m) {
    const a = airlineByIcao(airlines, m[1]);
    if (a?.iata) return `${a.iata} ${m[2]}`;
  }
  return callsign;
}
