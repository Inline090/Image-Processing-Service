import {
  CreateQueueCommand,
  DeleteMessageCommand,
  GetQueueUrlCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
  SetQueueAttributesCommand,
  SQSClient,
} from '@aws-sdk/client-sqs';
import { config } from '../config.js';
import type { TransformInput } from '../schemas/transform.schema.js';

export const sqs = new SQSClient({
  region: config.awsRegion,
  ...(config.sqsEndpoint === '' ? {} : { endpoint: config.sqsEndpoint }),
});

const QUEUE_NAME = 'transformations';
const VISIBILITY_TIMEOUT_SECONDS = 300;
const WAIT_TIME_SECONDS = 20;

export type TransformJobMessage = {
  jobId: string;
  imageId: string;
  userId: string;
  options: TransformInput;
};

export type ReceivedJob = {
  job: TransformJobMessage;
  receiptHandle: string;
};

let queueReady: Promise<void> | null = null;

async function configureQueue(): Promise<void> {
  const attributes = { VisibilityTimeout: String(VISIBILITY_TIMEOUT_SECONDS) };

  try {
    await sqs.send(new GetQueueUrlCommand({ QueueName: QUEUE_NAME }));
  } catch {
    await sqs.send(new CreateQueueCommand({ QueueName: QUEUE_NAME, Attributes: attributes }));
  }

  await sqs.send(
    new SetQueueAttributesCommand({ QueueUrl: config.sqsQueueUrl, Attributes: attributes }),
  );
}

export function ensureQueue(): Promise<void> {
  queueReady ??= configureQueue();
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

export async function receiveJob(): Promise<ReceivedJob | null> {
  const response = await sqs.send(
    new ReceiveMessageCommand({
      QueueUrl: config.sqsQueueUrl,
      MaxNumberOfMessages: 1,
      WaitTimeSeconds: WAIT_TIME_SECONDS,
    }),
  );

  const message = response.Messages?.[0];

  if (message === undefined || message.Body === undefined || message.ReceiptHandle === undefined) {
    return null;
  }

  return {
    job: JSON.parse(message.Body) as TransformJobMessage,
    receiptHandle: message.ReceiptHandle,
  };
}

export async function deleteJob(receiptHandle: string): Promise<void> {
  await sqs.send(
    new DeleteMessageCommand({ QueueUrl: config.sqsQueueUrl, ReceiptHandle: receiptHandle }),
  );
}
