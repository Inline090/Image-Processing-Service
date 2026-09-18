import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { hashTransformOptions } from '../../src/processing/optionsHash.js';
import type { TransformInput } from '../../src/schemas/transform.schema.js';

const IMAGE = '3f1b6c2e-0000-4000-8000-000000000000';

function hash(options: TransformInput): string {
  return hashTransformOptions(IMAGE, options);
}

// Every option has to reach the cache key. When one does not, two different
// transformations collide and the stored result of the first is served for the
// second, which is the worst failure this service can have.
const discriminating: Array<[string, TransformInput]> = [
  ['width', { width: 200 }],
  ['height', { height: 200 }],
  ['fit', { width: 100, height: 100, fit: 'contain' }],
  ['rotate', { rotate: 90 }],
  ['crop', { crop: { left: 1, top: 1, width: 10, height: 10 } }],
  ['grayscale', { grayscale: true }],
  ['sepia', { sepia: true }],
  ['format', { format: 'png' }],
  ['watermark', { watermark: { text: 'hello' } }],
  ['watermark position', { watermark: { text: 'hello', position: 'north' } }],
  ['modulate', { modulate: { brightness: 1.2 } }],
  ['modulate lightness', { modulate: { lightness: 10 } }],
  ['blur', { blur: 2 }],
  ['sharpen', { sharpen: true }],
  ['sharpen sigma', { sharpen: { sigma: 2 } }],
  ['flip', { flip: true }],
  ['flop', { flop: true }],
  ['trim', { trim: true }],
  ['trim threshold', { trim: { threshold: 30 } }],
  ['extend', { extend: { top: 10 } }],
  ['extend background', { extend: { background: '#ff0000' } }],
  ['background', { background: '#ff0000' }],
  ['flatten', { flatten: true }],
  ['quality', { quality: 40 }],
];

describe('transform options hash', () => {
  it('is stable for identical options', () => {
    assert.equal(hash({ width: 100, format: 'webp' }), hash({ width: 100, format: 'webp' }));
  });

  it('separates images', () => {
    assert.notEqual(
      hashTransformOptions('a', { width: 100 }),
      hashTransformOptions('b', { width: 100 }),
    );
  });

  for (const [label, options] of discriminating) {
    it(`changes the hash when ${label} is set`, () => {
      assert.notEqual(hash({}), hash(options));
    });
  }

  it('separates fit values when resizing', () => {
    assert.notEqual(hash({ width: 100, fit: 'contain' }), hash({ width: 100, fit: 'cover' }));
  });

  it('ignores fit when nothing is resized', () => {
    assert.equal(hash({ format: 'png' }), hash({ format: 'png', fit: 'contain' }));
  });

  it('treats an explicit quality equal to the default as the same entry', () => {
    assert.equal(hash({ format: 'webp' }), hash({ format: 'webp', quality: 82 }));
    assert.notEqual(hash({ format: 'webp' }), hash({ format: 'webp', quality: 50 }));
  });

  it('ignores quality for png, which is encoded losslessly', () => {
    assert.equal(hash({ format: 'png' }), hash({ format: 'png', quality: 20 }));
  });

  it('treats sharpen false as absent and true as its own entry', () => {
    assert.equal(hash({}), hash({ sharpen: false }));
    assert.notEqual(hash({}), hash({ sharpen: true }));
  });

  it('treats trim false as absent', () => {
    assert.equal(hash({}), hash({ trim: false }));
  });

  it('treats an omitted fit and the explicit default as the same entry', () => {
    assert.equal(hash({ width: 100 }), hash({ width: 100, fit: 'cover' }));
  });
});
