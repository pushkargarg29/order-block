import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { UpstoxError } from './upstox';
import { BudgetError, consumeRequestLimit, RateLimitUnavailable } from './ratelimit';
export { verifyBearerSecret } from './cron-auth';

/** Shared per-IP request limiting plus same-origin enforcement. */
export function requestIdentity(req: NextRequest): string {
  const vercelForwarded = req.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim();
  if (vercelForwarded) return vercelForwarded;
  const realIp = req.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'anon';
}

export async function guard(req: NextRequest, LIMIT = 120, scope = 'api'): Promise<NextResponse | null> {
  const site = req.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none') return json({ error: 'Forbidden' }, 403);
  const origin = req.headers.get('origin');
  if (origin) {
    try { if (new URL(origin).host !== req.headers.get('host')) return json({ error: 'Forbidden' }, 403); }
    catch { return json({ error: 'Forbidden' }, 403); }
  }
  const ip = requestIdentity(req);
  try {
    const result = await consumeRequestLimit(scope, ip, LIMIT);
    if (!result.allowed) return json({ error: 'Too many requests' }, 429, { 'Retry-After': String(Math.max(1, Math.ceil(result.retryAfterMs / 1000))) });
  } catch (error) {
    console.error('[stoclio] shared request limiter failed', error);
    return json({ error: 'Request protection is temporarily unavailable' }, 503, { 'Retry-After': '30' });
  }
  return null;
}

export function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers } });
}

/**
 * Public, shared response cached at the edge for every visitor.
 * fresh = seconds served without touching the server; stale = seconds a stale copy is served instantly
 * while the server refreshes it in the background (stale-while-revalidate).
 */
export function cachedJson(data: unknown, fresh: number, stale: number) {
  const v = `public, max-age=0, s-maxage=${fresh}, stale-while-revalidate=${stale}`;
  return NextResponse.json(data, { status: 200, headers: { 'Cache-Control': v, 'CDN-Cache-Control': v, 'X-Content-Type-Options': 'nosniff' } });
}

export const SYMBOL_RE = /^[A-Z0-9&\-]{1,20}$/;

/** Map any server error to a safe, brand-neutral message. Internal details are logged, never sent to the browser. */
export function errorResponse(e: unknown, fallback = 'Live market data is temporarily unavailable. Please retry shortly.') {
  if (e instanceof UpstoxError) return json({ error: e.message }, e.status);
  if (e instanceof BudgetError) return json({ error: e.message }, 503, { 'Retry-After': String(Math.max(1, Math.ceil(e.retryAfterMs / 1000))) });
  if (e instanceof RateLimitUnavailable) {
    console.error('[stoclio] shared rate limiter unavailable');
    return json({ error: e.message }, 503, { 'Retry-After': '30' });
  }
  console.error('[stoclio]', e);
  return json({ error: fallback }, 502);
}
