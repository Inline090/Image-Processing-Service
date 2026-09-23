-- Email link sign-in replaces guest sessions. The row keeps a digest of the token, never the
-- token itself, so a leaked row is not a usable link. Consumption is a single UPDATE, which is
-- what makes a link single use even if it is clicked twice at once.
CREATE TABLE IF NOT EXISTS login_tokens (
  token_hash  TEXT PRIMARY KEY,
  email       TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS login_tokens_email_idx ON login_tokens (email, created_at DESC);

-- Guest access is gone, so the allowance it needed has no readers left. Guest accounts that
-- already exist keep their rows and their images; they simply have no way to sign in.
DROP TABLE IF EXISTS guest_usage;
ALTER TABLE users DROP COLUMN IF EXISTS is_guest;
ALTER TABLE users DROP COLUMN IF EXISTS guest_upload_count;

-- Every account now arrives through a provider or an emailed link. The column has been unread
-- since the password route was deleted.
ALTER TABLE users DROP COLUMN IF EXISTS password_hash;
