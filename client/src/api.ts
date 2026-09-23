const API_ORIGIN = import.meta.env.VITE_API_URL ?? '';

const BASE = `${API_ORIGIN}/api`;

export type Image = {
  id: string;
  mimeType: string;
  sizeBytes: number;
  status: string;
  createdAt: string;
  originalUrl: string;
  processedUrl: string | null;
};

export type Job = {
  id: string;
  imageId: string;
  status: 'pending' | 'processing' | 'ready' | 'failed';
  progress: number;
  attempts: number;
  error: string | null;
  format: string | null;
  width: number | null;
  height: number | null;
  processedUrl: string | null;
};

export type WatermarkPosition =
  | 'northwest'
  | 'north'
  | 'northeast'
  | 'west'
  | 'center'
  | 'east'
  | 'southwest'
  | 'south'
  | 'southeast';

export type OutputFormat = 'jpeg' | 'png' | 'webp' | 'avif';

export type CropFocus = 'center' | 'attention' | 'entropy';

export type TransformOptions = {
  width?: number;
  height?: number;
  fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
  focus?: CropFocus;
  rotate?: number;
  crop?: { left: number; top: number; width: number; height: number };
  grayscale?: boolean;
  sepia?: boolean;
  format?: OutputFormat;
  watermark?: { text: string; position?: WatermarkPosition };
  modulate?: {
    brightness?: number;
    saturation?: number;
    hue?: number;
    lightness?: number;
  };
  blur?: number;
  sharpen?: boolean | { sigma: number; m1?: number; m2?: number };
  flip?: boolean;
  flop?: boolean;
  trim?: boolean | { background?: string; threshold?: number };
  extend?: {
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
    background?: string;
  };
  background?: string;
  flatten?: boolean;
  quality?: number;
  effort?: number;
};

// The token lives in localStorage and travels as a bearer header.
const TOKEN_KEY = 'ips.token';
let token: string | null = localStorage.getItem(TOKEN_KEY);

let unauthorizedHandler: (() => void) | null = null;

export function hasToken(): boolean {
  return token !== null;
}

export function setToken(value: string | null): void {
  token = value;

  if (value === null) {
    localStorage.removeItem(TOKEN_KEY);
  } else {
    localStorage.setItem(TOKEN_KEY, value);
  }
}

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

let authRedirectMessage: string | null = null;

// Reads the token or the error out of the fragment and wipes it from the address bar.
export function consumeAuthRedirect(): void {
  const hash = window.location.hash.slice(1);
  const separator = hash.indexOf('=');

  if (separator === -1) {
    return;
  }

  const key = hash.slice(0, separator);
  const value = decodeURIComponent(hash.slice(separator + 1));

  window.history.replaceState(null, '', window.location.pathname + window.location.search);

  if (key === 'token') {
    setToken(value);
  } else if (key === 'error') {
    authRedirectMessage = value;
  }
}

export function authRedirectError(): string | null {
  return authRedirectMessage;
}

export function clearAuthRedirectError(): void {
  authRedirectMessage = null;
}

export type SignInProvider = 'google' | 'facebook' | 'twitter';

export function providerSignInUrl(provider: SignInProvider): string {
  return `${BASE}/auth/${provider}`;
}

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

// Adds the token, and signs out on a 401 from anywhere but the auth routes.
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);

  if (token !== null) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let response: Response;

  try {
    response = await fetch(`${BASE}${path}`, { ...init, headers, credentials: 'include' });
  } catch {
    throw new Error('Could not reach the server. Check your connection and try again.');
  }

  if (response.status === 401 && !path.startsWith('/auth/')) {
    setToken(null);
    unauthorizedHandler?.();
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;

    throw new ApiError(body?.error?.message ?? unhelpfulStatus(response.status), response.status);
  }

  return (await response.json()) as T;
}

function unhelpfulStatus(status: number): string {
  return status >= 500
    ? 'The service is having trouble right now. Please try again in a moment.'
    : `That request could not be completed (status ${status}).`;
}

export const MAX_BATCH_IMAGES = 10;

export async function uploadImages(files: File[]): Promise<{ images: Image[] }> {
  const body = new FormData();

  for (const file of files) {
    body.append('images', file);
  }

  return request<{ images: Image[] }>('/images/batch', { method: 'POST', body });
}

export async function transformImage(id: string, options: TransformOptions): Promise<Job> {
  const result = await request<{ job: Job }>(`/images/${id}/transform`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  });

  return result.job;
}

export type ImagePage = {
  images: Image[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export function listImages(page: number, limit: number): Promise<ImagePage> {
  return request<ImagePage>(`/images?page=${page}&limit=${limit}`);
}

export async function getJob(id: string): Promise<Job> {
  const result = await request<{ job: Job }>(`/jobs/${id}`);
  return result.job;
}

export type BatchJob = {
  id: string;
  imageId: string;
  status: Job['status'];
  progress: number;
  attempts: number;
  error: string | null;
  width: number | null;
  height: number | null;
};

export type Batch = {
  batchId: string;
  total: number;
  pending: number;
  processing: number;
  ready: number;
  failed: number;

  settled: boolean;
  jobs: BatchJob[];
};

export type BulkResult = {
  batchId: string;
  queued: number;

  alreadyDone: number;
  jobs: Job[];
};

export function transformBulk(imageIds: string[], options: TransformOptions): Promise<BulkResult> {
  return request<BulkResult>('/images/transform-bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageIds, options }),
  });
}

export function getBatch(id: string): Promise<Batch> {
  return request<Batch>(`/jobs/batch/${id}`);
}

export type DownloadVariant = 'original' | 'processed';

export type Download = {
  url: string;
  filename: string;
};

export async function getDownload(id: string, variant: DownloadVariant): Promise<Download> {
  const result = await request<{ download: Download }>(`/images/${id}/download?variant=${variant}`);

  return result.download;
}

export async function deleteImage(id: string): Promise<number> {
  const result = await request<{ deleted: number }>(`/images/${id}`, { method: 'DELETE' });
  return result.deleted;
}

export async function clearImages(): Promise<number> {
  const result = await request<{ deleted: number }>('/images', { method: 'DELETE' });
  return result.deleted;
}

export type Account = {
  id: string;
  email: string;
  createdAt: string;
  avatarUrl: string | null;
};

export async function getMe(): Promise<Account> {
  const result = await request<{ user: Account }>('/auth/me');
  return result.user;
}

export type EmailSignIn = {
  sent: boolean;
  signInUrl?: string;
};

// The link arrives by email; the server only echoes it when it could not send one.
export function startEmailSignIn(email: string): Promise<EmailSignIn> {
  return request<EmailSignIn>('/auth/email/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
}
