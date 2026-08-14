// The deliverable. Everything before this file exists to make its output
// truthful: every item states where it came from, how confidently it was tied
// to this address, how coarse that tie is, and what it does not prove.
//
// Decision 2026-08-14 (docs/decisions/2026-08-14-timeline-reads-address-and-parcel.md):
// the timeline reads TWO paths, not one. Boston files RentSmart complaints
// against a parcel — the plot of land — rather than against a street address,
// and every one of the 4,959 heat records and 28,183 pest records in this
// database is filed that way. An address-only query returns none of them, which
// would silently undo the reason MOO-617 was pulled into plan 1.
//
// A parcel record is NOT promoted to address scope. It stays marked `parcel`,
// because a parcel holds several addresses and a record true of a building is
// not automatically true of one apartment.

import type { Pool } from "pg";
import { evidencePool } from "../db/pool";
import type { SourceSystem } from "./caveats";

// Exported so callers can tell a full page from a truncated one. A resident
// shown 200 of 216 records with no notice has been told a complete story that
// isn't — the same failure by omission this project exists to prevent.
export const MAX_ITEMS = 200;

export type EvidenceItem = {
  readonly ref: string;
  readonly sourceSystem: SourceSystem;
  readonly sourceRecordId: string;
  readonly title: string | null;
  readonly description: string | null;
  readonly sourceStatus: string | null;
  readonly occurredAt: Date | null;
  readonly eventCategory: string;
  readonly addressScope: string;
  readonly matchMethod: string | null;
  readonly matchConfidence: string | null;
  readonly sourceUrl: string;
  readonly caveat: string;
};

type Row = {
  event_id: string;
  source_system: SourceSystem;
  source_record_id: string;
  title: string | null;
  description: string | null;
  source_status: string | null;
  occurred_at: Date | null;
  event_category: string;
  address_scope: string;
  match_method: string | null;
  match_confidence: string | null;
  source_url: string;
  caveat: string;
};

const SELECTED_COLUMNS = `
  pe.event_id, pe.source_system, pe.source_record_id, pe.title,
  pe.description, pe.source_status, pe.occurred_at, pe.event_category,
  pe.address_scope, am.match_method, am.match_confidence,
  pe.source_url, pe.caveat
`;

// The two paths are separate SELECTs rather than one OR because they reach
// public_event through different indexes: the address path through
// (address_entity_id, occurred_at), the parcel path through the parcel index on
// address_match and then the unique (source_system, source_record_id). A single
// OR gives the planner no way to use both.
//
// UNION, not UNION ALL: an event carrying both an address link and a matching
// parcel would otherwise appear twice.
const TIMELINE_SQL = `
  WITH target AS (
    SELECT address_entity_id, parcel_id
    FROM address_entity
    WHERE sam_address_id = $1
  ),
  by_address AS (
    SELECT ${SELECTED_COLUMNS}
    FROM public_event pe
    JOIN target ON target.address_entity_id = pe.address_entity_id
    LEFT JOIN address_match am ON am.match_id = pe.address_match_id
  ),
  by_parcel AS (
    SELECT ${SELECTED_COLUMNS}
    FROM address_match am
    JOIN target ON target.parcel_id = am.candidate_parcel_id
    JOIN public_event pe
      ON pe.source_system = am.source_system
     AND pe.source_record_id = am.source_record_id
  )
  SELECT * FROM by_address
  UNION
  SELECT * FROM by_parcel
  ORDER BY occurred_at DESC NULLS LAST
  LIMIT ${MAX_ITEMS}
`;

function toItem(row: Row): EvidenceItem {
  return {
    // The opaque citation token. A model is shown this and never a source URL,
    // so an invented citation becomes a validator error rather than a dead link.
    ref: `evt_${row.event_id}`,
    sourceSystem: row.source_system,
    sourceRecordId: row.source_record_id,
    title: row.title,
    description: row.description,
    sourceStatus: row.source_status,
    occurredAt: row.occurred_at,
    eventCategory: row.event_category,
    addressScope: row.address_scope,
    matchMethod: row.match_method,
    matchConfidence: row.match_confidence,
    sourceUrl: row.source_url,
    caveat: row.caveat,
  };
}

export async function publicTimeline(
  samAddressId: number,
  pool: Pool = evidencePool(),
): Promise<EvidenceItem[]> {
  const { rows } = await pool.query<Row>(TIMELINE_SQL, [samAddressId]);
  return rows.map(toItem);
}
