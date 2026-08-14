-- Measured 2026-08-14 on CockroachDB v26.2.5: this syntax is accepted.
-- Created here rather than in migration 002 because an index over an empty
-- table verifies syntax and nothing else — plan 1 deliberately deferred it.
--
-- IF NOT EXISTS is not optional. Index creation in CockroachDB is an async job
-- that commits before the surrounding transaction resolves, so a failed
-- migration can leave partial state. Migration 004 did exactly that.
CREATE VECTOR INDEX IF NOT EXISTS memory_item_embedding_idx
  ON memory_item (embedding);
