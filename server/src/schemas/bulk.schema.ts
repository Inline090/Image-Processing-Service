import { z } from 'zod';
import { MAX_BULK_IMAGES } from '../config.js';
import { transformSchema } from './transform.schema.js';

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
