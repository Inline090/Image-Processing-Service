-- Accounts that sign in through a provider. Passport runs the round trip; this is what
-- it leaves behind.
--
-- One row per linked provider, rather than columns on users, so one person can attach
-- Google and Facebook and Twitter to the same account, and so adding a provider needs
-- no schema change.
--
-- provider_id is the provider's own identifier for the account. It is text because the
-- providers disagree about the type: Google uses a long decimal, Facebook and Twitter
-- do not, and none of them promise it will stay numeric.
CREATE TABLE IF NOT EXISTS oauth_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_id)
);

CREATE INDEX IF NOT EXISTS oauth_accounts_user_idx ON oauth_accounts (user_id);

-- An account that arrives through a provider has no password, so the column can no
-- longer be required. The password route treats a missing hash as a failed sign-in.
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
