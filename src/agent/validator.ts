// Runs after the model answers and before anything reaches a screen.
//
// The receipt says what was actually read. This file holds the model's prose
// against it. A sentence citing a source that was never read is deleted, not
// softened — that is the hallucination catch, and it is mechanical rather than
// hoped-for.
//
// Lane assignment lives here too, and it is decided by the cited ref's kind,
// never by the prose. The model cannot slide a resident's statement into the
// public-record lane, because it does not control which lane anything renders
// in.

import type { ReceiptItem } from "../receipt/types";

export type Lane = "public_record" | "resident_account" | "analysis";

export type ValidatedClaim = {
  readonly text: string;
  readonly refs: string[];
  readonly lane: Lane;
};

export type StrippedClaim = {
  readonly text: string;
  readonly unknownRefs: string[];
};

export type ValidationResult = {
  // false means: do not render the prose. Show "I could not verify my own
  // answer" and the raw receipt instead. Failing visibly is on-brand.
  readonly ok: boolean;
  readonly flagged: boolean;
  readonly claims: ValidatedClaim[];
  readonly stripped: StrippedClaim[];
  readonly appendedCaveats: string[];
};

// Matches a ref token wherever it appears, not only as the sole contents of a
// bracket. Found on a live turn 2026-08-14: the model writes citation groups
// as `[evt_a, evt_b]`, and a pattern anchored to `\[ref\]` saw neither of them
// — so the sentence read as uncited, dropped into the analysis lane, and a
// fabricated ref inside such a group would have passed unstripped.
const REF_PATTERN = /\b(?:evt|obs|mem)_[A-Za-z0-9-]{8,}/g;
const SENTENCE_BOUNDARY = /(?<=[.!?])\s+/;

const LANE_BY_KIND: Record<ReceiptItem["kind"], Lane> = {
  public_event: "public_record",
  resident_observation: "resident_account",
  agent_memory: "resident_account",
};

function refsIn(sentence: string): string[] {
  return [...sentence.matchAll(REF_PATTERN)].map((match) => match[0]);
}

function laneFor(refs: string[], byRef: Map<string, ReceiptItem>): Lane {
  const kinds = refs.map((ref) => byRef.get(ref)?.kind).filter(Boolean);
  // A sentence citing nothing is the model's own reading, and says so.
  if (kinds.length === 0) return "analysis";
  // Mixing a public record with a resident's own words in one sentence is
  // exactly the blur this project exists to prevent.
  const lanes = new Set(kinds.map((kind) => LANE_BY_KIND[kind!]));
  return lanes.size === 1 ? [...lanes][0]! : "analysis";
}

function splitSentences(prose: string): string[] {
  return prose
    .split(SENTENCE_BOUNDARY)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

// A permit records that work was authorised. Not that it happened, not that it
// worked, not that it fixed anything. If the model cites one and leaves that
// out, the caveat is appended rather than assumed.
function missingCaveats(
  claims: ValidatedClaim[],
  byRef: Map<string, ReceiptItem>,
  prose: string,
): string[] {
  const cited = new Set(claims.flatMap((claim) => claim.refs));
  const owed = [...cited]
    .map((ref) => byRef.get(ref))
    .filter((item) => item?.source_system === "building_permit")
    .map((item) => item!.caveat);
  return [...new Set(owed)].filter((caveat) => !prose.includes(caveat));
}

function partition(
  sentences: string[],
  byRef: Map<string, ReceiptItem>,
): { claims: ValidatedClaim[]; stripped: StrippedClaim[] } {
  const claims: ValidatedClaim[] = [];
  const stripped: StrippedClaim[] = [];
  for (const text of sentences) {
    const refs = refsIn(text);
    const unknownRefs = refs.filter((ref) => !byRef.has(ref));
    if (unknownRefs.length > 0) stripped.push({ text, unknownRefs });
    else claims.push({ text, refs, lane: laneFor(refs, byRef) });
  }
  return { claims, stripped };
}

export function validate(
  prose: string,
  items: ReceiptItem[],
): ValidationResult {
  const byRef = new Map(items.map((item) => [item.ref, item]));
  const sentences = splitSentences(prose);
  const { claims, stripped } = partition(sentences, byRef);
  const appendedCaveats = missingCaveats(claims, byRef, prose);
  return {
    ok: sentences.length > 0 && claims.length > 0,
    flagged: stripped.length > 0,
    claims,
    stripped,
    appendedCaveats,
  };
}

export type SectionValidation = {
  readonly ok: boolean;
  readonly flagged: boolean;
  readonly sections: Record<string, ValidationResult>;
  readonly strippedCount: number;
};

// Validated one section at a time, because the resident reads them one at a
// time. Validating the four as one blob was the first cut, and it produced a
// wall of text with no headings — the five-section shape exists so a tired
// person can find the part they need without reading the rest.
//
// The caveat a section owes is appended to that section, not to the end of the
// answer, so "a permit is not proof of repair" sits next to the permit.
export function validateSections(
  sections: Record<string, string>,
  items: ReceiptItem[],
): SectionValidation {
  const validated = Object.fromEntries(
    Object.entries(sections).map(([name, prose]) => [name, validate(prose, items)]),
  );
  const results = Object.values(validated);
  return {
    ok: results.some((result) => result.ok),
    flagged: results.some((result) => result.flagged),
    sections: validated,
    strippedCount: results.reduce((total, result) => total + result.stripped.length, 0),
  };
}

// What the resident actually reads: surviving sentences, plus any caveat the
// model owed and omitted.
export function renderValidated(result: ValidationResult): string {
  return [
    ...result.claims.map((claim) => claim.text),
    ...result.appendedCaveats,
  ].join(" ");
}
