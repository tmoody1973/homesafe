import { expect, test } from "bun:test";
import {
  ADDRESS_MATCH_COLUMNS,
  PUBLIC_EVENT_COLUMNS,
  toViolationEvent,
} from "../../src/ingest/violations";

const RETRIEVED = new Date("2026-08-13T12:00:00Z");

const ROW: Record<string, string> = {
  case_no: "V-2026-0442",
  status_dttm: "2026-07-02 09:14:00",
  status: "Open",
  code: "780 CMR",
  description: "Heat - Excessive, Insufficient",
  violation_stno: "302",
  violation_street: "Sumner",
  violation_suffix: "St",
  violation_zip: "02128",
  sam_id: "132380",
  latitude: "42.3690",
  longitude: "-71.0380",
};

function eventField(row: unknown[], name: string): unknown {
  return row[PUBLIC_EVENT_COLUMNS.indexOf(name as never)];
}
function matchField(row: unknown[], name: string): unknown {
  return row[ADDRESS_MATCH_COLUMNS.indexOf(name as never)];
}

test("uses case_no as the source record id", () => {
  const { event } = toViolationEvent(ROW, RETRIEVED)!;
  expect(eventField(event, "source_record_id")).toBe("V-2026-0442");
  expect(eventField(event, "source_system")).toBe("building_violation");
});

test("categorises the description", () => {
  const { event } = toViolationEvent(ROW, RETRIEVED)!;
  expect(eventField(event, "event_category")).toBe("heat_hot_water");
});

test("attaches the mandatory caveat", () => {
  const { event } = toViolationEvent(ROW, RETRIEVED)!;
  expect(eventField(event, "caveat")).toMatch(/current condition/i);
});

test("a sam_id join is address scope at high confidence", () => {
  const { event, match } = toViolationEvent(ROW, RETRIEVED)!;
  expect(eventField(event, "address_scope")).toBe("address");
  expect(matchField(match, "match_method")).toBe("sam_id_direct");
  expect(matchField(match, "match_confidence")).toBe("high");
});

test("records the raw source address on the match, not the event", () => {
  const { match } = toViolationEvent(ROW, RETRIEVED)!;
  expect(matchField(match, "raw_address")).toBe("302 Sumner St 02128");
});

test("a row with no sam_id becomes unknown scope and ambiguous confidence", () => {
  const { event, match } = toViolationEvent({ ...ROW, sam_id: "" }, RETRIEVED)!;
  expect(eventField(event, "address_scope")).toBe("unknown");
  expect(matchField(match, "match_method")).toBe("unmatched");
  expect(matchField(match, "match_confidence")).toBe("ambiguous");
});

test("sam_id 0 is Boston's absent-address sentinel, not an address", () => {
  const { event, match } = toViolationEvent({ ...ROW, sam_id: "0" }, RETRIEVED)!;
  expect(eventField(event, "address_scope")).toBe("unknown");
  expect(matchField(match, "candidate_sam_address_id")).toBeNull();
  expect(matchField(match, "match_confidence")).toBe("ambiguous");
});

test("a row with no case_no is skipped — no stable identity to upsert on", () => {
  expect(toViolationEvent({ ...ROW, case_no: "" }, RETRIEVED)).toBeNull();
});

test("preserves the whole source row as raw_payload for provenance", () => {
  const { event } = toViolationEvent(ROW, RETRIEVED)!;
  expect(JSON.parse(eventField(event, "raw_payload") as string).sam_id).toBe(
    "132380",
  );
});

test("the owner's mailing address never reaches raw_payload", () => {
  const withOwner = { ...ROW, contact_addr1: "9 Elm St", contact_zip: "02135" };
  const { event } = toViolationEvent(withOwner, RETRIEVED)!;
  const payload = JSON.parse(eventField(event, "raw_payload") as string);
  expect(payload.contact_addr1).toBeUndefined();
  expect(payload.contact_zip).toBeUndefined();
  expect(payload.violation_zip).toBe("02128");
});
