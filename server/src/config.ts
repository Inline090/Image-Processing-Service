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

function readInt(name: string, fallback: number, min: number): number {
  const raw = optional(name, String(fallback));
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min) {
    throw new Error(`Invalid ${name}: "${raw}" (expected an integer of at least ${min})`);
  }
  return value;
}

// Express accepts either a hop count or a list of addresses here, and a count must
// be a number rather than the string "2", so the digits are converted.
function readTrustProxy(): string | number | undefined {
  const raw = optional('TRUST_PROXY', '');
  if (raw === '') {
    return undefined;
  }

  const hops = Number(raw);

  return Number.isInteger(hops) && hops >= 1 ? hops : raw;
}

function optionalUrl(name: string): string | undefined {
  const value = optional(name, '');

  return value === '' ? undefined : value;
}

const googleClientId = optional('GOOGLE_CLIENT_ID', '');
const googleClientSecret = optional('GOOGLE_CLIENT_SECRET', '');
const facebookAppId = optional('FACEBOOK_APP_ID', '');
const facebookAppSecret = optional('FACEBOOK_APP_SECRET', '');
const twitterClientId = optional('TWITTER_CLIENT_ID', '');
const twitterClientSecret = optional('TWITTER_CLIENT_SECRET', '');

export const config = {
  env: optional('NODE_ENV', 'development'),
  logLevel: optional('LOG_LEVEL', 'info'),
  port: readPort('PORT', 3000),
  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: optional('JWT_EXPIRES_IN', '1h'),
  databaseUrl: optional('DATABASE_URL', 'postgres://ips:ips@localhost:5432/image_processing'),
  poolMax: readInt('DATABASE_POOL_MAX', 10, 1),
  awsRegion: optional('AWS_REGION', 'us-east-1'),
  s3Bucket: optional('S3_BUCKET', 'image-processing-originals'),
  s3Endpoint: optionalUrl('S3_ENDPOINT'),
  sqsEndpoint: optionalUrl('SQS_ENDPOINT'),
  sqsVisibilityTimeout: readInt('SQS_VISIBILITY_TIMEOUT', 300, 1),
  maxInputPixels: readInt('MAX_INPUT_PIXELS', 50_000_000, 1),
  guestUploadLimit: readInt('GUEST_UPLOAD_LIMIT', 5, 1),
  historyLimit: readInt('HISTORY_LIMIT', 12, 1),
  corsOrigins: optional('CORS_ORIGINS', '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin !== ''),
  trustProxy: readTrustProxy(),
  oauthCallbackBase: optional('OAUTH_CALLBACK_BASE', 'http://localhost:3000/api/auth'),
  googleClientId,
  googleClientSecret,
  facebookAppId,
  facebookAppSecret,
  twitterClientId,
  twitterClientSecret,
  // Where the browser is sent after the round trip. Always this configured address,
  // never one taken from the request, or the callback would be an open redirect.
  clientUrl: optional('CLIENT_URL', 'http://localhost:5173'),
} as const;

/**
 * The most images one bulk request may carry.
 *
 * Bounded so a single request cannot queue a large amount of work at once, and so the
 * bulk limiter can be measured in the same unit as the single-image one: three batches
 * of ten is the same thirty images per window that the transform route allows.
 */
export const MAX_BULK_IMAGES = 10;
