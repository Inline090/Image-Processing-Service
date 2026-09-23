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
  findImageByIdForUser,
  findImagesByIdsForUser,
  isResultShared,
  linkImageToResult,
  listImagesForUser,
} from '../repositories/images.js';
import { createJob, findLiveJob, findReadyJob } from '../repositories/jobs.js';
import { multerFiles } from '../middleware/upload.js';
import { refundGuestUploads } from '../repositories/guestUsage.js';
import { findUserById, recordGuestUpload } from '../repositories/users.js';
import type { BulkTransformInput } from '../schemas/bulk.schema.js';
import { downloadQuerySchema, listImagesQuerySchema } from '../schemas/image.schema.js';
import type { TransformInput } from '../schemas/transform.schema.js';
import { claimGuestUploads, guestUploadsLeft } from '../services/guestAllowance.js';
import { contentDigest } from '../storage/digest.js';
import { downloadFilename } from '../storage/filename.js';
import { deleteObject, putObject, signedDownloadUrl, signedUrl } from '../storage/s3.js';
import { guestKey } from '../middleware/guestSession.js';

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

// A cached job may have been stored for an earlier upload of the same picture, so the image
// asking for it is pointed at the object that already exists.
async function attachCachedResult(image: ImageRow, job: JobRow): Promise<void> {
  if (job.processed_key === null || image.processed_key === job.processed_key) {
    return;
  }

  const mimeType = job.format === null ? image.mime_type : `image/${job.format}`;

  await linkImageToResult(image.id, job.processed_key, mimeType);
}

export async function uploadImage(req: Request, res: Response): Promise<void> {
  const authUser = req.user;
  if (authUser === undefined) {
    throw new AppError('Not authenticated', 401);
  }

  const file = req.file;
  if (file === undefined) {
    throw new AppError('No file uploaded. Expected a form field named "image".', 400);
  }

  const user = await findUserById(authUser.sub);
  if (user === null) {
    throw new AppError('User no longer exists', 404);
  }

  const usageKey = guestKey(req);
  const room = config.historyLimit - (await countHistoryForUser(authUser.sub));

  if (room < 1) {
    throw new AppError('Your history is full. Delete an image to make room.', 403);
  }

  const claimed = await claimGuestUploads(user, usageKey, 1);

  if (claimed === 0) {
    throw new AppError(
      `Guest accounts can upload ${config.guestUploadLimit} images in total. Sign in to upload more.`,
      403,
    );
  }

  try {
    const key = `originals/${authUser.sub}/${randomUUID()}`;
    await putObject(key, file.buffer, file.mimetype);

    const image = await createImage({
      userId: authUser.sub,
      originalKey: key,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      originalFilename: file.originalname,
      contentHash: contentDigest(file.buffer),
    });

    if (user.is_guest) {
      await recordGuestUpload(authUser.sub);
    }

    res.status(201).json({ image: await serializeImage(image) });
  } catch (err) {
    await refundGuestUploads(usageKey, claimed);
    throw err;
  }
}

export async function uploadImages(req: Request, res: Response): Promise<void> {
  const authUser = req.user;
  if (authUser === undefined) {
    throw new AppError('Not authenticated', 401);
  }

  const files = multerFiles(req);
  if (files.length === 0) {
    throw new AppError('No files uploaded. Expected a form field named "images".', 400);
  }

  const user = await findUserById(authUser.sub);
  if (user === null) {
    throw new AppError('User no longer exists', 404);
  }

  const room = config.historyLimit - (await countHistoryForUser(authUser.sub));

  if (files.length > room) {
    throw new AppError(
      room === 0
        ? 'Your history is full. Delete an image to make room.'
        : `Your history has room for ${room} more images.`,
      403,
    );
  }

  const usageKey = guestKey(req);
  const left = await guestUploadsLeft(user, usageKey);

  const claimed = await claimGuestUploads(
    user,
    usageKey,
    user.is_guest ? Math.min(files.length, left) : files.length,
  );
  const accepted = files.slice(0, claimed);
  const dropped = files.length - accepted.length;

  if (accepted.length === 0) {
    throw new AppError(
      `Guest accounts can upload ${config.guestUploadLimit} images in total. Sign in to upload more.`,
      403,
    );
  }

  const created: ImageRow[] = [];

  try {
    for (const file of accepted) {
      const key = `originals/${authUser.sub}/${randomUUID()}`;
      await putObject(key, file.buffer, file.mimetype);

      const image = await createImage({
        userId: authUser.sub,
        originalKey: key,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        originalFilename: file.originalname,
        contentHash: contentDigest(file.buffer),
      });

      created.push(image);
    }
  } catch (err) {
    await refundGuestUploads(usageKey, claimed);
    throw err;
  }

  if (user.is_guest) {
    await Promise.all([
      recordGuestUpload(authUser.sub, created.length),
      refundGuestUploads(usageKey, claimed - created.length),
    ]);
  }

  res.status(201).json({
    images: await Promise.all(created.map(serializeImage)),
    dropped,
  });
}

function serializeJob(job: JobRow) {
  return {
    id: job.id,
    imageId: job.image_id,
    status: job.status,
    attempts: job.attempts,
    error: job.error,
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
  const optionsHash = hashTransformOptions(image.content_hash ?? image.id, options);
  const existing = await findReadyJob(authUser.sub, optionsHash);

  if (existing !== null) {
    await attachCachedResult(image, existing);

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

  const created = await createJob({
    imageId: image.id,
    userId: authUser.sub,
    options,
    optionsHash,
  });

  if (created === null) {
    const inFlight = await findLiveJob(authUser.sub, optionsHash);

    if (inFlight === null) {
      throw new AppError('Could not queue the transform', 500);
    }

    res.json({
      job: {
        ...serializeJob(inFlight),
        processedUrl:
          inFlight.processed_key === null ? null : await signedUrl(inFlight.processed_key),
      },
      cached: inFlight.status === 'ready',
    });
    return;
  }

  await publishTransformJob({
    jobId: created.id,
    imageId: image.id,
    userId: authUser.sub,
    options,
  });

  res.status(202).json({
    job: { ...serializeJob(created), processedUrl: null },
    cached: false,
  });
}

export async function transformBulk(req: Request, res: Response): Promise<void> {
  const authUser = req.user;
  if (authUser === undefined) {
    throw new AppError('Not authenticated', 401);
  }

  const { imageIds, options } = req.body as BulkTransformInput;

  const owned = await findImagesByIdsForUser(imageIds, authUser.sub);

  if (owned.length !== imageIds.length) {
    throw new AppError('One or more of those images were not found', 404);
  }

  const batchId = randomUUID();
  const queued: JobRow[] = [];
  let alreadyDone = 0;

  for (const image of owned) {
    const optionsHash = hashTransformOptions(image.content_hash ?? image.id, options);
    const ready = await findReadyJob(authUser.sub, optionsHash);

    if (ready !== null) {
      await attachCachedResult(image, ready);
      alreadyDone += 1;
      continue;
    }

    const job = await createJob({
      imageId: image.id,
      userId: authUser.sub,
      options,
      optionsHash,
      batchId,
    });

    if (job === null) {
      alreadyDone += 1;
      continue;
    }

    await publishTransformJob({
      jobId: job.id,
      imageId: image.id,
      userId: authUser.sub,
      options,
    });

    queued.push(job);
  }

  res.status(202).json({
    batchId,
    queued: queued.length,
    alreadyDone,
    jobs: queued.map(serializeJob),
  });
}

export async function list(req: Request, res: Response): Promise<void> {
  const authUser = req.user;
  if (authUser === undefined) {
    throw new AppError('Not authenticated', 401);
  }

  const parsed = listImagesQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    throw new AppError(`Invalid query parameters. ${formatIssues(parsed.error)}`, 400);
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
    throw new AppError(`Invalid query parameters. ${formatIssues(parsed.error)}`, 400);
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

async function discardObjects(images: ImageRow[]): Promise<void> {
  const keys: string[] = [];

  for (const image of images) {
    keys.push(image.original_key);

    if (image.processed_key === null) {
      continue;
    }

    // One picture uploaded twice shares a result, so the object may still be in use.
    if (await isResultShared(image.processed_key, image.id)) {
      continue;
    }

    keys.push(image.processed_key);
  }

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
