import 'server-only';
import { UpstreamError } from './cache';

/** JSON response that a CDN may cache for `sMaxAge` seconds and serve stale for `swr` more. */
export function cachedJson(data: unknown, sMaxAge: number, swr: number, extra: Record<string, string> = {}) {
  return Response.json(data, {
    headers: {
      'Cache-Control': `public, max-age=0, s-maxage=${sMaxAge}, stale-while-revalidate=${swr}`,
      ...extra,
    },
  });
}

export function errorJson(err: unknown) {
  const status = err instanceof UpstreamError ? (err.status === 429 ? 503 : 502) : 500;
  const message = err instanceof Error ? err.message : 'Unexpected error';
  return Response.json(
    { error: message },
    { status, headers: { 'Cache-Control': 'no-store', ...(status === 503 ? { 'Retry-After': '10' } : {}) } },
  );
}

export function badRequest(message: string) {
  return Response.json({ error: message }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
}
