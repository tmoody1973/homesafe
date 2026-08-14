// Events arrive with address_entity_id NULL and are joined to an address in a
// second pass, so an ingest can finish before SAM contains the address. Rows
// whose candidate is absent from SAM stay unlinked rather than being dropped —
// about 2.4% of violation sam_ids are not in the current SAM snapshot, and a
// resident is better served by an unmatched record than by a missing one.
//
// The linking runs in batches because CockroachDB tracks the locks a
// transaction holds in a fixed memory budget. Measured 2026-08-13: linking
// 16,263 violations in one statement was fine, linking 659,669 permits the same
// way failed after three minutes with
//   "lock spans: 1004715 bytes > budget: 1000000 bytes" (SQLSTATE 53400)
// — roughly 3,500 rows' worth of locks per megabyte. Batching also means an
// interrupted run keeps the links it already made.

import type { Pool } from "pg";

const LINK_BATCH_SIZE = 2000;

// Each pass selects only rows that CAN be linked, so a batch is never spent on
// events whose candidate address is missing. That is what lets "zero rows
// updated" mean "finished" rather than "this batch happened to be unlinkable".
const LINK_BATCH_SQL = `
  WITH linkable AS (
    SELECT pe.event_id, ae.address_entity_id, am.match_id
    FROM public_event pe
    JOIN address_match am
      ON am.source_system = pe.source_system
     AND am.source_record_id = pe.source_record_id
    JOIN address_entity ae
      ON ae.sam_address_id = am.candidate_sam_address_id
    WHERE pe.source_system = $1
      AND pe.address_entity_id IS NULL
    LIMIT $2
  )
  UPDATE public_event
  SET address_entity_id = linkable.address_entity_id,
      address_match_id  = linkable.match_id
  FROM linkable
  WHERE public_event.event_id = linkable.event_id
`;

export async function linkEventsToAddresses(
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
