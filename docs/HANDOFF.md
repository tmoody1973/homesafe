# HomeSafe — Handoff

**Written 2026-08-13, end of day one.** For picking this up in a fresh context window.
Everything below was verified by running it, not recalled.

---

## Read these first, in this order

1. **`docs/superpowers/plans/2026-08-13-secure-evidence-foundation.md`** — plan 1. Contains
   the exact code for every remaining task. It is the spec; do not improvise around it.
2. **`CLAUDE.md`** (project root) — Clean Code Standards **and** the "Plain English" glossary.
   Functions under 20 lines, overriding the global 50-line rule. Ignore everything below the
   `HEROUI` markers unless building UI.
3. **`docs/LEARNING-LOG.md`** — six entries, each a thing that cost real time. Reading it is
   faster than rediscovering them.
4. **`docs/superpowers/specs/2026-08-13-homesafe-design.md`** — the design the plan implements.

Tarik writes the "What I now believe" retros himself. **Never fill those in.**

---

## Verify state on arrival

```bash
cd /Users/tarikmoody/Projects/homesafe
git log --oneline | head -3      # expect aceb3e4 at the top
git status --short                # expect clean
bun test                          # expect 88 pass, 0 fail
bunx tsc --noEmit                 # expect silence
bun run migrate                   # expect "nothing to apply"
```

Database, as of handoff:

| Table | Rows |
|---|---|
| `address_entity` | **399,452** (SAM ingested) |
| `public_event` | 0 — next tasks fill this |
| `address_match` | 0 — next tasks fill this |

Migrations applied: `001`, `002`, `003`, `004`.

---

## Where the work is

Linear project **HomeSafe — CockroachDB × AWS Hackathon**, team `Moodyco`, issues `MOO-599`
onward. Every issue carries Intent / Acceptance criteria / Verification checklist, and each
closed one has a comment with the actual evidence.

**Done (12):** MOO-599 (scoped IAM user; root key deactivated), MOO-600 (cluster access),
MOO-601 (scaffold), MOO-602 (migration runner + public schema), MOO-603 (private schema,
`VECTOR(1024)`), **MOO-604 (the privilege gate)**, MOO-605 (CKAN resolution), MOO-606
(streaming + upsert + `stripPersonalFields`), MOO-607 (address normalize), MOO-608 (SAM
ingest), MOO-609 (address resolution), MOO-610 (categories + caveats).

**Remaining, strictly in this order** — each needs the previous one's rows:

| Issue | Task | Note |
|---|---|---|
| **MOO-611** | violations ingest via `sam_id` | next; first task to write `public_event` |
| MOO-612 | permits ingest via `property_id` | 237 MB, streaming already proven |
| **MOO-617** | **RentSmart ingest via `parcel`** | added today — this is where heat records live |
| MOO-613 | evidence timeline query + CLI | the deliverable |

Then plans 2–4 exist as backlog issues MOO-614, MOO-615, MOO-616.

---

## Environment gotchas that will waste your time

**1. SSL — the connection strings look incomplete on purpose.**
`.env` URLs deliberately omit `sslrootcert=system`. `psql` needs it; **node-postgres treats it
as a filename and dies with `ENOENT: open 'system'`.** Certificate verification is stated in
`src/db/pool.ts` instead. For an ad-hoc psql session only:
```bash
set -a; . ./.env; set +a
psql "${DATABASE_URL_ADMIN}&sslrootcert=system" -c "..."
```
**Do not "fix" the URLs by adding it back.**

**2. Bun auto-loads `.env`; plain bash does not.** Hence the `set -a` above.

**3. Three logins, three purposes.**
- `DATABASE_URL_ADMIN` — `tarik`, an admin. Migrations only. **Never** put this in Amplify or
  Lambda.
- `DATABASE_URL_APP` — `app_rw`. Case/consent/memory data. Cannot `UPDATE` or `DELETE`
  `audit_log` (append-only by a missing grant).
- `DATABASE_URL_EVIDENCE` — `evidence_ro`. `SELECT` on `address_entity`, `address_match`,
  `public_event` only. **Cannot see any private table** — that is MOO-604 and it is the product.

**4. CockroachDB schema statements must be individually idempotent.** Index creation is an
async job that commits before the surrounding transaction resolves, so a failed migration can
leave partial state. Migration 004 did exactly that. Always `CREATE ... IF NOT EXISTS`.

**5. Never hard-code a Boston CSV filename.** Use
`resolveResourceUrl(BOSTON_PACKAGES.x, /.*/)`. Four of five filenames rotated within 24 hours
of the readiness doc being written.

**6. Linear's MCP is flaky on writes.** `blocks` silently no-ops; `blockedBy` works sometimes.
Combining `patch` with another field discards both. State changes sometimes need a second call
— **always re-read with `get_issue` rather than trusting the write response.**

---

## Findings that changed the plan — do not re-derive these

**The `violation_zip` column.** Violations has no `zip` field. It is `violation_zip`. There is
also a `contact_zip`, which is the owner's mailing postcode and must never be mistaken for the
property's.

**Personal data in sources the spec missed.** Violations carries `contact_addr1/2`,
`contact_city`, `contact_state`, `contact_zip` (the owner's home address); permits carries
`applicant`; RentSmart carries `owner`. `stripPersonalFields()` in `src/ingest/upsert.ts`
removes them **at ingest** so they never enter the database. Verified against live headers —
nothing personal survives in any of the three sources. Apply it in every new ingest.

**`permit` comes from the source system, never from keywords.** A keyword rule put 4,408
violation rows into the `permit` category, and they mean the *opposite* of an issued permit
("Failure to secure permit", "Working Without a Permit"). One shared badge would tell a
resident their problem was being handled when the record says the reverse. `categorize()`
returns `permit` only for `source_system === "building_permit"`.

**Violations contain no heat records.** All 17,137 rows: zero heat, one pest. The habitability
signal lives in **RentSmart** (`Heat - Excessive, Insufficient` verbatim, 1,716 pest records).
That is why MOO-617 was pulled into plan 1 — without it the deliverable is a working timeline
with nothing in the category the demo is about.

**SAM is unit-level.** 267,501 of 399,452 rows carry an apartment number. Consequences:
ambiguity is the *common* case for a street address in a multi-unit building, and
`resolveAddress` correctly returns a list rather than picking. Separately, 99.5% of violation
`sam_id`s point at **address-level** records, so `address_scope = 'address'` is right and a
resident must be told a record concerns their *building*, not their apartment. About 2.4% of
violation `sam_id`s are absent from current SAM — show them unmatched, never drop them.

**A function around a column throws away the index.** `upper(full_address) = $1` full-scanned
399,452 rows at 1,900ms per lookup. Migration 004 adds an expression index; now 53ms. If a
query feels slow, `EXPLAIN` it before theorising.

**MCP is build-time only.** `managed-mcp` is an explicit member of `admin`, so it cannot be
scoped; it also exposes working write tools and caps responses at 10 KiB. Full reasoning in
`docs/decisions/003-mcp-build-time-only.md`. **Never put MCP in an application code path.**

---

## How the work has been running

Subagent per task, then **I verify independently** rather than trusting the report. That has
mattered every time:

- MOO-610's agent inverted a badge's meaning on a third of a dataset while all tests passed.
- MOO-609's agent produced correct answers at 1,900ms; no test covered viability.
- MOO-608 needed the row count *explained* (399k vs an expected 190k) rather than accepted.

**Brief agents to implement the plan and then say what they think is wrong with it** — not to
silently improve it. A subagent that quietly redesigns produces work indistinguishable from
work that followed the design.

Confine each agent to one directory, and have it `git add` by filename — never `-A`. Three
agents in one repo with `-A` each commit the others' half-finished work.

**Every verification must be against real data.** Green tests against fixtures I wrote only
prove self-consistency. Every finding above came from reading real Boston bytes.

**A denial that could have another explanation is not evidence.** This bit twice in one day:
an S3 test returned `NoSuchBucket` (proves nothing about permissions) and an insert test
returned a syntax error from a colon in a URL, which *looked* like a permission denial. Use
parameterised queries and pick a check that can only fail for the reason you're claiming.

---

## Open items for Tarik

- **Delete the 2008 root access key** — deactivated 2026-08-13, reversible with
  `aws iam update-access-key --access-key-id 08AJNVHKB3CS1XV9G502 --status Active`. Delete it
  after about a week of nothing breaking. MOO-599 stays open on this one criterion.
- **Six blank "What I now believe" retros** in `docs/LEARNING-LOG.md`, plus "What actually
  happened" in three decision docs. His voice, not mine — that split is what makes the
  portfolio artefact credible.
- `CLAUDE.md` is 30 KB because of the HeroUI docs index; worth trimming after plan 2 ships.

---

## The one-line version

Database layer done and the privacy boundary proven; 399k Boston addresses loaded; four
ingest/query tasks left in plan 1, starting with **MOO-611**, ending with
`bun run evidence "302 Sumner St"` printing real records with provenance and caveats.
