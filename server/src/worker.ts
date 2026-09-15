import { randomUUID } from 'node:crypto';
import { DeleteMessageCommand, ReceiveMessageCommand } from '@aws-sdk/client-sqs';
import { config } from './config.js';
import { logger } from './logger.js';
import { transformImage } from './processing/transform.js';
import { ensureQueue, sqs, type TransformJobMessage } from './queue/sqs.js';
import { findImageByIdForUser } from './repositories/images.js';
import { markJobFailed, markJobProcessing, markJobReady } from './repositories/jobs.js';
import { getObject, putObject } from './storage/s3.js';

const IDLE_DELAY_MS = 1000;

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

  await sqs.send(
    new DeleteMessageCommand({ QueueUrl: config.sqsQueueUrl, ReceiptHandle: message.ReceiptHandle }),
  );

  try {
    await processJob(job);
    logger.info({ jobId: job.jobId }, 'job processed');
  } catch (err) {
    logger.error({ err, jobId: job.jobId }, 'job failed');
    await markJobFailed(job.jobId, err instanceof Error ? err.message : 'Unknown error');
  }

  return true;
}

async function main(): Promise<void> {
  await ensureQueue();
  logger.info({ queue: config.sqsQueueUrl }, 'worker started');

  for (;;) {
    const worked = await pollOnce().catch((err: unknown) => {
      logger.error({ err }, 'poll failed');
      return false;
    });

    if (!worked) {
      await sleep(IDLE_DELAY_MS);
    }
  }
}

void main();
