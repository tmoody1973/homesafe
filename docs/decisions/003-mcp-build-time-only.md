# 003 — The AI that builds this gets database access. The AI that runs it doesn't.

**Date:** August 13, 2026
**Status:** Decided
**Supersedes:** [001 — Give the AI a public-records key and nothing else](001-mcp-two-keys.md)

## Decision

CockroachDB's Managed MCP Server is a **build-time tool only**. Claude Code uses it to
design the database, check migrations, profile queries, and read audit logs. The running
HomeSafe app never touches it. The app reaches the database through its own small set of
purpose-built functions, using a database login we create and restrict ourselves.

## Why this came up

Decision 001, written the same morning, assumed we could hand MCP a restricted database
login — one that could read public city records and nothing else — so that a renter's
private notes would be unreachable even if someone talked the AI into trying. It flagged
one untested belief and said to test it on day one.

We tested it on day one. It was wrong, and so were three other things we hadn't thought to
doubt.

What was at stake: HomeSafe's promise is that a renter's notes stay private until they
choose to share. Shipping a demo built on a boundary that doesn't hold — in the one feature
whose entire job is proving the system is trustworthy — would be worse than not shipping.

## What the spike found

All verified by live calls against the real cluster, not by reading documentation.

**1. It is not read-only.** The hackathon materials describe MCP as *"safe by default:
read-only mode."* It exposes tools named `create_table` and `insert_rows`. Both worked — a
table was created and a row written, from an AI client over HTTP.

**2. It connects as a superuser.** It queries the cluster as a database login called
`managed-mcp`. That part matched the assumption. But the login is superuser-equivalent, and
superusers ignore permissions. You cannot take away from an account that outranks the
permission system.

**3. Separating databases is not enough.** Pointed at one database, it listed every
database on the cluster and read a table in a different one. Only separating *clusters*
creates a real boundary, because the cluster is the unit MCP is addressed by.

**4. The advertised schema restrictions are a text filter.** The docs say tools cannot reach
the `system`, `crdb_internal`, `pg_catalog`, `information_schema`, or `pg_extension` schemas.
Asking for `pg_catalog.pg_roles` was refused — *"access to pg_catalog is blocked for security
reasons."* Asking for `pg_roles`, the same table without its schema prefix, returned the data.
The check reads the text of your query rather than enforcing a permission. A guardrail you
can step around by rephrasing is a convenience feature.

**One useful thing did hold.** Access is all-or-nothing at the cloud-role level, and we
walked it to confirm: with the `Cluster Developer` role the account sees cluster metadata
and cannot run a single SQL statement. With `Cluster Operator` it gets full read and write.
There is no setting in between. Cockroach Labs' own docs confirm MCP requires Cluster Admin
or Cluster Operator.

**And the obvious escape hatch is closed.** OAuth is the other way to connect, and it can be
scoped to a single cluster rather than the whole organization. But OAuth needs a person
clicking through a browser, which a deployed server cannot do. A server must use an API key.
So any MCP connection a running app could make is necessarily read-write superuser across
every database in its cluster.

*(One caveat on our own evidence: a first read of the docs page reported that the OAuth
consent screen offers a read-versus-write choice, and a second read of the same page did not
reproduce that line. Treat "OAuth can be read-only" as probable but unconfirmed. It does not
change the decision either way, because OAuth is unavailable to a server process.)*

**Separately, the documented limits make MCP a poor fit for serving user traffic**, which we
had not considered and which reaches the same conclusion independently:

| Limit | Value | Why it matters here |
|---|---|---|
| Response size | **10 KiB** | A public-record timeline for one address can exceed this. Results would truncate silently mid-answer |
| Query timeout | 20 seconds | Against a 12-second end-to-end agent budget, that is not a safety margin |
| Default row limit | 25 (max 10,000) | Fine, but it means every call needs an explicit LIMIT to be correct |
| Max statement length | 16,384 characters | Not a constraint for us |

The 10 KiB ceiling is the telling one. It is a sensible size for a developer asking questions
about a schema in an editor, and the wrong size for assembling a resident's evidence timeline.
The tool is built for the job we are actually using it for.

**Also worth recording:** the docs list the tools under explicit **"Read Operations"** and
**"Write Operations"** headings. Write access is a designed feature, documented as such. The
hackathon reference material's description of MCP as *"safe by default: read-only mode"* is
simply not what the product does.

## Options

**A. Two clusters.** Public city records in one cluster that MCP is allowed to reach;
private case data in a second cluster MCP is never configured for. Since the cluster is the
real boundary, this makes runtime MCP genuinely safe.
*Cost:* the two halves can no longer be joined in a single query. The table linking a case
to its evidence loses its foreign key, the timeline gets assembled in application code
instead of by the database, and we take on a new class of bug where the two clusters
disagree. Two weeks, one person.

**B. Build-time only.** One cluster. MCP is how we design and verify the schema. The running
app uses its own scoped database login — which *does* work, because the unscopeable account
is `managed-mcp` specifically, not any login we create.
*Cost:* the submission's answer to "what did your agent do with MCP" becomes "designed and
verified the schema," not "served resident queries."

**C. Wire it up at runtime anyway and don't mention it.** Listed only to reject. It would
mean the privacy promise in our own interface copy is false.

## What we chose and why

Option B. Joint call — Tarik chose it after seeing the spike results and the cost of the
two-cluster split.

Three things decided it.

**The integrity cost is worse than the marketing benefit.** The link between a case and its
evidence is the centre of the data model. Splitting it across two clusters means the database
can no longer guarantee those references are valid, so we'd write that guarantee by hand, in
application code, under deadline. That is exactly where a solo two-week project generates
bugs it won't have time to find.

**"Build-time only" is not a weak claim, it's an accurate one.** An AI agent used MCP to
design this schema, inspect it, and catch its own mistakes. That is a real agent doing real
work with the tool, and we can show the traces. The alternative framing — routing a
resident's question through a superuser connection so the architecture diagram looks better
— is worse engineering described more impressively.

**The finding is worth more than the checkbox.** The hackathon invites feedback on
CockroachDB's AI tooling as an optional submission item. A team that says *"we tried to use
MCP at runtime, discovered it authenticates as a superuser and that its schema restrictions
can be bypassed by omitting a prefix, and here is our writeup"* demonstrates more judgment
than a team that wired it up and never looked. The judges are Cockroach Labs engineers.

## What we gave up

The architecture diagram no longer shows the model reaching the database through MCP, which
is a genuinely nice-looking arrow and the one the project's requirements document drew. We
also give up any claim that MCP serves production traffic here.

We keep meeting the requirement to use at least two CockroachDB features — the distributed
vector index and the `ccloud` CLI — so nothing about eligibility changes. But we should
expect a judge to ask why MCP isn't in the runtime path, and the answer has to be ready and
specific, not defensive.

## How we'll know if this was right

1. **The scoped app login actually scopes.** Create the app's database login, grant it only
   what it needs, then try to read a table it wasn't granted. It must fail. This is the same
   test that killed decision 001 — run against a login we control this time.
2. **The build-time MCP traces are real and showable.** By submission we should have
   screenshots of MCP doing genuine schema work, not a contrived query taken for the camera.
3. **The written finding is submitted** as feedback, with the exact reproduction steps.
4. **A judge asking "why not MCP at runtime?" gets a 20-second answer** that improves their
   opinion of the project rather than sounding like an excuse.

## What actually happened

*(To be filled in by Tarik.)*
