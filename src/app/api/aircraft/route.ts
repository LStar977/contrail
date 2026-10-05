import type { NextRequest } from 'next/server';
import { cached } from '@/lib/server/cache';
import { lookupAircraft, type LookupKind } from '@/lib/server/upstream';
import { badRequest, cachedJson, errorJson } from '@/lib/server/respond';

// /api/aircraft?hex=abc123,def456 | ?callsign=BAW179 | ?reg=G-XWBG | ?type=A388 | ?mil=1 | ?sqk=7700
const PATTERNS: Record<LookupKind, RegExp> = {
  hex: /^[0-9a-f]{6}(,[0-9a-f]{6}){0,29}$/,
  callsign: /^[A-Z0-9]{2,8}$/,
  reg: /^[A-Z0-9-]{2,10}$/,
  type: /^[A-Z0-9]{2,4}$/,
  mil: /^1$/,
  sqk: /^[0-7]{4}$/,
};

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const kind = (Object.keys(PATTERNS) as LookupKind[]).find((k) => q.has(k));
  if (!kind) return badRequest('one of hex, callsign, reg, type, mil, sqk is required');
  const raw = (q.get(kind) ?? '').trim();
  const value = kind === 'hex' ? raw.toLowerCase() : raw.toUpperCase();
  if (!PATTERNS[kind].test(value)) return badRequest(`invalid ${kind}`);
  const fresh = kind === 'type' || kind === 'mil' ? 20000 : 5000;
  try {
    const { value: ac } = await cached(`ac:${kind}:${value}`, fresh, 60000, () => lookupAircraft(kind, value));
    return cachedJson({ ac }, Math.round(fresh / 1000), 20);
  } catch (err) {
    return errorJson(err);
  }
}
