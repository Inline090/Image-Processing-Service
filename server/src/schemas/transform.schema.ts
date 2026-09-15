import { z } from 'zod';

const watermarkPositions = [
  'northwest',
  'north',
  'northeast',
  'west',
  'center',
  'east',
  'southwest',
  'south',
  'southeast',
] as const;

export const transformSchema = z
  .object({
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    fit: z.enum(['cover', 'contain', 'fill', 'inside', 'outside']).optional(),
    rotate: z.number().int().optional(),
    crop: z
      .object({
        left: z.number().int().min(0),
        top: z.number().int().min(0),
        width: z.number().int().positive(),
        height: z.number().int().positive(),
      })
      .strict()
      .optional(),
    grayscale: z.boolean().optional(),
    sepia: z.boolean().optional(),
    format: z.enum(['jpeg', 'png', 'webp']).optional(),
    watermark: z
      .object({
        text: z.string().min(1).max(64),
        position: z.enum(watermarkPositions).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type TransformInput = z.infer<typeof transformSchema>;
