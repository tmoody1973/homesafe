import { afterAll, expect, test } from "bun:test";
import { createCase, createResident } from "../../src/case/cases";
import { appPool, closePools } from "../../src/db/pool";
import { addObservation, revokeMemory } from "../../src/memory/observations";

const created: string[] = [];

afterAll(async () => {
  for (const caseId of created) {
    await appPool().query("DELETE FROM housing_case WHERE case_id = $1", [caseId]);
  }
  await closePools();
});

const VECTOR = Array.from({ length: 1024 }, (_, index) => Math.cos(index) / 10);

async function seedMemory(): Promise<{ userId: string; memoryId: string }> {
  const userId = await createResident("revoke test resident");
  const caseId = await createCase({
    userId,
    rawAddress: "302 Sumner St",
    addressEntityId: null,
    issueCategory: "heat",
  });
  created.push(caseId);
  const { memoryId } = await addObservation(
    { caseId, body: "I want to take this back.", category: null },
    async () => VECTOR,
  );
  return { userId, memoryId: memoryId! };
}

test("revoking hides the memory now and schedules deletion by the database", async () => {
  const { userId, memoryId } = await seedMemory();
  expect(await revokeMemory(memoryId, userId)).toBe(true);

  const { rows } = await appPool().query<{ revoked_at: Date; expires_at: Date }>(
    "SELECT revoked_at, expires_at FROM memory_item WHERE memory_id = $1",
    [memoryId],
  );
  expect(rows[0]!.revoked_at).not.toBeNull();
  // expires_at is what CockroachDB's row-level TTL job (migration 008) acts
  // on. Thirty days out, give or take a minute of clock skew.
  const days = (rows[0]!.expires_at.getTime() - Date.now()) / 86_400_000;
  expect(days).toBeGreaterThan(29.9);
  expect(days).toBeLessThan(30.1);
});

test("a stranger cannot revoke someone else's memory", async () => {
  const { memoryId } = await seedMemory();
  const stranger = await createResident("revoke stranger");
  expect(await revokeMemory(memoryId, stranger)).toBe(false);
  const { rows } = await appPool().query<{ revoked_at: Date | null }>(
    "SELECT revoked_at FROM memory_item WHERE memory_id = $1",
    [memoryId],
  );
  expect(rows[0]!.revoked_at).toBeNull();
});

test("revoking twice reports failure the second time rather than moving the deletion date", async () => {
  const { userId, memoryId } = await seedMemory();
  expect(await revokeMemory(memoryId, userId)).toBe(true);
  expect(await revokeMemory(memoryId, userId)).toBe(false);
});
