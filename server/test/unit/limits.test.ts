import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import sharp from 'sharp';

process.env.MAX_INPUT_PIXELS = '1000';

const { ImageTooLargeError, transformImage } = await import('../../src/processing/transform.js');

function sourceImage(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 10, g: 120, b: 200 } } })
    .png()
    .toBuffer();
}

describe('input pixel limit', () => {
  it('processes an image under the limit', async () => {
    const result = await transformImage(await sourceImage(20, 20), { width: 10 });

    assert.equal(result.width, 10);
  });

  it('refuses an image over the limit before decoding it', async () => {
    const oversized = await sourceImage(100, 100);

    await assert.rejects(() => transformImage(oversized, {}), ImageTooLargeError);
  });
});
