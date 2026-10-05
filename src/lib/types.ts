/** One aircraft as the client works with it. */
export type Aircraft = {
  hex: string;
  cs: string; // callsign, trimmed ('' when not broadcast)
  reg: string;
  type: string; // ICAO type designator, e.g. A35K
  cat: string; // ADS-B emitter category, e.g. A5
  lat: number;
  lon: number;
  alt: number | null; // barometric altitude, feet
  ground: boolean;
  gs: number | null; // ground speed, knots
  trk: number | null; // track, degrees true
  vr: number | null; // vertical rate, ft/min
  sq: string;
  mil: boolean;
  emergency: boolean;
  /** epoch ms when this position was measured */
  t: number;
};

/** Compact wire format from /api/traffic: positions in arrays to keep payloads small. */
export type TrafficRow = [
  hex: string,
  cs: string,
  reg: string,
  type: string,
  cat: string,
  lat: number,
  lon: number,
  alt: number | 'g' | null,
  gs: number | null,
  trk: number | null,
  vr: number | null,
  sq: string,
  flags: number, // 1 military, 2 emergency
  age: number, // seconds since position, one decimal
];

/** `fetchedAt`/`served` are both server-clock ms, so the client can work out how stale a cached answer is without trusting clocks. */
export type TrafficResponse = { now: number; fetchedAt: number; served?: number; total: number; ac: TrafficRow[]; stale?: boolean; partial?: boolean };

/** Extra live fields for a selected aircraft. */
export type AircraftDetail = Aircraft & {
  wd?: number; // wind direction
  ws?: number; // wind speed kt
  oat?: number; // outside air temp °C
  mach?: number;
  tas?: number;
  navAlt?: number; // selected altitude on the autopilot
};

export type Airport = {
  icao: string;
  iata: string;
  name: string;
  city: string;
  country: string;
  lat: number;
  lon: number;
  size: 1 | 2;
  elev: number;
};

export type RouteAirport = { icao: string; iata: string; name: string; city: string; country: string; lat: number; lon: number };

export type FlightRoute = {
  callsign: string;
  flight: string; // IATA-style flight number, e.g. BA179 ('' if unknown)
  airline: { name: string; icao: string; iata: string } | null;
  origin: RouteAirport | null;
  destination: RouteAirport | null;
  source: 'adsbdb' | 'hexdb';
};

/** Trace points: [secondsSinceStart, lat, lon, altFt (-1 = ground), gs] */
export type TracePoint = [number, number, number, number, number];
export type FlightTrace = { start: number; desc: string; owner: string; year: string; reg: string; type: string; pts: TracePoint[] };

export type Metar = {
  icao: string;
  name: string;
  raw: string;
  time: number; // epoch ms
  tempC: number | null;
  dewC: number | null;
  windDir: number | 'VRB' | null;
  windKt: number | null;
  gustKt: number | null;
  visibility: string;
  altimeterHpa: number | null;
  clouds: { cover: string; base: number | null }[];
  category: string; // VFR, MVFR, IFR, LIFR
  wx: string;
};

/** `measuredBase` is the client-clock time the upstream snapshot was taken. */
export function rowToAircraft(r: TrafficRow, measuredBase: number): Aircraft {
  const [hex, cs, reg, type, cat, lat, lon, alt, gs, trk, vr, sq, flags, age] = r;
  return {
    hex, cs, reg, type, cat, lat, lon,
    alt: alt === 'g' ? 0 : alt,
    ground: alt === 'g',
    gs, trk, vr, sq,
    mil: (flags & 1) === 1,
    emergency: (flags & 2) === 2,
    t: measuredBase - age * 1000,
  };
}
