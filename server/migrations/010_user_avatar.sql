-- The picture a sign-in provider handed over, kept so the header can show it on every
-- later visit. It is a link rather than an upload: the provider goes on serving it, and
-- this column only remembers where from. Null for a guest, and for anyone whose provider
-- shared no picture.
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url text;
