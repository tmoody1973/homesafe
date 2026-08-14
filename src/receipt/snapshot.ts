// "What changed" is the demo's second-best moment, and it has to be a fact
// rather than a claim. It is computed by comparing this run's refs against the
// refs in the previous run's stored receipt — not by asking the model what it
// remembers seeing last time.

import { appPool } from "../db/pool";
import type { Receipt, SnapshotDelta } from "./types";

type PreviousRow = { receipt: Receipt; created_at: Date };

export function diffRefs(
  previousRefs: string[],
  currentRefs: string[],
  since: string | null,
): SnapshotDelta {
  const before = new Set(previousRefs);
  const now = new Set(currentRefs);
  return {
    since,
    added: currentRefs.filter((ref) => !before.has(ref)),
    removed: previousRefs.filter((ref) => !now.has(ref)),
    unchanged: currentRefs.filter((ref) => before.has(ref)),
  };
}

async function previousReceipt(caseId: string): Promise<PreviousRow | null> {
  const { rows } = await appPool().query<PreviousRow>(
    `SELECT receipt, created_at FROM agent_run
     WHERE case_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [caseId],
  );
  return rows[0] ?? null;
}

// A first run has nothing to compare against. Everything is `added` and
// `since` is null, which the panel renders as "this is the first time I
// looked" rather than inventing a change.
export async function snapshotDelta(
  caseId: string,
  currentRefs: string[],
): Promise<SnapshotDelta> {
  const previous = await previousReceipt(caseId);
  if (!previous) return diffRefs([], currentRefs, null);
  return diffRefs(
    previous.receipt.items.map((item) => item.ref),
    currentRefs,
    previous.created_at.toISOString(),
  );
}
