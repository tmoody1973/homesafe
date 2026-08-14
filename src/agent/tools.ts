// Four tools. Not five.
//
// `approve_packet_share` and `record_review` are deliberately absent. They are
// buttons, wired to server actions, never model-callable. A tool with a
// confirmation flag is still a tool the model can attempt, and attempts are
// exactly what prompt injection produces. A test asserts the count, so the day
// someone adds a fifth for convenience, that test is the conversation.
//
// Two of these connect as `evidence_ro`, which has no grant on any private
// table. Their inability to return a resident's note is a missing GRANT, not a
// filter in this file — nothing written here can widen it.

import { resolveAddress } from "../address/resolve";
import type { EvidenceItem } from "../evidence/query";
import { publicTimeline } from "../evidence/query";
import { embed } from "../memory/embed";
import type { MemorySearchResult } from "../memory/search";
import { searchCaseMemory } from "../memory/search";
import type { ActorRole } from "../receipt/types";

export type ToolContext = {
  readonly caseId: string;
  readonly userId: string;
  readonly role: ActorRole;
};

export type ToolSpec = {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
};

const MEMORY_LIMIT = 8;

export const TOOL_SPECS: readonly ToolSpec[] = [
  {
    name: "resolve_address",
    description:
      "Find Boston addresses matching text the resident typed. Returns every " +
      "candidate with a confidence. Never pick one yourself — a street address " +
      "in a multi-unit building matches several units, and the resident chooses.",
    inputSchema: {
      type: "object",
      properties: {
        raw_address: { type: "string", description: "Address text as typed" },
        zip: { type: "string", description: "Optional 5-digit ZIP" },
      },
      required: ["raw_address"],
    },
  },
  {
    name: "get_public_timeline",
    description:
      "Read Boston public records tied to one SAM address id. Public sources " +
      "only. Each record states how it was matched, how coarse the match is, " +
      "and what it does not prove.",
    inputSchema: {
      type: "object",
      properties: {
        sam_address_id: { type: "integer", description: "Boston SAM address id" },
      },
      required: ["sam_address_id"],
    },
  },
  {
    name: "search_case_memory",
    description:
      "Search this resident's own stored notes for this case by meaning. " +
      "Returns nothing they have not stored and nothing from any other case.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "What to look for, in plain words" },
      },
      required: ["query"],
    },
  },
  {
    name: "create_packet_draft",
    description:
      "Assemble a draft summary the resident could choose to share. It is a " +
      "preview only. It shares nothing and notifies nobody.",
    inputSchema: {
      type: "object",
      properties: {
        item_refs: {
          type: "array",
          items: { type: "string" },
          description: "Refs to include, taken from what you were given",
        },
        note: { type: "string", description: "One line on what this is for" },
      },
      required: ["item_refs"],
    },
  },
] as const;

type ToolInput = Record<string, unknown>;

// Two returns, deliberately. `model` is what the model is shown; `observed` is
// what the retrieval layer saw, and only `observed` reaches the receipt. The
// model never gets to describe its own retrieval.
export type ToolOutcome = {
  readonly model: unknown;
  readonly observed?: {
    readonly memory?: MemorySearchResult;
    readonly evidence?: EvidenceItem[];
  };
};

async function runResolveAddress(input: ToolInput): Promise<ToolOutcome> {
  const candidates = await resolveAddress(
    String(input.raw_address ?? ""),
    input.zip ? String(input.zip) : undefined,
  );
  return { model: { candidates, resident_must_choose: candidates.length > 1 } };
}

async function runPublicTimeline(input: ToolInput): Promise<ToolOutcome> {
  const samAddressId = Number(input.sam_address_id);
  if (!Number.isInteger(samAddressId) || samAddressId <= 0) {
    throw new Error("sam_address_id must be a positive integer");
  }
  const events = await publicTimeline(samAddressId);
  return { model: { events }, observed: { evidence: events } };
}

async function runSearchCaseMemory(
  input: ToolInput,
  context: ToolContext,
): Promise<ToolOutcome> {
  const memory = await searchCaseMemory({
    caseId: context.caseId,
    userId: context.userId,
    queryVector: await embed(String(input.query ?? "")),
    limit: MEMORY_LIMIT,
    viewerRole: context.role,
  });
  return {
    model: { hits: memory.hits, excluded: memory.excluded },
    observed: { memory },
  };
}

// A draft, and only a draft. Sharing is a button in plan 4, never a tool.
function runCreatePacketDraft(input: ToolInput): ToolOutcome {
  const refs = Array.isArray(input.item_refs) ? input.item_refs.map(String) : [];
  return {
    model: {
      status: "draft",
      shared: false,
      item_refs: refs,
      note: input.note ? String(input.note) : null,
    },
  };
}

const HANDLERS: Record<
  string,
  (input: ToolInput, context: ToolContext) => Promise<ToolOutcome> | ToolOutcome
> = {
  resolve_address: runResolveAddress,
  get_public_timeline: runPublicTimeline,
  search_case_memory: runSearchCaseMemory,
  create_packet_draft: runCreatePacketDraft,
};

export async function runTool(
  name: string,
  input: ToolInput,
  context: ToolContext,
): Promise<ToolOutcome> {
  const handler = HANDLERS[name];
  if (!handler) throw new Error(`No such tool: ${name}`);
  return handler(input, context);
}
