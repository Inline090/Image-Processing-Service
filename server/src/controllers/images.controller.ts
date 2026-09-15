import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import type { ImageRow } from '../db/types.js';
import { AppError } from '../middleware/error.js';
import { ImageTooLargeError, transformImage, type TransformResult } from '../processing/transform.js';
import { createImage, findImageById, markImageReady } from '../repositories/images.js';
import type { TransformInput } from '../schemas/transform.schema.js';
import { getObject, putObject } from '../storage/s3.js';

function publicImage(image: ImageRow) {
  return {
    id: image.id,
    originalKey: image.original_key,
    processedKey: image.processed_key,
    mimeType: image.mime_type,
    sizeBytes: Number(image.size_bytes),
    status: image.status,
    createdAt: image.created_at,
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

  res.status(201).json({ image: publicImage(image) });
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

  const original = await getObject(image.original_key);

  let result: TransformResult;
  try {
    result = await transformImage(original, req.body as TransformInput);
  } catch (err) {
    if (err instanceof ImageTooLargeError) {
      throw new AppError(err.message, 413);
    }
    throw err;
  }

  const processedKey = `processed/${image.user_id}/${randomUUID()}`;
  await putObject(processedKey, result.buffer, `image/${result.format}`);

  const updated = await markImageReady(image.id, processedKey);

  res.json({
    image: {
      ...publicImage(updated),
      format: result.format,
      width: result.width,
      height: result.height,
    },
  });
}
