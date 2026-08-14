import { expect, test } from "bun:test";
import { renderValidated, validate } from "../../src/agent/validator";
import type { ReceiptItem } from "../../src/receipt/types";

const PERMIT_CAVEAT =
  "This public permit records authorized or issued work. It does not establish " +
  "that a specific resident concern has been repaired or resolved.";

const ITEMS: ReceiptItem[] = [
  {
    ref: "evt_11111111-1111-1111-1111-111111111111",
    kind: "public_event",
    display_text: "Building violation — Heat, insufficient.",
    surfaced_by: "public_read_as_evidence_ro",
    retrieval_reason: "Public record tied to this address by sam_id_direct",
    source_system: "building_violation",
    caveat: "This is a historical public enforcement record.",
  },
  {
    ref: "evt_22222222-2222-2222-2222-222222222222",
    kind: "public_event",
    display_text: "Permit — heating system replacement.",
    surfaced_by: "public_read_as_evidence_ro",
    retrieval_reason: "Public record tied to this parcel by property_id",
    source_system: "building_permit",
    caveat: PERMIT_CAVEAT,
  },
  {
    ref: "obs_33333333-3333-3333-3333-333333333333",
    kind: "resident_observation",
    display_text: "Heat cutting out overnight.",
    surfaced_by: "vector_similarity",
    retrieval_reason: "Closest stored note",
    caveat: "Resident-provided statement; not independently verified.",
  },
];

const FABRICATED = "evt_00000000-0000-0000-0000-000000000000";

test("a fabricated ref is stripped and the run is flagged", () => {
  const result = validate(
    `A violation was recorded [${ITEMS[0]!.ref}]. An inspector confirmed the repair [${FABRICATED}].`,
    ITEMS,
  );
  expect(result.flagged).toBe(true);
  expect(result.stripped).toHaveLength(1);
  expect(result.stripped[0]!.unknownRefs).toEqual([FABRICATED]);
  expect(renderValidated(result)).not.toContain("inspector confirmed");
});

test("citing a permit forces the not-proof-of-repair caveat into the output", () => {
  const result = validate(
    `A heating permit was issued [${ITEMS[1]!.ref}].`,
    ITEMS,
  );
  expect(result.appendedCaveats).toEqual([PERMIT_CAVEAT]);
  expect(renderValidated(result)).toContain("does not establish");
});

test("a caveat the model already stated is not repeated", () => {
  const result = validate(
    `A heating permit was issued [${ITEMS[1]!.ref}]. ${PERMIT_CAVEAT}`,
    ITEMS,
  );
  expect(result.appendedCaveats).toHaveLength(0);
});

// The lane is decided by the cited ref's kind, never by the prose.
test("a claim citing an obs_ ref cannot render in the public lane", () => {
  const result = validate(
    `City records show the heat has been out for weeks [${ITEMS[2]!.ref}].`,
    ITEMS,
  );
  expect(result.claims[0]!.lane).toBe("resident_account");
});

test("a sentence mixing a public record with a resident note is neither lane", () => {
  const result = validate(
    `The record and the note agree [${ITEMS[0]!.ref}] [${ITEMS[2]!.ref}].`,
    ITEMS,
  );
  expect(result.claims[0]!.lane).toBe("analysis");
});

test("an uncited sentence is the model's own reading and is labelled so", () => {
  const result = validate("These two things may be related.", ITEMS);
  expect(result.claims[0]!.lane).toBe("analysis");
});

// Nothing survived, so nothing is rendered: the UI shows "I could not verify
// my own answer" plus the raw receipt.
test("an answer built entirely on invented sources fails validation", () => {
  const result = validate(`Everything is fine now [${FABRICATED}].`, ITEMS);
  expect(result.ok).toBe(false);
  expect(result.flagged).toBe(true);
});

// Found on a live turn: the model groups citations as [ref_a, ref_b]. A
// pattern anchored to a bracket holding exactly one ref saw neither.
test("refs grouped inside one bracket are all read", () => {
  const result = validate(
    `Two records exist [${ITEMS[0]!.ref}, ${ITEMS[1]!.ref}].`,
    ITEMS,
  );
  expect(result.claims[0]!.refs).toEqual([ITEMS[0]!.ref, ITEMS[1]!.ref]);
  expect(result.claims[0]!.lane).toBe("public_record");
});

test("a fabricated ref hidden in a citation group is still stripped", () => {
  const result = validate(
    `Records exist [${ITEMS[0]!.ref}, ${FABRICATED}].`,
    ITEMS,
  );
  expect(result.flagged).toBe(true);
  expect(result.stripped[0]!.unknownRefs).toEqual([FABRICATED]);
});

test("an empty model response fails validation rather than rendering blank", () => {
  const result = validate("   ", ITEMS);
  expect(result.ok).toBe(false);
});
