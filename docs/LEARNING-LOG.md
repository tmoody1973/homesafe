# Learning Log

Dated entries. Each answers three things: what did we expect, what happened, what do we
now believe. Claude drafts the "expected / happened" lines from what actually occurred;
Tarik writes the "what I now believe" lines in his own voice.

---

## August 13, 2026 — Bedrock access was already granted

**What we expected.** That getting Claude models enabled on Bedrock would be the one
dependency with a queue in front of it — a request that needs AWS approval, possibly not
same-day. It was flagged as the first thing to click, before any code, because it was the
only blocker we didn't control.

**What happened.** Checked it directly instead of assuming. Fifteen Anthropic models are
available in `us-east-1`, and a real `converse` call returned text on the first try. No
request, no queue, no wait. The embedding model answered too, and measuring its output
settled a schema decision on the spot: Titan v2 returns 1024 numbers, so the database
column is `VECTOR(1024)`. That number was going to be a guess until we called the API.

**Worth noting for next time:** listing a model and being able to call it are different
things. `list-foundation-models` shows what exists in the region, not what this account is
allowed to invoke. Only the actual call proves anything.

**What I now believe.**
*(Tarik to fill in.)*

---

## August 13, 2026 — "Read-only" was doing more persuasive work than it should

**What we expected.** CockroachDB's Managed MCP Server is advertised as "safe by default:
read-only mode, full audit logging." That reads like a security guarantee, and the project
requirements document had drawn the app's AI reaching the database straight through it.

**What happened.** Read-only turns out to mean *nothing can be changed or deleted* — not
*can only look at the right things*. For most applications that distinction doesn't matter.
For this one it's the whole product: HomeSafe's promise is that a renter's notes stay
private until they choose to share. An AI that can compose its own database queries can be
talked into reading a note it shouldn't, and read-only doesn't stop that; it only means the
note survives being read.

The fix wasn't a better prompt. It was two database logins — one that can see public city
records and nothing else, which is the one the AI holds. The private tables aren't
forbidden to it; they're invisible.

**The transferable bit:** when a vendor says "safe," ask *safe against what.* The answer is
usually narrower than the word.

**What I now believe.**
*(Tarik to fill in.)*

---

## August 13, 2026 — A function around a column throws away the index

**What we expected.** Address lookup to be fast. The table has indexes; the plan specified
them; the tests passed.

**What happened.** One `resolveAddress("302 Sumner St")` call took **1,900 milliseconds.** The
spec budgets three seconds for the *entire* evidence timeline, so the very first step was eating
most of the budget before a single housing record had been fetched.

`EXPLAIN` said it plainly:

```
• filter
│ filter: upper(full_address) = '302 SUMNER ST'
└── • scan
      estimated row count: 31 - 399,452 (100% of the table)
      spans: FULL SCAN
```

The table *had* three indexes. None could help, because the query wraps the column in a
function. `upper(full_address)` is not `full_address` as far as an index is concerned — the
database would have to compute `upper()` on all 399,452 rows before it could compare anything,
so it just reads them all. **An index on a column cannot serve a query that transforms that
column.** Obvious once stated, invisible while writing the query.

Fixed with an expression index — an index on `upper(full_address)` itself rather than on the
bare column. Also added an index leading with `street_number, street_name` because the existing
one led with `zip`, and residents mostly don't type a postcode, so the second cascade step
couldn't use it either.

**Result: 1,900ms → 53ms.** Same query, same data, same code.

**A second thing, worth more than the speed fix.** The migration failed halfway with
`Connection terminated unexpectedly`, and afterwards the *first* index existed while the second
did not, and the migration was not recorded as applied. Our runner wraps each migration in a
transaction on the assumption that a failure rolls everything back. **For index creation in
CockroachDB it does not** — building an index is an asynchronous background job that had already
committed. So a partially-applied migration is a real state this project can reach.

It recovered cleanly only because both statements were written `CREATE INDEX IF NOT EXISTS`, so
re-running skipped the finished one. That was habit, not foresight. Worth making it a rule: in
CockroachDB, schema-change statements should be individually idempotent, because the transaction
will not save you.

**Worth generalising:** tests told us the answer was *correct* and said nothing about it being
*usable*. Correctness and viability are separate properties, and only one of them had a test.
The 1,900ms would have surfaced in plan 2 as "the UI feels slow" — a symptom three layers away
from its cause.

**What I now believe.**
*(Tarik to fill in.)*

---

## August 13, 2026 — The dataset the demo is about contains none of the demo's data

**What we expected.** That Boston's Building and Property Violations dataset — the
enforcement record, the thing that sounds most like "official proof a landlord did something
wrong" — would carry the heat complaints HomeSafe's whole story is built on. Plan 1 was built
around it and permits, and deliberately deferred RentSmart to a later plan on the grounds that
RentSmart needed fuzzy address matching.

**What happened.** Counted heat records in the entire violations file, all 17,137 rows.

Zero.

One pest record. In the whole file. Meanwhile RentSmart, in a smaller sample, had 17 heat
records including the literal string `Heat - Excessive, Insufficient`, plus 1,716 pest records
— `Rodent Activity`, `Bed Bugs`, `Mice Infestation - Residential`.

Violations turns out to be overwhelmingly *administrative* — `Certificate of Occupancy`,
`Right of Entry`, `Failure to secure permit`, `Testing & Certification`. It is a record of code
compliance, not of people being cold. The habitability signal — the part a renter actually
lives inside — is in the dataset I had ranked as secondary and postponed.

So plan 1, as scoped, would have delivered a working evidence timeline with real Boston records
and **not one record in the category the demo is about.** Everything would have passed. Every
test green, every join verified, the whole pipeline sound — and the deliverable would have been
useless for the story it exists to tell.

**Why I got it wrong is the interesting part.** I grouped RentSmart with 311 because both were
described as needing address matching rather than a clean identifier join. That is true and
irrelevant. RentSmart joins on `parcel` → `PARCEL_ID`, which is an identifier — it belonged
with violations and permits from the start. I sorted the datasets by *how hard they look to
join* when the question that mattered was *which one contains the thing we are looking for.*

**Worth generalising:** "does this dataset join cleanly" and "does this dataset contain what we
need" are different questions, and I only asked the first. A source's name is not its contents
— "Building and Property Violations" sounds authoritative and is mostly paperwork. The only way
to know what is in a dataset is to count what is in it.

Also worth noting what caught it: not a test. Every test passed. It surfaced from asking an
idle question — *"how many heat records are actually in here?"* — while reviewing something
else. No acceptance criterion I had written would have found this.

**What I now believe.**
*(Tarik to fill in.)*

---

## August 13, 2026 — Reading the real file headers found a privacy hole nobody had flagged

**What we expected.** Task 5 was defensive plumbing: ask Boston's catalog for today's
download link instead of hard-coding a filename, because Boston renames files on refresh.
Sensible, unglamorous, five minutes.

**What happened.** Three things, in ascending order of importance.

**One — the paranoia was already justified.** Comparing the readiness doc written the previous
day against live values: four of five filenames had *already* changed. `tmpwkewfc3d.csv` was
now `tmpi6q1ybno.csv`, and so on. Hard-coding the URLs from a document written twenty-four
hours earlier would have produced a pipeline that was broken before it ran once. The habit of
resolving instead of memorising paid for itself the same day it was written.

**Two — a column in the plan does not exist.** Since the download worked, I pulled the first
few hundred bytes of each file and checked every column name the plan's mappers referenced.
The violations mapper read a field called `zip`. There is no `zip` in that file. The real name
is `violation_zip`. That would have quietly produced addresses with no postcode, weakening
every 311 match later — a data-quality bug that degrades results rather than raising an error.

**Three — and this is the one that matters — the sources carry personal data the spec had
not accounted for.** The violations file has `contact_addr1`, `contact_addr2`, `contact_city`,
`contact_state`, `contact_zip`: the property owner's mailing address. Permits has `applicant`:
who filed it.

The spec's rule was "never display owner fields," and it named RentSmart and Property
Assessment as the sources that carry them. It missed these two. Worse, the plan preserved the
*entire* source row as `raw_payload` for provenance — which would have written owner home
addresses into a table the read-only evidence login can query.

Nobody would have shown them deliberately. That is not the failure mode. The failure mode is
that they would have been *sitting there*, one careless `SELECT *` from turning a
housing-safety tool into a landlord-targeting one — in a project whose stated non-goals
explicitly forbid exactly that.

Fixed by dropping personal fields at ingest so they never enter the database at all, rather
than by remembering not to select them.

**What this cost:** twenty minutes. **What it would have cost:** four adapters built on a
wrong column name, and personal data quietly accumulating in a table we had spent the whole
morning proving was safe to read.

**Worth generalising:** the plan's column names came from a summary document. The summary was
right about most of them and wrong about one, and silent about the fields that mattered most.
**Reading three hundred bytes of the actual file was worth more than the document that
described it.** The same lesson as the MCP spike and the connection string, arriving for the
third time today: the artefact beats the description of the artefact.

**What I now believe.**
*(Tarik to fill in.)*

---

## August 13, 2026 — The connection string that worked in one tool broke the other

**What we expected.** That a single database connection string would work everywhere. The
plan's `.env.example` had one, and the first thing we did with the new password was connect
with `psql` and confirm it worked.

**What happened.** `psql` refused first, asking for a certificate file at
`~/.postgresql/root.crt`, and told us to add `sslrootcert=system` — meaning "use the trust
store the operating system already has." Added it, connected fine.

Then the same URL failed in the actual application code, because **node-postgres does not
understand `system`.** It treats the value as a filename and dies with `ENOENT: no such file
or directory, open 'system'`. Two tools, same standard-looking connection string, opposite
requirements.

The fix is to keep the URL free of it and state certificate verification in code instead —
`ssl: { rejectUnauthorized: true }` in the connection pool. Tested both ways to be sure the
secure setting was the one that worked, not just the permissive one.

**What this cost:** about five minutes, because it was caught while writing a config file
rather than in the middle of a task. **What it would have cost:** Task 4 builds the connection
pool, and Tasks 8, 11, and 12 all run long ingests through it. An SSL error surfacing there
would have looked like a database problem, a permissions problem, or a bad password — three
wrong trails before the right one.

**Worth generalising:** verifying a credential with a *different tool* than the one that will
use it proves less than it appears to. The check that counts is the one made by the code that
actually runs. Both places now carry a comment saying why the URL looks incomplete, because
the obvious "fix" is to add the parameter back.

**What I now believe.**
*(Tarik to fill in.)*

---

## August 13, 2026 — The spike killed the design, in about forty minutes

**What we expected.** That CockroachDB's Managed MCP Server would connect to the cluster
as some kind of database user, and that we could therefore restrict it with ordinary
database permissions — let it read the public city records, and make the private resident
notes invisible to it. That was decision 001, written a few hours earlier and reasoned
through carefully.

**What happened.** All four assumptions inside it turned out to be wrong.

1. **MCP is not read-only.** The hackathon materials describe it as "safe by default:
   read-only mode." It exposes tools called `create_table` and `insert_rows`, and both
   worked — a table was created and a row inserted, from an AI client, over HTTP.
2. **It connects as a SQL user called `managed-mcp`**, which does exist as a real named
   identity — so the premise was half right. But it is superuser-equivalent, which means
   database permissions do not apply to it. You cannot revoke from a superuser.
3. **Database separation is not enough.** It listed every database on the cluster and read
   a table in a different one from where it was pointed. Only *cluster* separation is a
   real boundary, because the cluster ID is part of how MCP is addressed.
4. **The real guardrails live in the MCP server, not the database.** Requests for the
   `system` and `crdb_internal` schemas came back "blocked for security reasons" — a
   protection implemented by Cockroach Labs in their MCP layer. Which is genuinely useful,
   but it protects *their* internals. It does nothing for our tables.

The one piece of good news, and it's the useful one: **access is all-or-nothing at the
cloud-role level.** With the `CLUSTER_DEVELOPER` role the service account can see cluster
metadata and cannot run a single SQL statement. With `CLUSTER_OPERATOR_WRITER` it gets
full read *and* write. There is no middle setting. So the lever exists — it's just a much
blunter one than the design assumed.

**What this cost:** about forty minutes. **What it saved:** building an entire security
architecture on an assumption that would have failed in front of judges, in the one part
of the demo whose whole purpose is proving the system is trustworthy.

**Then the docs disagreed with the experiment, and the experiment won.** CockroachDB's
own documentation says: *"Tools cannot access the `system`, `crdb_internal`, `pg_catalog`,
`information_schema`, and `pg_extension` schemas."* But we had already read from
`pg_catalog` without trying to. Testing it deliberately:

| Query | Result |
|---|---|
| `SELECT rolname FROM pg_catalog.pg_roles` | blocked — *"access to pg_catalog is blocked for security reasons"* |
| `SELECT rolname FROM pg_roles` | **returned rows** |

Same table. Same data. The only difference is whether the schema was named in the query
text. So the restriction is a **string check on the SQL you send**, not a permission the
database enforces — write the table name without its schema prefix and the search path
resolves it anyway.

This is worth reporting to Cockroach Labs, and the hackathon explicitly invites feedback
on their AI tooling as an optional submission item. It also settles the design question
more firmly than the superuser finding did: if a guardrail can be stepped around by
rephrasing a query, it is a convenience feature, not a security boundary, and no promise
we make to a renter can rest on it.

**Worth generalising:** the assumption was flagged in the spec as needing a day-one test
*because* the design depended on it. That habit — write down which load-bearing belief is
unverified, then test that one first — is what made this cheap instead of expensive. And
when a vendor's documentation and a live experiment disagree, the experiment is the fact.

**What I now believe.**
*(Tarik to fill in.)*

---

## August 13, 2026 — The requirements doc was a roadmap wearing a spec's clothes

**What we expected.** An 800-line requirements document with 26 numbered requirements and a
submission checklist reads like something you build.

**What happened.** Counted the actual subsystems in it: about seven, each independently
buildable, including a whole photo-upload-and-AI-image-description feature with its own
security surface. Two weeks spread across seven subsystems produces a demo where nothing is
convincing — the failure isn't running out of time, it's arriving on time with seven things
that each almost work.

What made it tractable was a question with a wrong-shaped answer. Asked which *single*
moment in the video had to be undeniable, the answer was three moments. But those three
weren't competing headlines — they were a sequence (real records → visible memory →
controlled handoff), where each one only means anything because the previous one happened.
The sequence handed over the build order for free.

**Also worth keeping:** the moment that *didn't* get picked — the resident leaving and
coming back — turned out to be load-bearing anyway. The memory panel's most convincing line
is *why* it remembered something, and without an earlier session there's no reason to show.
Something can be essential and not be the headline.

**What I now believe.**
*(Tarik to fill in.)*

---

## August 14, 2026 — The query that would have hidden every heat record

**What we expected.** Task 13 was the easy one. Three ingests were done, a million records
were loaded, and the final task was a SELECT and a print loop. The plan had the code written
out; it looked like typing.

**What happened.** The plan's query joined events to addresses. RentSmart records aren't
joined to addresses — they're joined to a parcel, the plot of land, because that's how Boston
files them. Measured before writing it: the plan's query reaches 640,922 records and **zero**
heat records. Every single one of the 4,959 heat records and 28,183 pest records is
parcel-filed. The deliverable would have run, printed real Boston data, passed every test in
the plan, and been silently empty in the one category the entire demo is about — the exact
hole MOO-617 was pulled into plan 1 to close, quietly reopened by the last task.

**Also worth keeping:** this is the third defect in a row found by measuring instead of
reading. The permits date parser returned Invalid Date for all 659,669 rows. The violations
`sam_id` sentinel of `0` claimed a high-confidence match to an address that doesn't exist.
Neither threw. Neither failed a test — both plans' fixtures used values the live files don't
contain. The pattern isn't "the plan had bugs"; it's that a fixture written by the same person
who wrote the code can only ever confirm what they already believed. Only the real bytes
disagree.

**Also worth keeping:** the 200-record cap printed "200 public record(s)" for a building with
216. Truthful number, false impression. The fix was seven words.

**What I now believe.**
*(Tarik to fill in.)*

---

## August 14, 2026 — Four builds to deploy an empty page

**What we expected.** The scaffold built clean locally in three seconds. Deploying an empty
Next.js page is the most boring task in the plan.

**What happened.** Four builds. Every failure was configuration, none was code, and the app
never changed between attempt one and attempt four.

1. `npm ci` — there is no `package-lock.json`, because this project is bun everywhere.
2. `deploy-manifest.json` missing — the branch's `framework` was `null`, so Amplify never
   treated it as a managed Next.js app and went looking for an adapter contract we do not use.
3. `Cannot read 'next' version in package.json` — Amplify read the **repo root**, where the
   backend's package.json lives, not `web/`.
4. Green, after `AMPLIFY_MONOREPO_APP_ROOT=web`.

Every one of those is invisible from a local build. `bun run build` passes identically whether
or not Amplify knows what framework it is looking at.

**Also worth keeping:** the spec put this on day 1 with the reason written down — *"first
deploys are where hours vanish."* It was right, and it was right about the mechanism too: not
one hard problem, four small ones that each cost a full build cycle to discover. Doing this on
day 13 with a video to record would have been the difference between submitting and not.

**Also worth keeping:** I wasted ten minutes watching an empty variable. The git push had
already auto-triggered a build, so my manual `start-job` was rejected, `$JOB` came back empty,
and the polling loop printed a usage error every twenty seconds without me looking at it. The
loop had no guard for "did the thing I am polling actually start."

**What I now believe.**
*(Tarik to fill in.)*
