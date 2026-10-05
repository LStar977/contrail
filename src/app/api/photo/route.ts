import type { NextRequest } from 'next/server';
import { cached } from '@/lib/server/cache';
import { aircraftPhoto } from '@/lib/server/upstream';
import { badRequest, cachedJson } from '@/lib/server/respond';

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const hex = (q.get('hex') ?? '').toLowerCase();
  const reg = (q.get('reg') ?? '').toUpperCase();
  if (!/^[0-9a-f]{6}$/.test(hex) || (reg && !/^[A-Z0-9-]{2,10}$/.test(reg))) return badRequest('hex is required');
  const { value } = await cached(`photo:${hex}:${reg}`, 12 * 3600_000, 24 * 3600_000, () => aircraftPhoto(hex, reg || undefined)).catch(() => ({ value: null }));
  return cachedJson({ photo: value }, 6 * 3600, 6 * 3600);
}
