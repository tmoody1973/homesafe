import { afterAll, expect, test } from "bun:test";
import { createCase, createResident, listObservations } from "../../src/case/cases";
import { appPool, closePools } from "../../src/db/pool";
import { addObservation } from "../../src/memory/observations";

// Real rows against the real cluster. A fixture-only pass would prove these
// files agree with themselves and nothing about the grants they run under.

const created: string[] = [];

afterAll(async () => {
  for (const caseId of created) {
    await appPool().query("DELETE FROM housing_case WHERE case_id = $1", [caseId]);
  }
  await closePools();
});

async function seedCase(): Promise<{ userId: string; caseId: string }> {
  const userId = await createResident("test resident");
  const caseId = await createCase({
    userId,
    rawAddress: "302 Sumner St",
    addressEntityId: null,
    issueCategory: "heat",
  });
  created.push(caseId);
  return { userId, caseId };
}

test("a new case belongs to the resident who opened it", async () => {
  const { userId, caseId } = await seedCase();
  const { rows } = await appPool().query<{ user_id: string; status: string }>(
    "SELECT user_id, status FROM housing_case WHERE case_id = $1",
    [caseId],
  );
  expect(rows[0]!.user_id).toBe(userId);
  expect(rows[0]!.status).toBe("open");
});

test("listObservations returns nothing for a different resident", async () => {
  const { caseId } = await seedCase();
  await addObservation(
    { caseId, body: "The radiators were cold all night.", category: "heat" },
    async () => Array.from({ length: 1024 }, () => 0.01),
  );
  const otherUserId = await createResident("someone else");

  const owner = await listObservations(caseId, (await ownerOf(caseId)));
  const stranger = await listObservations(caseId, otherUserId);

  expect(owner).toHaveLength(1);
  expect(stranger).toHaveLength(0);
});

async function ownerOf(caseId: string): Promise<string> {
  const { rows } = await appPool().query<{ user_id: string }>(
    "SELECT user_id FROM housing_case WHERE case_id = $1",
    [caseId],
  );
  return rows[0]!.user_id;
}
