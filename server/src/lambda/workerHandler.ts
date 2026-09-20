import type { SQSBatchResponse, SQSEvent } from 'aws-lambda';
import { logger } from '../logger.js';
import type { TransformJobMessage } from '../queue/sqs.js';
import { failJob, processJob } from '../services/transformJob.js';

/**
 * The queue's consumer when the worker runs on Lambda.
 *
 * The queue triggers this with one batch of messages, and Lambda deletes whatever is
 * not named in the response: anything reported in batchItemFailures is left on the
 * queue and retried under its redrive policy, which is the same three-attempts-then-
 * dead-letter rule the poll loop in worker.ts applies itself. Both paths run the shared
 * processJob, so a job behaves the same wherever the worker happens to run.
 *
 * Nothing here creates clients or ends the pool: Lambda reuses a warm process across
 * invocations, so shutting the pool down at the end of one would undo that reuse.
 */
export async function handler(event: SQSEvent): Promise<SQSBatchResponse> {
  const batchItemFailures: SQSBatchResponse['batchItemFailures'] = [];

  for (const record of event.Records) {
    const startedAt = Date.now();

    let message: TransformJobMessage;
    try {
      message = JSON.parse(record.body) as TransformJobMessage;
    } catch (err) {
      // There is no jobId to record a failure against, but the message is still
      // reported so the queue counts the attempt and eventually dead-letters it
      // rather than delivering the same unreadable body forever.
      logger.error(
        { err, messageId: record.messageId },
        'job failed - the message body is not readable',
      );
      batchItemFailures.push({ itemIdentifier: record.messageId });
      continue;
    }

    try {
      const outcome = await processJob(message);

      // Not naming it in batchItemFailures is what tells Lambda to delete the message.
      // A skipped job has been dealt with, so reporting it as a failure would only
      // deliver it again.
      logger.info(
        {
          jobId: message.jobId,
          messageId: record.messageId,
          outcome,
          durationMs: Date.now() - startedAt,
        },
        outcome === 'skipped' ? 'job skipped' : 'job completed',
      );
    } catch (err) {
      logger.error(
        {
          err,
          jobId: message.jobId,
          messageId: record.messageId,
          durationMs: Date.now() - startedAt,
        },
        'job failed - message left on the queue for retry',
      );
      await failJob(message.jobId, err);

      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  return { batchItemFailures };
}
