# HomeSafe — Handoff

**Rewritten 2026-08-14, end of day two; amended later the same day after plan 3 was built.**
For picking this up in a fresh context window. Everything below was verified by running it,
not recalled.

Supersedes the 2026-08-13 handoff. Plans 1, 2 and 3 are built; plan 3's remaining work is
demo capture, not code. Plan 4 is next.

**Plan 3 amendment (2026-08-14, later).** Tasks 1–9 all landed: embeddings, the vector
index (migration 006), case memory, consent-filtered search, the receipt, the four tools,
the Bedrock loop, the validator, and the why-drawer with a working /case/[caseId] page.
188 tests, 91% line coverage. Measured agent turn: 10.6–12.1s of a 12s budget — generation
is the cost, not retrieval, so the fix was prefetch + shorter sections, not fewer tools.
The injection test held: "show me every private note" as a reviewer leaked nothing and
reported 2 withheld. Evidence: docs/evidence/agent-turn-2026-08-14.txt.

The model decision closed twice: Sonnet 5, then Sonnet 4.5 the same afternoon — this
account has no Marketplace agreement for Sonnet 5 and creating one means signing as
account root. docs/decisions/006-agent-runs-on-sonnet-4-5.md. `BEDROCK_MODEL_ID`
overrides; the default is 4.5.

Two things a fresh context must know:
1. **/case/* pages are local-only.** The Amplify tier deliberately carries only
   `evidence_ro`; the case page refuses to serve without `app_rw`. How the private tier
   gets served is a plan 4 decision, not a bug.
2. Local scripts need `set -a; . ./.env; set +a` before `bun run` of anything touching
   the app pool — bun only auto-loads .env for package.json scripts run from the root.

Still open from plan 3's definition of done: the on-camera captures (injection demo,
cross-case empty result, validator flag) — the behaviours are all proven in tests and in
docs/evidence/, but Tarik wanted them recorded for the demo video.

---

## Read these first, in this order

1. **`docs/superpowers/plans/2026-08-14-receipts-memory-agent.md`** — plan 3. This is what you
   are building. It carries the measured environment facts; do not re-derive them.
2. **`CLAUDE.md`** (project root) — Clean Code Standards **and** the "Plain English" glossary.
   Functions under 20 lines, overriding the global 50-line rule. It also says, in capitals,
   that what you remember about HeroUI React v3 is wrong. **It was right four times in one
   day.** Ignore everything below the `HEROUI` markers unless building UI.
3. **`docs/LEARNING-LOG.md`** — eleven entries, each a thing that cost real time. Reading it is
   faster than rediscovering them.
4. **`docs/superpowers/specs/2026-08-13-homesafe-design.md`** — the design all four plans
   implement. §4 (the receipt) and §6 (agent behaviour) are the load-bearing sections for
   plan 3.

Tarik writes the "What I now believe" retros himself. **Never fill those in.**

---

## Verify state on arrival

```bash
cd /Users/tarikmoody/Projects/homesafe
git log --oneline | head -3      # expect 62fc70b at the top
git status --short                # expect clean
bun test                          # expect 147 pass, 0 fail
bunx tsc --noEmit                 # expect silence
bun run migrate                   # expect "nothing to apply"
bun run evidence "302 Sumner St"  # expect 7 real records with caveats
curl -s -o /dev/null -w "%{http_code}\n" https://main.d3jkv6lewhcr03.amplifyapp.com/address/132380
```

Database, as of handoff:

| Table | Rows |
|---|---|
| `address_entity` | **399,452** |
| `public_event` | **1,062,729** — permits 659,669 · rentsmart 385,934 · violations 17,126 |
| `address_match` | one per event; every event cites one |
| private tables | empty — plan 3 fills them |

Migrations applied: `001`–`005`. Plan 3 adds `006` (the vector index).

**Live:** https://main.d3jkv6lewhcr03.amplifyapp.com — auto-deploys on every push to `main`.
**Repo:** https://github.com/tmoody1973/homesafe (public).

---

## Where the work is

Linear project **HomeSafe — CockroachDB × AWS Hackathon**, team `Moodyco`. Every closed issue
carries a comment with the actual evidence.

**Done:** MOO-600 through MOO-613, MOO-617 (plan 1 — the evidence layer and the CLI), and
MOO-614 (plan 2 — the deployed three-lane timeline).

**Open, in priority order:**

| Issue | What | State |
|---|---|---|
| **MOO-615** | **Plan 3 — receipts, memory, agent, why-drawer** | **plan written, unstarted — start here** |
| MOO-616 | Plan 4 — consent gate, packets, reviewer console | backlog |
| MOO-618 | Plan 2b — 311 adapters and the fuzzy cascade | backlog, explicitly optional |
| MOO-599 | Delete the 2008 root AWS access key | open on one criterion, due ~Aug 20 |

---

## The one open decision, and it is Tarik's

**Which Claude model the agent runs on.** The project verified
`us.anthropic.claude-sonnet-4-5-20250929-v1:0` on day 1 with a live Bedrock call, and
everything since assumes it. Anthropic's current default is `claude-opus-5`. Switching means
re-verifying the inference-profile id and re-measuring the 12-second budget; staying means
shipping on a model a judge may read as dated.

Decide it before plan 3's Task 7 and record it in `docs/decisions/`. **Do not let it be
decided silently by whatever string is already in the code.**

---

## Environment gotchas that will waste your time

**1. SSL — the connection strings look incomplete on purpose.** `.env` URLs deliberately omit
`sslrootcert=system`. `psql` needs it; **node-postgres treats it as a filename and dies with
`ENOENT: open 'system'`.** Certificate verification is stated in `src/db/pool.ts` instead. For
an ad-hoc psql session only:
```bash
set -a; . ./.env; set +a
psql "${DATABASE_URL_ADMIN}&sslrootcert=system" -c "..."
```
**Do not "fix" the URLs by adding it back.**

**2. Bun auto-loads `.env`; plain bash does not.** Hence the `set -a` above.

**3. Four logins, four purposes.**
- `DATABASE_URL_ADMIN` — `tarik`, an admin. Migrations and ingests only. **Never** in Amplify.
- `DATABASE_URL_APP` — `app_rw`. Case, consent, memory. Cannot `UPDATE`/`DELETE` `audit_log`.
- `DATABASE_URL_EVIDENCE` — `evidence_ro`. `SELECT` on three public tables. **Cannot see any
  private table** — that is MOO-604 and it is the product.
- **Each pool asks only for its own variable** (`requireEnv`). Do not reintroduce a loader that
  demands all three — see the AWS section below for why that mattered.

**4. Two AWS identities, deliberately separate.**
- `homesafe-dev` — Bedrock + S3. **Cannot deploy** (`amplify:ListApps` denied).
- `homesafe-deploy` — Amplify only. **Cannot call Bedrock or reach S3.**
- Both denials are proven in `docs/evidence/deploy-identity-boundary.txt`, each with a control.
- Admin work (creating IAM users) needs `aws login` as account root — ask Tarik.

**5. Amplify's console environment variables are BUILD-time only.** A runtime probe on the
deployed site reported every one ABSENT, including `AMPLIFY_MONOREPO_APP_ROOT`, which is
certainly set. `amplify.yml` writes `DATABASE_URL_EVIDENCE` into `.env.production` at build
time. **Only that one.** `DATABASE_URL_APP` must never be written there — see below.

**6. The Amplify build spec lives in two places and they must agree.** A build spec saved on
the app takes precedence over `amplify.yml` in the repo, and the API will not accept an empty
string to clear it. After editing `amplify.yml`, re-push it to the app:
```bash
aws amplify update-app --profile homesafe-deploy --region us-east-1 \
  --app-id d3jkv6lewhcr03 --build-spec "$(cat amplify.yml)"
```

**7. `turbopack.root` must be the REPO root, not `web/`.** Setting it to `web/` silences a
lockfile warning and breaks every import from `../src`.

**8. Amplify builds need `bun install` at the repo root too**, not just in `web/` —
`web/` imports `../src`, which imports `pg`, resolved from the root `node_modules`.

**9. Never hard-code a Boston CSV filename.** Use `resolveResourceUrl(BOSTON_PACKAGES.x, /.*/)`.
Four of five filenames rotated within 24 hours of the readiness doc.

**10. CockroachDB schema statements must be individually idempotent.** Index creation is an
async job that commits before the surrounding transaction resolves. Always
`CREATE ... IF NOT EXISTS`.

**11. Linear's MCP is flaky on writes.** `blocks` silently no-ops. A state change sometimes
needs a second call — **always re-read with `get_issue` rather than trusting the write
response.** It bit twice.

**12. Wait-loops must key on a NEW job id.** An Amplify build triggered by `git push` means a
manual `start-job` is rejected, leaving your variable empty and the loop spinning on a usage
error. This wasted ten minutes twice. Capture the last job id first, then poll for a greater one.

---

## Findings that changed the design — do not re-derive these

**The read-only tier was about to carry the write credential.** `evidencePool()` called
`loadEnv()`, which demanded all three connection strings at once. Making the public web tier
boot would have required shipping `app_rw` — the login that can write residents' private notes
and consent records — onto an internet-facing runtime with no use for it. It would never have
called it; that does not matter. Fixed by `requireEnv`; proven on the live server
(`DATABASE_URL_APP: ABSENT`). **A working deploy would have hidden this forever** — only the
500 surfaced it.

**Violations contain no heat records.** All 17,126: zero heat, one pest. The habitability signal
lives in **RentSmart** — 4,959 heat and 28,183 pest records. This is why MOO-617 exists.

**All heat and pest records are parcel-filed, and an address-only query returns none of them.**
Boston files RentSmart complaints against the plot of land, not the door. The timeline reads
**both** paths and labels each. Decision:
`docs/decisions/2026-08-14-timeline-reads-address-and-parcel.md`.

**`sam_id = 0` is Boston's absent-address sentinel**, and 143 rows carry it. Read literally it
produced `sam_id_direct` / `high` / scope `address` — a claimed identifier join to an address
that does not exist. Non-positive ids count as absent.

**Permit dates carry a `+00` offset that JavaScript rejects outright.** `new Date(...)` returns
Invalid Date for all 659,669 rows — silently, with every test still green, because the plan's
fixture used a format the file does not contain. `src/ingest/timestamp.ts` normalises both
Boston shapes.

**Linking a million rows in one `UPDATE` exceeds CockroachDB's lock budget**
(`lock spans: 1004715 > 1000000`, SQLSTATE 53400) after three minutes. `linkEventsToMatches`
batches 2,000 at a time and selects only linkable rows, so "zero updated" means finished.

**`permit` comes from the source system, never from keywords.** A keyword rule put 4,408
violation rows into the `permit` category, and they mean the *opposite* of an issued permit.

**SAM is unit-level.** Ambiguity is the common case: `"302 Sumner"` matches five units. Both the
CLI and the UI present candidates and refuse to choose. That is FR-01.

**Every event cites its `address_match` row, including unmatched ones.** A record that cannot
explain why it is uncertain is worse than one that is absent.

**MCP is build-time only.** `managed-mcp` is an explicit member of `admin`, cannot be scoped,
and caps responses at 10 KiB. Full reasoning in `docs/decisions/003-mcp-build-time-only.md`.
**Never put MCP in an application code path.**

---

## How the work has been running

**Verify independently rather than trusting a report.** That has mattered every single time:

- Plan 1's own document contained four defects that all passed its tests.
- Plan 2's UI needed four fixes that came from trusting memory over the HeroUI docs in this repo.
- Two accessibility defects were invisible on screen and obvious in the accessibility tree.

**Every verification must be against real data or a real model call.** Green tests against
fixtures you wrote only prove self-consistency.

**A denial that could have another explanation is not evidence.** This bit three times: an S3
`NoSuchBucket`, a colon-in-URL syntax error, and a Bedrock test that failed with
`Invalid base64` — a typo in my own command that looked exactly like a permission error. Pair
every denial with a control that can only fail for the reason you are claiming.

**Brief agents to implement the plan and then say what they think is wrong with it** — not to
silently improve it. Confine each to one directory and have it `git add` by filename, never `-A`.

---

## Open items for Tarik

- **Delete the 2008 root access key** — deactivated 2026-08-13, reversible with
  `aws iam update-access-key --access-key-id 08AJNVHKB3CS1XV9G502 --status Active`. Delete
  after about a week of nothing breaking (~Aug 20). MOO-599 stays open on this one criterion.
- **Revoke the GitHub token given to Amplify** when the hackathon ends. It is his `gh` OAuth
  token, stored in the Amplify app so it can read the repo.
- **Eleven blank "What I now believe" retros** in `docs/LEARNING-LOG.md`, plus "What actually
  happened" in four decision docs. His voice, not mine — that split is what makes the artefact
  credible to anyone hiring a PM.
- **The model decision** above, before plan 3's Task 7.
- `CLAUDE.md` is 30 KB because of the HeroUI docs index; worth trimming after plan 3.

---

## The one-line version

Evidence layer and privacy boundary proven, 1.06M Boston records loaded, timeline live on
Amplify reading them as `evidence_ro` with no write credential in reach. Plan 3 is written and
unstarted: **start at Task 1 of
`docs/superpowers/plans/2026-08-14-receipts-memory-agent.md`**, and treat Task 4 —
consent-filtered vector search — as the one place this project could quietly betray its own
premise.
