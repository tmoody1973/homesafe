import { afterAll, expect, test } from "bun:test";
import { TOOL_SPECS, runTool } from "../../src/agent/tools";
import { createCase, createResident } from "../../src/case/cases";
import { appPool, closePools } from "../../src/db/pool";
import { addObservation } from "../../src/memory/observations";

const SAM_ADDRESS_ID = 132380;
const PRIVATE_NOTE = "The radiator has been cold since Tuesday night.";

const created: string[] = [];

afterAll(async () => {
  for (const caseId of created) {
    await appPool().query("DELETE FROM housing_case WHERE case_id = $1", [caseId]);
  }
  await closePools();
});

async function seedCaseWithNote(): Promise<{ caseId: string; userId: string }> {
  const userId = await createResident("tool test resident");
  const caseId = await createCase({
    userId,
    rawAddress: "302 Sumner St",
    addressEntityId: null,
    issueCategory: "heat",
  });
  created.push(caseId);
  await addObservation(
    { caseId, body: PRIVATE_NOTE, category: "heat" },
    async () => Array.from({ length: 1024 }, (_, i) => Math.sin(i) / 10),
  );
  return { caseId, userId };
}

// The day someone adds a fifth tool for convenience, this test is the
// conversation. approve_packet_share and record_review are buttons, not tools.
test("exactly four tools are exposed to the model", () => {
  expect(TOOL_SPECS).toHaveLength(4);
  expect(TOOL_SPECS.map((spec) => spec.name).sort()).toEqual([
    "create_packet_draft",
    "get_public_timeline",
    "resolve_address",
    "search_case_memory",
  ]);
});

test("no sharing or review tool exists under any name", () => {
  const names = TOOL_SPECS.map((spec) => spec.name).join(" ");
  expect(names).not.toMatch(/approve|share|review|publish|send/i);
});

test("resolve_address returns every candidate and refuses to choose", async () => {
  const result = ((await runTool("resolve_address", { raw_address: "302 Sumner" }, {
    caseId: "unused",
    userId: "unused",
    role: "resident",
  })).model) as { candidates: unknown[]; resident_must_choose: boolean };
  expect(result.candidates.length).toBeGreaterThan(1);
  expect(result.resident_must_choose).toBe(true);
});

// The point of the boundary: this is a missing GRANT, not a filter here.
test("get_public_timeline cannot return a private note even for its own case", async () => {
  const { caseId, userId } = await seedCaseWithNote();
  const outcome = await runTool(
    "get_public_timeline",
    { sam_address_id: SAM_ADDRESS_ID },
    { caseId, userId, role: "resident" },
  );
  const result = outcome.model;
  const asText = JSON.stringify(result);
  expect(asText).not.toContain(PRIVATE_NOTE);
  expect(asText).not.toContain("radiator");
  expect((result as { events: unknown[] }).events.length).toBeGreaterThan(0);
});

test("create_packet_draft produces a draft and shares nothing", async () => {
  const result = ((await runTool(
    "create_packet_draft",
    { item_refs: ["evt_1", "obs_2"], note: "for the inspector" },
    { caseId: "unused", userId: "unused", role: "resident" },
  )).model) as { status: string; shared: boolean };
  expect(result.status).toBe("draft");
  expect(result.shared).toBe(false);
});

test("an unknown tool name is refused rather than guessed at", async () => {
  await expect(
    runTool("approve_packet_share", {}, {
      caseId: "unused",
      userId: "unused",
      role: "resident",
    }),
  ).rejects.toThrow(/No such tool/);
});
