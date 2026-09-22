import type { SQSBatchResponse, SQSEvent } from 'aws-lambda';
import { logger } from '../logger.js';
import type { TransformJobMessage } from '../queue/sqs.js';
import { failJob, processJob } from '../services/transformJob.js';

// Reports failures so the queue retries them; anything unlisted is deleted.
export async function handler(event: SQSEvent): Promise<SQSBatchResponse> {
  const batchItemFailures: SQSBatchResponse['batchItemFailures'] = [];

  for (const record of event.Records) {
    const startedAt = Date.now();

    let message: TransformJobMessage;
    try {
      message = JSON.parse(record.body) as TransformJobMessage;
    } catch (err) {
      logger.error(
        { err, messageId: record.messageId },
        'job failed - the message body is not readable',
      );
      batchItemFailures.push({ itemIdentifier: record.messageId });
      continue;
    }

    try {
      const outcome = await processJob(message);

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
