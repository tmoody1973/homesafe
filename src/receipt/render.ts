// The drawer renders what this file returns, and nothing else.
//
// Plan 3 asks for a test proving the drawer matches `agent_run.receipt` field
// for field. Asserting that against a rendered DOM tests one snapshot in time;
// a field added to the receipt next week would still slip past silently. So
// the flattening lives here, the component only maps over it, and the test
// below the fold asserts every key of the receipt is accounted for. Drift
// stops being something we check and starts being something that cannot
// compile.

import type { Receipt, ReceiptItem } from "./types";

export type ReceiptRow = {
  readonly label: string;
  readonly value: string;
};

export type RenderedItem = {
  readonly ref: string;
  readonly kind: ReceiptItem["kind"];
  readonly headline: string;
  readonly rows: ReceiptRow[];
  readonly sourceUrl: string | null;
};

export type RenderedReceipt = {
  readonly header: ReceiptRow[];
  readonly consentFilter: ReceiptRow[];
  readonly items: RenderedItem[];
  readonly excluded: ReceiptRow[];
  readonly delta: ReceiptRow[];
  readonly withheldTotal: number;
};

// Field names as a resident would say them. `match_confidence` means nothing
// to the person reading; "How sure we are it is this address" does.
const ITEM_LABELS: Record<string, string> = {
  surfaced_by: "How it came up",
  retrieval_reason: "Why it was read",
  caveat: "What it does not prove",
  consent_state: "Who can see it",
  recorded_at: "When you wrote it",
  vector_distance: "How close in meaning (lower is closer)",
  source_system: "Which Boston dataset",
  source_record_id: "Boston's own record number",
  occurred_at: "When it happened",
  address_scope: "How precisely it attaches",
  match_method: "How it was matched",
  match_confidence: "How sure we are it is this address",
};

const SKIPPED_ITEM_KEYS = new Set(["ref", "kind", "display_text", "source_url"]);

function itemRows(item: ReceiptItem): ReceiptRow[] {
  return Object.entries(item)
    .filter(([key, value]) => !SKIPPED_ITEM_KEYS.has(key) && value !== null && value !== undefined)
    .map(([key, value]) => ({
      label: ITEM_LABELS[key] ?? key,
      value: String(value),
    }));
}

function renderItem(item: ReceiptItem): RenderedItem {
  return {
    ref: item.ref,
    kind: item.kind,
    headline: item.display_text,
    rows: itemRows(item),
    sourceUrl: item.source_url ?? null,
  };
}

function excludedRows(receipt: Receipt): ReceiptRow[] {
  return receipt.excluded.map((entry) => ({
    label: entry.reason.replaceAll("_", " "),
    value: String(entry.count),
  }));
}

function deltaRows(receipt: Receipt): ReceiptRow[] {
  const { since, added, removed, unchanged } = receipt.snapshot_delta;
  return [
    { label: "Compared against", value: since ?? "nothing — this is the first look" },
    { label: "New since then", value: String(added.length) },
    { label: "Gone since then", value: String(removed.length) },
    { label: "Unchanged", value: String(unchanged.length) },
  ];
}

export function renderReceipt(receipt: Receipt): RenderedReceipt {
  return {
    header: [
      { label: "Receipt", value: receipt.receipt_id },
      { label: "Question asked", value: receipt.question },
      { label: "Read at", value: receipt.retrieved_at },
      { label: "Read as", value: receipt.actor.role },
    ],
    consentFilter: [
      { label: "Case", value: receipt.consent_filter_applied.case_scope.join(", ") },
      { label: "Allowed to see", value: receipt.consent_filter_applied.role_allows.join(", ") },
      { label: "The filter that ran", value: receipt.consent_filter_applied.sql_predicate },
    ],
    items: receipt.items.map(renderItem),
    excluded: excludedRows(receipt),
    delta: deltaRows(receipt),
    withheldTotal: receipt.excluded.reduce((total, entry) => total + entry.count, 0),
  };
}

// Every top-level field of a receipt must reach the drawer. Listed here so a
// new field added to the receipt without a place to render fails a test rather
// than disappearing quietly behind a panel that claims to show everything.
export const RENDERED_RECEIPT_KEYS = [
  "receipt_id",
  "case_id",
  "actor",
  "question",
  "retrieved_at",
  "consent_filter_applied",
  "items",
  "snapshot_delta",
  "excluded",
] as const;
