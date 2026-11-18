import { timingSafeEqual } from 'node:crypto';

export function verifyBearerSecret(authorization: string | null, secret: string): boolean {
  if (!authorization?.startsWith('Bearer ')) return false;
  const provided = Buffer.from(authorization.slice(7));
  const expected = Buffer.from(secret);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}
