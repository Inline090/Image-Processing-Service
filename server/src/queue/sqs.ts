import {
  CreateQueueCommand,
  DeleteMessageCommand,
  GetQueueAttributesCommand,
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
const DEAD_LETTER_QUEUE_NAME = 'transformations-dlq';
const WAIT_TIME_SECONDS = 20;

export const MAX_RECEIVE_COUNT = 3;

export type TransformJobMessage = {
  jobId: string;
  imageId: string;
  userId: string;
  options: TransformInput;
};

export type ReceivedJob = {
  job: TransformJobMessage;
  receiptHandle: string;
  receiveCount: number;
};

let queueReady: Promise<void> | null = null;

async function resolveQueueUrl(name: string): Promise<string> {
  try {
    const found = await sqs.send(new GetQueueUrlCommand({ QueueName: name }));

    if (found.QueueUrl !== undefined) {
      return found.QueueUrl;
    }
  } catch {
    // not created yet
  }

  const created = await sqs.send(new CreateQueueCommand({ QueueName: name }));

  if (created.QueueUrl === undefined) {
    throw new Error(`Could not create queue: ${name}`);
  }

  return created.QueueUrl;
}

async function queueArn(queueUrl: string): Promise<string> {
  const { Attributes } = await sqs.send(
    new GetQueueAttributesCommand({ QueueUrl: queueUrl, AttributeNames: ['QueueArn'] }),
  );

  const arn = Attributes?.QueueArn;

  if (arn === undefined) {
    throw new Error(`Queue has no ARN: ${queueUrl}`);
  }

  return arn;
}

async function configureQueue(): Promise<void> {
  const deadLetterUrl = await resolveQueueUrl(DEAD_LETTER_QUEUE_NAME);
  const deadLetterArn = await queueArn(deadLetterUrl);

  await resolveQueueUrl(QUEUE_NAME);

  await sqs.send(
    new SetQueueAttributesCommand({
      QueueUrl: config.sqsQueueUrl,
      Attributes: {
        VisibilityTimeout: String(config.sqsVisibilityTimeout),
        RedrivePolicy: JSON.stringify({
          deadLetterTargetArn: deadLetterArn,
          maxReceiveCount: String(MAX_RECEIVE_COUNT),
        }),
      },
    }),
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
      MessageSystemAttributeNames: ['ApproximateReceiveCount'],
    }),
  );

  const message = response.Messages?.[0];

  if (message === undefined || message.Body === undefined || message.ReceiptHandle === undefined) {
    return null;
  }

  return {
    job: JSON.parse(message.Body) as TransformJobMessage,
    receiptHandle: message.ReceiptHandle,
    receiveCount: Number(message.Attributes?.ApproximateReceiveCount ?? '1'),
  };
}

export async function deleteJob(receiptHandle: string): Promise<void> {
  await sqs.send(
    new DeleteMessageCommand({ QueueUrl: config.sqsQueueUrl, ReceiptHandle: receiptHandle }),
  );
}
