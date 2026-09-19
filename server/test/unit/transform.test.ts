import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { describe, it } from 'node:test';
import sharp from 'sharp';
import { transformImage } from '../../src/processing/transform.js';

function sourceImage(width = 400, height = 300): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 10, g: 120, b: 200 } } })
    .png()
    .toBuffer();
}

function rawImage(width: number, height: number, pixels: Buffer): Promise<Buffer> {
  return sharp(pixels, { raw: { width, height, channels: 3 } })
    .png()
    .toBuffer();
}

function twoToneImage(width: number, height: number): Promise<Buffer> {
  const channels = 3;
  const pixels = Buffer.alloc(width * height * channels);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * channels;
      const left = x < width / 2;

      pixels[offset] = left ? 255 : 0;
      pixels[offset + 2] = left ? 0 : 255;
    }
  }

  return rawImage(width, height, pixels);
}

describe('transform pipeline', () => {
  it('resizes to the requested width, preserving the aspect ratio', async () => {
    const result = await transformImage(await sourceImage(), { width: 200 });

    assert.equal(result.width, 200);
    assert.equal(result.height, 150);
  });

  it('resizes to the requested height, preserving the aspect ratio', async () => {
    const result = await transformImage(await sourceImage(), { height: 150 });

    assert.equal(result.height, 150);
    assert.equal(result.width, 200);
  });

  it('resizes to both dimensions when a width and a height are given', async () => {
    const result = await transformImage(await sourceImage(), { width: 100, height: 100 });

    assert.equal(result.width, 100);
    assert.equal(result.height, 100);
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

  it('desaturating with modulate leaves every pixel with equal channels', async () => {
    const result = await transformImage(await sourceImage(16, 16), {
      modulate: { saturation: 0 },
      format: 'png',
    });

    const { data } = await sharp(result.buffer).raw().toBuffer({ resolveWithObject: true });

    assert.equal(data[0], data[1]);
    assert.equal(data[1], data[2]);
  });

  it('blurs the pixels without changing the dimensions', async () => {
    const source = await twoToneImage(64, 64);
    const plain = await transformImage(source, { format: 'png' });
    const blurred = await transformImage(source, { blur: 4, format: 'png' });

    assert.equal(blurred.width, 64);
    assert.equal(blurred.height, 64);
    assert.notDeepEqual(plain.buffer, blurred.buffer);
  });

  it('sharpens with defaults and with explicit parameters', async () => {
    const source = await twoToneImage(100, 80);
    const defaults = await transformImage(source, { sharpen: true, format: 'png' });
    const explicit = await transformImage(source, {
      sharpen: { sigma: 2, m1: 1, m2: 2 },
      format: 'png',
    });

    assert.equal(defaults.width, 100);
    assert.equal(explicit.width, 100);
  });

  it('flops the image horizontally', async () => {
    const source = await twoToneImage(4, 2);
    const before = await sharp(source).raw().toBuffer();
    const result = await transformImage(source, { flop: true, format: 'png' });
    const after = await sharp(result.buffer).raw().toBuffer();

    assert.deepEqual([before[0], before[2]], [255, 0]);
    assert.deepEqual([after[0], after[2]], [0, 255]);
  });

  it('flips the image vertically', async () => {
    const channels = 3;
    const pixels = Buffer.alloc(2 * 2 * channels);

    for (let x = 0; x < 2; x += 1) {
      pixels[x * channels] = 255;
      pixels[(2 + x) * channels + 2] = 255;
    }

    const source = await rawImage(2, 2, pixels);
    const result = await transformImage(source, { flip: true, format: 'png' });
    const after = await sharp(result.buffer).raw().toBuffer();

    assert.equal(after[0], 0);
    assert.equal(after[2], 255);
  });

  it('trims a uniform border', async () => {
    const size = 40;
    const inner = 20;
    const channels = 3;
    const pixels = Buffer.alloc(size * size * channels, 255);
    const offset = (size - inner) / 2;

    for (let y = offset; y < offset + inner; y += 1) {
      for (let x = offset; x < offset + inner; x += 1) {
        const index = (y * size + x) * channels;

        pixels[index] = 0;
        pixels[index + 1] = 0;
        pixels[index + 2] = 0;
      }
    }

    const result = await transformImage(await rawImage(size, size, pixels), {
      trim: true,
      format: 'png',
    });

    assert.equal(result.width, inner);
    assert.equal(result.height, inner);
  });

  it('pads the canvas with extend', async () => {
    const result = await transformImage(await sourceImage(100, 50), {
      extend: { top: 10, bottom: 20, left: 5, right: 15, background: '#ff0000' },
    });

    assert.equal(result.width, 120);
    assert.equal(result.height, 80);
  });

  it('fills the letterbox with the requested background', async () => {
    const result = await transformImage(await sourceImage(100, 50), {
      width: 100,
      height: 100,
      fit: 'contain',
      background: '#ff0000',
      format: 'png',
    });

    const { data } = await sharp(result.buffer).raw().toBuffer({ resolveWithObject: true });

    assert.equal(result.width, 100);
    assert.equal(result.height, 100);
    assert.deepEqual([data[0], data[1], data[2]], [255, 0, 0]);
  });

  it('flattens a transparent image onto the background', async () => {
    const transparent = await sharp({
      create: { width: 10, height: 10, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .png()
      .toBuffer();

    const result = await transformImage(transparent, {
      flatten: true,
      background: '#00ff00',
      format: 'png',
    });

    const { data } = await sharp(result.buffer).raw().toBuffer({ resolveWithObject: true });

    assert.deepEqual([data[0], data[1], data[2]], [0, 255, 0]);
  });

  it('honours the quality setting when encoding', async () => {
    const noisy = await rawImage(128, 128, randomBytes(128 * 128 * 3));
    const low = await transformImage(noisy, { format: 'webp', quality: 10 });
    const high = await transformImage(noisy, { format: 'webp', quality: 95 });

    assert.ok(
      low.buffer.length < high.buffer.length,
      `expected quality 10 (${low.buffer.length} bytes) to be smaller than quality 95 (${high.buffer.length} bytes)`,
    );
  });
});
