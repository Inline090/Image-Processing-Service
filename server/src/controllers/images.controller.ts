import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { config } from '../config.js';
import type { ImageRow, JobRow } from '../db/types.js';
import { logger } from '../logger.js';
import { AppError } from '../middleware/error.js';
import { formatIssues } from '../middleware/validate.js';
import { hashTransformOptions } from '../processing/optionsHash.js';
import { publishTransformJob } from '../queue/sqs.js';
import {
  countHistoryForUser,
  createImage,
  deleteAllImagesForUser,
  deleteImageForUser,
  deleteSettledEphemeralForUser,
  findImageByIdForUser,
  listImagesForUser,
} from '../repositories/images.js';
import { createJob, findReadyJob } from '../repositories/jobs.js';
import { findUserById, recordGuestUpload } from '../repositories/users.js';
import { downloadQuerySchema, listImagesQuerySchema } from '../schemas/image.schema.js';
import type { TransformInput } from '../schemas/transform.schema.js';
import { downloadFilename } from '../storage/filename.js';
import { deleteObject, putObject, signedDownloadUrl, signedUrl } from '../storage/s3.js';

async function serializeImage(image: ImageRow) {
  return {
    id: image.id,
    mimeType: image.mime_type,
    sizeBytes: Number(image.size_bytes),
    status: image.status,
    createdAt: image.created_at,
    originalUrl: await signedUrl(image.original_key),
    processedUrl: image.processed_key === null ? null : await signedUrl(image.processed_key),
    /** True when the history was full, so this one is not kept. */
    ephemeral: image.ephemeral,
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

  // Checked before the object is written, so a refused upload leaves nothing in
  // storage to clean up. Registered accounts are not capped. The counter is
  // spent, not the live image count, so clearing the history does not refund
  // quota - a guest gets these uploads once, ever.
  const user = await findUserById(authUser.sub);
  if (user === null) {
    throw new AppError('User no longer exists', 404);
  }

  if (user.is_guest && user.guest_upload_count >= config.guestUploadLimit) {
    throw new AppError(
      `Guest accounts can upload ${config.guestUploadLimit} images in total. Create an account to keep uploading.`,
      403,
    );
  }

  // A full history does not refuse the upload: the transform still runs and its
  // result is still downloadable, it just is not kept. The row is marked instead,
  // so the cap bounds stored files without ever blocking the tool.
  const historySize = await countHistoryForUser(authUser.sub);
  const ephemeral = historySize >= config.historyLimit;

  const key = `originals/${authUser.sub}/${randomUUID()}`;
  await putObject(key, file.buffer, file.mimetype);

  const image = await createImage({
    userId: authUser.sub,
    originalKey: key,
    mimeType: file.mimetype,
    sizeBytes: file.size,
    originalFilename: file.originalname,
    ephemeral,
  });

  // The scratch slot holds one image, so the one it replaced can go now - both
  // its row and the objects it points at. Done after the new row exists, so an
  // upload that fails earlier leaves the previous scratch intact.
  if (ephemeral) {
    await discardObjects(await deleteSettledEphemeralForUser(authUser.sub, image.id));
  }

  // Charged only once the upload has actually landed, so a failed write does not
  // cost the guest an image.
  if (user.is_guest) {
    await recordGuestUpload(authUser.sub);
  }

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
    countHistoryForUser(authUser.sub),
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

export async function downloadImage(req: Request, res: Response): Promise<void> {
  const authUser = req.user;
  if (authUser === undefined) {
    throw new AppError('Not authenticated', 401);
  }

  const imageId = req.params.id;
  if (typeof imageId !== 'string') {
    throw new AppError('Image id is required', 400);
  }

  const parsed = downloadQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    throw new AppError(`Invalid query parameters - ${formatIssues(parsed.error)}`, 400);
  }

  const image = await findImageByIdForUser(imageId, authUser.sub);
  if (image === null) {
    throw new AppError('Image not found', 404);
  }

  const processed = parsed.data.variant === 'processed';
  const key = processed ? image.processed_key : image.original_key;

  if (key === null) {
    throw new AppError('This image has no processed result yet', 404);
  }

  const mimeType = processed ? (image.processed_mime_type ?? image.mime_type) : image.mime_type;
  const filename = downloadFilename(image.original_filename, image.id, mimeType);

  res.json({ download: { url: await signedDownloadUrl(key, filename), filename } });
}

// The rows are already gone by this point, so a storage failure is logged rather
// than surfaced: failing the request would only leave objects the user can no
// longer see or reach.
async function discardObjects(images: ImageRow[]): Promise<void> {
  const keys = images.flatMap((image) =>
    image.processed_key === null ? [image.original_key] : [image.original_key, image.processed_key],
  );

  await Promise.all(
    keys.map((key) =>
      deleteObject(key).catch((err: unknown) => {
        logger.warn({ err, key }, 'could not delete the stored object');
      }),
    ),
  );
}

export async function removeImage(req: Request, res: Response): Promise<void> {
  const authUser = req.user;
  if (authUser === undefined) {
    throw new AppError('Not authenticated', 401);
  }

  const imageId = req.params.id;
  if (typeof imageId !== 'string') {
    throw new AppError('Image id is required', 400);
  }

  const image = await deleteImageForUser(imageId, authUser.sub);
  if (image === null) {
    throw new AppError('Image not found', 404);
  }

  await discardObjects([image]);

  res.json({ deleted: 1 });
}

export async function clearImages(req: Request, res: Response): Promise<void> {
  const authUser = req.user;
  if (authUser === undefined) {
    throw new AppError('Not authenticated', 401);
  }

  const images = await deleteAllImagesForUser(authUser.sub);
  await discardObjects(images);

  res.json({ deleted: images.length });
}
