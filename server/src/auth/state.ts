import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';

// A nonce plus its signature, checked without storing anything.
export function createState(): string {
  const nonce = randomBytes(16).toString('hex');

  return `${nonce}.${sign(nonce)}`;
}

export function isStateValid(state: unknown): boolean {
  if (typeof state !== 'string') {
    return false;
  }

  const separator = state.indexOf('.');

  if (separator === -1) {
    return false;
  }

  const offered = Buffer.from(state.slice(separator + 1));
  const expected = Buffer.from(sign(state.slice(0, separator)));

  return offered.length === expected.length && timingSafeEqual(offered, expected);
}

function sign(nonce: string): string {
  return createHmac('sha256', config.jwtSecret).update(nonce).digest('hex');
}
