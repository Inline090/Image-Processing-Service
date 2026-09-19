import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';

/**
 * The value handed to a provider and returned untouched. Signing it proves the
 * callback belongs to a round trip this server started, rather than one arranged by
 * somebody else and aimed at a visitor.
 *
 * It is deliberately not stored anywhere: the signature is the memory, and it is only
 * as old as the round trip takes. That is what lets the state be checked without a
 * session, which this api does not have.
 */
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
