import type { NextRequest } from 'next/server';
import { cached } from '@/lib/server/cache';
import { metars } from '@/lib/server/upstream';
import { badRequest, cachedJson, errorJson } from '@/lib/server/respond';

export async function GET(request: NextRequest) {
  const ids = (request.nextUrl.searchParams.get('ids') ?? '')
    .toUpperCase().split(',').map((s) => s.trim()).filter((s) => /^[A-Z0-9]{4}$/.test(s)).slice(0, 10);
  if (!ids.length) return badRequest('ids is required');
  try {
    const { value } = await cached(`metar:${ids.join(',')}`, 5 * 60_000, 60 * 60_000, () => metars(ids));
    return cachedJson({ metars: value }, 300, 600);
  } catch (err) {
    return errorJson(err);
  }
}
