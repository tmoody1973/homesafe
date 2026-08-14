// Every public-evidence source does the same three things: stream Boston's
// current CSV, map each row to an (event, match) pair, and upsert both. Only the
// mapping differs, so it is the only thing a source file has to supply.

import type { Pool } from "pg";
import { resolveResourceUrl } from "../catalog/ckan";
import { batched, streamCsvRows } from "./csv-stream";
import { BATCH_SIZE, upsertBatch } from "./upsert";

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
  "candidate_sam_address_id", "candidate_parcel_id",
  "match_method", "match_confidence", "resolver_version",
] as const;

const CONFLICT_COLUMNS = ["source_system", "source_record_id"];
const SOURCE_RECORD_ID_POSITION = PUBLIC_EVENT_COLUMNS.indexOf(
  "source_record_id" as never,
);

export type SourceEvent = { readonly event: unknown[]; readonly match: unknown[] };

export type EventMapper = (
  row: Record<string, string>,
  retrievedAt: Date,
) => SourceEvent | null;

// Boston renames its files on every refresh — four of five rotated within a day
// of the readiness doc — so the download URL is always resolved through the
// catalog API and never hard-coded.
export async function openBostonCsv(
  packageId: string,
): Promise<NodeJS.ReadableStream> {
  const url = await resolveResourceUrl(packageId, /.*/);
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`${packageId} download failed: ${response.status}`);
  }
  const { Readable } = await import("node:stream");
  return Readable.fromWeb(response.body as never);
}

async function* mapped(
  csvStream: NodeJS.ReadableStream,
  retrievedAt: Date,
  toEvent: EventMapper,
): AsyncGenerator<SourceEvent> {
  for await (const row of streamCsvRows(csvStream)) {
    const result = toEvent(row, retrievedAt);
    if (result !== null) yield result;
  }
}

// A batch carrying the same source record id twice makes CockroachDB reject the
// whole statement ("cannot affect row a second time"), so the last one wins.
function dedupeByRecordId(batch: SourceEvent[]): SourceEvent[] {
  const byRecordId = new Map<unknown, SourceEvent>();
  for (const item of batch) {
    byRecordId.set(item.event[SOURCE_RECORD_ID_POSITION], item);
  }
  return [...byRecordId.values()];
}

export async function ingestEvents(
  pool: Pool,
  csvStream: NodeJS.ReadableStream,
  retrievedAt: Date,
  toEvent: EventMapper,
): Promise<number> {
  let total = 0;
  const rows = mapped(csvStream, retrievedAt, toEvent);
  for await (const batch of batched(rows, BATCH_SIZE)) {
    const unique = dedupeByRecordId(batch);
    // Matches first: a public_event may only cite a linkage that already exists.
    await upsertBatch(pool, "address_match", [...ADDRESS_MATCH_COLUMNS],
      CONFLICT_COLUMNS, unique.map((item) => item.match));
    total += await upsertBatch(pool, "public_event", [...PUBLIC_EVENT_COLUMNS],
      CONFLICT_COLUMNS, unique.map((item) => item.event));
  }
  return total;
}
