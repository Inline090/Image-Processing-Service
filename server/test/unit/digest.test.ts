import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { contentDigest } from '../../src/storage/digest.js';

describe('content digest', () => {
  it('is stable for the same bytes', () => {
    const first = contentDigest(Buffer.from('one picture'));
    const second = contentDigest(Buffer.from('one picture'));

    assert.equal(first, second);
  });

  it('separates different bytes', () => {
    assert.notEqual(
      contentDigest(Buffer.from('one picture')),
      contentDigest(Buffer.from('another picture')),
    );
  });

  it('is a sha256 hex digest', () => {
    assert.match(contentDigest(Buffer.from('x')), /^[0-9a-f]{64}$/);
  });
});
