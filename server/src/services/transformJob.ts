import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { ImageTooLargeError, transformImage } from '../processing/transform.js';
import type { TransformJobMessage } from '../queue/sqs.js';
import { findImageByIdForUser } from '../repositories/images.js';
import { markJobFailed, markJobProcessing, markJobReady } from '../repositories/jobs.js';
import { getObject, putObject } from '../storage/s3.js';
import { announceBatchIfSettled } from './announceBatch.js';

// Only errors this code raises are shown; everything else stays in the log.
export function failureMessage(err: unknown): string {
  if (err instanceof ImageTooLargeError) {
    return err.message;
  }

  return 'This image could not be processed. Please try a different file.';
}

export type ProcessOutcome = 'processed' | 'skipped';

// Runs one job end to end: read the original, transform it, store it, then announce.
export async function processJob(message: TransformJobMessage): Promise<ProcessOutcome> {
  const claimed = await markJobProcessing(message.jobId);

  if (!claimed) {
    logger.info({ jobId: message.jobId }, 'job not claimed - another consumer has it');
    return 'skipped';
  }

  const image = await findImageByIdForUser(message.imageId, message.userId);
  if (image === null) {
    throw new Error(`Image not found: ${message.imageId}`);
  }

  const original = await getObject(image.original_key);
  const result = await transformImage(original, message.options);

  const processedKey = `processed/${image.user_id}/${randomUUID()}`;
  const mimeType = `image/${result.format}`;
  await putObject(processedKey, result.buffer, mimeType);

  await markJobReady(
    message.jobId,
    {
      processedKey,
      format: result.format,
      mimeType,
      width: result.width,
      height: result.height,
    },
    config.cacheTtlDays,
  );

  logger.info(
    {
      jobId: message.jobId,
      bytesIn: original.length,
      bytesOut: result.buffer.length,
      format: result.format,
      width: result.width,
      height: result.height,
    },
    'job output stored',
  );

  await announceBatchIfSettled(message.jobId);

  return 'processed';
}

export async function failJob(jobId: string, err: unknown): Promise<void> {
  await markJobFailed(jobId, failureMessage(err));
  await announceBatchIfSettled(jobId);
}
