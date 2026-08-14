// SAM is Boston's official address register, and `address_entity` is the join
// hub: violations, permits and RentSmart all reach a residence through
// SAM_ADDRESS_ID. A wrong mapping here attaches every other record to the wrong
// building, and the failure reads as "no records at this address" rather than as
// an error — so nothing about this file guesses.

import type { Pool } from "pg";
import { BOSTON_PACKAGES, resolveResourceUrl } from "../catalog/ckan";
import { batched, streamCsvRows } from "./csv-stream";
import { ingestPool } from "./pool";
import { BATCH_SIZE, upsertBatch } from "./upsert";

export const ADDRESS_ENTITY_COLUMNS = [
  "sam_address_id", "full_address", "street_number", "street_name",
  "unit", "zip", "neighborhood", "parcel_id", "building_id",
  "lat", "lon", "sam_snapshot_at",
] as const;

const ADDRESS_ENTITY_TABLE = "address_entity";
const CONFLICT_COLUMNS = ["sam_address_id"];

export type SamRow = Record<string, string>;

export type SamIngestCounts = {
  readonly upserted: number;
  readonly skipped: number;
};

// Boston's SAM CSV begins with a UTF-8 byte-order mark, so the parser names the
// first header "﻿SAM_ADDRESS_ID". Looking up the plain name found nothing
// and every one of the 399,452 rows was skipped as unusable — a silent empty
// ingest, the exact failure the catalog lookup exists to prevent. The fallback
// covers any column, since only the first can ever carry the mark.
const BYTE_ORDER_MARK = "﻿";

function text(row: SamRow, key: string): string | null {
  const value = (row[key] ?? row[BYTE_ORDER_MARK + key])?.trim();
  return value ? value : null;
}

function integer(row: SamRow, key: string): number | null {
  const value = text(row, key);
  if (value === null) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function decimal(row: SamRow, key: string): number | null {
  const value = text(row, key);
  if (value === null) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function toAddressEntity(row: SamRow, snapshotAt: Date): unknown[] | null {
  const samAddressId = integer(row, "SAM_ADDRESS_ID");
  if (samAddressId === null) return null;
  return [
    samAddressId,
    text(row, "FULL_ADDRESS") ?? "",
    // Street numbers are text on purpose: "181-183 State St" is a real address
    // and parsing it as a number would silently store 181.
    text(row, "STREET_NUMBER"),
    text(row, "FULL_STREET_NAME"),
    text(row, "UNIT"),
    text(row, "ZIP_CODE"),
    text(row, "MAILING_NEIGHBORHOOD"),
    text(row, "PARCEL_ID"),
    integer(row, "BUILDING_ID"),
    decimal(row, "POINT_Y"),
    decimal(row, "POINT_X"),
    snapshotAt,
  ];
}

// A batch carrying the same sam_address_id twice makes CockroachDB reject the
// whole statement ("cannot affect row a second time"), so the last mapping of a
// repeated id wins and the duplicate is counted as skipped.
function dedupeBySamId(batch: unknown[][]): unknown[][] {
  const byId = new Map<unknown, unknown[]>();
  for (const row of batch) byId.set(row[0], row);
  return [...byId.values()];
}

async function* mapped(
  csvStream: NodeJS.ReadableStream,
  snapshotAt: Date,
  skipped: { count: number },
): AsyncGenerator<unknown[]> {
  for await (const row of streamCsvRows(csvStream)) {
    const mappedRow = toAddressEntity(row, snapshotAt);
    if (mappedRow === null) skipped.count += 1;
    else yield mappedRow;
  }
}

// The pool is injected rather than taken from src/db/pool.ts because neither
// application login may write here — see src/ingest/pool.ts for the reasoning.
export async function ingestSam(
  csvStream: NodeJS.ReadableStream,
  snapshotAt: Date,
  pool: Pool,
): Promise<SamIngestCounts> {
  const skipped = { count: 0 };
  let upserted = 0;
  for await (const batch of batched(mapped(csvStream, snapshotAt, skipped), BATCH_SIZE)) {
    const unique = dedupeBySamId(batch);
    skipped.count += batch.length - unique.length;
    upserted += await upsertBatch(
      pool,
      ADDRESS_ENTITY_TABLE,
      [...ADDRESS_ENTITY_COLUMNS],
      CONFLICT_COLUMNS,
      unique,
    );
  }
  return { upserted, skipped: skipped.count };
}

async function openSamCsv(): Promise<NodeJS.ReadableStream> {
  const url = await resolveResourceUrl(BOSTON_PACKAGES.sam, /.*/);
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`SAM download failed: ${response.status}`);
  }
  const { Readable } = await import("node:stream");
  return Readable.fromWeb(response.body as never);
}

if (import.meta.main) {
  const pool = ingestPool();
  try {
    const counts = await ingestSam(await openSamCsv(), new Date(), pool);
    console.log(
      `upserted ${counts.upserted} address_entity rows, skipped ${counts.skipped}`,
    );
  } finally {
    await pool.end();
  }
}
