import type { NextRequest } from 'next/server';
import { cached } from '@/lib/server/cache';
import { trafficAround } from '@/lib/server/upstream';
import type { TrafficResponse } from '@/lib/types';
import { badRequest, cachedJson, errorJson } from '@/lib/server/respond';

// Radius steps and a coarse centre grid mean nearby viewers share the same upstream request.
const STEPS = [25, 50, 100, 150, 250, 400, 600, 900, 1300, 2000, 3000];

// Recent good answers, so a request that fails upstream can be served from a bigger circle that covers it.
type Recent = { lat: number; lon: number; r: number; at: number; value: TrafficResponse };
const g = globalThis as unknown as { __contrailRecent?: Recent[] };
const recent: Recent[] = (g.__contrailRecent ??= []);
const NM_PER_DEG = 60;
const dist = (aLat: number, aLon: number, bLat: number, bLon: number) => {
  const dLat = (aLat - bLat) * NM_PER_DEG;
  const dLon = ((((aLon - bLon + 540) % 360) - 180) * NM_PER_DEG) * Math.cos(((aLat + bLat) / 2) * (Math.PI / 180));
  return Math.hypot(dLat, dLon);
};
function fromCovering(lat: number, lon: number, r: number): TrafficResponse | null {
  const now = Date.now();
  const hit = recent.find((c) => now - c.at < 180_000 && dist(c.lat, c.lon, lat, lon) + r <= c.r * 1.05);
  if (!hit) return null;
  const ac = hit.value.ac.filter((row) => dist(row[5], row[6], lat, lon) <= r);
  return { ...hit.value, ac, total: ac.length };
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const lat = Number(q.get('lat'));
  const lon = Number(q.get('lon'));
  const want = Number(q.get('r') ?? 250);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || !Number.isFinite(want)) {
    return badRequest('lat, lon and r are required');
  }
  const r = STEPS.find((s) => s >= want) ?? STEPS[STEPS.length - 1];
  const grid = Math.max(0.05, r / 300);
  const qLat = Math.max(-85, Math.min(85, Math.round(lat / grid) * grid));
  const qLon = ((((Math.round(lon / grid) * grid + 180) % 360) + 360) % 360) - 180;
  const key = `traffic:${qLat.toFixed(2)}:${qLon.toFixed(2)}:${r}`;
  try {
    // wide views are expensive upstream: refresh them less often (aircraft still glide in between)
    const fresh = r > 600 ? 15000 : 7000;
    const { value, stale } = await cached(key, fresh, 180000, async () => {
      const v = await trafficAround(+qLat.toFixed(3), +qLon.toFixed(3), r);
      recent.unshift({ lat: qLat, lon: qLon, r, at: Date.now(), value: v });
      recent.length = Math.min(recent.length, 24);
      return v;
    });
    // partial (fallback) answers are only cached briefly so a full one replaces them quickly
    const ttl = stale || value.partial ? 2 : Math.round(fresh / 1000);
    return cachedJson({ ...value, served: Date.now(), ...(stale ? { stale: true } : {}) }, ttl, 20, { 'X-Contrail-Query': `${qLat.toFixed(2)},${qLon.toFixed(2)},${r}` });
  } catch (err) {
    const cover = fromCovering(qLat, qLon, r);
    if (cover) return cachedJson({ ...cover, served: Date.now(), stale: true }, 2, 10);
    return errorJson(err);
  }
}
