-- Revoked memory gets erased by the database itself, on a schedule — not by
-- an application job we promise to run. CockroachDB's row-level TTL deletes
-- any row whose expires_at has passed; revokeMemory() sets revoked_at (which
-- hides the row from every query instantly) and expires_at thirty days later
-- (after which the bytes stop existing).
--
-- The thirty-day gap is deliberate: a resident who revokes in distress can
-- change their mind for a month; after that, "revoked" stops meaning "hidden"
-- and starts meaning "gone".
ALTER TABLE memory_item ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

ALTER TABLE memory_item SET (
  ttl_expiration_expression = 'expires_at',
  ttl_job_cron = '@hourly'
);
