import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { config } from '../config.js';

export const s3 = new S3Client({
  region: config.awsRegion,
  ...(config.s3Endpoint === '' ? {} : { endpoint: config.s3Endpoint, forcePathStyle: true }),
});

export async function putObject(key: string, body: Buffer, contentType: string): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: config.s3Bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

export async function getObject(key: string): Promise<Buffer> {
  const result = await s3.send(new GetObjectCommand({ Bucket: config.s3Bucket, Key: key }));

  if (result.Body === undefined) {
    throw new Error(`Object has no body: ${key}`);
  }

  return Buffer.from(await result.Body.transformToByteArray());
}
