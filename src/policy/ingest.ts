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
import codeFile from "../../data/policy/sanitary-code-410.json";
import guidesFile from "../../data/policy/tenant-guides.json";
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

type CodeSection = {
  readonly section: string;
  readonly title: string;
  readonly text: string;
  readonly source_name: string;
  readonly source_url: string;
};

// Two tiers, honestly labelled. The curated rules are human-written plain
// English; the code sections are the EXACT regulatory wording, extracted
// mechanically from the official mass.gov document — no paraphrase for the
// model to inherit as if it were law.
function codeBody(section: CodeSection): string {
  return (
    `MASSACHUSETTS SANITARY CODE ${section.section} — ${section.title}: ${section.text} ` +
    `(Source: ${section.source_name}, ${section.source_url} — exact regulatory text, not attorney-reviewed.)`
  );
}

type TenantGuide = { readonly id: string; readonly topic: string; readonly description: string };

// Third tier: referrals to Legal Tactics, the legal-aid self-help guide.
// Copyrighted authored work, so NOTHING is reproduced — each body is our own
// one-paragraph description of what a chapter covers, plus the guide's URL.
// The agent's job with these is one sentence: "a step-by-step legal-aid guide
// exists for exactly this — here is where."
function guideBody(guide: TenantGuide, guideUrl: string): string {
  return (
    `TENANT GUIDE — ${guide.topic}: ${guide.description} ` +
    `(Free from Massachusetts legal aid organizations at ${guideUrl} — HomeSafe links to this guide and does not reproduce it.)`
  );
}

async function insertPolicy(body: string): Promise<void> {
  const vector = await embed(body);
  await appPool().query(
    `INSERT INTO memory_item (case_id, memory_type, body, embedding, consent_scope)
     VALUES (NULL, 'policy_guidance', $1, $2::VECTOR, 'public_rule')`,
    [body, `[${vector.join(",")}]`],
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
  const sections = (codeFile as { sections: CodeSection[] }).sections;
  await appPool().query(
    "DELETE FROM memory_item WHERE memory_type = 'policy_guidance' AND case_id IS NULL",
  );
  for (const rule of rules) await insertPolicy(policyBody(rule));
  for (const section of sections) await insertPolicy(codeBody(section));
  const { guides, guide_url } = guidesFile as { guides: TenantGuide[]; guide_url: string };
  for (const guide of guides) await insertPolicy(guideBody(guide, guide_url));
  return rules.length + sections.length + guides.length;
}

if (import.meta.main) {
  const count = await ingestPolicyRules();
  console.log(`ingested ${count} policy rules`);
  process.exit(0);
}
