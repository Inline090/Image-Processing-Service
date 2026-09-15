import { z } from 'zod';

export const listImagesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListImagesQuery = z.infer<typeof listImagesQuerySchema>;
