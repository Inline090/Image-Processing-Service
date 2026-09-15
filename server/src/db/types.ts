export type ImageStatus = 'pending' | 'processing' | 'ready' | 'failed';

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
