'use client';

import useSWR from 'swr';
import type { AircraftDetail, FlightRoute, FlightTrace, Metar, TrafficResponse } from './types';

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    let msg = `${res.status}`;
    try { msg = ((await res.json()) as { error?: string }).error ?? msg; } catch {}
    throw new HttpError(res.status, msg);
  }
  return (await res.json()) as T;
}

/**
 * Traffic for a circle. Returns the payload plus `measuredBase`: the client-clock moment the upstream snapshot
 * was taken, after subtracting time spent in our cache and the CDN, so dead reckoning starts from the right place.
 */
export async function fetchTraffic(lat: number, lon: number, r: number, signal?: AbortSignal) {
  const res = await fetch(`/api/traffic?lat=${lat.toFixed(3)}&lon=${lon.toFixed(3)}&r=${Math.round(r)}`, { signal });
  if (!res.ok) {
    let msg = `${res.status}`;
    try { msg = ((await res.json()) as { error?: string }).error ?? msg; } catch {}
    throw new HttpError(res.status, msg);
  }
  const data = (await res.json()) as TrafficResponse;
  const cdnAge = Number(res.headers.get('age') ?? 0) * 1000;
  const inCache = Math.max(0, (data.served ?? data.fetchedAt) - data.fetchedAt);
  return { data, measuredBase: Date.now() - cdnAge - inCache };
}

export const fetchAircraft = (q: string) => getJson<{ ac: AircraftDetail[] }>(`/api/aircraft?${q}`).then((d) => d.ac);

const swrOpts = { revalidateOnFocus: false, shouldRetryOnError: false } as const;

export function useAircraftDetail(hex: string | null) {
  return useSWR(hex ? `/api/aircraft?hex=${hex}` : null, (u: string) => getJson<{ ac: AircraftDetail[] }>(u).then((d) => d.ac[0] ?? null), {
    ...swrOpts, refreshInterval: 5000, dedupingInterval: 4000,
  });
}

export function useRoute(callsign: string | null | undefined) {
  return useSWR(callsign ? `/api/route?callsign=${callsign}` : null, (u: string) => getJson<{ route: FlightRoute | null }>(u).then((d) => d.route), {
    ...swrOpts, dedupingInterval: 600_000,
  });
}

export function useRoutes(callsigns: string[]) {
  // callers pass callsigns in priority order: trim first, then sort so the cache key is stable
  const key = callsigns.length ? `/api/route?callsigns=${[...new Set(callsigns)].slice(0, 40).sort().join(',')}` : null;
  return useSWR(key, (u: string) => getJson<{ routes: Record<string, FlightRoute | null> }>(u).then((d) => d.routes), {
    ...swrOpts, dedupingInterval: 120_000, keepPreviousData: true,
  });
}

export function useTrace(hex: string | null) {
  return useSWR(hex ? `/api/trace?hex=${hex}` : null, (u: string) => getJson<{ trace: FlightTrace | null }>(u).then((d) => d.trace), {
    ...swrOpts, refreshInterval: 45_000, dedupingInterval: 20_000, keepPreviousData: false,
  });
}

export function useMetar(icao: string | null | undefined) {
  return useSWR(icao ? `/api/metar?ids=${icao}` : null, (u: string) => getJson<{ metars: Metar[] }>(u).then((d) => d.metars[0] ?? null), {
    ...swrOpts, refreshInterval: 300_000,
  });
}

// ---------------------------------------------------------------- browser-direct, CORS-enabled sources

export type Photo = { src: string; width: number; height: number; link: string; photographer: string };

/** Aircraft photo from Planespotters.net (metadata via our cache; the image is loaded straight from their CDN with credit). */
export function usePhoto(hex: string | null, reg?: string) {
  return useSWR(hex ? `/api/photo?hex=${hex}${reg ? `&reg=${encodeURIComponent(reg)}` : ''}` : null,
    (u: string) => getJson<{ photo: Photo | null }>(u).then((d) => d.photo), { ...swrOpts, dedupingInterval: 3600_000 });
}

export type Weather = {
  timezone: string;
  tempC: number;
  code: number;
  windKt: number;
  windDir: number;
  isDay: boolean;
  t250: number | null; // °C at 250 hPa (~34,000 ft)
  rh250: number | null; // % relative humidity at 250 hPa
};

/** Current weather + IANA timezone for a point (Open-Meteo, no key, CC BY 4.0). */
export function useWeather(lat: number | null | undefined, lon: number | null | undefined, opts: { upper?: boolean } = {}) {
  const key = lat != null && lon != null ? `meteo:${lat.toFixed(2)},${lon.toFixed(2)}:${opts.upper ? 1 : 0}` : null;
  return useSWR(key, async () => {
    const upper = opts.upper ? '&hourly=temperature_250hPa,relative_humidity_250hPa&forecast_hours=1' : '';
    const d = await getJson<{
      timezone: string;
      current: { temperature_2m: number; weather_code: number; wind_speed_10m: number; wind_direction_10m: number; is_day: number };
      hourly?: { temperature_250hPa?: number[]; relative_humidity_250hPa?: number[] };
    }>(`https://api.open-meteo.com/v1/forecast?latitude=${lat!.toFixed(3)}&longitude=${lon!.toFixed(3)}&current=temperature_2m,weather_code,wind_speed_10m,wind_direction_10m,is_day&wind_speed_unit=kn&timezone=auto${upper}`);
    return {
      timezone: d.timezone,
      tempC: d.current.temperature_2m,
      code: d.current.weather_code,
      windKt: d.current.wind_speed_10m,
      windDir: d.current.wind_direction_10m,
      isDay: d.current.is_day === 1,
      t250: d.hourly?.temperature_250hPa?.[0] ?? null,
      rh250: d.hourly?.relative_humidity_250hPa?.[0] ?? null,
    } satisfies Weather;
  }, { ...swrOpts, dedupingInterval: 600_000, refreshInterval: 900_000 });
}

export function weatherWords(code: number): string {
  if (code === 0) return 'Clear';
  if (code <= 2) return 'Partly cloudy';
  if (code === 3) return 'Overcast';
  if (code <= 48) return 'Fog';
  if (code <= 57) return 'Drizzle';
  if (code <= 67) return 'Rain';
  if (code <= 77) return 'Snow';
  if (code <= 82) return 'Showers';
  if (code <= 86) return 'Snow showers';
  return 'Thunderstorms';
}
