// Events arrive with address_entity_id NULL and are joined to an address in a
// second pass, so an ingest can finish before SAM contains the address. Rows
// whose candidate is absent from SAM stay unlinked rather than being dropped —
// about 2.4% of violation sam_ids are not in the current SAM snapshot, and a
// resident is better served by an unmatched record than by a missing one.

import type { Pool } from "pg";

const LINK_SQL = `
  UPDATE public_event
  SET address_entity_id = address_entity.address_entity_id,
      address_match_id  = address_match.match_id
  FROM address_match
  JOIN address_entity
    ON address_entity.sam_address_id = address_match.candidate_sam_address_id
  WHERE address_match.source_system = public_event.source_system
    AND address_match.source_record_id = public_event.source_record_id
    AND public_event.source_system = $1
    AND public_event.address_entity_id IS NULL
`;

export async function linkEventsToAddresses(
  pool: Pool,
  sourceSystem: string,
): Promise<number> {
  const result = await pool.query(LINK_SQL, [sourceSystem]);
  return result.rowCount ?? 0;
}
