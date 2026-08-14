import { afterAll, expect, test } from "bun:test";
import { createCase, createResident } from "../../src/case/cases";
import { appPool, closePools } from "../../src/db/pool";
import { addObservation } from "../../src/memory/observations";
import {
  CONSENT_PREDICATE,
  SEARCH_SQL,
  searchCaseMemory,
} from "../../src/memory/search";

const created: string[] = [];

afterAll(async () => {
  for (const caseId of created) {
    await appPool().query("DELETE FROM housing_case WHERE case_id = $1", [caseId]);
  }
  await closePools();
});

function vectorNear(seed: number): number[] {
  return Array.from({ length: 1024 }, (_, index) => Math.sin(seed + index) / 10);
}

async function seedCase(label: string): Promise<{ userId: string; caseId: string }> {
  const userId = await createResident(label);
  const caseId = await createCase({
    userId,
    rawAddress: "302 Sumner St",
    addressEntityId: null,
    issueCategory: "heat",
  });
  created.push(caseId);
  return { userId, caseId };
}

// Spec §9.1. This is the test the whole task exists for. A filter applied
// after ranking instead of before looks identical in the UI and fails here.
test("case A's memory is invisible to user B — no rows, no text, no counts", async () => {
  const caseA = await seedCase("resident A");
  const caseB = await seedCase("resident B");
  await addObservation(
    { caseId: caseA.caseId, body: "No heat since Tuesday.", category: "heat" },
    async () => vectorNear(1),
  );

  const asOwner = await searchCaseMemory({
    caseId: caseA.caseId,
    userId: caseA.userId,
    queryVector: vectorNear(1),
    limit: 10,
  });
  const asStranger = await searchCaseMemory({
    caseId: caseA.caseId,
    userId: caseB.userId,
    queryVector: vectorNear(1),
    limit: 10,
  });

  expect(asOwner.hits.length).toBeGreaterThan(0);
  expect(asStranger.hits).toHaveLength(0);
  expect(JSON.stringify(asStranger)).not.toContain("No heat since Tuesday");
  expect(asStranger.excluded.every((entry) => entry.count === 0)).toBe(true);
});

// A refactor that "simplifies" the query must fail loudly rather than quietly
// widening it, so the predicate is asserted as text, not only as behaviour.
test("the ownership and consent predicates are present in the SQL itself", () => {
  expect(SEARCH_SQL).toContain(CONSENT_PREDICATE);
  expect(SEARCH_SQL).toContain("FROM housing_case WHERE user_id");
  const whereClause = SEARCH_SQL.slice(
    SEARCH_SQL.indexOf("WHERE"),
    SEARCH_SQL.indexOf("ORDER BY"),
  );
  expect(whereClause).toContain("revoked_at IS NULL");
  expect(SEARCH_SQL.indexOf("WHERE")).toBeLessThan(SEARCH_SQL.indexOf("ORDER BY"));
});

test("a reviewer sees no private item, and is told how many were withheld", async () => {
  const { userId, caseId } = await seedCase("resident C");
  await addObservation(
    { caseId, body: "The bathroom ceiling is leaking.", category: "water" },
    async () => vectorNear(2),
  );

  const asReviewer = await searchCaseMemory({
    caseId,
    userId,
    queryVector: vectorNear(2),
    limit: 10,
    viewerRole: "reviewer",
  });

  expect(asReviewer.hits).toHaveLength(0);
  const withheld = asReviewer.excluded.find((e) => e.reason === "not_shared_by_resident");
  expect(withheld?.count).toBeGreaterThan(0);
  expect(JSON.stringify(asReviewer)).not.toContain("bathroom ceiling");
});

test("revoked memory is withheld and counted, never returned", async () => {
  const { userId, caseId } = await seedCase("resident D");
  const written = await addObservation(
    { caseId, body: "I withdrew this note.", category: null },
    async () => vectorNear(3),
  );
  await appPool().query(
    "UPDATE memory_item SET revoked_at = now() WHERE memory_id = $1",
    [written.memoryId],
  );

  const result = await searchCaseMemory({
    caseId,
    userId,
    queryVector: vectorNear(3),
    limit: 10,
  });

  expect(result.hits).toHaveLength(0);
  const revoked = result.excluded.find((e) => e.reason === "revoked_by_resident");
  expect(revoked?.count).toBe(1);
});
