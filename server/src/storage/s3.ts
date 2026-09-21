import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config.js';
import { contentDisposition } from './filename.js';

// Path style against the local emulator, virtual host against real S3.
export const s3 = new S3Client({
  region: config.awsRegion,
  endpoint: config.s3Endpoint,
  forcePathStyle: config.s3Endpoint !== undefined,
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

export async function deleteObject(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: config.s3Bucket, Key: key }));
}

export function signedUrl(key: string, expiresInSeconds = 900): Promise<string> {
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: config.s3Bucket, Key: key }), {
    expiresIn: expiresInSeconds,
  });
}

export function signedDownloadUrl(
  key: string,
  filename: string,
  expiresInSeconds = 900,
): Promise<string> {
  return getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: config.s3Bucket,
      Key: key,
      ResponseContentDisposition: contentDisposition(filename),
    }),
    { expiresIn: expiresInSeconds },
  );
}
