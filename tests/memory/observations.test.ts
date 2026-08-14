import { afterAll, expect, test } from "bun:test";
import { createCase, createResident } from "../../src/case/cases";
import { appPool, closePools, evidencePool } from "../../src/db/pool";
import {
  addObservation,
  embedPendingObservations,
} from "../../src/memory/observations";

const created: string[] = [];

afterAll(async () => {
  for (const caseId of created) {
    await appPool().query("DELETE FROM housing_case WHERE case_id = $1", [caseId]);
  }
  await closePools();
});

async function seedCase(): Promise<string> {
  const userId = await createResident("observation test resident");
  const caseId = await createCase({
    userId,
    rawAddress: "302 Sumner St",
    addressEntityId: null,
    issueCategory: "heat",
  });
  created.push(caseId);
  return caseId;
}

const FAKE_VECTOR = Array.from({ length: 1024 }, (_, index) => index / 1024);

test("a note and its searchable memory are written together", async () => {
  const caseId = await seedCase();
  const written = await addObservation(
    { caseId, body: "No heat since Tuesday.", category: "heat" },
    async () => FAKE_VECTOR,
  );
  expect(written.memoryId).not.toBeNull();

  const { rows } = await appPool().query<{ source_observation_id: string; consent_scope: string }>(
    "SELECT source_observation_id, consent_scope FROM memory_item WHERE memory_id = $1",
    [written.memoryId],
  );
  expect(rows[0]!.source_observation_id).toBe(written.observationId);
  expect(rows[0]!.consent_scope).toBe("private_to_resident");
});

test("a note defaults to private_to_resident — share nothing is the default", async () => {
  const caseId = await seedCase();
  const written = await addObservation(
    { caseId, body: "Landlord came by but did not enter.", category: null },
    async () => FAKE_VECTOR,
  );
  const { rows } = await appPool().query<{ privacy: string }>(
    "SELECT privacy FROM resident_observation WHERE observation_id = $1",
    [written.observationId],
  );
  expect(rows[0]!.privacy).toBe("private_to_resident");
});

// Spec §7. A resident must never lose their words because a model was down.
test("the note still saves when the embedding call fails", async () => {
  const caseId = await seedCase();
  const written = await addObservation(
    { caseId, body: "Third night with no heat.", category: "heat" },
    async () => {
      throw new Error("Bedrock unavailable");
    },
  );
  expect(written.observationId).toBeString();
  expect(written.memoryId).toBeNull();

  const caughtUp = await embedPendingObservations(10, async () => FAKE_VECTOR);
  expect(caughtUp).toBeGreaterThan(0);

  const { rows } = await appPool().query<{ count: string }>(
    "SELECT count(*) AS count FROM memory_item WHERE source_observation_id = $1",
    [written.observationId],
  );
  expect(rows[0]!.count).toBe("1");
});

// MOO-604 re-run, after this task put real rows in both private tables.
test("evidence_ro still cannot see resident notes or memory", async () => {
  const denied = /does not have \w+ privilege on relation|permission denied/i;
  await expect(
    evidencePool().query("SELECT * FROM resident_observation LIMIT 1"),
  ).rejects.toThrow(denied);
  await expect(
    evidencePool().query("SELECT * FROM memory_item LIMIT 1"),
  ).rejects.toThrow(denied);
});
