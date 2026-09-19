import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createState, isStateValid } from '../../src/auth/state.js';

// The state is what stops a callback being handed to us by somebody else, so it has to
// survive a round trip and nothing else.
describe('sign-in state', () => {
  it('accepts the value it just handed out', () => {
    assert.equal(isStateValid(createState()), true);
  });

  it('hands out a different value every time', () => {
    assert.notEqual(createState(), createState());
  });

  it('rejects a value whose nonce was swapped', () => {
    const state = createState();
    const signature = state.slice(state.indexOf('.') + 1);

    assert.equal(isStateValid(`00000000000000000000000000000000.${signature}`), false);
  });

  it('rejects a value whose signature was changed', () => {
    const state = createState();

    assert.equal(isStateValid(`${state.slice(0, state.indexOf('.'))}.${'a'.repeat(64)}`), false);
  });

  it('rejects anything that is not the shape it made', () => {
    assert.equal(isStateValid(''), false);
    assert.equal(isStateValid('no-separator'), false);
    assert.equal(isStateValid('.only-a-signature'), false);
    assert.equal(isStateValid('only-a-nonce.'), false);
  });

  it('rejects the values a callback actually arrives with when there is no state', () => {
    // Undefined and null reach here whenever a provider returns without one.
    assert.equal(isStateValid(undefined), false);
    assert.equal(isStateValid(null), false);
  });
});
