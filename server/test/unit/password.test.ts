import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { hashPassword, verifyPassword } from '../../src/utils/password.js';

describe('password hashing', () => {
  it('accepts the correct password', async () => {
    const hash = await hashPassword('hunter2hunter2');

    assert.equal(await verifyPassword('hunter2hunter2', hash), true);
  });

  it('rejects the wrong password', async () => {
    const hash = await hashPassword('hunter2hunter2');

    assert.equal(await verifyPassword('hunter2hunter3', hash), false);
  });

  it('salts every hash, so the same password produces different output', async () => {
    const first = await hashPassword('hunter2hunter2');
    const second = await hashPassword('hunter2hunter2');

    assert.notEqual(first, second);
  });

  it('never stores the plaintext', async () => {
    const hash = await hashPassword('hunter2hunter2');

    assert.equal(hash.includes('hunter2hunter2'), false);
  });
});
