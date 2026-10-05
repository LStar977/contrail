import 'server-only';
import airportsData from '../../../public/data/airports.json';
import airlinesData from '../../../public/data/airlines.json';
import { UpstreamError } from './cache';
import type { AircraftDetail, FlightRoute, FlightTrace, Metar, RouteAirport, TracePoint, TrafficResponse, TrafficRow } from '../types';

const CONTACT =
  process.env.CONTRAIL_CONTACT ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `+https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'local development build');
export const USER_AGENT = `Contrail/0.1 (personal flight tracker; ${CONTACT})`;

async function getJson<T>(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  const { timeoutMs = 12000, headers, ...rest } = init;
  const res = await fetch(url, {
    ...rest,
    cache: 'no-store',
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', ...headers },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new UpstreamError(res.status, `${new URL(url).host} responded ${res.status}`);
  return (await res.json()) as T;
}

// ---------------------------------------------------------------- adsb.lol live positions

type AdsbAircraft = {
  hex: string; flight?: string; r?: string; t?: string; category?: string;
  lat?: number; lon?: number; alt_baro?: number | 'ground'; alt_geom?: number;
  gs?: number; track?: number; true_heading?: number; calc_track?: number;
  baro_rate?: number; geom_rate?: number; squawk?: string; emergency?: string; dbFlags?: number;
  seen_pos?: number; seen?: number; wd?: number; ws?: number; oat?: number; mach?: number; tas?: number;
  nav_altitude_mcp?: number; nav_altitude_fms?: number;
};
type AdsbResponse = { ac?: AdsbAircraft[]; now?: number; total?: number; msg?: string };

const ADSB = 'https://api.adsb.lol/v2';
const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;

const isEmergency = (a: AdsbAircraft) =>
  (a.emergency != null && a.emergency !== 'none') || a.squawk === '7500' || a.squawk === '7600' || a.squawk === '7700';

function toRow(a: AdsbAircraft): TrafficRow | null {
  if (a.lat == null || a.lon == null) return null;
  const alt = a.alt_baro === 'ground' ? 'g' : typeof a.alt_baro === 'number' ? a.alt_baro : a.alt_geom ?? null;
  const trk = a.track ?? a.true_heading ?? a.calc_track ?? null;
  const vr = a.baro_rate ?? a.geom_rate ?? null;
  const flags = ((a.dbFlags ?? 0) & 1 ? 1 : 0) | (isEmergency(a) ? 2 : 0);
  return [
    a.hex, (a.flight ?? '').trim(), a.r ?? '', a.t ?? '', a.category ?? '',
    round(a.lat, 5), round(a.lon, 5), alt,
    a.gs != null ? Math.round(a.gs) : null,
    trk != null ? Math.round(trk) : null,
    vr != null ? Math.round(vr / 32) * 32 : null,
    a.squawk ?? '', flags, round(a.seen_pos ?? a.seen ?? 0, 1),
  ];
}

// After a 429 we stop asking adsb.lol for a little while instead of making things worse.
let cooldownUntil = 0;

async function adsbLolPoint(lat: number, lon: number, radiusNm: number) {
  if (Date.now() < cooldownUntil) throw new UpstreamError(429, 'adsb.lol rate limit, cooling down');
  try {
    return await getJson<AdsbResponse>(`${ADSB}/point/${lat}/${lon}/${radiusNm}`, { timeoutMs: 15000 });
  } catch (err) {
    if (err instanceof UpstreamError && err.status === 429) cooldownUntil = Date.now() + 15_000;
    throw err;
  }
}

/** adsb.fi's open data API speaks the same format, for circles up to 250 nm (1 request per second). */
const adsbFiPoint = (lat: number, lon: number, radiusNm: number) =>
  getJson<AdsbResponse>(`https://opendata.adsb.fi/api/v3/lat/${lat}/lon/${lon}/dist/${Math.min(250, radiusNm)}`, { timeoutMs: 12000 });

export async function trafficAround(lat: number, lon: number, radiusNm: number): Promise<TrafficResponse> {
  let data: AdsbResponse;
  let partial = false;
  try {
    data = await adsbLolPoint(lat, lon, radiusNm);
  } catch (err) {
    // adsb.fi tops out at 250 nm: for wider views, something near the centre beats an empty map
    try {
      data = await adsbFiPoint(lat, lon, radiusNm);
      partial = radiusNm > 250;
    } catch {
      throw err;
    }
  }
  const ac: TrafficRow[] = [];
  for (const a of data.ac ?? []) {
    const row = toRow(a);
    if (row) ac.push(row);
  }
  return { now: data.now ?? Date.now(), fetchedAt: Date.now(), total: ac.length, ac, ...(partial ? { partial: true } : {}) };
}

function toDetail(a: AdsbAircraft, now: number): AircraftDetail | null {
  const row = toRow(a);
  if (!row) return null;
  const [hex, cs, reg, type, cat, lat, lon, alt, gs, trk, vr, sq, flags, age] = row;
  return {
    hex, cs, reg, type, cat, lat, lon, gs, trk, vr, sq,
    alt: alt === 'g' ? 0 : alt, ground: alt === 'g',
    mil: (flags & 1) === 1, emergency: (flags & 2) === 2,
    t: now - age * 1000,
    wd: a.wd, ws: a.ws, oat: a.oat, mach: a.mach, tas: a.tas,
    navAlt: a.nav_altitude_fms ?? a.nav_altitude_mcp,
  };
}

export type LookupKind = 'hex' | 'callsign' | 'reg' | 'type' | 'mil' | 'sqk';

export async function lookupAircraft(kind: LookupKind, value: string): Promise<AircraftDetail[]> {
  const path = {
    hex: `/hex/${value}`,
    callsign: `/callsign/${value}`,
    reg: `/reg/${value}`,
    type: `/type/${value}`,
    mil: '/mil',
    sqk: `/sqk/${value}`,
  }[kind];
  const data = await getJson<AdsbResponse>(`${ADSB}${path}`);
  const now = data.now ?? Date.now();
  return (data.ac ?? []).map((a) => toDetail(a, now)).filter((a): a is AircraftDetail => a != null);
}

// ---------------------------------------------------------------- full-flight traces (adsb.lol / readsb)

type RawTrace = { icao: string; r?: string; t?: string; desc?: string; ownOp?: string; year?: string; timestamp: number; trace: unknown[][] };

export async function flightTrace(hex: string): Promise<FlightTrace | null> {
  const url = `https://adsb.lol/data/traces/${hex.slice(-2)}/trace_full_${hex}.json`;
  let raw: RawTrace;
  try {
    raw = await getJson<RawTrace>(url, { headers: { Referer: 'https://adsb.lol/' }, timeoutMs: 15000 });
  } catch (err) {
    if (err instanceof UpstreamError && err.status === 404) return null;
    throw err;
  }
  const pts = raw.trace ?? [];
  // readsb marks the first point of a new flight with flag bit 2; keep only the latest leg.
  let start = 0;
  for (let i = pts.length - 1; i >= 0; i--) {
    if ((Number(pts[i][6]) & 2) === 2) { start = i; break; }
  }
  const leg = pts.slice(start);
  const out: TracePoint[] = [];
  let lastAlt = 0;
  for (const p of leg) {
    const alt = p[3] === 'ground' ? -1 : typeof p[3] === 'number' ? (lastAlt = p[3] as number) : lastAlt;
    out.push([Math.round(Number(p[0])), round(Number(p[1]), 4), round(Number(p[2]), 4), alt, Math.round(Number(p[4] ?? 0))]);
  }
  const step = Math.ceil(out.length / 900);
  const pick = step > 1 ? out.filter((_, i) => i % step === 0 || i === out.length - 1) : out;
  return {
    start: raw.timestamp,
    desc: raw.desc ?? '', owner: raw.ownOp ?? '', year: raw.year ?? '', reg: raw.r ?? '', type: raw.t ?? '',
    pts: pick,
  };
}

// ---------------------------------------------------------------- routes (adsbdb, hexdb fallback)

type Ap = [string, string, string, string, string, number, number, number, number];
const AIRPORTS = new Map<string, RouteAirport>(
  (airportsData as Ap[]).map((a) => [a[0], { icao: a[0], iata: a[1], name: a[2], city: a[3], country: a[4], lat: a[5], lon: a[6] }]),
);
const AIRLINES = new Map<string, { name: string; icao: string; iata: string }>(
  (airlinesData as string[][]).map((a) => [a[0], { icao: a[0], iata: a[1], name: a[2] }]),
);

type AdsbdbAirport = { iata_code: string; icao_code: string; name: string; municipality: string; country_name: string; latitude: number; longitude: number };
type AdsbdbRoute = {
  response: string | {
    flightroute?: {
      callsign: string; callsign_iata?: string;
      airline?: { name: string; icao: string; iata: string } | null;
      origin: AdsbdbAirport; destination: AdsbdbAirport;
    };
  };
};

const fromAdsbdb = (a: AdsbdbAirport): RouteAirport => ({
  icao: a.icao_code, iata: a.iata_code ?? '', name: a.name, city: a.municipality ?? '', country: a.country_name ?? '', lat: a.latitude, lon: a.longitude,
});

export async function flightRoute(callsign: string): Promise<FlightRoute | null> {
  try {
    const data = await getJson<AdsbdbRoute>(`https://api.adsbdb.com/v0/callsign/${encodeURIComponent(callsign)}`, { timeoutMs: 8000 });
    const fr = typeof data.response === 'object' ? data.response.flightroute : undefined;
    if (fr?.origin && fr.destination) {
      return {
        callsign,
        flight: fr.callsign_iata ?? '',
        airline: fr.airline ? { name: fr.airline.name, icao: fr.airline.icao, iata: fr.airline.iata } : AIRLINES.get(callsign.slice(0, 3)) ?? null,
        origin: fromAdsbdb(fr.origin),
        destination: fromAdsbdb(fr.destination),
        source: 'adsbdb',
      };
    }
  } catch {
    // fall through to hexdb
  }
  try {
    const res = await fetch(`https://hexdb.io/callsign-route?callsign=${encodeURIComponent(callsign)}`, {
      headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(8000), cache: 'no-store',
    });
    if (!res.ok) return null;
    const text = (await res.text()).trim();
    const m = text.match(/^([A-Z0-9]{3,4})-([A-Z0-9]{3,4})$/);
    if (!m) return null;
    const origin = AIRPORTS.get(m[1]) ?? null;
    const destination = AIRPORTS.get(m[2]) ?? null;
    if (!origin || !destination) return null;
    const airline = AIRLINES.get(callsign.slice(0, 3)) ?? null;
    const num = callsign.slice(3);
    return { callsign, flight: airline?.iata && /^\d/.test(num) ? airline.iata + num : '', airline, origin, destination, source: 'hexdb' };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- METAR (aviationweather.gov)

type AwcMetar = {
  icaoId: string; name?: string; rawOb: string; obsTime: number; temp?: number; dewp?: number;
  wdir?: number | 'VRB'; wspd?: number; wgst?: number; visib?: number | string; altim?: number;
  clouds?: { cover: string; base: number | null }[]; fltCat?: string; wxString?: string;
};

export async function metars(ids: string[]): Promise<Metar[]> {
  const data = await getJson<AwcMetar[]>(`https://aviationweather.gov/api/data/metar?ids=${ids.join(',')}&format=json`);
  return data.map((m) => ({
    icao: m.icaoId,
    name: m.name ?? '',
    raw: m.rawOb,
    time: m.obsTime * 1000,
    tempC: m.temp ?? null,
    dewC: m.dewp ?? null,
    windDir: m.wdir ?? null,
    windKt: m.wspd ?? null,
    gustKt: m.wgst ?? null,
    visibility: m.visib == null ? '' : String(m.visib),
    altimeterHpa: m.altim ?? null,
    clouds: m.clouds ?? [],
    category: m.fltCat ?? '',
    wx: m.wxString ?? '',
  }));
}

// ---------------------------------------------------------------- aircraft photos (Planespotters.net)
// Their API terms allow caching the JSON for up to 24h; the image itself must be hotlinked with credit, never proxied.

type PsPhoto = { thumbnail_large?: { src: string; size: { width: number; height: number } }; thumbnail?: { src: string; size: { width: number; height: number } }; link: string; photographer: string };

export async function aircraftPhoto(hex: string, reg?: string) {
  const urls = [`https://api.planespotters.net/pub/photos/hex/${hex}`];
  if (reg) urls.push(`https://api.planespotters.net/pub/photos/reg/${encodeURIComponent(reg)}`);
  for (const url of urls) {
    try {
      const d = await getJson<{ photos?: PsPhoto[] }>(url, { timeoutMs: 8000 });
      const p = d.photos?.[0];
      const t = p?.thumbnail_large ?? p?.thumbnail;
      if (p && t) return { src: t.src, width: t.size.width, height: t.size.height, link: p.link, photographer: p.photographer };
    } catch {
      // try the next lookup
    }
  }
  return null;
}
