import sharp from 'sharp';
import { config } from '../config.js';
import { DEFAULT_FIT, DEFAULT_QUALITY, DEFAULT_WATERMARK_POSITION } from './optionsHash.js';

const DEFAULT_FLATTEN_BACKGROUND = '#ffffff';

// sharp calls the centre gravity "centre". Attention and entropy are its two
// smart-crop strategies: each scans the image and picks the region worth keeping
// instead of assuming the middle.
type ResizePosition = 'centre' | 'attention' | 'entropy';

function focusPosition(focus: CropFocus): ResizePosition {
  if (focus === 'attention') {
    return 'attention';
  }

  if (focus === 'entropy') {
    return 'entropy';
  }

  return 'centre';
}

export type ResizeFit = 'cover' | 'contain' | 'fill' | 'inside' | 'outside';

/** What a resize keeps when it has to discard part of the image. */
export type CropFocus = 'center' | 'attention' | 'entropy';

export type OutputFormat = 'jpeg' | 'png' | 'webp' | 'avif';

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

export type ModulateOptions = {
  brightness?: number;
  saturation?: number;
  hue?: number;
  lightness?: number;
};

export type SharpenOptions = {
  sigma: number;
  m1?: number;
  m2?: number;
};

export type TrimOptions = {
  background?: string;
  threshold?: number;
};

export type ExtendOptions = {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
  background?: string;
};

export type TransformOptions = {
  width?: number;
  height?: number;
  fit?: ResizeFit;
  focus?: CropFocus;
  rotate?: number;
  crop?: { left: number; top: number; width: number; height: number };
  grayscale?: boolean;
  sepia?: boolean;
  format?: OutputFormat;
  watermark?: { text: string; position?: WatermarkPosition };
  modulate?: ModulateOptions;
  blur?: number;
  sharpen?: boolean | SharpenOptions;
  flip?: boolean;
  flop?: boolean;
  trim?: boolean | TrimOptions;
  extend?: ExtendOptions;
  background?: string;
  flatten?: boolean;
  quality?: number;
  effort?: number;
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

  // Geometry, applied at the original resolution before any downscaling.
  if (options.rotate !== undefined) {
    pipeline =
      options.background === undefined
        ? pipeline.rotate(options.rotate)
        : pipeline.rotate(options.rotate, { background: options.background });
  }

  if (options.crop !== undefined) {
    pipeline = pipeline.extract(options.crop);
  }

  if (options.trim !== undefined && options.trim !== false) {
    pipeline = options.trim === true ? pipeline.trim() : pipeline.trim(options.trim);
  }

  if (options.width !== undefined || options.height !== undefined) {
    pipeline = pipeline.resize({
      width: options.width,
      height: options.height,
      fit: options.fit ?? DEFAULT_FIT,
      ...(options.focus === undefined ? {} : { position: focusPosition(options.focus) }),
      ...(options.background === undefined ? {} : { background: options.background }),
    });
  }

  // Colour work, after the resize so it runs on fewer pixels.
  if (options.modulate !== undefined) {
    pipeline = pipeline.modulate(options.modulate);
  }

  if (options.grayscale === true) {
    pipeline = pipeline.grayscale();
  }

  if (options.sepia === true) {
    pipeline = pipeline.grayscale().tint({ r: 112, g: 66, b: 20 });
  }

  // Detail work last, so sharpening is not undone by the downscale.
  if (options.blur !== undefined) {
    pipeline = pipeline.blur(options.blur);
  }

  if (options.sharpen !== undefined && options.sharpen !== false) {
    pipeline = options.sharpen === true ? pipeline.sharpen() : pipeline.sharpen(options.sharpen);
  }

  // Mirroring, before the canvas is padded so the padding is never flipped.
  if (options.flip === true) {
    pipeline = pipeline.flip();
  }

  if (options.flop === true) {
    pipeline = pipeline.flop();
  }

  if (options.extend !== undefined) {
    const background = options.extend.background ?? options.background;

    pipeline = pipeline.extend({
      top: options.extend.top ?? 0,
      bottom: options.extend.bottom ?? 0,
      left: options.extend.left ?? 0,
      right: options.extend.right ?? 0,
      ...(background === undefined ? {} : { background }),
    });
  }

  if (options.flatten === true) {
    pipeline = pipeline.flatten({ background: options.background ?? DEFAULT_FLATTEN_BACKGROUND });
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
        gravity: options.watermark.position ?? DEFAULT_WATERMARK_POSITION,
      },
    ]);
  }

  const quality = options.quality ?? DEFAULT_QUALITY;
  const effort = options.effort;

  if (options.format === 'jpeg') {
    pipeline = pipeline.jpeg({ quality });
  } else if (options.format === 'png') {
    pipeline = pipeline.png();
  } else if (options.format === 'webp') {
    pipeline = pipeline.webp({ quality, ...(effort === undefined ? {} : { effort }) });
  } else if (options.format === 'avif') {
    // AVIF is a HEIF profile, so sharp exposes it as heif with AV1 compression
    // rather than as a codec of its own.
    pipeline = pipeline.heif({
      compression: 'av1',
      quality,
      ...(effort === undefined ? {} : { effort }),
    });
  }

  const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });

  return {
    buffer: data,
    // sharp reports AVIF as "heif", which would store the wrong content type and
    // make the download save as .bin, so the requested format wins when there is
    // one and sharp's own report is the fallback.
    format: options.format ?? info.format,
    width: info.width,
    height: info.height,
  };
}
