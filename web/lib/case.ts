import "server-only";

import { renderValidated, type SectionValidation } from "../../src/agent/validator";
import { listObservations, type Observation } from "../../src/case/cases";
import { appPool } from "../../src/db/pool";
import { renderReceipt, type RenderedReceipt } from "../../src/receipt/render";
import type { Receipt } from "../../src/receipt/types";

export type { Observation, RenderedReceipt };

const REQUIRED_LOGIN = "app_rw";

let confirmedLogin: Promise<void> | undefined;

// The mirror of the check in evidence.ts, and it matters for the opposite
// reason. That one refuses to serve if the read-only page ever gains write
// access. This one refuses to serve if the case page is connected as anything
// other than `app_rw` — an admin connection here would quietly ignore every
// grant the product is built on, and nothing about the page would look wrong.
async function assertCaseLogin(): Promise<void> {
  const { rows } = await appPool().query<{ current_user: string }>("SELECT current_user");
  const login = rows[0]?.current_user;
  if (login !== REQUIRED_LOGIN) {
    throw new Error(
      `Case connection is authenticated as "${login}", not "${REQUIRED_LOGIN}". ` +
        "Refusing to serve: this page must never hold privileges it cannot be restricted by.",
    );
  }
}

async function withVerifiedLogin<T>(read: () => Promise<T>): Promise<T> {
  confirmedLogin ??= assertCaseLogin();
  await confirmedLogin;
  return read();
}

export type CaseHeader = {
  readonly caseId: string;
  readonly userId: string;
  readonly rawAddress: string;
  readonly samAddressId: number | null;
  readonly issueCategory: string;
};

export type AnswerSection = {
  readonly title: string;
  readonly text: string;
};

export type LatestAnswer = {
  readonly question: string;
  readonly sections: AnswerSection[];
  readonly validation: SectionValidation;
  readonly receipt: RenderedReceipt;
  readonly modelId: string;
  readonly latencyMs: number | null;
};

// Spec §6.2, in the spec's order. The fifth section, "Why I remember this",
// is not here on purpose: it is the drawer, rendered from the receipt rather
// than written by the model.
//
// The order is stated here rather than taken from the stored object's keys.
// Those keys arrive in whatever order the model wrote them, which put
// "Possible next human step" above "What I found" on the first real run — an
// instruction to act before the reasoning it rests on.
const SECTIONS: readonly (readonly [string, string])[] = [
  ["what_i_found", "What I found"],
  ["what_changed", "What changed"],
  ["what_remains_uncertain", "What remains uncertain"],
  ["possible_next_human_step", "Possible next human step"],
];

function toSections(validation: SectionValidation): AnswerSection[] {
  return SECTIONS.map(([name, title]) => ({
    title,
    text: validation.sections[name] ? renderValidated(validation.sections[name]) : "",
  })).filter((section) => section.text.trim() !== "");
}

type CaseRow = {
  case_id: string;
  user_id: string;
  raw_address_input: string;
  sam_address_id: string | null;
  issue_category: string;
};

type RunRow = {
  question: string | null;
  model_output: string | null;
  receipt: Receipt;
  validator_result: SectionValidation;
  model_id: string;
  latency_ms: number | null;
};

export function caseHeaderFor(caseId: string): Promise<CaseHeader | null> {
  return withVerifiedLogin(async () => {
    const { rows } = await appPool().query<CaseRow>(
      `SELECT c.case_id, c.user_id, c.raw_address_input, a.sam_address_id, c.issue_category
       FROM housing_case c
       LEFT JOIN address_entity a ON a.address_entity_id = c.address_entity_id
       WHERE c.case_id = $1`,
      [caseId],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      caseId: row.case_id,
      userId: row.user_id,
      rawAddress: row.raw_address_input,
      samAddressId: row.sam_address_id === null ? null : Number(row.sam_address_id),
      issueCategory: row.issue_category,
    };
  });
}

export function observationsFor(caseId: string, userId: string): Promise<Observation[]> {
  return withVerifiedLogin(() => listObservations(caseId, userId));
}

// The prose shown is the validated prose, never the model's raw output. A
// claim citing a source that was not read has already been deleted by the time
// it reaches here.
export function latestAnswerFor(caseId: string): Promise<LatestAnswer | null> {
  return withVerifiedLogin(async () => {
    const { rows } = await appPool().query<RunRow>(
      `SELECT question, model_output, receipt, validator_result, model_id, latency_ms
       FROM agent_run WHERE case_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [caseId],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      question: row.question ?? "",
      sections: toSections(row.validator_result),
      validation: row.validator_result,
      receipt: renderReceipt(row.receipt),
      modelId: row.model_id,
      latencyMs: row.latency_ms,
    };
  });
}
