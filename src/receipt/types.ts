// The shape is fixed by spec §4. One artifact does three jobs: it is the
// why-panel, it is the `agent_run.receipt` audit row, and it is the
// validator's source of truth. That is why the panel cannot lie — it is not
// the model's account of what it remembered, it is the record of what the
// retrieval layer actually read.
//
// Nothing here is ever written by the model.

export type ItemKind =
  | "resident_observation"
  | "agent_memory"
  | "policy_guidance"
  | "public_event";

export type ActorRole = "resident" | "reviewer";

export type ReceiptActor = {
  readonly user_id: string;
  readonly role: ActorRole;
};

export type ConsentFilterApplied = {
  readonly case_scope: string[];
  readonly role_allows: string[];
  // The predicate that actually ran. If the panel says a filter was applied,
  // the filter is right there to read.
  readonly sql_predicate: string;
};

export type ReceiptItem = {
  readonly ref: string;
  readonly kind: ItemKind;
  readonly display_text: string;
  readonly surfaced_by: string;
  readonly retrieval_reason: string;
  readonly caveat: string;
  readonly consent_state?: string;
  readonly recorded_at?: string;
  // Spec §4 sketches this as `similarity: 0.87`. What the query actually
  // measures is a distance, and converting one to the other would mean
  // inventing a number to fill a field. The measured value is reported under
  // its real name instead: lower is closer.
  readonly vector_distance?: number;
  readonly source_system?: string;
  readonly source_record_id?: string;
  readonly source_url?: string;
  readonly occurred_at?: string | null;
  readonly address_scope?: string;
  readonly match_method?: string | null;
  readonly match_confidence?: string | null;
};

// Counts only. A test asserts no body, no ref and no embedding ever appears
// here — the panel proves the filter ran with a number that moves, without
// leaking a byte through it.
export type Excluded = {
  readonly reason: string;
  readonly count: number;
  readonly bucket?: string;
};

export type SnapshotDelta = {
  readonly since: string | null;
  readonly added: string[];
  readonly removed: string[];
  readonly unchanged: string[];
};

export type Receipt = {
  readonly receipt_id: string;
  readonly case_id: string;
  readonly actor: ReceiptActor;
  readonly question: string;
  readonly retrieved_at: string;
  readonly consent_filter_applied: ConsentFilterApplied;
  readonly items: ReceiptItem[];
  readonly snapshot_delta: SnapshotDelta;
  readonly excluded: Excluded[];
};
