import {
  CreateQueueCommand,
  GetQueueUrlCommand,
  SendMessageCommand,
  SQSClient,
} from '@aws-sdk/client-sqs';
import { config } from '../config.js';
import type { TransformInput } from '../schemas/transform.schema.js';

export const sqs = new SQSClient({
  region: config.awsRegion,
  ...(config.sqsEndpoint === '' ? {} : { endpoint: config.sqsEndpoint }),
});

const QUEUE_NAME = 'transformations';

export type TransformJobMessage = {
  jobId: string;
  imageId: string;
  userId: string;
  options: TransformInput;
};

let queueReady: Promise<void> | null = null;

async function createQueueIfMissing(): Promise<void> {
  try {
    await sqs.send(new GetQueueUrlCommand({ QueueName: QUEUE_NAME }));
  } catch {
    await sqs.send(new CreateQueueCommand({ QueueName: QUEUE_NAME }));
  }
}

export function ensureQueue(): Promise<void> {
  queueReady ??= createQueueIfMissing();
  return queueReady;
}

export async function publishTransformJob(message: TransformJobMessage): Promise<void> {
  await ensureQueue();

  await sqs.send(
    new SendMessageCommand({
      QueueUrl: config.sqsQueueUrl,
      MessageBody: JSON.stringify(message),
    }),
  );
}
