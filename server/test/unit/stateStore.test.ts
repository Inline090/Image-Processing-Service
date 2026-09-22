import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Request } from 'express';
import { statelessState } from '../../src/auth/passport.js';
import { createState } from '../../src/auth/state.js';

const request = {} as unknown as Request;
const meta = {
  authorizationURL: 'https://provider.test/authorize',
  tokenURL: 'https://provider.test/token',
  clientID: 'client-id',
};

function verifyWith(state: string, arity: 3 | 4): boolean {
  let ok = false;

  if (arity === 3) {
    statelessState.verify(request, state, (_err, result) => {
      ok = result;
    });
  } else {
    statelessState.verify(request, state, meta, (_err, result) => {
      ok = result;
    });
  }

  return ok;
}

describe('sign-in state store', () => {
  it('keeps the parameter counts the library dispatches on', () => {
    assert.equal(statelessState.store.length, 3);
    assert.equal(statelessState.verify.length, 4);
  });

  it('stores nothing, and reports no error', () => {
    let errored = false;

    statelessState.store(request, (_err, state) => {
      errored = _err !== null;
      assert.equal(state, undefined);
    });

    assert.equal(errored, false);
  });

  it('accepts the state it issued', () => {
    assert.equal(verifyWith(createState(), 3), true);
    assert.equal(verifyWith(createState(), 4), true);
  });

  it('rejects a state it never issued, with either callback position', () => {
    assert.equal(verifyWith('made-up', 3), false);
    assert.equal(verifyWith('made-up', 4), false);
    assert.equal(verifyWith('', 4), false);
  });
});
