// Loads the curated Massachusetts housing rules into memory as
// `policy_guidance` — global memory, case_id NULL, retrievable for every case
// by meaning like everything else, and cited like everything else.
//
// The corpus is a checked-in JSON file, not a scrape: each entry was verified
// against its source by a person, carries that source URL, and must say
// "not yet attorney-reviewed" on its face — the ingest refuses entries that
// don't. When an attorney does review one, the flag changes in the file and
// the change is a git commit someone signed.
//
// Idempotent by reconstruction: global policy rows are replaced wholesale, so
// re-running after an edit never leaves a stale rule behind.

import rulesFile from "../../data/policy/mass-housing-rules.json";
import { appPool } from "../db/pool";
import { embed } from "../memory/embed";

type PolicyRule = {
  readonly id: string;
  readonly title: string;
  readonly rule: string;
  readonly source_name: string;
  readonly source_url: string;
  readonly review_status: string;
};

export function policyBody(rule: PolicyRule): string {
  return (
    `MASSACHUSETTS RULE — ${rule.title}: ${rule.rule} ` +
    `(Source: ${rule.source_name}, ${rule.source_url} — ${rule.review_status}.)`
  );
}

export async function ingestPolicyRules(): Promise<number> {
  const rules = (rulesFile as { rules: PolicyRule[] }).rules;
  for (const rule of rules) {
    if (rule.review_status !== "not yet attorney-reviewed"
      && rule.review_status !== "attorney-reviewed") {
      throw new Error(`Rule ${rule.id} has no honest review_status`);
    }
  }
  await appPool().query(
    "DELETE FROM memory_item WHERE memory_type = 'policy_guidance' AND case_id IS NULL",
  );
  for (const rule of rules) {
    const body = policyBody(rule);
    const vector = await embed(body);
    await appPool().query(
      `INSERT INTO memory_item (case_id, memory_type, body, embedding, consent_scope)
       VALUES (NULL, 'policy_guidance', $1, $2::VECTOR, 'public_rule')`,
      [body, `[${vector.join(",")}]`],
    );
  }
  return rules.length;
}

if (import.meta.main) {
  const count = await ingestPolicyRules();
  console.log(`ingested ${count} policy rules`);
  process.exit(0);
}
