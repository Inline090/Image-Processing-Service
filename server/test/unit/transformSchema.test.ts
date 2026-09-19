import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { transformSchema } from '../../src/schemas/transform.schema.js';

function accepts(options: unknown): boolean {
  return transformSchema.safeParse(options).success;
}

// Effort is the encoder's own knob, and sharp rejects an out-of-range value deep
// inside the worker, where the failure surfaces as a failed job that is retried
// and then dead-lettered. These pin that it is refused at the API boundary
// instead, while the caller still has a request to get a 400 back on.
describe('transform schema', () => {
  it('accepts avif as an output format', () => {
    assert.equal(accepts({ format: 'avif' }), true);
  });

  it('accepts effort for the formats that have the knob', () => {
    assert.equal(accepts({ format: 'avif', effort: 0 }), true);
    assert.equal(accepts({ format: 'avif', effort: 6 }), true);
    assert.equal(accepts({ format: 'webp', effort: 6 }), true);
  });

  it('rejects effort above the range both encoders accept', () => {
    assert.equal(accepts({ format: 'avif', effort: 7 }), false);
    assert.equal(accepts({ format: 'webp', effort: 9 }), false);
  });

  it('rejects effort for a format that has no such knob', () => {
    assert.equal(accepts({ format: 'jpeg', effort: 4 }), false);
    assert.equal(accepts({ format: 'png', effort: 4 }), false);
  });

  it('rejects effort with no format, rather than ignoring it', () => {
    assert.equal(accepts({ effort: 4 }), false);
  });

  it('accepts the smart crop strategies and refuses anything else', () => {
    assert.equal(accepts({ width: 100, focus: 'center' }), true);
    assert.equal(accepts({ width: 100, focus: 'attention' }), true);
    assert.equal(accepts({ width: 100, focus: 'entropy' }), true);
    assert.equal(accepts({ width: 100, focus: 'faces' }), false);
  });

  it('allows a crop taken from a large photograph', () => {
    // The crop comes out of the original, so its bound has to clear a modern camera
    // rather than the output cap the resize fields use.
    assert.equal(accepts({ crop: { left: 400, top: 300, width: 7200, height: 4800 } }), true);

    // Still bounded, and still whole pixels.
    assert.equal(accepts({ crop: { left: 0, top: 0, width: 40000, height: 10 } }), false);
    assert.equal(accepts({ crop: { left: 0, top: 0, width: 10.5, height: 10 } }), false);
  });
});
