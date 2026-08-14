-- Resident photos, stored in the same cluster as everything else so they sit
-- behind the same grants: app_rw only, evidence_ro has no privilege here at
-- all. A photo is private the same way a note is — by a missing GRANT.
--
-- The bytes are the browser's re-encoded JPEG, never the original file: the
-- client draws the image to a canvas and exports it, which drops EXIF metadata
-- — including the GPS position phones embed in every photo. For someone
-- documenting their landlord, that stripped location is the point.
--
-- The AI is locked out by design: no embedding, no description, no path from
-- this table into the agent's context. The resident's own caption is the only
-- text, and it lives on the observation like any other note.
CREATE TABLE IF NOT EXISTS observation_photo (
  photo_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  observation_id UUID NOT NULL REFERENCES resident_observation ON DELETE CASCADE,
  case_id        UUID NOT NULL REFERENCES housing_case ON DELETE CASCADE,
  content_type   STRING NOT NULL DEFAULT 'image/jpeg',
  content        BYTES NOT NULL,
  byte_size      INT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  INDEX (observation_id),
  CONSTRAINT photo_under_four_mb CHECK (byte_size <= 4194304)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE observation_photo TO app_rw;
