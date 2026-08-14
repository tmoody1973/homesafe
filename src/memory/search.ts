// The security-critical file. Every filter below lives in the SQL `WHERE`,
// evaluated before the similarity ordering.
//
// Filtering after ranking means that for one moment this process held another
// resident's private note in memory. It looks identical in the UI, passes a
// casual review, and is the single most likely way this project betrays its
// own premise. The cross-case leak test in tests/memory/search.test.ts is what
// stands between here and that.
//
// `excluded` reports counts and never content. "2 items were withheld because
// you haven't shared them" proves the filter ran without leaking a byte
// through it.

import { appPool } from "../db/pool";

export type ViewerRole = "resident" | "reviewer";

export type MemorySearch = {
  readonly caseId: string;
  readonly userId: string;
  readonly queryVector: number[];
  readonly limit: number;
  readonly viewerRole?: ViewerRole;
};

export type MemoryHit = {
  // Spec §4 addresses a resident's own words as `obs_…`. A memory with no
  // observation behind it — an agent summary, say — keeps its own `mem_…`.
  readonly ref: string;
  readonly body: string;
  readonly memoryType: string;
  readonly consentScope: string;
  readonly createdAt: Date;
  readonly distance: number;
};

export type ExcludedCount = {
  readonly reason: string;
  readonly count: number;
};

export type MemorySearchResult = {
  readonly hits: MemoryHit[];
  readonly excluded: ExcludedCount[];
  // The predicate that actually ran, carried into the receipt. If the panel
  // says a filter was applied, this is the filter.
  readonly consentFilterApplied: string;
};

const OWNERSHIP_PREDICATE =
  "case_id IN (SELECT case_id FROM housing_case WHERE user_id = $3)";

export const CONSENT_PREDICATE =
  "(NOT $5 OR consent_scope <> 'private_to_resident')";

const VISIBLE_WHERE = [
  "case_id = $2",
  "revoked_at IS NULL",
  OWNERSHIP_PREDICATE,
  CONSENT_PREDICATE,
].join("\n    AND ");

// Policy rows are Massachusetts rules — global, case_id NULL, secret to
// nobody. They join every search by meaning; the ownership and consent
// predicates still guard everything that belongs to a person.
export const SEARCH_SQL = `
  SELECT memory_id, source_observation_id, body, memory_type, consent_scope,
         created_at, embedding <-> $1::VECTOR AS distance
  FROM memory_item
  WHERE (${VISIBLE_WHERE})
     OR (memory_type = 'policy_guidance' AND case_id IS NULL)
  ORDER BY embedding <-> $1::VECTOR
  LIMIT $4
`;

// Counted with the same predicates rather than by fetching rows and throwing
// them away — a row discarded in application code is a row that was read.
const EXCLUDED_SQL = `
  SELECT
    count(*) FILTER (WHERE revoked_at IS NOT NULL) AS revoked,
    count(*) FILTER (
      WHERE revoked_at IS NULL AND consent_scope = 'private_to_resident'
    ) AS private
  FROM memory_item
  WHERE case_id = $1
    AND case_id IN (SELECT case_id FROM housing_case WHERE user_id = $2)
`;

type HitRow = {
  memory_id: string;
  source_observation_id: string | null;
  body: string;
  memory_type: string;
  consent_scope: string;
  created_at: Date;
  distance: string;
};

function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(",")}]`;
}

function toHit(row: HitRow): MemoryHit {
  return {
    ref: row.source_observation_id
      ? `obs_${row.source_observation_id}`
      : `mem_${row.memory_id}`,
    body: row.body,
    memoryType: row.memory_type,
    consentScope: row.consent_scope,
    createdAt: row.created_at,
    distance: Number(row.distance),
  };
}

async function countExcluded(
  caseId: string,
  userId: string,
  isReviewer: boolean,
): Promise<ExcludedCount[]> {
  const { rows } = await appPool().query<{ revoked: string; private: string }>(
    EXCLUDED_SQL,
    [caseId, userId],
  );
  const row = rows[0] ?? { revoked: "0", private: "0" };
  return [
    { reason: "revoked_by_resident", count: Number(row.revoked) },
    {
      reason: "not_shared_by_resident",
      count: isReviewer ? Number(row.private) : 0,
    },
  ];
}

// With 79 statute chunks in global memory, law can crowd a resident's own
// notes out of the top results. Statutes keep at most MAX_POLICY_HITS slots.
// Dropping fetched rows is forbidden for CONSENT rows — that taboo is about
// holding someone's private data — but these are public law; trimming them
// after ranking leaks nothing about anyone.
const MAX_POLICY_HITS = 3;

function capPolicy(hits: MemoryHit[], limit: number): MemoryHit[] {
  let policySeen = 0;
  const kept = hits.filter((hit) => {
    if (hit.memoryType !== "policy_guidance") return true;
    policySeen += 1;
    return policySeen <= MAX_POLICY_HITS;
  });
  return kept.slice(0, limit);
}

export async function searchCaseMemory(
  search: MemorySearch,
): Promise<MemorySearchResult> {
  const isReviewer = search.viewerRole === "reviewer";
  const { rows } = await appPool().query<HitRow>(SEARCH_SQL, [
    toVectorLiteral(search.queryVector),
    search.caseId,
    search.userId,
    // Overfetch so capping statutes still fills the page with personal rows.
    search.limit + MAX_POLICY_HITS,
    isReviewer,
  ]);
  return {
    hits: capPolicy(rows.map(toHit), search.limit),
    excluded: await countExcluded(search.caseId, search.userId, isReviewer),
    consentFilterApplied: VISIBLE_WHERE,
  };
}
