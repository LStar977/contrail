import type { NextRequest } from 'next/server';
import { cached } from '@/lib/server/cache';
import { flightTrace } from '@/lib/server/upstream';
import { badRequest, cachedJson, errorJson } from '@/lib/server/respond';

export async function GET(request: NextRequest) {
  const hex = (request.nextUrl.searchParams.get('hex') ?? '').toLowerCase();
  if (!/^[0-9a-f]{6}$/.test(hex)) return badRequest('hex is required');
  try {
    const { value } = await cached(`trace:${hex}`, 20000, 300000, () => flightTrace(hex));
    return cachedJson({ trace: value }, 20, 60);
  } catch (err) {
    return errorJson(err);
  }
}
