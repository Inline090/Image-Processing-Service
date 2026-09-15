export type ImageStatus = 'pending' | 'processing' | 'ready' | 'failed';

export type JobStatus = 'pending' | 'processing' | 'ready' | 'failed';

export type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  created_at: Date;
};

export type ImageRow = {
  id: string;
  user_id: string;
  original_key: string;
  processed_key: string | null;
  mime_type: string;
  size_bytes: string;
  width: number | null;
  height: number | null;
  status: ImageStatus;
  created_at: Date;
};

export type JobRow = {
  id: string;
  image_id: string;
  user_id: string;
  options: unknown;
  options_hash: string;
  status: JobStatus;
  attempts: number;
  error: string | null;
  processed_key: string | null;
  width: number | null;
  height: number | null;
  format: string | null;
  created_at: Date;
  updated_at: Date;
};
