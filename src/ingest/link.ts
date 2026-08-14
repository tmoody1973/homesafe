// Events arrive citing nothing and are joined in a second pass, so an ingest can
// finish before SAM contains the address.
//
// Every event gets a pointer to its `address_match` row — the record of how the
// linkage was decided and how confident it is — INCLUDING events that could not
// be resolved to an address. An unmatched record that cites no linkage decision
// cannot explain itself, and explaining itself is the whole point: a resident
// must be able to see "we tried, and here is why this is uncertain".
//
// `address_entity_id` is set only where the linkage actually resolves. A
// parcel-level match deliberately does not resolve: a parcel holds several
// addresses, so choosing one would attach a record to a home it may not concern.
// RentSmart is entirely parcel-level, and 6,787 permits are too. Those stay
// findable by parcel rather than being guessed at or dropped.
//
// The pass runs in batches because CockroachDB tracks a transaction's locks in a
// fixed memory budget. Measured 2026-08-13: linking 16,263 violations in one
// statement was fine, linking 659,669 permits the same way failed after three
// minutes with
//   "lock spans: 1004715 bytes > budget: 1000000 bytes" (SQLSTATE 53400)
// — roughly 3,500 rows' worth of locks per megabyte. Batching also means an
// interrupted run keeps the links it already made.

import type { Pool } from "pg";

const LINK_BATCH_SIZE = 2000;

// Each pass selects only rows that will actually be updated, so "zero rows
// updated" means finished rather than "this batch happened to be unlinkable".
const LINK_BATCH_SQL = `
  WITH linkable AS (
    SELECT pe.event_id, am.match_id, address_entity.address_entity_id
    FROM public_event pe
    JOIN address_match am
      ON am.source_system = pe.source_system
     AND am.source_record_id = pe.source_record_id
    LEFT JOIN address_entity
      ON address_entity.sam_address_id = am.candidate_sam_address_id
    WHERE pe.source_system = $1
      AND pe.address_match_id IS NULL
    LIMIT $2
  )
  UPDATE public_event
  SET address_match_id  = linkable.match_id,
      address_entity_id = linkable.address_entity_id
  FROM linkable
  WHERE public_event.event_id = linkable.event_id
`;

export async function linkEventsToMatches(
  pool: Pool,
  sourceSystem: string,
  onProgress?: (linkedSoFar: number) => void,
): Promise<number> {
  let total = 0;
  for (;;) {
    const result = await pool.query(LINK_BATCH_SQL, [
      sourceSystem,
      LINK_BATCH_SIZE,
    ]);
    const linked = result.rowCount ?? 0;
    if (linked === 0) return total;
    total += linked;
    onProgress?.(total);
  }
}
