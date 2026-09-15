import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { AppError } from '../middleware/error.js';
import { createImage } from '../repositories/images.js';
import { putObject } from '../storage/s3.js';

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

  res.status(201).json({
    image: {
      id: image.id,
      originalKey: image.original_key,
      mimeType: image.mime_type,
      sizeBytes: Number(image.size_bytes),
      status: image.status,
      createdAt: image.created_at,
    },
  });
}
