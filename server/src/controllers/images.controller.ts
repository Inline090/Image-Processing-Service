import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import type { ImageRow, JobRow } from '../db/types.js';
import { AppError } from '../middleware/error.js';
import { formatIssues } from '../middleware/validate.js';
import { hashTransformOptions } from '../processing/optionsHash.js';
import { publishTransformJob } from '../queue/sqs.js';
import {
  countImagesForUser,
  createImage,
  findImageByIdForUser,
  listImagesForUser,
} from '../repositories/images.js';
import { createJob, findReadyJob } from '../repositories/jobs.js';
import { listImagesQuerySchema } from '../schemas/image.schema.js';
import type { TransformInput } from '../schemas/transform.schema.js';
import { putObject, signedUrl } from '../storage/s3.js';

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

function serializeJob(job: JobRow) {
  return {
    id: job.id,
    imageId: job.image_id,
    status: job.status,
    attempts: job.attempts,
    error: job.error,
    processedKey: job.processed_key,
    format: job.format,
    width: job.width,
    height: job.height,
    createdAt: job.created_at,
    updatedAt: job.updated_at,
  };
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

  const image = await findImageByIdForUser(imageId, authUser.sub);
  if (image === null) {
    throw new AppError('Image not found', 404);
  }

  const options = req.body as TransformInput;
  const optionsHash = hashTransformOptions(image.id, options);
  const existing = await findReadyJob(image.id, optionsHash);

  if (existing !== null) {
    res.json({
      job: {
        ...serializeJob(existing),
        processedUrl:
          existing.processed_key === null ? null : await signedUrl(existing.processed_key),
      },
      cached: true,
    });
    return;
  }

  const job = await createJob({ imageId: image.id, userId: authUser.sub, options, optionsHash });
  await publishTransformJob({ jobId: job.id, imageId: image.id, userId: authUser.sub, options });

  res.status(202).json({
    job: { ...serializeJob(job), processedUrl: null },
    cached: false,
  });
}


export async function list(req: Request, res: Response): Promise<void> {
  const authUser = req.user;
  if (authUser === undefined) {
    throw new AppError('Not authenticated', 401);
  }

  const parsed = listImagesQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    throw new AppError(`Invalid query parameters - ${formatIssues(parsed.error)}`, 400);
  }

  const { page, limit } = parsed.data;
  const offset = (page - 1) * limit;

  const [total, rows] = await Promise.all([
    countImagesForUser(authUser.sub),
    listImagesForUser(authUser.sub, limit, offset),
  ]);

  res.json({
    images: await Promise.all(rows.map((row) => serializeImage(row))),
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  });
}

export async function getImage(req: Request, res: Response): Promise<void> {
  const authUser = req.user;
  if (authUser === undefined) {
    throw new AppError('Not authenticated', 401);
  }

  const imageId = req.params.id;
  if (typeof imageId !== 'string') {
    throw new AppError('Image id is required', 400);
  }

  const image = await findImageByIdForUser(imageId, authUser.sub);
  if (image === null) {
    throw new AppError('Image not found', 404);
  }

  res.json({ image: await serializeImage(image) });
}
