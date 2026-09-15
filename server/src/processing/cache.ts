import { createHash } from 'node:crypto';
import type { TransformInput } from '../schemas/transform.schema.js';

const PIPELINE_VERSION = 1;
const TTL_MS = 15 * 60 * 1000;
const MAX_ENTRIES = 500;

export type CachedTransform = {
  processedKey: string;
  format: string;
  width: number;
  height: number;
};

type Entry = {
  value: CachedTransform;
  expiresAt: number;
};

const store = new Map<string, Entry>();

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

function cacheKey(imageId: string, options: TransformInput): string {
  const material = `${PIPELINE_VERSION}:${imageId}:${canonicalize(options)}`;
  return createHash('sha256').update(material).digest('hex');
}

function sweep(): void {
  const now = Date.now();

  for (const [key, entry] of store) {
    if (entry.expiresAt <= now) {
      store.delete(key);
    }
  }
}

export function getCachedTransform(
  imageId: string,
  options: TransformInput,
): CachedTransform | null {
  const entry = store.get(cacheKey(imageId, options));

  if (entry === undefined) {
    return null;
  }

  if (entry.expiresAt <= Date.now()) {
    store.delete(cacheKey(imageId, options));
    return null;
  }

  return entry.value;
}

export function setCachedTransform(
  imageId: string,
  options: TransformInput,
  value: CachedTransform,
): void {
  if (store.size >= MAX_ENTRIES) {
    sweep();

    if (store.size >= MAX_ENTRIES) {
      store.clear();
    }
  }

  store.set(cacheKey(imageId, options), { value, expiresAt: Date.now() + TTL_MS });
}
