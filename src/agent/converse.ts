// The tool loop. It ties the three guardrails together in one order that
// matters: tools read (grants decide what they can see), the receipt records
// what they read, then the model's prose is held against that receipt.
//
// Spec §7: a Bedrock failure leaves case, consent and evidence data untouched.
// Nothing here writes case state — the only write is the `agent_run` row, and
// that happens after the model has already answered.

import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ContentBlock,
  type Message,
  type Tool,
  type ToolInputSchema,
  type ToolResultContentBlock,
} from "@aws-sdk/client-bedrock-runtime";
import { requireEnv } from "../config/env";
import { appPool } from "../db/pool";
import type { EvidenceItem } from "../evidence/query";
import { publicTimeline } from "../evidence/query";
import { embed } from "../memory/embed";
import type { MemorySearchResult } from "../memory/search";
import { searchCaseMemory } from "../memory/search";
import { emitReceipt, persistAgentRun } from "../receipt/emit";
import type { Receipt, ActorRole } from "../receipt/types";
import { MODEL_SECTIONS, RESPONSE_SCHEMA, systemPrompt } from "./prompt";
import { TOOL_SPECS, runTool, type ToolContext } from "./tools";
import { validate, type ValidationResult } from "./validator";

// Decision 006. Tarik's call, twice: Sonnet 5 first, then Sonnet 4.5 once the
// cost of getting it was clear. Sonnet 5 has no AWS Marketplace agreement on
// this account (`agreementAvailability: NOT_AVAILABLE`, against a control of
// AVAILABLE for this model), and creating one means signing a billing
// agreement as account root — the credential MOO-599 exists to remove.
//
// The override stays so a run can be pinned elsewhere deliberately, rather
// than the model being decided by whatever string happens to be here.
export const MODEL_ID =
  process.env.BEDROCK_MODEL_ID?.trim() ||
  "us.anthropic.claude-sonnet-4-5-20250929-v1:0";

const MAX_ROUNDS = 8;
const MAX_TOKENS = 800;

// The SDK types a JSON Schema as a recursive DocumentType, which a plain
// object literal cannot satisfy structurally. One cast, in one place.
function asSchema(schema: unknown): ToolInputSchema {
  return { json: schema } as unknown as ToolInputSchema;
}

// Not a fifth tool. final_answer performs nothing and reaches nothing; it is
// how Bedrock returns the section shape as structured output rather than as
// prose we would have to parse. The rule this protects is "no tool that acts",
// and it still holds.
const FINAL_ANSWER: Tool = {
  toolSpec: {
    name: "final_answer",
    description: "Give your answer. Four sections, each in plain words.",
    inputSchema: asSchema(RESPONSE_SCHEMA),
  },
};

const TOOLS: Tool[] = [
  ...TOOL_SPECS.map((spec) => ({
    toolSpec: {
      name: spec.name,
      description: spec.description,
      inputSchema: asSchema(spec.inputSchema),
    },
  })),
  FINAL_ANSWER,
];

export type AgentTurn = {
  readonly runId: string;
  readonly receipt: Receipt;
  readonly sections: Record<string, string>;
  readonly validation: ValidationResult;
  readonly latencyMs: number;
  // One entry per model call. Plan 3 budgets 12 seconds for a whole turn, and
  // the honest fix for an over-budget turn is fewer tool calls — which you
  // cannot choose between without knowing what each round cost.
  readonly roundLatenciesMs: number[];
};

type Observed = {
  memory: MemorySearchResult | null;
  evidence: EvidenceItem[];
};

let client: BedrockRuntimeClient | undefined;

function bedrock(): BedrockRuntimeClient {
  client ??= new BedrockRuntimeClient({
    region: requireEnv(process.env, "AWS_REGION"),
  });
  return client;
}

function toolUses(content: ContentBlock[]): NonNullable<ContentBlock.ToolUseMember["toolUse"]>[] {
  return content
    .map((block) => ("toolUse" in block ? block.toolUse : undefined))
    .filter((use): use is NonNullable<typeof use> => use !== undefined);
}

async function answerToolUse(
  use: { toolUseId?: string; name?: string; input?: unknown },
  context: ToolContext,
  observed: Observed,
): Promise<ContentBlock> {
  try {
    const outcome = await runTool(
      use.name!,
      (use.input ?? {}) as Record<string, unknown>,
      context,
    );
    if (outcome.observed?.memory) observed.memory = outcome.observed.memory;
    if (outcome.observed?.evidence) observed.evidence = outcome.observed.evidence;
    return {
      toolResult: {
        toolUseId: use.toolUseId,
        content: [{ json: outcome.model } as ToolResultContentBlock],
      },
    };
  } catch (error) {
    // A failing tool is told to the model as a failure, not hidden. An agent
    // that cannot tell "no records" from "the query broke" will say the first.
    return {
      toolResult: {
        toolUseId: use.toolUseId,
        status: "error",
        content: [{ text: (error as Error).message }],
      },
    };
  }
}

function emptySections(): Record<string, string> {
  return Object.fromEntries(MODEL_SECTIONS.map((name) => [name, ""]));
}

function sectionsFrom(input: unknown): Record<string, string> {
  const source = (input ?? {}) as Record<string, unknown>;
  return Object.fromEntries(
    MODEL_SECTIONS.map((name) => [name, String(source[name] ?? "")]),
  );
}

// Measured 2026-08-14: a turn that made the model discover everything through
// tools cost 14.7s against a 12s budget, spread over three model calls. The
// case already knows its address and its question, so the two reads that will
// certainly happen are done here, before the model runs, and handed over in
// the first message. The tools stay available for anything else it wants.
//
// This also tightens the receipt: the retrieval it records is retrieval this
// code performed, not retrieval the model chose to report.
async function prefetch(
  context: ToolContext,
  question: string,
): Promise<Observed> {
  const [memory, evidence] = await Promise.all([
    searchCaseMemory({
      caseId: context.caseId,
      userId: context.userId,
      queryVector: await embed(question),
      limit: 8,
      viewerRole: context.role,
    }),
    timelineForCase(context.caseId, context.userId),
  ]);
  return { memory, evidence };
}

// Ownership is checked in SQL here too: the SAM id is read only from a case
// this user owns. `evidence_ro` then reads the records themselves.
async function timelineForCase(
  caseId: string,
  userId: string,
): Promise<EvidenceItem[]> {
  const { rows } = await appPool().query<{ sam_address_id: string }>(
    `SELECT a.sam_address_id FROM housing_case c
     JOIN address_entity a ON a.address_entity_id = c.address_entity_id
     WHERE c.case_id = $1 AND c.user_id = $2`,
    [caseId, userId],
  );
  if (rows.length === 0) return [];
  return publicTimeline(Number(rows[0]!.sam_address_id));
}

function openingMessage(question: string, observed: Observed): string {
  return [
    question,
    "",
    "Already retrieved for you — cite from this, and call a tool only if you need something it does not cover:",
    JSON.stringify({
      case_memory: observed.memory?.hits ?? [],
      withheld: observed.memory?.excluded ?? [],
      public_records: observed.evidence,
    }),
  ].join("\n");
}

async function converseUntilAnswer(
  question: string,
  context: ToolContext,
  observed: Observed,
  roundLatenciesMs: number[],
): Promise<Record<string, string>> {
  const messages: Message[] = [
    { role: "user", content: [{ text: openingMessage(question, observed) }] },
  ];
  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const startedRound = performance.now();
    const response = await bedrock().send(
      new ConverseCommand({
        modelId: MODEL_ID,
        system: [{ text: systemPrompt() }],
        messages,
        toolConfig: { tools: TOOLS },
        inferenceConfig: { maxTokens: MAX_TOKENS },
      }),
    );
    roundLatenciesMs.push(Math.round(performance.now() - startedRound));
    const content = response.output?.message?.content ?? [];
    messages.push({ role: "assistant", content });

    const uses = toolUses(content);
    const final = uses.find((use) => use.name === "final_answer");
    if (final) return sectionsFrom(final.input);
    if (uses.length === 0) return emptySections();

    const results = await Promise.all(
      uses.map((use) => answerToolUse(use, context, observed)),
    );
    messages.push({ role: "user", content: results });
  }
  throw new Error(`Agent did not answer within ${MAX_ROUNDS} rounds`);
}

export async function runAgentTurn(
  context: ToolContext,
  question: string,
): Promise<AgentTurn> {
  const started = performance.now();
  const observed = await prefetch(context, question);
  const roundLatenciesMs: number[] = [];
  const sections = await converseUntilAnswer(
    question,
    context,
    observed,
    roundLatenciesMs,
  );

  const receipt = await emitReceipt({
    caseId: context.caseId,
    actor: { user_id: context.userId, role: context.role as ActorRole },
    question,
    memory: observed.memory ?? emptyMemory(),
    evidence: observed.evidence,
  });
  const validation = validate(Object.values(sections).join(" "), receipt.items);
  const latencyMs = Math.round(performance.now() - started);

  const runId = await persistAgentRun({
    receipt,
    modelId: MODEL_ID,
    modelOutput: JSON.stringify(sections),
    validatorResult: validation,
    latencyMs,
  });
  return { runId, receipt, sections, validation, latencyMs, roundLatenciesMs };
}

// A turn where the model never searched memory still needs an honest receipt:
// nothing was read, and nothing was withheld.
function emptyMemory(): MemorySearchResult {
  return { hits: [], excluded: [], consentFilterApplied: "not queried" };
}
