import { randomUUID } from 'node:crypto';
import { DeleteMessageCommand, ReceiveMessageCommand } from '@aws-sdk/client-sqs';
import { config } from './config.js';
import { pool } from './db/pool.js';
import { logger } from './logger.js';
import { transformImage } from './processing/transform.js';
import { ensureQueue, sqs, type TransformJobMessage } from './queue/sqs.js';
import { findImageByIdForUser } from './repositories/images.js';
import { markJobFailed, markJobProcessing, markJobReady } from './repositories/jobs.js';
import { getObject, putObject } from './storage/s3.js';

const IDLE_DELAY_MS = 1000;

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

async function pollOnce(): Promise<boolean> {
  const response = await sqs.send(
    new ReceiveMessageCommand({ QueueUrl: config.sqsQueueUrl, MaxNumberOfMessages: 1 }),
  );

  const message = response.Messages?.[0];
  if (message === undefined || message.Body === undefined) {
    return false;
  }

  const job = JSON.parse(message.Body) as TransformJobMessage;
  const startedAt = Date.now();

  logger.info({ jobId: job.jobId, imageId: job.imageId }, 'job received');

  try {
    await processJob(job);

    await sqs.send(
      new DeleteMessageCommand({
        QueueUrl: config.sqsQueueUrl,
        ReceiptHandle: message.ReceiptHandle,
      }),
    );

    logger.info({ jobId: job.jobId, durationMs: Date.now() - startedAt }, 'job completed');
  } catch (err) {
    logger.error(
      { err, jobId: job.jobId, durationMs: Date.now() - startedAt },
      'job failed - message left on the queue for retry',
    );
    await markJobFailed(job.jobId, err instanceof Error ? err.message : 'Unknown error');
  }

  return true;
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
    const worked = await pollOnce().catch((err: unknown) => {
      logger.error({ err }, 'poll failed');
      return false;
    });

    if (!worked && !shuttingDown) {
      await sleep(IDLE_DELAY_MS);
    }
  }

  await pool.end();
  logger.info('worker stopped');
}

void main();
