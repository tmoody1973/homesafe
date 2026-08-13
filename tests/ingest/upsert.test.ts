import { expect, test } from "bun:test";
import { buildUpsertSql, stripPersonalFields } from "../../src/ingest/upsert";

test("builds a parameterised multi-row upsert", () => {
  const sql = buildUpsertSql("public_event", ["source_system", "source_record_id"], ["source_system", "source_record_id"], 2);
  expect(sql).toContain("INSERT INTO public_event (source_system, source_record_id)");
  expect(sql).toContain("VALUES ($1, $2), ($3, $4)");
  expect(sql).toContain("ON CONFLICT (source_system, source_record_id) DO UPDATE SET");
});

test("excludes conflict columns from the update clause", () => {
  const sql = buildUpsertSql("t", ["a", "b", "c"], ["a"], 1);
  expect(sql).toContain("b = excluded.b");
  expect(sql).toContain("c = excluded.c");
  expect(sql).not.toContain("a = excluded.a");
});

test("rejects an empty row count rather than emitting invalid sql", () => {
  expect(() => buildUpsertSql("t", ["a"], ["a"], 0)).toThrow(/at least one row/i);
});

// The owner's home mailing address must never reach the database, because
// `evidence_ro` can read `public_event.raw_payload`.
const VIOLATION_ROW = {
  case_no: "V-1",
  sam_id: "132380",
  description: "Heat, insufficient",
  contact_addr1: "12 Owner Way",
  contact_addr2: "Apt 3",
  contact_city: "Quincy",
  contact_state: "MA",
  contact_zip: "02169",
  applicant: "Jane Owner",
};

test("drops owner contact fields and the permit applicant", () => {
  const stripped = stripPersonalFields(VIOLATION_ROW);
  for (const key of [
    "contact_addr1",
    "contact_addr2",
    "contact_city",
    "contact_state",
    "contact_zip",
    "applicant",
  ]) {
    expect(stripped).not.toHaveProperty(key);
  }
});

test("keeps the fields the evidence timeline is built from", () => {
  expect(stripPersonalFields(VIOLATION_ROW)).toEqual({
    case_no: "V-1",
    sam_id: "132380",
    description: "Heat, insufficient",
  });
});

test("leaves its input untouched", () => {
  const row = { ...VIOLATION_ROW };
  stripPersonalFields(row);
  expect(row).toEqual(VIOLATION_ROW);
});
