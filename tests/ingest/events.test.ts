import { expect, test } from "bun:test";
import { Readable } from "node:stream";
import type { Pool } from "pg";
import {
  ADDRESS_MATCH_COLUMNS,
  PUBLIC_EVENT_COLUMNS,
  ingestEvents,
  type SourceEvent,
} from "../../src/ingest/events";

type Call = { sql: string; values: unknown[] };

// A stand-in for the database that records what it was asked to do. The ingest
// pipeline takes its pool as an argument precisely so this is possible without
// touching the real cluster.
// Every row contributes one `($1, $2, ...)` group to the VALUES clause, so
// counting the group openings gives the row count a real driver would report.
// Counting the flattened parameters instead would report columns, not rows.
function rowsAffected(sql: string): number {
  return (sql.match(/\(\$/g) ?? []).length;
}

function recordingPool(): { pool: Pool; calls: Call[] } {
  const calls: Call[] = [];
  const pool = {
    query: async (sql: string, values: unknown[]) => {
      calls.push({ sql, values });
      return { rowCount: rowsAffected(sql) };
    },
  } as unknown as Pool;
  return { pool, calls };
}

function eventFor(recordId: string, scope = "address"): SourceEvent {
  const event = PUBLIC_EVENT_COLUMNS.map((column) => {
    if (column === "source_system") return "building_violation";
    if (column === "source_record_id") return recordId;
    if (column === "address_scope") return scope;
    return null;
  });
  const match = ADDRESS_MATCH_COLUMNS.map((column) =>
    column === "source_record_id" ? recordId : null,
  );
  return { event, match };
}

const CSV = "case_no\nA\nB\n";

test("writes the match before the event, so the citation always exists first", async () => {
  const { pool, calls } = recordingPool();
  await ingestEvents(pool, Readable.from([CSV]), new Date(), (row) =>
    eventFor(row.case_no!),
  );
  expect(calls[0]!.sql).toContain("INSERT INTO address_match");
  expect(calls[1]!.sql).toContain("INSERT INTO public_event");
});

test("counts only the events it wrote", async () => {
  const { pool } = recordingPool();
  const written = await ingestEvents(pool, Readable.from([CSV]), new Date(), (row) =>
    eventFor(row.case_no!),
  );
  expect(written).toBe(2);
});

test("a row the mapper rejects is skipped, not written", async () => {
  const { pool } = recordingPool();
  const written = await ingestEvents(pool, Readable.from([CSV]), new Date(), (row) =>
    row.case_no === "B" ? null : eventFor(row.case_no!),
  );
  expect(written).toBe(1);
});

// CockroachDB rejects a statement that touches the same row twice
// ("cannot affect row a second time"), which would fail the whole batch.
test("a repeated source record id inside one batch collapses to the last one", async () => {
  const { pool, calls } = recordingPool();
  const written = await ingestEvents(
    pool,
    Readable.from(["case_no\nA\nA\n"]),
    new Date(),
    (row) => eventFor(row.case_no!),
  );
  expect(written).toBe(1);
  expect(calls).toHaveLength(2);
});

test("an empty source writes nothing at all", async () => {
  const { pool, calls } = recordingPool();
  const written = await ingestEvents(
    pool,
    Readable.from(["case_no\n"]),
    new Date(),
    (row) => eventFor(row.case_no!),
  );
  expect(written).toBe(0);
  expect(calls).toHaveLength(0);
});
