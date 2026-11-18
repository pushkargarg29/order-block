import { NextRequest } from 'next/server';
import { guard, json, requestIdentity } from '@/lib/guard';
import { consumeRequestLimit } from '@/lib/ratelimit';
import {
  createMethodologySession, isMethodologyAuthConfigured, METHODOLOGY_COOKIE,
  METHODOLOGY_SESSION_SECONDS, verifyMethodologyPin
} from '@/lib/methodology-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const blocked = await guard(req, 30, 'methodology-access');
  if (blocked) return blocked;

  if (!isMethodologyAuthConfigured()) return json({ error: 'Methodology PIN access is not configured.' }, 503);

  const attempt = await consumeRequestLimit('methodology-pin-attempts', requestIdentity(req), 5, 15 * 60 * 1000);
  if (!attempt.allowed) {
    return json({ error: 'Too many attempts. Try again after the cooldown.' }, 429, {
      'Retry-After': String(Math.max(1, Math.ceil(attempt.retryAfterMs / 1000)))
    });
  }

  const body: unknown = await req.json().catch(() => null);
  const pin = body && typeof body === 'object' && 'pin' in body ? body.pin : null;
  if (typeof pin !== 'string' || !/^\d{4}$/.test(pin)) return json({ error: 'Enter the four-digit PIN.' }, 400);
  if (!verifyMethodologyPin(pin)) return json({ error: 'Incorrect PIN.' }, 401);

  const response = json({ ok: true });
  response.cookies.set(METHODOLOGY_COOKIE, createMethodologySession(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/methodology',
    maxAge: METHODOLOGY_SESSION_SECONDS
  });
  return response;
}
