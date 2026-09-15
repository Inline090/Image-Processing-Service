CREATE TABLE IF NOT EXISTS jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  image_id      UUID NOT NULL REFERENCES images(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  options       JSONB NOT NULL,
  options_hash  TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending',
  attempts      INTEGER NOT NULL DEFAULT 0,
  error         TEXT,
  processed_key TEXT,
  width         INTEGER,
  height        INTEGER,
  format        TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS jobs_lookup_idx ON jobs (image_id, options_hash, status);
CREATE INDEX IF NOT EXISTS jobs_created_idx ON jobs (created_at DESC);
