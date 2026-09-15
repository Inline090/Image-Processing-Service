import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined || value.trim() === '' ? fallback : value;
}

function readPort(name: string, fallback: number): number {
  const raw = optional(name, String(fallback));
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid ${name}: "${raw}" (expected an integer between 1 and 65535)`);
  }
  return port;
}

// Parsed once, at boot: anything downstream can trust these values.
export const config = {
  env: optional('NODE_ENV', 'development'),
  logLevel: optional('LOG_LEVEL', 'info'),
  port: readPort('PORT', 3000),
  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: optional('JWT_EXPIRES_IN', '1h'),
  databaseUrl: optional('DATABASE_URL', 'postgres://ips:ips@localhost:5432/image_processing'),
  awsRegion: optional('AWS_REGION', 'us-east-1'),
  s3Bucket: optional('S3_BUCKET', 'image-processing-originals'),
  s3Endpoint: optional('S3_ENDPOINT', ''),
  sqsQueueUrl: optional('SQS_QUEUE_URL', 'http://localhost:9324/000000000000/transformations'),
} as const;
