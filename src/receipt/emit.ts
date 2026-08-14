// Builds the receipt out of what retrieval observed, and nothing else.
//
// If you find yourself adding a tool that lets the model report what it
// retrieved, stop — that is this architecture inverted. The model's only job
// is prose; this file decides what is true.

import type { EvidenceItem } from "../evidence/query";
import type { MemorySearchResult } from "../memory/search";
import { appPool } from "../db/pool";
import { snapshotDelta } from "./snapshot";
import type {
  Excluded,
  Receipt,
  ReceiptActor,
  ReceiptItem,
} from "./types";

const OBSERVATION_CAVEAT =
  "Resident-provided statement; not independently verified.";

const AGENT_MEMORY_CAVEAT =
  "HomeSafe's own earlier conclusion — a record of past reasoning, not a source of new facts.";

const POLICY_CAVEAT =
  "An official rule as published at the linked source. Whether it applies to your exact situation may require legal help. Not yet attorney-reviewed.";

const URL_PATTERN = /https?:\/\/[^\s)]+/;

export type RetrievalObserved = {
  readonly caseId: string;
  readonly actor: ReceiptActor;
  readonly question: string;
  readonly memory: MemorySearchResult;
  readonly evidence: EvidenceItem[];
  readonly evidenceExcluded?: Excluded[];
};

function memoryKind(hit: MemorySearchResult["hits"][number]): ReceiptItem["kind"] {
  if (hit.ref.startsWith("obs_")) return "resident_observation";
  return hit.memoryType === "policy_guidance" ? "policy_guidance" : "agent_memory";
}

const MEMORY_CAVEATS: Record<string, string> = {
  resident_observation: OBSERVATION_CAVEAT,
  agent_memory: AGENT_MEMORY_CAVEAT,
  policy_guidance: POLICY_CAVEAT,
};

function memoryReason(kind: ReceiptItem["kind"], question: string): string {
  if (kind === "resident_observation") return `Closest stored note to "${question}"`;
  if (kind === "policy_guidance")
    return `A Massachusetts rule closest in meaning to "${question}"`;
  return `The agent's own earlier conclusion, closest in meaning to "${question}"`;
}

function memoryItemFrom(
  hit: MemorySearchResult["hits"][number],
  question: string,
): ReceiptItem {
  const kind = memoryKind(hit);
  return {
    ref: hit.ref,
    kind,
    display_text: hit.body,
    consent_state: hit.consentScope,
    recorded_at: hit.createdAt.toISOString(),
    surfaced_by: "vector_similarity",
    vector_distance: hit.distance,
    retrieval_reason: memoryReason(kind, question),
    caveat: MEMORY_CAVEATS[kind]!,
    // A rule that cannot be checked at its source is an assertion. The URL
    // travels in the body from the curated file; surface it as a real link.
    source_url:
      kind === "policy_guidance" ? hit.body.match(URL_PATTERN)?.[0] : undefined,
  };
}

function evidenceItemFrom(event: EvidenceItem): ReceiptItem {
  return {
    ref: event.ref,
    kind: "public_event",
    display_text: [event.title, event.description].filter(Boolean).join(" — "),
    surfaced_by: "public_read_as_evidence_ro",
    retrieval_reason: `Public record tied to this ${event.addressScope} by ${event.matchMethod ?? "no shared identifier"}`,
    source_system: event.sourceSystem,
    source_record_id: event.sourceRecordId,
    source_url: event.sourceUrl,
    occurred_at: event.occurredAt?.toISOString() ?? null,
    address_scope: event.addressScope,
    match_method: event.matchMethod,
    match_confidence: event.matchConfidence,
    caveat: event.caveat,
  };
}

function buildItems(observed: RetrievalObserved): ReceiptItem[] {
  return [
    ...observed.memory.hits.map((hit) =>
      memoryItemFrom(hit, observed.question),
    ),
    ...observed.evidence.map(evidenceItemFrom),
  ];
}

export async function emitReceipt(
  observed: RetrievalObserved,
): Promise<Receipt> {
  const items = buildItems(observed);
  return {
    receipt_id: `rcpt_${crypto.randomUUID()}`,
    case_id: observed.caseId,
    actor: observed.actor,
    question: observed.question,
    retrieved_at: new Date().toISOString(),
    consent_filter_applied: {
      case_scope: [observed.caseId],
      role_allows:
        observed.actor.role === "resident"
          ? ["private_to_resident", "shared_with_reviewer"]
          : ["shared_with_reviewer"],
      sql_predicate: observed.memory.consentFilterApplied,
    },
    items,
    snapshot_delta: await snapshotDelta(
      observed.caseId,
      items.map((item) => item.ref),
    ),
    excluded: [...observed.memory.excluded, ...(observed.evidenceExcluded ?? [])],
  };
}

export type AgentRunRecord = {
  readonly receipt: Receipt;
  readonly modelId: string;
  readonly modelOutput: string | null;
  readonly validatorResult: unknown;
  readonly latencyMs: number;
};

// The receipt is stored unchanged: the same bytes reach the audit row, the
// panel and the validator. Anything that reshapes it here lets the panel and
// the record drift apart, and then the panel is a story again.
export async function persistAgentRun(run: AgentRunRecord): Promise<string> {
  const { receipt } = run;
  const { rows } = await appPool().query<{ run_id: string }>(
    `INSERT INTO agent_run
       (case_id, actor_user_id, actor_role, question, model_id,
        receipt, model_output, validator_result, latency_ms)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING run_id`,
    [
      receipt.case_id,
      receipt.actor.user_id,
      receipt.actor.role,
      receipt.question,
      run.modelId,
      JSON.stringify(receipt),
      run.modelOutput,
      JSON.stringify(run.validatorResult),
      run.latencyMs,
    ],
  );
  return rows[0]!.run_id;
}
