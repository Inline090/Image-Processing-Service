import { createHash } from 'node:crypto';
import type { TransformInput } from '../schemas/transform.schema.js';

const PIPELINE_VERSION = 1;

function canonicalize(options: TransformInput): string {
  const crop =
    options.crop === undefined
      ? null
      : [options.crop.left, options.crop.top, options.crop.width, options.crop.height];

  const watermark =
    options.watermark === undefined
      ? null
      : [options.watermark.text, options.watermark.position ?? null];

  return JSON.stringify([
    options.width ?? null,
    options.height ?? null,
    options.fit ?? null,
    options.rotate ?? null,
    crop,
    options.grayscale ?? null,
    options.sepia ?? null,
    options.format ?? null,
    watermark,
  ]);
}

export function hashTransformOptions(imageId: string, options: TransformInput): string {
  const material = `${PIPELINE_VERSION}:${imageId}:${canonicalize(options)}`;
  return createHash('sha256').update(material).digest('hex');
}
