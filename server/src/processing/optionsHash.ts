import { createHash } from 'node:crypto';
import type { TransformInput } from '../schemas/transform.schema.js';

const PIPELINE_VERSION = 3;

export const DEFAULT_FIT = 'cover';
export const DEFAULT_FOCUS = 'center';
export const DEFAULT_EFFORT = 4;
export const DEFAULT_WATERMARK_POSITION = 'southeast';
export const DEFAULT_QUALITY = 82;

// Normalises the options so equal requests produce the same key.
function canonicalize(options: TransformInput): string {
  const resizes = options.width !== undefined || options.height !== undefined;
  const fit = resizes ? (options.fit ?? DEFAULT_FIT) : null;

  const focus = resizes ? (options.focus ?? DEFAULT_FOCUS) : null;

  const crop =
    options.crop === undefined
      ? null
      : [options.crop.left, options.crop.top, options.crop.width, options.crop.height];

  const watermark =
    options.watermark === undefined
      ? null
      : [options.watermark.text, options.watermark.position ?? DEFAULT_WATERMARK_POSITION];

  const modulate =
    options.modulate === undefined
      ? null
      : [
          options.modulate.brightness ?? null,
          options.modulate.saturation ?? null,
          options.modulate.hue ?? null,
          options.modulate.lightness ?? null,
        ];

  const sharpen =
    options.sharpen === undefined || options.sharpen === false
      ? null
      : options.sharpen === true
        ? [null, null, null]
        : [options.sharpen.sigma ?? null, options.sharpen.m1 ?? null, options.sharpen.m2 ?? null];

  const trim =
    options.trim === undefined || options.trim === false
      ? null
      : options.trim === true
        ? [null, null]
        : [options.trim.background ?? null, options.trim.threshold ?? null];

  const extend =
    options.extend === undefined
      ? null
      : [
          options.extend.top ?? null,
          options.extend.bottom ?? null,
          options.extend.left ?? null,
          options.extend.right ?? null,
          options.extend.background ?? null,
        ];

  const quality = options.format === 'png' ? null : (options.quality ?? DEFAULT_QUALITY);

  const effort =
    options.format === 'webp' || options.format === 'avif'
      ? (options.effort ?? DEFAULT_EFFORT)
      : null;

  return JSON.stringify([
    options.width ?? null,
    options.height ?? null,
    fit,
    focus,
    options.rotate ?? null,
    crop,
    options.grayscale === true ? true : null,
    options.sepia === true ? true : null,
    options.format ?? null,
    watermark,
    modulate,
    options.blur ?? null,
    sharpen,
    options.flip === true ? true : null,
    options.flop === true ? true : null,
    trim,
    extend,
    options.background ?? null,
    quality,
    effort,
    options.flatten === true ? true : null,
  ]);
}

// The version prefix stops a changed pipeline from serving old entries.
export function hashTransformOptions(imageId: string, options: TransformInput): string {
  const material = `${PIPELINE_VERSION}:${imageId}:${canonicalize(options)}`;
  return createHash('sha256').update(material).digest('hex');
}
