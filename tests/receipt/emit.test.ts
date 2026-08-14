import { afterAll, expect, test } from "bun:test";
import { createCase, createResident } from "../../src/case/cases";
import { appPool, closePools } from "../../src/db/pool";
import { publicTimeline } from "../../src/evidence/query";
import { addObservation } from "../../src/memory/observations";
import { searchCaseMemory } from "../../src/memory/search";
import { emitReceipt, persistAgentRun } from "../../src/receipt/emit";
import { diffRefs } from "../../src/receipt/snapshot";
import type { Receipt } from "../../src/receipt/types";

// 302 Sumner St. Real Boston records, loaded in plan 1.
const SAM_ADDRESS_ID = 132380;

const created: string[] = [];

afterAll(async () => {
  for (const caseId of created) {
    await appPool().query("DELETE FROM agent_run WHERE case_id = $1", [caseId]);
    await appPool().query("DELETE FROM housing_case WHERE case_id = $1", [caseId]);
  }
  await closePools();
});

function vectorNear(seed: number): number[] {
  return Array.from({ length: 1024 }, (_, index) => Math.sin(seed + index) / 10);
}

async function seedRetrieval(): Promise<Receipt> {
  const userId = await createResident("receipt test resident");
  const caseId = await createCase({
    userId,
    rawAddress: "302 Sumner St",
    addressEntityId: null,
    issueCategory: "heat",
  });
  created.push(caseId);
  await addObservation(
    { caseId, body: "Heat cutting out overnight, third time this month.", category: "heat" },
    async () => vectorNear(1),
  );
  return emitReceipt({
    caseId,
    actor: { user_id: userId, role: "resident" },
    question: "The heat is still out; what changed?",
    memory: await searchCaseMemory({
      caseId,
      userId,
      queryVector: vectorNear(1),
      limit: 10,
    }),
    evidence: await publicTimeline(SAM_ADDRESS_ID),
  });
}

test("every item carries where it came from and what it does not prove", async () => {
  const receipt = await seedRetrieval();
  expect(receipt.items.length).toBeGreaterThan(1);
  for (const item of receipt.items) {
    expect(item.ref).toBeString();
    expect(item.caveat.length).toBeGreaterThan(0);
    expect(item.surfaced_by.length).toBeGreaterThan(0);
    expect(item.retrieval_reason.length).toBeGreaterThan(0);
  }
  const publicItems = receipt.items.filter((item) => item.kind === "public_event");
  expect(publicItems.length).toBeGreaterThan(0);
  for (const item of publicItems) {
    expect(item.source_url).toStartWith("http");
    expect(item.address_scope).toBeString();
  }
});

test("the applied consent predicate is recorded, not described", async () => {
  const receipt = await seedRetrieval();
  const predicate = receipt.consent_filter_applied.sql_predicate;
  expect(predicate).toContain("revoked_at IS NULL");
  expect(predicate).toContain("FROM housing_case WHERE user_id");
});

// The rule the panel's honesty rests on: excluded proves the filter ran and
// leaks nothing through it.
test("excluded carries counts and never content", async () => {
  const receipt = await seedRetrieval();
  for (const entry of receipt.excluded) {
    expect(Object.keys(entry).sort()).toEqual(["count", "reason"]);
    expect(typeof entry.count).toBe("number");
  }
  const asText = JSON.stringify(receipt.excluded);
  expect(asText).not.toContain("Heat cutting out");
  expect(asText).not.toContain("obs_");
  expect(asText).not.toContain("embedding");
});

test("the first run reports everything as added and nothing as changed since", async () => {
  const receipt = await seedRetrieval();
  expect(receipt.snapshot_delta.since).toBeNull();
  expect(receipt.snapshot_delta.added).toHaveLength(receipt.items.length);
  expect(receipt.snapshot_delta.removed).toHaveLength(0);
});

test("a second run reports only what actually appeared since the first", () => {
  const delta = diffRefs(["evt_a", "evt_b"], ["evt_b", "evt_c"], "2026-08-13T00:00:00Z");
  expect(delta.added).toEqual(["evt_c"]);
  expect(delta.removed).toEqual(["evt_a"]);
  expect(delta.unchanged).toEqual(["evt_b"]);
});

test("the stored audit row holds the receipt byte for byte", async () => {
  const receipt = await seedRetrieval();
  const runId = await persistAgentRun({
    receipt,
    modelId: "us.anthropic.claude-sonnet-5",
    modelOutput: "placeholder",
    validatorResult: { flagged: false },
    latencyMs: 1234,
  });
  const { rows } = await appPool().query<{ receipt: Receipt }>(
    "SELECT receipt FROM agent_run WHERE run_id = $1",
    [runId],
  );
  expect(rows[0]!.receipt).toEqual(receipt);
});
