import { timingSafeEqual } from 'node:crypto';

export function isMethodologyAuthConfigured(): boolean {
  return /^\d{4}$/.test(process.env.METHODOLOGY_PIN ?? '');
}

export function verifyMethodologyPin(pin: string): boolean {
  const expected = process.env.METHODOLOGY_PIN;
  if (!expected || !/^\d{4}$/.test(expected) || !/^\d{4}$/.test(pin)) return false;
  const providedBytes = Buffer.from(pin);
  const expectedBytes = Buffer.from(expected);
  return timingSafeEqual(providedBytes, expectedBytes);
}
