import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MAX_BULK_IMAGES } from '../../src/config.js';
import { bulkTransformSchema } from '../../src/schemas/bulk.schema.js';

const uuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function accepts(payload: unknown): boolean {
  return bulkTransformSchema.safeParse(payload).success;
}

describe('bulk transform schema', () => {
  it('accepts a list with options', () => {
    assert.equal(accepts({ imageIds: [uuid(1), uuid(2)], options: { width: 200 } }), true);
  });

  it('collapses the same image sent twice', () => {
    const result = bulkTransformSchema.safeParse({
      imageIds: [uuid(1), uuid(1), uuid(2)],
      options: {},
    });

    assert.equal(result.success, true);
    assert.equal(result.success ? result.data.imageIds.length : 0, 2);
  });

  it('applies the cap after collapsing, not before', () => {
    const repeated = Array.from({ length: MAX_BULK_IMAGES * 2 }, () => uuid(1));
    const result = bulkTransformSchema.safeParse({ imageIds: repeated, options: {} });

    assert.equal(result.success, true);
    assert.equal(result.success ? result.data.imageIds.length : 0, 1);
  });

  it('refuses more images than the cap allows', () => {
    const over = Array.from({ length: MAX_BULK_IMAGES + 1 }, (_, index) => uuid(index));

    assert.equal(accepts({ imageIds: over, options: {} }), false);
  });

  it('refuses an empty list', () => {
    assert.equal(accepts({ imageIds: [], options: {} }), false);
  });

  it('refuses something that is not an image id', () => {
    assert.equal(accepts({ imageIds: ['not-a-uuid'], options: {} }), false);
  });

  it('validates the options exactly as a single transform does', () => {
    assert.equal(accepts({ imageIds: [uuid(1)], options: { width: 'wide' } }), false);
    assert.equal(accepts({ imageIds: [uuid(1)], options: { width: 100, unknown: true } }), false);
  });

  it('refuses an unknown key at the top level rather than ignoring it', () => {
    assert.equal(accepts({ imageIds: [uuid(1)], options: {}, extra: true }), false);
  });
});
