import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const { ImageTooLargeError } = await import('../../src/processing/transform.js');
const { failureMessage } = await import('../../src/services/transformJob.js');

describe('job failure message', () => {
  it('passes through the message of an error this code raised itself', () => {
    assert.equal(
      failureMessage(new ImageTooLargeError(60_000_000, 50_000_000)),
      'Input image is 60000000 pixels, the limit is 50000000',
    );
  });

  it('replaces anything else with plain words, so no bucket or key leaks', () => {
    assert.equal(
      failureMessage(new Error('AccessDenied for s3://image-processing-originals/originals/abc')),
      'This image could not be processed. Please try a different file.',
    );
  });

  it('handles a thrown value that is not an error at all', () => {
    assert.equal(
      failureMessage('something odd'),
      'This image could not be processed. Please try a different file.',
    );
  });
});
