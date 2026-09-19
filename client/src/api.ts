const BASE = '/api';

export type Image = {
  id: string;
  mimeType: string;
  sizeBytes: number;
  status: string;
  createdAt: string;
  originalUrl: string;
  processedUrl: string | null;
  /** True when the history was full, so this one is not kept there. */
  ephemeral: boolean;
};

export type Job = {
  id: string;
  imageId: string;
  status: 'pending' | 'processing' | 'ready' | 'failed';
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

/** What a resize keeps when it has to discard part of the image. */
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

// The server caps a guest account, but starting a fresh guest session would
// hand out a new allowance. Remembering that this browser has spent its guest
// quota is what keeps the cap meaningful; registering is the way forward.
const GUEST_EXHAUSTED_KEY = 'ips.guestExhausted';

export function isGuestExhausted(): boolean {
  return localStorage.getItem(GUEST_EXHAUSTED_KEY) !== null;
}

export function markGuestExhausted(): void {
  localStorage.setItem(GUEST_EXHAUSTED_KEY, '1');
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);

  if (token !== null) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${BASE}${path}`, { ...init, headers });

  if (response.status === 401 && !path.startsWith('/auth/')) {
    setToken(null);
    unauthorizedHandler?.();
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;

    throw new Error(body?.error?.message ?? `Request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

export function register(email: string, password: string): Promise<unknown> {
  return request('/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
}

export async function login(email: string, password: string): Promise<void> {
  const result = await request<{ token: string }>('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  setToken(result.token);
}

export async function uploadImage(file: File): Promise<Image> {
  const body = new FormData();
  body.append('image', file);

  const result = await request<{ image: Image }>('/images', { method: 'POST', body });
  return result.image;
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
  guest: boolean;
  /** null for a registered account, which is not capped. */
  uploadLimit: number | null;
  /** How much of the guest allowance has been spent. Deleting history does not lower it. */
  uploadsUsed: number;
};

export async function getMe(): Promise<Account> {
  const result = await request<{ user: Account }>('/auth/me');
  return result.user;
}

export async function signInAsGuest(): Promise<Account> {
  const result = await request<{ token: string; user: Account }>('/auth/guest', {
    method: 'POST',
  });

  setToken(result.token);
  return result.user;
}
