import { pool } from './db/pool.js';
import { logger } from './logger.js';
import { deleteJob, ensureQueue, MAX_RECEIVE_COUNT, receiveJob } from './queue/sqs.js';
import { failJob, processJob } from './services/transformJob.js';

const POLL_ERROR_BACKOFF_MS = 5000;

let shuttingDown = false;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function pollOnce(): Promise<void> {
  const received = await receiveJob();

  if (received === null) {
    return;
  }

  const { job, receiptHandle } = received;
  const startedAt = Date.now();

  logger.info(
    { jobId: job.jobId, imageId: job.imageId, receiveCount: received.receiveCount },
    'job received',
  );

  if (received.receiveCount >= MAX_RECEIVE_COUNT) {
    logger.warn(
      { jobId: job.jobId, receiveCount: received.receiveCount },
      'last attempt - another failure moves this message to the dead-letter queue',
    );
  }

  try {
    const outcome = await processJob(job);

    // A skipped job still leaves the queue. Either another consumer holds it or it is
    // already done, and leaving it would only hand the same job to somebody else.
    await deleteJob(receiptHandle);

    logger.info(
      { jobId: job.jobId, outcome, durationMs: Date.now() - startedAt },
      outcome === 'skipped' ? 'job skipped' : 'job completed',
    );
  } catch (err) {
    logger.error(
      { err, jobId: job.jobId, durationMs: Date.now() - startedAt },
      'job failed - message left on the queue for retry',
    );
    await failJob(job.jobId, err);
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
  // Logged before anything is contacted, so a worker that never reaches the queue is
  // distinguishable from one that is quietly waiting on it.
  logger.info('worker starting - contacting the queue');

  const queue = await ensureQueue();

  process.on('SIGINT', () => requestShutdown('SIGINT'));
  process.on('SIGTERM', () => requestShutdown('SIGTERM'));

  logger.info({ queue, pid: process.pid }, 'worker started');

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

void main().catch((err: unknown) => {
  // Said plainly rather than left as an unhandled rejection, because the usual cause is
  // a setting rather than a bug: no credentials, or a queue this account cannot reach.
  logger.error({ err }, 'worker could not start');
  process.exit(1);
});
