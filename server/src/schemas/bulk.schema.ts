import { z } from 'zod';
import { MAX_BULK_IMAGES } from '../config.js';
import { transformSchema } from './transform.schema.js';

/**
 * One request that applies the same options to several images.
 *
 * The ids are de-duplicated before the cap is applied, so sending the same image twice
 * costs one slot rather than two - and it cannot queue the same image twice, because
 * the pair of image and options is what a job is keyed on.
 */
export const bulkTransformSchema = z
  .object({
    imageIds: z
      .array(z.string().uuid())
      .min(1)
      .transform((ids) => Array.from(new Set(ids)))
      .refine((ids) => ids.length <= MAX_BULK_IMAGES, {
        message: `At most ${MAX_BULK_IMAGES} images per request`,
      }),
    options: transformSchema,
  })
  .strict();

export type BulkTransformInput = z.infer<typeof bulkTransformSchema>;
