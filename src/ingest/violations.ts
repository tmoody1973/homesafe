// Violations join to an address through Boston's own `sam_id`, not through
// address text. A shared identifier is the only linkage this project treats as
// `high` confidence — everything else states a lower one.

import { BOSTON_PACKAGES } from "../catalog/ckan";
import { RESOLVER_VERSION } from "../address/resolve";
import { caveatFor } from "../evidence/caveats";
import { categorize } from "../evidence/categorize";
import { ingestEvents, openBostonCsv, type SourceEvent } from "./events";
import { linkEventsToAddresses } from "./link";
import { ingestPool } from "./pool";
import { parseSourceTimestamp } from "./timestamp";
import { stripPersonalFields } from "./upsert";

export { ADDRESS_MATCH_COLUMNS, PUBLIC_EVENT_COLUMNS } from "./events";

const SOURCE_SYSTEM = "building_violation";
const SOURCE_URL =
  "https://data.boston.gov/dataset/building-and-property-violations1";

function trimmed(row: Record<string, string>, key: string): string | null {
  const value = row[key]?.trim();
  return value ? value : null;
}

function rawAddress(row: Record<string, string>): string {
  // `violation_zip`, NOT `zip` — verified against the live CSV header
  // 2026-08-13. The violations file has no `zip` column; it also has a
  // `contact_zip`, which is the OWNER's mailing zip and must never be
  // mistaken for the property's.
  return [
    trimmed(row, "violation_stno"),
    trimmed(row, "violation_street"),
    trimmed(row, "violation_suffix"),
    trimmed(row, "violation_zip"),
  ]
    .filter((part): part is string => part !== null)
    .join(" ");
}

// Boston writes `0` where a violation has no SAM address, and 143 live rows do.
// Read literally, zero is a valid integer, so those rows were being stamped
// `sam_id_direct` / `high` / scope `address` — a claimed identifier join to an
// address that does not exist. High confidence is the one claim this project
// must never make wrongly, so a non-positive id counts as absent.
function samId(row: Record<string, string>): number | null {
  const value = trimmed(row, "sam_id");
  if (value === null) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function toViolationEvent(
  row: Record<string, string>,
  retrievedAt: Date,
): SourceEvent | null {
  const caseNo = trimmed(row, "case_no");
  if (caseNo === null) return null;

  const sam = samId(row);
  const description = trimmed(row, "description") ?? "";

  const event = [
    SOURCE_SYSTEM,
    caseNo,
    // 99.5% of violation sam_ids point at address-level SAM records, so a
    // resident must be told the record concerns their building, not their unit.
    sam === null ? "unknown" : "address",
    categorize(description, SOURCE_SYSTEM),
    trimmed(row, "status"),
    trimmed(row, "code"),
    description,
    parseSourceTimestamp(trimmed(row, "status_dttm")),
    "day",
    retrievedAt,
    SOURCE_URL,
    JSON.stringify(stripPersonalFields(row)),
    caveatFor(SOURCE_SYSTEM),
  ];

  const match = [
    SOURCE_SYSTEM,
    caseNo,
    rawAddress(row),
    sam,
    null, // the violations file carries no parcel column — verified 2026-08-13
    sam === null ? "unmatched" : "sam_id_direct",
    sam === null ? "ambiguous" : "high",
    RESOLVER_VERSION,
  ];

  return { event, match };
}

if (import.meta.main) {
  const pool = ingestPool();
  try {
    const csv = await openBostonCsv(BOSTON_PACKAGES.violations);
    const count = await ingestEvents(pool, csv, new Date(), toViolationEvent);
    const linked = await linkEventsToAddresses(pool, SOURCE_SYSTEM);
    console.log(`upserted ${count} violation events, linked ${linked}`);
  } finally {
    await pool.end();
  }
}
