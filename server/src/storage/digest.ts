import { createHash } from 'node:crypto';

// Digest of the stored bytes. Two uploads of one picture then share a cache key.
export function contentDigest(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}
