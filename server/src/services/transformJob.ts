import { randomUUID } from 'node:crypto';
import { logger } from '../logger.js';
import { ImageTooLargeError, transformImage } from '../processing/transform.js';
import type { TransformJobMessage } from '../queue/sqs.js';
import { findImageByIdForUser } from '../repositories/images.js';
import { markJobFailed, markJobProcessing, markJobReady } from '../repositories/jobs.js';
import { getObject, putObject } from '../storage/s3.js';

/**
 * What gets stored on the job, and therefore shown in the UI. Only errors this
 * code raises itself are passed through: anything else - a storage failure, an SDK
 * error - can name buckets, keys and regions, so the caller gets plain words and
 * the full detail stays in the log.
 */
export function failureMessage(err: unknown): string {
  if (err instanceof ImageTooLargeError) {
    return err.message;
  }

  return 'This image could not be processed. Please try a different file.';
}

/**
 * Runs one transform end to end: read the original, process it, and store the result.
 *
 * It throws on failure rather than deciding what that means, because the two things
 * that consume the queue retry differently - the poll loop in worker.ts on a
 * long-lived host, and the queue's own redrive policy when the worker runs on Lambda.
 */
export async function processJob(message: TransformJobMessage): Promise<void> {
  await markJobProcessing(message.jobId);

  const image = await findImageByIdForUser(message.imageId, message.userId);
  if (image === null) {
    throw new Error(`Image not found: ${message.imageId}`);
  }

  const original = await getObject(image.original_key);
  const result = await transformImage(original, message.options);

  const processedKey = `processed/${image.user_id}/${randomUUID()}`;
  const mimeType = `image/${result.format}`;
  await putObject(processedKey, result.buffer, mimeType);

  await markJobReady(message.jobId, {
    processedKey,
    format: result.format,
    mimeType,
    width: result.width,
    height: result.height,
  });

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
}

/**
 * Records a failure against the job so the UI can stop waiting on it. The message is
 * always a plain sentence, never the raw error - see failureMessage.
 */
export async function failJob(jobId: string, err: unknown): Promise<void> {
  await markJobFailed(jobId, failureMessage(err));
}
