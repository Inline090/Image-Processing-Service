import { createHash } from 'node:crypto';
import type { TransformInput } from '../schemas/transform.schema.js';

const PIPELINE_VERSION = 1;
const DEFAULT_FIT = 'cover';
const DEFAULT_WATERMARK_POSITION = 'southeast';

function canonicalize(options: TransformInput): string {
  const resizes = options.width !== undefined || options.height !== undefined;
  const fit = resizes ? options.fit ?? DEFAULT_FIT : null;

  const crop =
    options.crop === undefined
      ? null
      : [options.crop.left, options.crop.top, options.crop.width, options.crop.height];

  const watermark =
    options.watermark === undefined
      ? null
      : [
          options.watermark.text,
          options.watermark.position ?? DEFAULT_WATERMARK_POSITION,
        ];

  return JSON.stringify([
    options.width ?? null,
    options.height ?? null,
    fit,
    options.rotate ?? null,
    crop,
    options.grayscale === true ? true : null,
    options.sepia === true ? true : null,
    options.format ?? null,
    watermark,
  ]);
}

export function hashTransformOptions(imageId: string, options: TransformInput): string {
  const material = `${PIPELINE_VERSION}:${imageId}:${canonicalize(options)}`;
  return createHash('sha256').update(material).digest('hex');
}