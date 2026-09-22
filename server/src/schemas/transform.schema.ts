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

const formats = ['jpeg', 'png', 'webp', 'avif'] as const;

const focusValues = ['center', 'attention', 'entropy'] as const;

const MAX_EFFORT = 6;

function effortIsAllowed(options: { format?: string; effort?: number }): boolean {
  if (options.effort === undefined) {
    return true;
  }

  return options.format === 'webp' || options.format === 'avif';
}

const MAX_CROP_EDGE = 20000;

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Expected a hex colour such as #ffffff');

const modulateSchema = z
  .object({
    brightness: z.number().min(0).max(10).optional(),
    saturation: z.number().min(0).max(10).optional(),
    hue: z.number().min(0).max(360).optional(),
    lightness: z.number().min(0).max(100).optional(),
  })
  .strict();

const sharpenSchema = z
  .object({
    sigma: z.number().min(0.000001).max(10000),
    m1: z.number().min(0).max(1000000).optional(),
    m2: z.number().min(0).max(1000000).optional(),
  })
  .strict();

const trimSchema = z
  .object({
    background: hexColor.optional(),
    threshold: z.number().min(0).max(255).optional(),
  })
  .strict();

const extendSchema = z
  .object({
    top: z.number().int().min(0).max(4096).optional(),
    bottom: z.number().int().min(0).max(4096).optional(),
    left: z.number().int().min(0).max(4096).optional(),
    right: z.number().int().min(0).max(4096).optional(),
    background: hexColor.optional(),
  })
  .strict();

export const transformSchema = z
  .object({
    width: z.number().int().positive().max(4096).optional(),
    height: z.number().int().positive().max(4096).optional(),
    fit: z.enum(['cover', 'contain', 'fill', 'inside', 'outside']).optional(),
    focus: z.enum(focusValues).optional(),
    rotate: z.number().int().optional(),
    crop: z
      .object({
        left: z.number().int().min(0).max(MAX_CROP_EDGE),
        top: z.number().int().min(0).max(MAX_CROP_EDGE),
        width: z.number().int().positive().max(MAX_CROP_EDGE),
        height: z.number().int().positive().max(MAX_CROP_EDGE),
      })
      .strict()
      .optional(),
    grayscale: z.boolean().optional(),
    sepia: z.boolean().optional(),
    format: z.enum(formats).optional(),
    watermark: z
      .object({
        text: z.string().min(1).max(64),
        position: z.enum(watermarkPositions).optional(),
      })
      .strict()
      .optional(),
    modulate: modulateSchema.optional(),
    blur: z.number().min(0.3).max(1000).optional(),
    sharpen: z.union([z.boolean(), sharpenSchema]).optional(),
    flip: z.boolean().optional(),
    flop: z.boolean().optional(),
    trim: z.union([z.boolean(), trimSchema]).optional(),
    extend: extendSchema.optional(),
    background: hexColor.optional(),
    flatten: z.boolean().optional(),
    quality: z.number().int().min(1).max(100).optional(),
    effort: z.number().int().min(0).max(MAX_EFFORT).optional(),
  })
  .strict()
  .refine(effortIsAllowed, {
    path: ['effort'],
    message: 'effort only applies to webp and avif, so set the format alongside it',
  });

export type TransformInput = z.infer<typeof transformSchema>;
