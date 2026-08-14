-- `address_match` could record only a candidate SAM address id, so a linkage
-- made on a parcel had nowhere to state which parcel. A permit with no
-- `property_id` was being written as `match_method = 'parcel_direct'`,
-- `match_confidence = 'medium'` with every identifier column null — a stated
-- confidence about a linkage the row does not actually hold. It also made the
-- match unresolvable later: the parcel survived only inside the event's
-- raw_payload JSON, which is provenance, not a join key.
--
-- RentSmart (MOO-617) joins on parcel as its primary identifier, so this is the
-- column that task needs too, not a permits-only accommodation.
--
-- Individually idempotent, per migration 004's lesson: CockroachDB commits an
-- index creation as an async job that can outlive the surrounding transaction,
-- so a failed migration can leave partial state behind.
ALTER TABLE address_match
  ADD COLUMN IF NOT EXISTS candidate_parcel_id STRING;

CREATE INDEX IF NOT EXISTS address_match_parcel_idx
  ON address_match (candidate_parcel_id);
