-- Address resolution was doing a FULL SCAN of 399,452 rows to find one address.
-- Measured 2026-08-13: a single `resolveAddress("302 Sumner St")` took 1,900ms.
-- The spec budgets 3 seconds for the ENTIRE evidence timeline, so step one was
-- consuming most of the budget before any records were fetched.
--
-- EXPLAIN said:
--     • filter
--     │ filter: upper(full_address) = '302 SUMNER ST'
--     └── • scan
--           estimated row count: 31 - 399,452 (100% of the table)
--           spans: FULL SCAN (SOFT LIMIT)
--
-- The existing indexes cover `parcel_id`, `sam_address_id`, and
-- (zip, street_name, street_number). None can serve `upper(full_address)`,
-- because a function applied to a column defeats an index on that column.
--
-- An expression index on the exact expression the resolver uses fixes it
-- without a migration of the data or a re-ingest.

CREATE INDEX IF NOT EXISTS address_entity_upper_full_address_idx
  ON address_entity (upper(full_address));

-- The resolver's second cascade step filters on street_number and street_name
-- with an optional zip. The existing index leads with `zip`, so a lookup that
-- omits zip — which is most of them, since residents rarely type it — cannot
-- use it. This one leads with the fields that are always present.
CREATE INDEX IF NOT EXISTS address_entity_street_lookup_idx
  ON address_entity (street_number, street_name, zip);
