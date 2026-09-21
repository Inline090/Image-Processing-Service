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
  endpoint: config.sqsEndpoint,
});

const QUEUE_NAME = 'transformations';
const DEAD_LETTER_QUEUE_NAME = 'transformations-dlq';
// Long polling: an idle worker waits here instead of asking every second.
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

let queueReady: Promise<string> | null = null;

async function queueUrl(name: string): Promise<string> {
  const found = await sqs.send(new GetQueueUrlCommand({ QueueName: name })).catch(() => null);

  if (found?.QueueUrl !== undefined) {
    return found.QueueUrl;
  }

  try {
    const created = await sqs.send(new CreateQueueCommand({ QueueName: name }));

    if (created.QueueUrl === undefined) {
      throw new Error(`Could not create queue: ${name}`);
    }

    return created.QueueUrl;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);

    throw new Error(
      `Queue "${name}" does not exist and could not be created (${reason}). ` +
        'Create it before starting the app, or grant sqs:CreateQueue to this user.',
    );
  }
}

async function queueArn(url: string): Promise<string> {
  const { Attributes } = await sqs.send(
    new GetQueueAttributesCommand({ QueueUrl: url, AttributeNames: ['QueueArn'] }),
  );

  const arn = Attributes?.QueueArn;

  if (arn === undefined) {
    throw new Error(`Queue has no ARN: ${url}`);
  }

  return arn;
}

async function configureQueue(): Promise<string> {
  const deadLetterUrl = await queueUrl(DEAD_LETTER_QUEUE_NAME);
  const deadLetterArn = await queueArn(deadLetterUrl);

  // Set on every start, so a queue left with the old defaults gets corrected.
  const mainUrl = await queueUrl(QUEUE_NAME);

  await sqs.send(
    new SetQueueAttributesCommand({
      QueueUrl: mainUrl,
      Attributes: {
        VisibilityTimeout: String(config.sqsVisibilityTimeout),
        RedrivePolicy: JSON.stringify({
          deadLetterTargetArn: deadLetterArn,
          maxReceiveCount: String(MAX_RECEIVE_COUNT),
        }),
      },
    }),
  );

  return mainUrl;
}

export function ensureQueue(): Promise<string> {
  queueReady ??= configureQueue();
  return queueReady;
}

export async function publishTransformJob(message: TransformJobMessage): Promise<void> {
  const url = await ensureQueue();

  await sqs.send(new SendMessageCommand({ QueueUrl: url, MessageBody: JSON.stringify(message) }));
}

export async function receiveJob(): Promise<ReceivedJob | null> {
  const url = await ensureQueue();

  const response = await sqs.send(
    new ReceiveMessageCommand({
      QueueUrl: url,
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
  const url = await ensureQueue();

  await sqs.send(new DeleteMessageCommand({ QueueUrl: url, ReceiptHandle: receiptHandle }));
}
