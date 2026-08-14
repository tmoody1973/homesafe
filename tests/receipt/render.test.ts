import { expect, test } from "bun:test";
import { RENDERED_RECEIPT_KEYS, renderReceipt } from "../../src/receipt/render";
import type { Receipt } from "../../src/receipt/types";

const RECEIPT: Receipt = {
  receipt_id: "rcpt_1",
  case_id: "case_1",
  actor: { user_id: "usr_1", role: "resident" },
  question: "The heat is still out; what changed?",
  retrieved_at: "2026-08-14T11:04:22.000Z",
  consent_filter_applied: {
    case_scope: ["case_1"],
    role_allows: ["private_to_resident"],
    sql_predicate: "case_id = $2 AND revoked_at IS NULL",
  },
  items: [
    {
      ref: "obs_1",
      kind: "resident_observation",
      display_text: "Heat cutting out overnight.",
      surfaced_by: "vector_similarity",
      retrieval_reason: "Closest stored note",
      caveat: "Resident-provided statement; not independently verified.",
      consent_state: "private_to_resident",
      vector_distance: 0.42,
    },
    {
      ref: "evt_1",
      kind: "public_event",
      display_text: "Permit — heating replacement.",
      surfaced_by: "public_read_as_evidence_ro",
      retrieval_reason: "Public record tied to this parcel",
      caveat: "A permit does not establish a repair.",
      source_system: "building_permit",
      source_url: "https://data.boston.gov/x",
      address_scope: "parcel",
      match_method: "parcel_direct",
      match_confidence: "high",
      occurred_at: null,
    },
  ],
  snapshot_delta: { since: null, added: ["obs_1", "evt_1"], removed: [], unchanged: [] },
  excluded: [
    { reason: "revoked_by_resident", count: 0 },
    { reason: "not_shared_by_resident", count: 2 },
  ],
};

// A field added to the receipt with no place to render would vanish behind a
// panel that claims to show everything. This is the test that stops that.
test("every field of a receipt has somewhere to render", () => {
  expect(Object.keys(RECEIPT).sort()).toEqual([...RENDERED_RECEIPT_KEYS].sort());
});

test("every item's fields reach the drawer, with the ones the UI uses directly held back", () => {
  const rendered = renderReceipt(RECEIPT);
  const permit = rendered.items[1]!;
  const labels = permit.rows.map((row) => row.label);
  expect(permit.headline).toBe("Permit — heating replacement.");
  expect(permit.sourceUrl).toBe("https://data.boston.gov/x");
  expect(labels).toContain("What it does not prove");
  expect(labels).toContain("How sure we are it is this address");
  // occurred_at was null on this record; an empty row reads as a fact we have
  // and are not showing, which is worse than not listing it.
  expect(labels).not.toContain("When it happened");
});

test("the filter that ran is shown verbatim, not described", () => {
  const rendered = renderReceipt(RECEIPT);
  const filter = rendered.consentFilter.find((row) => row.label === "The filter that ran");
  expect(filter?.value).toBe(RECEIPT.consent_filter_applied.sql_predicate);
});

// The number that moves is what proves the filter runs.
test("the withheld total is the sum of the excluded counts", () => {
  expect(renderReceipt(RECEIPT).withheldTotal).toBe(2);
});

test("a first look says so rather than inventing a comparison", () => {
  const rendered = renderReceipt(RECEIPT);
  const since = rendered.delta.find((row) => row.label === "Compared against");
  expect(since?.value).toBe("nothing — this is the first look");
});

test("nothing withheld ever carries a body or a ref", () => {
  const rendered = renderReceipt(RECEIPT);
  const asText = JSON.stringify(rendered.excluded);
  expect(asText).not.toContain("obs_");
  expect(asText).not.toContain("Heat cutting out");
});
