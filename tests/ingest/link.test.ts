import { expect, test } from "bun:test";
import type { Pool } from "pg";
import { linkEventsToMatches } from "../../src/ingest/link";

// Linking runs in batches because CockroachDB tracks a transaction's locks in a
// fixed memory budget, and one statement over 659,669 permits exceeded it. The
// loop's contract is therefore worth pinning: it must keep going while rows are
// still being linked, and it must stop the moment a pass links none.
function poolReturning(rowCounts: number[]): { pool: Pool; passes: () => number } {
  let pass = 0;
  const pool = {
    query: async () => ({ rowCount: rowCounts[pass++] ?? 0 }),
  } as unknown as Pool;
  return { pool, passes: () => pass };
}

test("keeps going until a pass links nothing", async () => {
  const { pool, passes } = poolReturning([2000, 2000, 431, 0]);
  expect(await linkEventsToMatches(pool, "building_permit")).toBe(4431);
  expect(passes()).toBe(4);
});

test("stops after one pass when there is nothing to link", async () => {
  const { pool, passes } = poolReturning([0]);
  expect(await linkEventsToMatches(pool, "rentsmart")).toBe(0);
  expect(passes()).toBe(1);
});

test("reports progress as it goes, so a long backfill is not silent", async () => {
  const { pool } = poolReturning([2000, 500, 0]);
  const seen: number[] = [];
  await linkEventsToMatches(pool, "building_violation", (total) => seen.push(total));
  expect(seen).toEqual([2000, 2500]);
});

test("passes the source system through to the query", async () => {
  const values: unknown[][] = [];
  const pool = {
    query: async (_sql: string, params: unknown[]) => {
      values.push(params);
      return { rowCount: values.length === 1 ? 1 : 0 };
    },
  } as unknown as Pool;
  await linkEventsToMatches(pool, "rentsmart");
  expect(values[0]![0]).toBe("rentsmart");
});
