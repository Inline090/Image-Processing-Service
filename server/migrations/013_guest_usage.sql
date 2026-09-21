-- A guest's uploads counted per browser as well as per account.
--
-- A guest account is minted fresh whenever the browser asks for one, so the account's own
-- counter on its own hands out a new allowance to anyone who clears their cookies. This
-- carries the second counter an upload has to fit inside: the server issues the browser a
-- token in an HttpOnly cookie, and the row here is keyed on that token.
--
-- A browser that keeps no cookies sends no token, and then the account's counter is the
-- whole answer - which is also why no row is written for it.
--
-- The key is text rather than a network address: nothing in this table reads as one.
CREATE TABLE IF NOT EXISTS guest_usage (
  usage_key text PRIMARY KEY,
  upload_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
