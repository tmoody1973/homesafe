import { expect, test } from "bun:test";
import {
  ADDRESS_MATCH_COLUMNS,
  PUBLIC_EVENT_COLUMNS,
} from "../../src/ingest/violations";
import { toPermitEvent } from "../../src/ingest/permits";

const RETRIEVED = new Date("2026-08-13T12:00:00Z");

// Copied verbatim from the live CSV's first data row, 2026-08-13. property_id
// 130392 is the readiness doc's verified permit → 181-183 State St. The
// timestamps carry a `+00` offset, which is the shape the plan's own fixture
// missed and which JavaScript will not parse unaided.
const ROW: Record<string, string> = {
  permitnumber: "A1000569",
  worktype: "INTEXT",
  permittypedescr: "Amendment to a Long Form",
  description: "Interior/Exterior Work",
  applicant: "Patrick Sharkey",
  issued_date: "2021-01-28 16:29:26+00",
  expiration_date: "2021-07-28 04:00:00+00",
  status: "Closed",
  address: "181-183 State ST",
  city: "Boston",
  state: "MA",
  zip: "02109",
  property_id: "130392",
  parcel_id: "0303807000",
};

function eventField(row: unknown[], name: string): unknown {
  return row[PUBLIC_EVENT_COLUMNS.indexOf(name as never)];
}
function matchField(row: unknown[], name: string): unknown {
  return row[ADDRESS_MATCH_COLUMNS.indexOf(name as never)];
}

test("uses permitnumber as the source record id", () => {
  const { event } = toPermitEvent(ROW, RETRIEVED)!;
  expect(eventField(event, "source_record_id")).toBe("A1000569");
  expect(eventField(event, "source_system")).toBe("building_permit");
});

test("every permit is category permit, never inferred from its description", () => {
  const { event } = toPermitEvent(ROW, RETRIEVED)!;
  expect(eventField(event, "event_category")).toBe("permit");
});

test("carries the caveat that a permit does not prove a repair", () => {
  const { event } = toPermitEvent(ROW, RETRIEVED)!;
  expect(eventField(event, "caveat")).toMatch(/does not establish/i);
  expect(eventField(event, "caveat")).toMatch(/repaired|resolved/i);
});

test("property_id joins to SAM at high confidence", () => {
  const { event, match } = toPermitEvent(ROW, RETRIEVED)!;
  expect(eventField(event, "address_scope")).toBe("address");
  expect(matchField(match, "candidate_sam_address_id")).toBe(130392);
  expect(matchField(match, "match_method")).toBe("sam_id_direct");
  expect(matchField(match, "match_confidence")).toBe("high");
});

test("uses the real issued_date, offset and all, as the event time", () => {
  const { event } = toPermitEvent(ROW, RETRIEVED)!;
  expect((eventField(event, "occurred_at") as Date).toISOString()).toBe(
    "2021-01-28T16:29:26.000Z",
  );
});

test("a row with no permitnumber is skipped", () => {
  expect(toPermitEvent({ ...ROW, permitnumber: "" }, RETRIEVED)).toBeNull();
});

test("a row with no property_id falls back to parcel scope, not address scope", () => {
  const { event, match } = toPermitEvent({ ...ROW, property_id: "" }, RETRIEVED)!;
  expect(eventField(event, "address_scope")).toBe("parcel");
  expect(matchField(match, "match_method")).toBe("parcel_direct");
  expect(matchField(match, "match_confidence")).toBe("medium");
});

test("property_id 0 is an absent address, not address 0", () => {
  const { event, match } = toPermitEvent({ ...ROW, property_id: "0" }, RETRIEVED)!;
  expect(eventField(event, "address_scope")).toBe("parcel");
  expect(matchField(match, "candidate_sam_address_id")).toBeNull();
});

test("a row with neither property_id nor parcel_id is unknown and ambiguous", () => {
  const { event, match } = toPermitEvent(
    { ...ROW, property_id: "", parcel_id: "" },
    RETRIEVED,
  )!;
  expect(eventField(event, "address_scope")).toBe("unknown");
  expect(matchField(match, "match_method")).toBe("unmatched");
  expect(matchField(match, "match_confidence")).toBe("ambiguous");
});

test("the applicant's name never reaches raw_payload", () => {
  const { event } = toPermitEvent(ROW, RETRIEVED)!;
  const payload = JSON.parse(eventField(event, "raw_payload") as string);
  expect(payload.applicant).toBeUndefined();
  expect(payload.permitnumber).toBe("A1000569");
});

test("the parcel is kept on the match so a parcel-scoped permit stays findable", () => {
  const { match } = toPermitEvent({ ...ROW, property_id: "" }, RETRIEVED)!;
  expect(matchField(match, "candidate_parcel_id")).toBe("0303807000");
  expect(matchField(match, "raw_address")).toBe("181-183 State ST 02109");
});
