import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import type { ImageRow } from '../db/types.js';
import { AppError } from '../middleware/error.js';
import { formatIssues } from '../middleware/validate.js';
import { getCachedTransform, setCachedTransform } from '../processing/cache.js';
import { ImageTooLargeError, transformImage, type TransformResult } from '../processing/transform.js';
import {
  countImages,
  createImage,
  findImageById,
  listImages,
  markImageReady,
} from '../repositories/images.js';
import { listImagesQuerySchema } from '../schemas/image.schema.js';
import type { TransformInput } from '../schemas/transform.schema.js';
import { getObject, putObject, signedUrl } from '../storage/s3.js';

async function serializeImage(image: ImageRow) {
  return {
    id: image.id,
    mimeType: image.mime_type,
    sizeBytes: Number(image.size_bytes),
    status: image.status,
    createdAt: image.created_at,
    originalUrl: await signedUrl(image.original_key),
    processedUrl: image.processed_key === null ? null : await signedUrl(image.processed_key),
  };
}

export async function uploadImage(req: Request, res: Response): Promise<void> {
  const authUser = req.user;
  if (authUser === undefined) {
    throw new AppError('Not authenticated', 401);
  }

  const file = req.file;
  if (file === undefined) {
    throw new AppError('No file uploaded - expected a form field named "image"', 400);
  }

  const key = `originals/${authUser.sub}/${randomUUID()}`;
  await putObject(key, file.buffer, file.mimetype);

  const image = await createImage({
    userId: authUser.sub,
    originalKey: key,
    mimeType: file.mimetype,
    sizeBytes: file.size,
  });

  res.status(201).json({ image: await serializeImage(image) });
}

export async function transform(req: Request, res: Response): Promise<void> {
  const authUser = req.user;
  if (authUser === undefined) {
    throw new AppError('Not authenticated', 401);
  }

  const imageId = req.params.id;
  if (typeof imageId !== 'string') {
    throw new AppError('Image id is required', 400);
  }

  const image = await findImageById(imageId);
  if (image === null) {
    throw new AppError('Image not found', 404);
  }

  const options = req.body as TransformInput;
  const cached = getCachedTransform(image.id, options);

  if (cached !== null) {
    res.json({
      image: {
        ...(await serializeImage(image)),
        format: cached.format,
        width: cached.width,
        height: cached.height,
        cached: true,
      },
    });
    return;
  }

  const original = await getObject(image.original_key);

  let result: TransformResult;
  try {
    result = await transformImage(original, options);
  } catch (err) {
    if (err instanceof ImageTooLargeError) {
      throw new AppError(err.message, 413);
    }
    throw err;
  }

  const processedKey = `processed/${image.user_id}/${randomUUID()}`;
  await putObject(processedKey, result.buffer, `image/${result.format}`);

  const updated = await markImageReady(image.id, processedKey);

  setCachedTransform(image.id, options, {
    processedKey,
    format: result.format,
    width: result.width,
    height: result.height,
  });

  res.json({
    image: {
      ...(await serializeImage(updated)),
      format: result.format,
      width: result.width,
      height: result.height,
      cached: false,
    },
  });
}

export async function list(req: Request, res: Response): Promise<void> {
  const parsed = listImagesQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    throw new AppError(`Invalid query parameters - ${formatIssues(parsed.error)}`, 400);
  }

  const { page, limit } = parsed.data;
  const offset = (page - 1) * limit;

  const [total, rows] = await Promise.all([countImages(), listImages(limit, offset)]);

  res.json({
    images: await Promise.all(rows.map((row) => serializeImage(row))),
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  });
}

export async function getImage(req: Request, res: Response): Promise<void> {
  const imageId = req.params.id;
  if (typeof imageId !== 'string') {
    throw new AppError('Image id is required', 400);
  }

  const image = await findImageById(imageId);
  if (image === null) {
    throw new AppError('Image not found', 404);
  }

  res.json({ image: await serializeImage(image) });
}
