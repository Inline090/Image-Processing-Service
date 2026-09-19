-- History is capped per user, but a transform past the cap still has to run and
-- its result still has to be reachable, so those rows are marked instead of being
-- refused. Everything already stored predates the cap and counts as history.
ALTER TABLE images ADD COLUMN IF NOT EXISTS ephemeral BOOLEAN NOT NULL DEFAULT false;
