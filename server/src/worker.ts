import { randomUUID } from 'node:crypto';
import { config } from './config.js';
import { pool } from './db/pool.js';
import { logger } from './logger.js';
import { transformImage } from './processing/transform.js';
import { deleteJob, ensureQueue, receiveJob, type TransformJobMessage } from './queue/sqs.js';
import { findImageByIdForUser } from './repositories/images.js';
import { markJobFailed, markJobProcessing, markJobReady } from './repositories/jobs.js';
import { getObject, putObject } from './storage/s3.js';

const POLL_ERROR_BACKOFF_MS = 5000;

let shuttingDown = false;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function processJob(message: TransformJobMessage): Promise<void> {
  await markJobProcessing(message.jobId);

  const image = await findImageByIdForUser(message.imageId, message.userId);
  if (image === null) {
    throw new Error(`Image not found: ${message.imageId}`);
  }

  const original = await getObject(image.original_key);
  const result = await transformImage(original, message.options);

  const processedKey = `processed/${image.user_id}/${randomUUID()}`;
  await putObject(processedKey, result.buffer, `image/${result.format}`);

  await markJobReady(message.jobId, {
    processedKey,
    format: result.format,
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

async function pollOnce(): Promise<void> {
  const received = await receiveJob();

  if (received === null) {
    return;
  }

  const { job, receiptHandle } = received;
  const startedAt = Date.now();

  logger.info({ jobId: job.jobId, imageId: job.imageId }, 'job received');

  try {
    await processJob(job);

    await deleteJob(receiptHandle);

    logger.info({ jobId: job.jobId, durationMs: Date.now() - startedAt }, 'job completed');
  } catch (err) {
    logger.error(
      { err, jobId: job.jobId, durationMs: Date.now() - startedAt },
      'job failed - message left on the queue for retry',
    );
    await markJobFailed(job.jobId, err instanceof Error ? err.message : 'Unknown error');
  }
}

function requestShutdown(signal: string): void {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  logger.info({ signal }, 'shutdown requested - finishing the job in flight');
}

async function main(): Promise<void> {
  await ensureQueue();

  process.on('SIGINT', () => requestShutdown('SIGINT'));
  process.on('SIGTERM', () => requestShutdown('SIGTERM'));

  logger.info({ queue: config.sqsQueueUrl, pid: process.pid }, 'worker started');

  while (!shuttingDown) {
    try {
      await pollOnce();
    } catch (err) {
      logger.error({ err }, 'poll failed - backing off');
      await sleep(POLL_ERROR_BACKOFF_MS);
    }
  }

  await pool.end();
  logger.info('worker stopped');
}

void main();
