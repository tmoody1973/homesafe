import { expect, test } from "bun:test";
import {
  ADDRESS_MATCH_COLUMNS,
  PUBLIC_EVENT_COLUMNS,
} from "../../src/ingest/violations";
import { toRentSmartEvent } from "../../src/ingest/rentsmart";

const RETRIEVED = new Date("2026-08-13T12:00:00Z");

// Copied verbatim from the live CSV's first data row, 2026-08-13.
const ROW: Record<string, string> = {
  date: "2026-08-11 02:04:34.067+00",
  violation_type: "Sanitation Requests",
  description: "Rodent Activity",
  address: "75 Worcester St, 02118",
  neighborhood: "Roxbury",
  zip_code: "02118",
  parcel: "0900562000",
  owner: "BETTENCOURT ARLENE J",
  year_built: "1870",
  property_type: "Residential 3-family",
};

const HEAT_ROW: Record<string, string> = {
  ...ROW,
  violation_type: "Housing Complaints",
  description: "Heat - Excessive, Insufficient",
};

function eventField(row: unknown[], name: string): unknown {
  return row[PUBLIC_EVENT_COLUMNS.indexOf(name as never)];
}
function matchField(row: unknown[], name: string): unknown {
  return row[ADDRESS_MATCH_COLUMNS.indexOf(name as never)];
}

test("categorises from description, not the coarse violation_type bucket", () => {
  expect(eventField(toRentSmartEvent(HEAT_ROW, RETRIEVED)!.event, "event_category"))
    .toBe("heat_hot_water");
  expect(eventField(toRentSmartEvent(ROW, RETRIEVED)!.event, "event_category"))
    .toBe("pest");
});

test("is always parcel scope at medium confidence — never address, never high", () => {
  const { event, match } = toRentSmartEvent(ROW, RETRIEVED)!;
  expect(eventField(event, "address_scope")).toBe("parcel");
  expect(matchField(match, "match_method")).toBe("parcel_direct");
  expect(matchField(match, "match_confidence")).toBe("medium");
  expect(matchField(match, "candidate_parcel_id")).toBe("0900562000");
  expect(matchField(match, "candidate_sam_address_id")).toBeNull();
});

test("carries the aggregation caveat, not a property score", () => {
  const { event } = toRentSmartEvent(ROW, RETRIEVED)!;
  expect(eventField(event, "caveat")).toMatch(/aggregated/i);
  expect(eventField(event, "caveat")).toMatch(/not.*property score/i);
});

test("parses the millisecond-and-offset timestamp the file actually uses", () => {
  const { event } = toRentSmartEvent(ROW, RETRIEVED)!;
  expect((eventField(event, "occurred_at") as Date).toISOString()).toBe(
    "2026-08-11T02:04:34.067Z",
  );
});

test("the owner's name never reaches raw_payload", () => {
  const { event } = toRentSmartEvent(ROW, RETRIEVED)!;
  const payload = JSON.parse(eventField(event, "raw_payload") as string);
  expect(payload.owner).toBeUndefined();
  expect(payload.parcel).toBe("0900562000");
});

test("the derived id is stable across runs — same row, same id", () => {
  const first = toRentSmartEvent(ROW, RETRIEVED)!;
  const later = toRentSmartEvent(ROW, new Date("2027-01-01T00:00:00Z"))!;
  expect(eventField(later.event, "source_record_id")).toBe(
    eventField(first.event, "source_record_id"),
  );
});

test("the derived id separates rows that differ in any identifying field", () => {
  const idOf = (row: Record<string, string>) =>
    eventField(toRentSmartEvent(row, RETRIEVED)!.event, "source_record_id");
  const base = idOf(ROW);
  expect(idOf({ ...ROW, date: "2026-08-11 02:04:35.067+00" })).not.toBe(base);
  expect(idOf({ ...ROW, parcel: "0900562001" })).not.toBe(base);
  expect(idOf({ ...ROW, description: "Bed Bugs" })).not.toBe(base);
  expect(idOf({ ...ROW, violation_type: "Housing Complaints" })).not.toBe(base);
});

test("a row with no parcel is skipped — parcel is the only join this source has", () => {
  expect(toRentSmartEvent({ ...ROW, parcel: "" }, RETRIEVED)).toBeNull();
});

test("a row with no usable date is skipped — the id would not be reproducible", () => {
  expect(toRentSmartEvent({ ...ROW, date: "" }, RETRIEVED)).toBeNull();
});
