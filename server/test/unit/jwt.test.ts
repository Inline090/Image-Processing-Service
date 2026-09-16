import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import jwt from 'jsonwebtoken';
import { config } from '../../src/config.js';
import { signToken, verifyToken } from '../../src/utils/jwt.js';

const PAYLOAD = { sub: 'user-1', email: 'someone@example.com' };

describe('jwt', () => {
  it('round-trips a payload', () => {
    const payload = verifyToken(signToken(PAYLOAD));

    assert.equal(payload.sub, PAYLOAD.sub);
    assert.equal(payload.email, PAYLOAD.email);
  });

  it('rejects a tampered token', () => {
    const token = signToken(PAYLOAD);
    const tampered = `${token.slice(0, -3)}abc`;

    assert.throws(() => verifyToken(tampered));
  });

  it('rejects a token signed with a different secret', () => {
    const foreign = jwt.sign(PAYLOAD, 'not-our-secret');

    assert.throws(() => verifyToken(foreign));
  });

  it('rejects an expired token', () => {
    const expired = jwt.sign(PAYLOAD, config.jwtSecret, { expiresIn: -1 });

    assert.throws(() => verifyToken(expired));
  });
});
