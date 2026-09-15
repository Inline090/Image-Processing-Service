import sharp from 'sharp';
import { config } from '../config.js';

export type ResizeFit = 'cover' | 'contain' | 'fill' | 'inside' | 'outside';

export type WatermarkPosition =
  | 'northwest'
  | 'north'
  | 'northeast'
  | 'west'
  | 'center'
  | 'east'
  | 'southwest'
  | 'south'
  | 'southeast';

export type TransformOptions = {
  width?: number;
  height?: number;
  fit?: ResizeFit;
  rotate?: number;
  crop?: { left: number; top: number; width: number; height: number };
  grayscale?: boolean;
  sepia?: boolean;
  format?: 'jpeg' | 'png' | 'webp';
  watermark?: { text: string; position?: WatermarkPosition };
};

export type TransformResult = {
  buffer: Buffer;
  format: string;
  width: number;
  height: number;
};

export class ImageTooLargeError extends Error {
  constructor(pixels: number, limit: number) {
    super(`Input image is ${pixels} pixels, the limit is ${limit}`);
    this.name = 'ImageTooLargeError';
  }
}

const SVG_ESCAPES: Record<string, string> = {
  '<': '&lt;',
  '>': '&gt;',
  '&': '&amp;',
  "'": '&apos;',
  '"': '&quot;',
};

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (char) => SVG_ESCAPES[char] ?? char);
}

function watermarkOverlay(text: string, imageWidth: number, imageHeight: number): Buffer {
  const fontByWidth = Math.round(imageWidth * 0.05);
  const fontByHeight = Math.round(imageHeight * 0.25);
  const fontSize = Math.max(8, Math.min(fontByWidth, fontByHeight, 48));

  const width = imageWidth;
  const height = Math.max(1, Math.min(Math.round(fontSize * 1.8), imageHeight));
  const baseline = Math.min(Math.round(fontSize * 1.25), height);

  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="' +
    width +
    '" height="' +
    height +
    '">' +
    '<text x="' +
    Math.round(fontSize * 0.4) +
    '" y="' +
    baseline +
    '" font-family="sans-serif" font-size="' +
    fontSize +
    '" fill="#ffffff" fill-opacity="0.85">' +
    escapeXml(text) +
    '</text></svg>';

  return Buffer.from(svg);
}

export async function transformImage(
  input: Buffer,
  options: TransformOptions,
): Promise<TransformResult> {
  const metadata = await sharp(input).metadata();
  const inputPixels = (metadata.width ?? 0) * (metadata.height ?? 0);

  if (inputPixels > config.maxInputPixels) {
    throw new ImageTooLargeError(inputPixels, config.maxInputPixels);
  }

  let pipeline = sharp(input, { limitInputPixels: config.maxInputPixels }).autoOrient();

  if (options.rotate !== undefined) {
    pipeline = pipeline.rotate(options.rotate);
  }

  if (options.crop !== undefined) {
    pipeline = pipeline.extract(options.crop);
  }

  if (options.grayscale === true) {
    pipeline = pipeline.grayscale();
  }

  if (options.sepia === true) {
    pipeline = pipeline.grayscale().tint({ r: 112, g: 66, b: 20 });
  }

  if (options.width !== undefined || options.height !== undefined) {
    pipeline = pipeline.resize({
      width: options.width,
      height: options.height,
      fit: options.fit ?? 'cover',
    });
  }

  if (options.watermark !== undefined) {
    const sized = await pipeline.toBuffer({ resolveWithObject: true });
    const overlay = watermarkOverlay(
      options.watermark.text,
      sized.info.width,
      sized.info.height,
    );

    pipeline = sharp(sized.data, { limitInputPixels: config.maxInputPixels }).composite([
      {
        input: overlay,
        gravity: options.watermark.position ?? 'southeast',
      },
    ]);
  }

  if (options.format === 'jpeg') {
    pipeline = pipeline.jpeg({ quality: 82 });
  } else if (options.format === 'png') {
    pipeline = pipeline.png();
  } else if (options.format === 'webp') {
    pipeline = pipeline.webp({ quality: 82 });
  }

  const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });

  return {
    buffer: data,
    format: info.format,
    width: info.width,
    height: info.height,
  };
}
