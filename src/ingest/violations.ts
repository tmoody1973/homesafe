// Violations join to an address through Boston's own `sam_id`, not through
// address text. A shared identifier is the only linkage this project treats as
// `high` confidence — everything else states a lower one.

import type { Pool } from "pg";
import { BOSTON_PACKAGES, resolveResourceUrl } from "../catalog/ckan";
import { RESOLVER_VERSION } from "../address/resolve";
import { caveatFor } from "../evidence/caveats";
import { categorize } from "../evidence/categorize";
import { batched, streamCsvRows } from "./csv-stream";
import { linkEventsToAddresses } from "./link";
import { ingestPool } from "./pool";
import { BATCH_SIZE, stripPersonalFields, upsertBatch } from "./upsert";

const SOURCE_SYSTEM = "building_violation";
const SOURCE_URL =
  "https://data.boston.gov/dataset/building-and-property-violations1";

// address_entity_id and address_match_id are deliberately absent: they are set
// by the linking pass alone. Listing them here would make every re-ingest reset
// them to NULL, because ON CONFLICT DO UPDATE writes every column it is given.
export const PUBLIC_EVENT_COLUMNS = [
  "source_system", "source_record_id", "address_scope",
  "event_category", "source_status", "title", "description",
  "occurred_at", "occurred_precision", "retrieved_at", "source_url",
  "raw_payload", "caveat",
] as const;

export const ADDRESS_MATCH_COLUMNS = [
  "source_system", "source_record_id", "raw_address",
  "candidate_sam_address_id", "match_method", "match_confidence",
  "resolver_version",
] as const;

const CONFLICT_COLUMNS = ["source_system", "source_record_id"];

function trimmed(row: Record<string, string>, key: string): string | null {
  const value = row[key]?.trim();
  return value ? value : null;
}

function timestamp(row: Record<string, string>, key: string): Date | null {
  const value = trimmed(row, key);
  if (value === null) return null;
  const parsed = new Date(value.replace(" ", "T"));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
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
): { event: unknown[]; match: unknown[] } | null {
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
    timestamp(row, "status_dttm"),
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
    sam === null ? "unmatched" : "sam_id_direct",
    sam === null ? "ambiguous" : "high",
    RESOLVER_VERSION,
  ];

  return { event, match };
}

async function* mapped(
  csvStream: NodeJS.ReadableStream,
  retrievedAt: Date,
): AsyncGenerator<{ event: unknown[]; match: unknown[] }> {
  for await (const row of streamCsvRows(csvStream)) {
    const result = toViolationEvent(row, retrievedAt);
    if (result !== null) yield result;
  }
}

// A batch carrying the same case_no twice makes CockroachDB reject the whole
// statement ("cannot affect row a second time"), so the last mapping wins.
function dedupeByCaseNo(
  batch: { event: unknown[]; match: unknown[] }[],
): { event: unknown[]; match: unknown[] }[] {
  const byCaseNo = new Map<unknown, { event: unknown[]; match: unknown[] }>();
  for (const item of batch) byCaseNo.set(item.event[1], item);
  return [...byCaseNo.values()];
}

export async function ingestViolations(
  csvStream: NodeJS.ReadableStream,
  retrievedAt: Date,
  pool: Pool,
): Promise<number> {
  let total = 0;
  for await (const batch of batched(mapped(csvStream, retrievedAt), BATCH_SIZE)) {
    const unique = dedupeByCaseNo(batch);
    // Matches first: a public_event may only cite a linkage that already exists.
    await upsertBatch(pool, "address_match", [...ADDRESS_MATCH_COLUMNS],
      CONFLICT_COLUMNS, unique.map((item) => item.match));
    total += await upsertBatch(pool, "public_event", [...PUBLIC_EVENT_COLUMNS],
      CONFLICT_COLUMNS, unique.map((item) => item.event));
  }
  return total;
}

async function openViolationsCsv(): Promise<NodeJS.ReadableStream> {
  const url = await resolveResourceUrl(BOSTON_PACKAGES.violations, /.*/);
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`violations download failed: ${response.status}`);
  }
  const { Readable } = await import("node:stream");
  return Readable.fromWeb(response.body as never);
}

if (import.meta.main) {
  const pool = ingestPool();
  try {
    const count = await ingestViolations(
      await openViolationsCsv(),
      new Date(),
      pool,
    );
    const linked = await linkEventsToAddresses(pool, SOURCE_SYSTEM);
    console.log(`upserted ${count} violation events, linked ${linked}`);
  } finally {
    await pool.end();
  }
}
