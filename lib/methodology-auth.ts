import { createHmac, timingSafeEqual } from 'node:crypto';

export const METHODOLOGY_COOKIE = 'stoclio_methodology_access';
export const METHODOLOGY_SESSION_SECONDS = 12 * 60 * 60;

const sessionKey = () => {
  const secret = process.env.CRON_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) return null;
  return createHmac('sha256', secret).update('stoclio:methodology-session:v1').digest();
};

export function isMethodologyAuthConfigured(): boolean {
  return /^\d{4}$/.test(process.env.METHODOLOGY_PIN ?? '') && sessionKey() != null;
}

export function verifyMethodologyPin(pin: string): boolean {
  const expected = process.env.METHODOLOGY_PIN;
  if (!expected || !/^\d{4}$/.test(expected) || !/^\d{4}$/.test(pin)) return false;
  const providedBytes = Buffer.from(pin);
  const expectedBytes = Buffer.from(expected);
  return timingSafeEqual(providedBytes, expectedBytes);
}

export function createMethodologySession(now = Date.now()): string {
  const key = sessionKey();
  if (!key) throw new Error('Methodology session signing is not configured.');
  const expires = now + METHODOLOGY_SESSION_SECONDS * 1000;
  const payload = `v1.${expires}`;
  const signature = createHmac('sha256', key).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function verifyMethodologySession(token: string | undefined, now = Date.now()): boolean {
  const key = sessionKey();
  if (!key || !token) return false;
  const [version, expiresText, signature, ...rest] = token.split('.');
  if (version !== 'v1' || !expiresText || !signature || !/^[A-Za-z0-9_-]{43}$/.test(signature) || rest.length) return false;
  const expires = Number(expiresText);
  if (!Number.isSafeInteger(expires) || expires <= now || expires > now + METHODOLOGY_SESSION_SECONDS * 1000) return false;
  const expected = createHmac('sha256', key).update(`${version}.${expiresText}`).digest();
  const provided = Buffer.from(signature, 'base64url');
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}
