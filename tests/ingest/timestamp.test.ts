import { expect, test } from "bun:test";
import { parseSourceTimestamp } from "../../src/ingest/timestamp";

test("parses the permits shape, whose +00 offset JavaScript rejects raw", () => {
  const parsed = parseSourceTimestamp("2021-01-28 16:29:26+00");
  expect(parsed?.toISOString()).toBe("2021-01-28T16:29:26.000Z");
});

test("parses the violations shape as local time", () => {
  const parsed = parseSourceTimestamp("2013-10-22 00:00:00");
  expect(parsed?.getFullYear()).toBe(2013);
  expect(parsed?.getDate()).toBe(22);
});

test("keeps a full offset when the source states one", () => {
  const parsed = parseSourceTimestamp("2021-07-28 04:00:00+00:00");
  expect(parsed?.toISOString()).toBe("2021-07-28T04:00:00.000Z");
});

test("an empty or unparseable value is null, never an Invalid Date", () => {
  expect(parseSourceTimestamp("")).toBeNull();
  expect(parseSourceTimestamp("   ")).toBeNull();
  expect(parseSourceTimestamp(null)).toBeNull();
  expect(parseSourceTimestamp("not a date")).toBeNull();
});
