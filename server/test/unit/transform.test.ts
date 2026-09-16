import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import sharp from 'sharp';
import { transformImage } from '../../src/processing/transform.js';

function sourceImage(width = 400, height = 300): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 10, g: 120, b: 200 } } })
    .png()
    .toBuffer();
}

describe('transform pipeline', () => {
  it('resizes to the requested width, preserving the aspect ratio', async () => {
    const result = await transformImage(await sourceImage(), { width: 200 });

    assert.equal(result.width, 200);
    assert.equal(result.height, 150);
  });

  it('converts the output format', async () => {
    const result = await transformImage(await sourceImage(), { width: 100, format: 'webp' });

    assert.equal(result.format, 'webp');
  });

  it('crops to the requested region', async () => {
    const result = await transformImage(await sourceImage(), {
      crop: { left: 0, top: 0, width: 120, height: 90 },
    });

    assert.equal(result.width, 120);
    assert.equal(result.height, 90);
  });

  it('rotates a rectangle, swapping its dimensions', async () => {
    const result = await transformImage(await sourceImage(200, 100), { rotate: 90 });

    assert.equal(result.width, 100);
    assert.equal(result.height, 200);
  });

  it('grayscale leaves every pixel with equal channels', async () => {
    const source = await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 200, g: 40, b: 40 } },
    })
      .png()
      .toBuffer();

    const result = await transformImage(source, { grayscale: true });
    const { data } = await sharp(result.buffer).raw().toBuffer({ resolveWithObject: true });

    assert.equal(data[0], data[1]);
    assert.equal(data[1], data[2]);
  });

  it('watermarks an image narrower than the overlay (issue 22 regression)', async () => {
    const result = await transformImage(await sourceImage(), {
      width: 40,
      watermark: { text: 'tiny' },
    });

    assert.equal(result.width, 40);
  });

  it('escapes markup in watermark text instead of emitting it', async () => {
    const result = await transformImage(await sourceImage(), {
      width: 200,
      watermark: { text: '<script>alert(1)</script>' },
    });

    assert.equal(result.width, 200);
  });
});
