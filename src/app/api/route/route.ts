import type { NextRequest } from 'next/server';
import { cached, mapLimit } from '@/lib/server/cache';
import { flightRoute } from '@/lib/server/upstream';
import { badRequest, cachedJson } from '@/lib/server/respond';
import type { FlightRoute } from '@/lib/types';

const CALLSIGN = /^[A-Z0-9]{3,8}$/;

// Routes rarely change: re-check every 30 minutes, and keep serving the last answer for 6 hours if lookups fail.
async function routeFor(cs: string): Promise<FlightRoute | null> {
  const { value } = await cached(`route:${cs}`, 30 * 60_000, 6 * 3600_000, () => flightRoute(cs));
  return value;
}

// /api/route?callsign=BAW179         → { route }
// /api/route?callsigns=BAW179,ICE615 → { routes: { BAW179: route | null, … } }  (max 40)
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const one = q.get('callsign');
  if (one) {
    const cs = one.trim().toUpperCase();
    if (!CALLSIGN.test(cs)) return badRequest('invalid callsign');
    const route = await routeFor(cs).catch(() => null);
    return cachedJson({ route }, route ? 1800 : 300, 3600);
  }
  const many = (q.get('callsigns') ?? '').toUpperCase().split(',').map((s) => s.trim()).filter((s) => CALLSIGN.test(s));
  if (!many.length) return badRequest('callsign or callsigns is required');
  const list = [...new Set(many)].slice(0, 40);
  const results = await mapLimit(list, 4, async (cs) => [cs, await routeFor(cs).catch(() => null)] as const);
  return cachedJson({ routes: Object.fromEntries(results) }, 600, 3600);
}
