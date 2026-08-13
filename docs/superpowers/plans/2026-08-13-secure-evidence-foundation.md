# HomeSafe Plan 1 — Secure Evidence Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Given a Boston street address, return real public housing-safety records for it — each carrying its source URL, retrieval time, address-match confidence, address scope, and a caveat stating what it does not prove — from a CockroachDB cluster whose private tables are provably unreadable by the evidence login.

**Architecture:** Two SQL logins against one cluster. `evidence_ro` can `SELECT` on three public-evidence tables and nothing else; `app_rw` handles case, consent, and memory data. Boston CSVs are resolved through the CKAN catalog API (never a hard-coded `tmp*.csv` filename), streamed, normalized into one canonical `public_event` shape, and joined to canonical addresses through Boston's SAM identifier. Every ingested row records where it came from, when, how confidently it was matched, and what it cannot be used to claim.

**Tech Stack:** TypeScript on Bun 1.3.14 (verified) · `pg` (node-postgres) · `csv-parse` for streaming · `bun test` · CockroachDB Cloud `drying-gerbil` v26.2.5 (us-east-2) · `ccloud` 0.8.23 · CockroachDB Agent Skill `hardening-user-privileges`

**Spec:** `docs/superpowers/specs/2026-08-13-homesafe-design.md`

---

## Scope Check — this is plan 1 of 4

The spec's slice is one coherent product but four independently shippable stages. Each produces working, testable software alone, so each gets its own plan:

| Plan | Scope | Deliverable |
|---|---|---|
| **1 — this plan** | Cluster hardening, schema, CKAN resolution, SAM + violations + permits ingest, address resolution, evidence query | `bun run evidence "302 Sumner St"` prints real Boston records with provenance and caveats. No UI. |
| 2 | RentSmart + 311 adapters, the fuzzy match cascade with scope badges, Next.js on Amplify, three-lane timeline | First submittable artifact |
| 3 | Case/observation tables, embeddings, vector index, retrieval receipts, Bedrock agent, claim validator, why-drawer | The load-bearing demo moment |
| 4 | Packet preview, per-item consent, immutable versioning, reviewer console, negative-test screenshots | The handoff |

Plan 1 deliberately takes only the **verified direct joins** — violations via `sam_id`, permits via `property_id`. 311 needs a fuzzy cascade whose correct answer is sometimes "I'm not confident," and mixing that into the foundation would make failures ambiguous. Do the certain thing first, then the uncertain thing against a known-good base.

---

## Global Constraints

Copied from the spec and project rules. Every task's requirements implicitly include these.

- **Functions under 20 lines.** Project `CLAUDE.md` overrides the global 50-line default. Longer logic gets extracted into named helpers.
- **Files under 800 lines, 200–400 typical.** One responsibility per file. Organize by concern (`ingest/`, `address/`, `evidence/`), not by technical layer.
- **Immutability.** Never mutate an input. Return new objects.
- **TDD is mandatory.** Failing test → run it and watch it fail → minimal implementation → run it and watch it pass → commit. Minimum 80% coverage.
- **No hardcoded values.** Magic numbers and strings become named constants.
- **No silently swallowed errors.** Every `catch` either handles or rethrows with context.
- **`public_event.caveat` is `NOT NULL`.** A public record cannot be inserted without an explicit statement of what it does not prove.
- **Never display owner fields.** Property Assessment and RentSmart both carry owner data. It is never selected into the resident-facing path.
- **`raw_address_input` is never overwritten** by a match result.
- **Embedding width is `VECTOR(1024)`** — measured from `amazon.titan-embed-text-v2:0`, not guessed. Relevant to plan 3; the column is declared here.
- **Cluster:** `drying-gerbil`, id `c17dc37c-5918-4d7d-b6ea-161c9ff7304d`, org `org-3bmzs`, region `us-east-2`.
- **`managed-mcp` is a superuser and cannot be scoped.** MCP is build-time only. Never put it in an application code path. See `docs/decisions/003-mcp-build-time-only.md`.
- **Verified demo address:** `302 Sumner St` → `SAM_ADDRESS_ID` `132380`, `PARCEL_ID` `0104910000`, `BUILDING_ID` `130883`.

---

## Pre-flight: three debts to clear first

These are not tasks — they are hand-work that must happen before Task 1, because later tasks assume them.

- [ ] **Drop the spike leftover.** `DROP TABLE IF EXISTS homesafe.spike_private_delete_me;`
- [ ] **Create a scoped AWS IAM user** to replace root on account `953791390715`. Minimum policy: `bedrock:InvokeModel`, `bedrock:Converse`, and `s3:GetObject`/`s3:PutObject` on the project bucket only. Re-authenticate the CLI against it. Root credentials must not reach Amplify, Lambda, or a local `.env`.
- [ ] **Set a SQL password** you will use for migrations:
  `ccloud cluster user password drying-gerbil tarik -p '<strong-password>'`

---

## File Structure

```
homesafe/
├── package.json                     # bun scripts, deps
├── tsconfig.json                    # strict TS
├── .env.example                     # documents required vars; no secrets
├── .gitignore                        # already excludes *.csv and .env*
├── db/
│   ├── migrate.ts                   # migration runner (~40 lines)
│   └── migrations/
│       ├── 001_public_evidence.sql  # address_entity, address_match, public_event
│       ├── 002_private_case.sql     # user_account, housing_case, observations, memory, packets, audit
│       └── 003_logins.sql           # app_rw + evidence_ro, GRANT/REVOKE
├── src/
│   ├── config/env.ts                # validated environment, fails fast
│   ├── db/pool.ts                   # appRw + evidenceRo pools
│   ├── catalog/ckan.ts              # resolve current CSV URL from the catalog API
│   ├── ingest/
│   │   ├── csv-stream.ts            # streaming row reader
│   │   ├── upsert.ts                # idempotent batched upsert
│   │   ├── sam.ts                   # SAM → address_entity
│   │   ├── violations.ts            # violations → public_event via sam_id
│   │   └── permits.ts               # permits → public_event via property_id
│   ├── address/
│   │   ├── normalize.ts             # street normalization, unit extraction
│   │   └── resolve.ts               # match cascade → {samAddressId, method, confidence}
│   ├── evidence/
│   │   ├── caveats.ts               # canonical caveat text per source system
│   │   ├── categorize.ts            # description → event_category
│   │   └── query.ts                 # timeline for a SAM address
│   └── cli/evidence.ts              # bun run evidence "302 Sumner St"
└── tests/                           # mirrors src/, outside it
    ├── db/logins.test.ts            # THE negative test
    ├── catalog/ckan.test.ts
    ├── ingest/csv-stream.test.ts
    ├── ingest/upsert.test.ts
    ├── address/normalize.test.ts
    ├── address/resolve.test.ts
    ├── evidence/caveats.test.ts
    ├── evidence/categorize.test.ts
    └── evidence/query.test.ts
```

---

## Task 1: Project scaffold and fail-fast environment config

**Files:**
- Create: `package.json`, `tsconfig.json`, `.env.example`, `src/config/env.ts`
- Test: `tests/config/env.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `loadEnv(source: Record<string, string | undefined>): Env` where
  `type Env = { appDatabaseUrl: string; evidenceDatabaseUrl: string; awsRegion: string }`.
  Throws `Error` listing every missing variable at once.

- [ ] **Step 1: Initialise the project**

```bash
cd /Users/tarikmoody/Projects/homesafe
bun init -y
bun add pg csv-parse
bun add -d @types/pg typescript
```

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "types": ["bun-types"],
    "skipLibCheck": true
  },
  "include": ["src", "db", "tests"]
}
```

- [ ] **Step 3: Write `.env.example`**

```bash
# Two logins, one cluster. Neither is `managed-mcp` — see docs/decisions/003.
# app_rw: case, consent, memory data.
DATABASE_URL_APP=postgresql://app_rw:PASSWORD@drying-gerbil-31622.j77.aws-us-east-2.cockroachlabs.cloud:26257/homesafe?sslmode=verify-full
# evidence_ro: SELECT on three public-evidence tables only.
DATABASE_URL_EVIDENCE=postgresql://evidence_ro:PASSWORD@drying-gerbil-31622.j77.aws-us-east-2.cockroachlabs.cloud:26257/homesafe?sslmode=verify-full
# Migrations run as an admin login; kept out of the app's env entirely.
DATABASE_URL_ADMIN=postgresql://tarik:PASSWORD@drying-gerbil-31622.j77.aws-us-east-2.cockroachlabs.cloud:26257/homesafe?sslmode=verify-full
AWS_REGION=us-east-1
```

- [ ] **Step 4: Write the failing test**

```typescript
// tests/config/env.test.ts
import { expect, test } from "bun:test";
import { loadEnv } from "../../src/config/env";

test("returns a typed Env when every variable is present", () => {
  const env = loadEnv({
    DATABASE_URL_APP: "postgresql://app_rw@host:26257/homesafe",
    DATABASE_URL_EVIDENCE: "postgresql://evidence_ro@host:26257/homesafe",
    AWS_REGION: "us-east-1",
  });
  expect(env.appDatabaseUrl).toBe("postgresql://app_rw@host:26257/homesafe");
  expect(env.awsRegion).toBe("us-east-1");
});

test("names every missing variable in one error, not just the first", () => {
  expect(() => loadEnv({ AWS_REGION: "us-east-1" })).toThrow(
    /DATABASE_URL_APP.*DATABASE_URL_EVIDENCE/s,
  );
});

test("rejects a blank variable the same as a missing one", () => {
  expect(() =>
    loadEnv({
      DATABASE_URL_APP: "   ",
      DATABASE_URL_EVIDENCE: "postgresql://evidence_ro@host:26257/homesafe",
      AWS_REGION: "us-east-1",
    }),
  ).toThrow(/DATABASE_URL_APP/);
});
```

- [ ] **Step 5: Run the test and watch it fail**

Run: `bun test tests/config/env.test.ts`
Expected: FAIL — cannot resolve `../../src/config/env`.

- [ ] **Step 6: Write the implementation**

```typescript
// src/config/env.ts
export type Env = {
  readonly appDatabaseUrl: string;
  readonly evidenceDatabaseUrl: string;
  readonly awsRegion: string;
};

const REQUIRED = [
  "DATABASE_URL_APP",
  "DATABASE_URL_EVIDENCE",
  "AWS_REGION",
] as const;

function missingKeys(source: Record<string, string | undefined>): string[] {
  return REQUIRED.filter((key) => (source[key] ?? "").trim() === "");
}

export function loadEnv(source: Record<string, string | undefined>): Env {
  const missing = missingKeys(source);
  if (missing.length > 0) {
    throw new Error(
      `Missing or blank required environment variables: ${missing.join(", ")}`,
    );
  }
  return {
    appDatabaseUrl: source.DATABASE_URL_APP!.trim(),
    evidenceDatabaseUrl: source.DATABASE_URL_EVIDENCE!.trim(),
    awsRegion: source.AWS_REGION!.trim(),
  };
}
```

- [ ] **Step 7: Run the test and watch it pass**

Run: `bun test tests/config/env.test.ts`
Expected: 3 pass.

- [ ] **Step 8: Commit**

```bash
git add package.json tsconfig.json bun.lock .env.example src/config/env.ts tests/config/env.test.ts
git commit -m "feat: project scaffold and fail-fast environment config"
```

---

## Task 2: Migration runner and the public-evidence schema

**Files:**
- Create: `db/migrate.ts`, `db/migrations/001_public_evidence.sql`
- Test: `tests/db/migrate.test.ts`

**Interfaces:**
- Consumes: `loadEnv` from Task 1
- Produces: `pendingMigrations(all: string[], applied: string[]): string[]` — pure, sorted, returns only unapplied versions. Also a runnable `bun run migrate`.

- [ ] **Step 1: Write the failing test for the pure selection logic**

```typescript
// tests/db/migrate.test.ts
import { expect, test } from "bun:test";
import { pendingMigrations } from "../../db/migrate";

test("returns unapplied migrations in lexical order", () => {
  const all = ["003_logins.sql", "001_public_evidence.sql", "002_private_case.sql"];
  expect(pendingMigrations(all, ["001_public_evidence.sql"])).toEqual([
    "002_private_case.sql",
    "003_logins.sql",
  ]);
});

test("returns an empty list when everything is applied", () => {
  const all = ["001_a.sql", "002_b.sql"];
  expect(pendingMigrations(all, ["002_b.sql", "001_a.sql"])).toEqual([]);
});

test("ignores non-sql files", () => {
  expect(pendingMigrations(["001_a.sql", "README.md"], [])).toEqual(["001_a.sql"]);
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `bun test tests/db/migrate.test.ts`
Expected: FAIL — cannot resolve `../../db/migrate`.

- [ ] **Step 3: Write the migration runner**

```typescript
// db/migrate.ts
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { Client } from "pg";

const MIGRATIONS_DIR = join(import.meta.dir, "migrations");

export function pendingMigrations(all: string[], applied: string[]): string[] {
  const done = new Set(applied);
  return all
    .filter((name) => name.endsWith(".sql") && !done.has(name))
    .sort();
}

async function ensureLedger(client: Client): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    STRING PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function appliedVersions(client: Client): Promise<string[]> {
  const { rows } = await client.query<{ version: string }>(
    "SELECT version FROM schema_migrations",
  );
  return rows.map((row) => row.version);
}

async function applyOne(client: Client, version: string): Promise<void> {
  const sql = await readFile(join(MIGRATIONS_DIR, version), "utf8");
  await client.query("BEGIN");
  try {
    await client.query(sql);
    await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [
      version,
    ]);
    await client.query("COMMIT");
    console.log(`applied ${version}`);
  } catch (cause) {
    await client.query("ROLLBACK");
    throw new Error(`migration ${version} failed`, { cause });
  }
}

export async function migrate(adminUrl: string): Promise<void> {
  const client = new Client({ connectionString: adminUrl });
  await client.connect();
  try {
    await ensureLedger(client);
    const todo = pendingMigrations(
      await readdir(MIGRATIONS_DIR),
      await appliedVersions(client),
    );
    for (const version of todo) await applyOne(client, version);
    if (todo.length === 0) console.log("nothing to apply");
  } finally {
    await client.end();
  }
}

if (import.meta.main) {
  const url = process.env.DATABASE_URL_ADMIN;
  if (!url) throw new Error("DATABASE_URL_ADMIN is required to run migrations");
  await migrate(url);
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `bun test tests/db/migrate.test.ts`
Expected: 3 pass.

- [ ] **Step 5: Write `db/migrations/001_public_evidence.sql`**

```sql
-- The only three tables `evidence_ro` will be granted SELECT on.
CREATE TABLE IF NOT EXISTS address_entity (
  address_entity_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sam_address_id    INT8 NOT NULL UNIQUE,
  full_address      STRING NOT NULL,
  street_number     STRING,
  street_name       STRING,
  unit              STRING,
  zip               STRING,
  neighborhood      STRING,
  parcel_id         STRING,
  building_id       INT8,
  lat               FLOAT8,
  lon               FLOAT8,
  sam_snapshot_at   TIMESTAMPTZ NOT NULL,
  INDEX (parcel_id),
  INDEX (zip, street_name, street_number)
);

-- A fallible linkage decision, stored apart from the record it links.
CREATE TABLE IF NOT EXISTS address_match (
  match_id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_system            STRING NOT NULL,
  source_record_id         STRING NOT NULL,
  raw_address              STRING NOT NULL,
  candidate_sam_address_id INT8,
  match_method             STRING NOT NULL,
  match_confidence         STRING NOT NULL,
  coord_distance_m         FLOAT8,
  resolver_version         STRING NOT NULL,
  review_status            STRING NOT NULL DEFAULT 'automated',
  reviewed_by              STRING,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_system, source_record_id),
  CONSTRAINT match_method_known CHECK (match_method IN (
    'sam_id_direct', 'parcel_direct', 'sam_exact_address_zip',
    'structured_components', 'coordinate_proximity', 'unmatched'
  )),
  CONSTRAINT match_confidence_known CHECK (match_confidence IN (
    'high', 'medium', 'low', 'ambiguous'
  ))
);

CREATE TABLE IF NOT EXISTS public_event (
  event_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_system      STRING NOT NULL,
  source_record_id   STRING NOT NULL,
  address_entity_id  UUID REFERENCES address_entity,
  address_match_id   UUID REFERENCES address_match,
  address_scope      STRING NOT NULL,
  event_category     STRING NOT NULL,
  source_status      STRING,
  title              STRING,
  description        STRING,
  occurred_at        TIMESTAMPTZ,
  occurred_precision STRING,
  closed_at          TIMESTAMPTZ,
  retrieved_at       TIMESTAMPTZ NOT NULL,
  source_url         STRING NOT NULL,
  raw_payload        JSONB,
  -- NOT NULL on purpose: a public record cannot exist here without an
  -- explicit statement of what it does not prove.
  caveat             STRING NOT NULL,
  UNIQUE (source_system, source_record_id),
  INDEX (address_entity_id, occurred_at DESC),
  INDEX (event_category),
  CONSTRAINT source_system_known CHECK (source_system IN (
    'boston_311_legacy', 'boston_311_new', 'building_violation',
    'rentsmart', 'building_permit', 'property_assessment'
  )),
  CONSTRAINT address_scope_known CHECK (address_scope IN (
    'unit', 'address', 'building', 'parcel', 'nearby', 'unknown'
  )),
  CONSTRAINT event_category_known CHECK (event_category IN (
    'heat_hot_water', 'pest', 'structural_safety', 'permit',
    'utilities', 'sanitation', 'other'
  ))
);
```

- [ ] **Step 6: Create the database and run the migration**

```bash
psql "$DATABASE_URL_ADMIN" -c "CREATE DATABASE IF NOT EXISTS homesafe;"
bun run db/migrate.ts
```

Expected: `applied 001_public_evidence.sql`

- [ ] **Step 7: Verify the constraints actually bite**

```bash
psql "$DATABASE_URL_ADMIN" -d homesafe -c \
  "INSERT INTO public_event (source_system, source_record_id, address_scope, event_category, retrieved_at, source_url, caveat) VALUES ('building_violation','t1','address','heat_hot_water', now(),'http://x','c');"
psql "$DATABASE_URL_ADMIN" -d homesafe -c \
  "INSERT INTO public_event (source_system, source_record_id, address_scope, event_category, retrieved_at, source_url) VALUES ('building_violation','t2','address','heat_hot_water', now(),'http://x');"
psql "$DATABASE_URL_ADMIN" -d homesafe -c "DELETE FROM public_event WHERE source_record_id = 't1';"
```

Expected: first succeeds; second fails with a null-violation on `caveat`; then cleanup.

- [ ] **Step 8: Add the migrate script to `package.json`**

```json
{
  "scripts": {
    "migrate": "bun run db/migrate.ts",
    "test": "bun test"
  }
}
```

- [ ] **Step 9: Commit**

```bash
git add db package.json tests/db/migrate.test.ts
git commit -m "feat: migration runner and public-evidence schema"
```

---

## Task 3: Private-case schema

**Files:**
- Create: `db/migrations/002_private_case.sql`

**Interfaces:**
- Consumes: the migration runner from Task 2
- Produces: tables `user_account`, `housing_case`, `resident_observation`, `memory_item`, `consent_grant`, `evidence_packet`, `evidence_packet_item`, `task`, `agent_run`, `audit_log`. Plans 3 and 4 build on these names.

- [ ] **Step 1: Write the migration**

```sql
CREATE TABLE IF NOT EXISTS user_account (
  user_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name  STRING NOT NULL,
  role          STRING NOT NULL CHECK (role IN ('resident','reviewer','admin')),
  language_pref STRING DEFAULT 'en',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS housing_case (
  case_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES user_account,
  address_entity_id UUID REFERENCES address_entity,
  raw_address_input STRING NOT NULL,
  issue_category    STRING NOT NULL,
  status            STRING NOT NULL DEFAULT 'open',
  is_demo           BOOL NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_reviewed_at  TIMESTAMPTZ,
  INDEX (user_id)
);

CREATE TABLE IF NOT EXISTS resident_observation (
  observation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id        UUID NOT NULL REFERENCES housing_case ON DELETE CASCADE,
  body           STRING NOT NULL,
  category       STRING,
  privacy        STRING NOT NULL DEFAULT 'private_to_resident',
  recorded_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at     TIMESTAMPTZ,
  INDEX (case_id, recorded_at DESC)
);

-- VECTOR(1024) matches amazon.titan-embed-text-v2:0, measured not guessed.
CREATE TABLE IF NOT EXISTS memory_item (
  memory_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id               UUID REFERENCES housing_case ON DELETE CASCADE,
  memory_type           STRING NOT NULL CHECK (memory_type IN (
                          'resident_observation','agent_summary',
                          'policy_guidance','issue_definition')),
  source_observation_id UUID REFERENCES resident_observation,
  body                  STRING NOT NULL,
  embedding             VECTOR(1024) NOT NULL,
  consent_scope         STRING NOT NULL DEFAULT 'private_to_resident',
  retention_policy      STRING NOT NULL DEFAULT 'case_lifetime',
  revoked_at            TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  INDEX (case_id)
);

CREATE TABLE IF NOT EXISTS consent_grant (
  consent_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id           UUID NOT NULL REFERENCES housing_case ON DELETE CASCADE,
  scope             STRING NOT NULL,
  item_refs         STRING[] NOT NULL,
  recipient_role    STRING NOT NULL,
  recipient_user_id UUID REFERENCES user_account,
  granted_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at        TIMESTAMPTZ,
  revoked_at        TIMESTAMPTZ,
  INDEX (case_id)
);

CREATE TABLE IF NOT EXISTS evidence_packet (
  packet_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id           UUID NOT NULL REFERENCES housing_case,
  version           INT NOT NULL,
  status            STRING NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','shared','revoked')),
  resident_summary  STRING,
  staff_summary     STRING,
  content_hash      STRING,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at       TIMESTAMPTZ,
  approved_by       UUID REFERENCES user_account,
  recipient_user_id UUID REFERENCES user_account,
  UNIQUE (case_id, version)
);

CREATE TABLE IF NOT EXISTS evidence_packet_item (
  packet_id         UUID NOT NULL REFERENCES evidence_packet ON DELETE CASCADE,
  item_ref          STRING NOT NULL,
  item_type         STRING NOT NULL,
  item_hash         STRING NOT NULL,
  resident_approved BOOL NOT NULL DEFAULT false,
  PRIMARY KEY (packet_id, item_ref)
);

CREATE TABLE IF NOT EXISTS task (
  task_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id           UUID NOT NULL REFERENCES housing_case ON DELETE CASCADE,
  owner_role        STRING NOT NULL,
  title             STRING NOT NULL,
  status            STRING NOT NULL DEFAULT 'draft',
  due_date          DATE,
  requires_approval BOOL NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The retrieval receipt, persisted. One write serves the why-panel,
-- the audit trail, and the citation validator.
CREATE TABLE IF NOT EXISTS agent_run (
  run_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id          UUID REFERENCES housing_case,
  actor_user_id    UUID REFERENCES user_account,
  actor_role       STRING NOT NULL,
  question         STRING,
  model_id         STRING NOT NULL,
  receipt          JSONB NOT NULL,
  model_output     STRING,
  validator_result JSONB,
  latency_ms       INT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  INDEX (case_id, created_at DESC)
);

CREATE TABLE IF NOT EXISTS audit_log (
  audit_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID,
  actor_role    STRING,
  action        STRING NOT NULL,
  object_type   STRING NOT NULL,
  object_id     STRING NOT NULL,
  detail        JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  INDEX (object_type, object_id),
  INDEX (created_at DESC)
);
```

- [ ] **Step 2: Apply it**

Run: `bun run migrate`
Expected: `applied 002_private_case.sql`

- [ ] **Step 3: Confirm the vector column was accepted**

```bash
psql "$DATABASE_URL_ADMIN" -d homesafe -c \
  "SELECT column_name, data_type FROM information_schema.columns WHERE table_name='memory_item' AND column_name='embedding';"
```

Expected: one row showing a vector type. **If this fails,** CockroachDB v26.2.5 needs a cluster setting or different syntax for vectors — stop and consult the current CockroachDB docs (`npx ctx7@latest docs /cockroachdb/docs "VECTOR column type and CREATE VECTOR INDEX syntax"`) before improvising. The vector *index* is created in plan 3; only the column is needed here.

- [ ] **Step 4: Commit**

```bash
git add db/migrations/002_private_case.sql
git commit -m "feat: private-case schema with 1024-dim memory embeddings"
```

---

## Task 4: Two logins, and the negative test that proves the boundary

This is the most important task in the plan. Everything HomeSafe promises a renter rests on the test in Step 5 passing.

**Files:**
- Create: `db/migrations/003_logins.sql`, `src/db/pool.ts`
- Test: `tests/db/logins.test.ts`

**Interfaces:**
- Consumes: `loadEnv` (Task 1), schemas (Tasks 2–3)
- Produces: `appPool(): Pool` and `evidencePool(): Pool` from `src/db/pool.ts`, both memoised singletons.

- [ ] **Step 1: Consult the CockroachDB Agent Skill**

Invoke the `hardening-user-privileges` skill (installed, `author: cockroachdb`) and follow its least-privilege guidance for this migration. Two reasons: it encodes CockroachDB-specific pitfalls — notably that `PUBLIC` role grants can quietly re-open what you just closed — and it is how the submission's fourth CockroachDB tool becomes load-bearing rather than decorative. Record anything it changes about the SQL below.

- [ ] **Step 2: Write `db/migrations/003_logins.sql`**

```sql
-- Two logins, one cluster, no overlap.
CREATE USER IF NOT EXISTS app_rw      WITH PASSWORD NULL;
CREATE USER IF NOT EXISTS evidence_ro WITH PASSWORD NULL;

-- CockroachDB grants schema privileges to PUBLIC by default, which would
-- silently undo the restriction below. Close it first.
REVOKE ALL ON SCHEMA public FROM public;
GRANT USAGE ON SCHEMA public TO app_rw, evidence_ro;

-- evidence_ro: SELECT on exactly three tables. Nothing else, ever.
GRANT SELECT ON TABLE address_entity, address_match, public_event TO evidence_ro;

-- app_rw: case, consent, and memory data.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  user_account, housing_case, resident_observation, memory_item,
  consent_grant, evidence_packet, evidence_packet_item, task, agent_run
TO app_rw;
GRANT SELECT ON TABLE address_entity, address_match, public_event TO app_rw;

-- The audit log is append-only because of a missing grant, not because
-- application code chooses not to update it.
GRANT SELECT, INSERT ON TABLE audit_log TO app_rw;
```

- [ ] **Step 3: Apply, then set passwords**

```bash
bun run migrate
ccloud cluster user password drying-gerbil app_rw      -p '<app-password>'
ccloud cluster user password drying-gerbil evidence_ro -p '<evidence-password>'
```

Then write both connection strings into `.env` following `.env.example`. **`.env` is gitignored — confirm with `git check-ignore .env` before continuing.**

- [ ] **Step 4: Write the failing negative test**

```typescript
// tests/db/logins.test.ts
import { expect, test } from "bun:test";
import { appPool, evidencePool } from "../../src/db/pool";

const PRIVATE_TABLES = [
  "resident_observation",
  "memory_item",
  "consent_grant",
  "evidence_packet",
  "housing_case",
];

test("evidence_ro can read the three public-evidence tables", async () => {
  const pool = evidencePool();
  for (const table of ["address_entity", "address_match", "public_event"]) {
    const { rowCount } = await pool.query(`SELECT * FROM ${table} LIMIT 1`);
    expect(rowCount).not.toBeNull();
  }
});

test.each(PRIVATE_TABLES)(
  "evidence_ro CANNOT read %s — the boundary the whole product rests on",
  async (table) => {
    await expect(
      evidencePool().query(`SELECT * FROM ${table} LIMIT 1`),
    ).rejects.toThrow(/permission denied|does not exist/i);
  },
);

test("evidence_ro cannot write to a table it can read", async () => {
  await expect(
    evidencePool().query(
      `INSERT INTO public_event (source_system, source_record_id, address_scope,
         event_category, retrieved_at, source_url, caveat)
       VALUES ('building_violation','deny-test','address','other', now(), 'http://x','c')`,
    ),
  ).rejects.toThrow(/permission denied/i);
});

test("app_rw cannot UPDATE audit_log — append-only by grant", async () => {
  await expect(
    appPool().query("UPDATE audit_log SET action = 'tampered'"),
  ).rejects.toThrow(/permission denied/i);
});

test("app_rw cannot DELETE from audit_log", async () => {
  await expect(
    appPool().query("DELETE FROM audit_log"),
  ).rejects.toThrow(/permission denied/i);
});
```

- [ ] **Step 5: Run the test and watch it fail**

Run: `bun test tests/db/logins.test.ts`
Expected: FAIL — cannot resolve `../../src/db/pool`.

- [ ] **Step 6: Write `src/db/pool.ts`**

```typescript
import { Pool } from "pg";
import { loadEnv } from "../config/env";

const MAX_CLIENTS = 5;

let app: Pool | undefined;
let evidence: Pool | undefined;

function makePool(connectionString: string): Pool {
  return new Pool({ connectionString, max: MAX_CLIENTS });
}

export function appPool(): Pool {
  app ??= makePool(loadEnv(process.env).appDatabaseUrl);
  return app;
}

export function evidencePool(): Pool {
  evidence ??= makePool(loadEnv(process.env).evidenceDatabaseUrl);
  return evidence;
}

export async function closePools(): Promise<void> {
  await Promise.all([app?.end(), evidence?.end()]);
  app = undefined;
  evidence = undefined;
}
```

- [ ] **Step 7: Run the test and watch every case pass**

Run: `bun test tests/db/logins.test.ts`
Expected: 9 pass (1 positive read, 5 denied private reads, 1 denied write, 2 denied audit mutations).

**If any private-table read succeeds, stop.** Do not continue the plan. A `PUBLIC` role grant or an inherited role is leaking access, and every later task would be building on a boundary that does not hold. Re-run the `hardening-user-privileges` skill against the live cluster and fix it before Task 5.

- [ ] **Step 8: Capture the evidence**

Save the passing output to `docs/evidence/logins-negative-test.txt`. This is submission material — the Production Readiness criterion asks what happens when things go wrong, and a permission denial you can show beats a paragraph claiming you thought about access control.

```bash
mkdir -p docs/evidence
bun test tests/db/logins.test.ts 2>&1 | tee docs/evidence/logins-negative-test.txt
```

- [ ] **Step 9: Commit**

```bash
git add db/migrations/003_logins.sql src/db/pool.ts tests/db/logins.test.ts docs/evidence/logins-negative-test.txt
git commit -m "feat: scoped app_rw and evidence_ro logins with proven privilege boundary"
```

---

## Task 5: Resolve current Boston CSV URLs through the catalog API

Boston rotates resource filenames on refresh — the readiness doc warns that a `tmp*.csv` URL is not permanent. Hard-coding one produces a pipeline that breaks silently a week later.

**Files:**
- Create: `src/catalog/ckan.ts`
- Test: `tests/catalog/ckan.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `type CkanResource = { id: string; name: string; format: string; url: string }`
  - `pickCsvResource(resources: CkanResource[], namePattern: RegExp): CkanResource` — pure; throws if no CSV matches.
  - `resolveResourceUrl(packageId: string, namePattern: RegExp, fetchImpl?: typeof fetch): Promise<string>`
  - `const BOSTON_PACKAGES` mapping our five sources to their catalog ids.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/catalog/ckan.test.ts
import { expect, test } from "bun:test";
import { pickCsvResource, resolveResourceUrl } from "../../src/catalog/ckan";

const RESOURCES = [
  { id: "a", name: "Metadata", format: "PDF", url: "http://x/meta.pdf" },
  { id: "b", name: "Violations 2026", format: "CSV", url: "http://x/tmp1.csv" },
  { id: "c", name: "Violations Archive", format: "CSV", url: "http://x/tmp2.csv" },
];

test("picks the CSV whose name matches the pattern", () => {
  expect(pickCsvResource(RESOURCES, /2026/).url).toBe("http://x/tmp1.csv");
});

test("matches format case-insensitively", () => {
  const lower = [{ id: "d", name: "Data", format: "csv", url: "http://x/d.csv" }];
  expect(pickCsvResource(lower, /Data/).url).toBe("http://x/d.csv");
});

test("throws a named error when nothing matches rather than returning undefined", () => {
  expect(() => pickCsvResource(RESOURCES, /Permits/)).toThrow(/no CSV resource/i);
});

test("resolveResourceUrl reads the url out of a catalog response", async () => {
  const fakeFetch = (async () =>
    new Response(
      JSON.stringify({ success: true, result: { resources: RESOURCES } }),
      { status: 200 },
    )) as unknown as typeof fetch;
  const url = await resolveResourceUrl("building-and-property-violations1", /2026/, fakeFetch);
  expect(url).toBe("http://x/tmp1.csv");
});

test("resolveResourceUrl throws with context on a non-200", async () => {
  const failing = (async () => new Response("nope", { status: 503 })) as unknown as typeof fetch;
  await expect(resolveResourceUrl("pkg", /x/, failing)).rejects.toThrow(/503/);
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `bun test tests/catalog/ckan.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// src/catalog/ckan.ts
const CATALOG_BASE = "https://data.boston.gov/api/3/action/package_show";

export const BOSTON_PACKAGES = {
  sam: "live-street-address-management-sam-addresses",
  violations: "building-and-property-violations1",
  permits: "approved-building-permits",
  rentsmart: "rentsmart",
  serviceRequests: "311-service-requests",
} as const;

export type CkanResource = {
  readonly id: string;
  readonly name: string;
  readonly format: string;
  readonly url: string;
};

export function pickCsvResource(
  resources: CkanResource[],
  namePattern: RegExp,
): CkanResource {
  const match = resources.find(
    (r) => r.format.toUpperCase() === "CSV" && namePattern.test(r.name),
  );
  if (!match) {
    throw new Error(
      `no CSV resource matching ${namePattern} among: ${resources
        .map((r) => `${r.name} (${r.format})`)
        .join(", ")}`,
    );
  }
  return match;
}

export async function resolveResourceUrl(
  packageId: string,
  namePattern: RegExp,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const response = await fetchImpl(`${CATALOG_BASE}?id=${packageId}`);
  if (!response.ok) {
    throw new Error(
      `catalog lookup for ${packageId} failed: ${response.status} ${response.statusText}`,
    );
  }
  const body = (await response.json()) as { result?: { resources?: CkanResource[] } };
  const resources = body.result?.resources ?? [];
  return pickCsvResource(resources, namePattern).url;
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `bun test tests/catalog/ckan.test.ts`
Expected: 5 pass.

- [ ] **Step 5: Confirm it works against the live catalog**

```bash
bun -e 'import {resolveResourceUrl,BOSTON_PACKAGES} from "./src/catalog/ckan"; console.log(await resolveResourceUrl(BOSTON_PACKAGES.violations, /.*/))'
```

Expected: a real `data.boston.gov` CSV URL. If the catalog returns a 403 from this machine, record it in `docs/LEARNING-LOG.md` — the readiness doc flagged access controls on some endpoints, and knowing which ones work from where matters before Lambda.

- [ ] **Step 6: Commit**

```bash
git add src/catalog/ckan.ts tests/catalog/ckan.test.ts
git commit -m "feat: resolve Boston CSV urls through the catalog api"
```

---

## Task 6: Streaming CSV reader and idempotent batched upsert

Permits is roughly 237 MB and SAM roughly 121 MB. Reading either into memory is not an option.

**Files:**
- Create: `src/ingest/csv-stream.ts`, `src/ingest/upsert.ts`
- Test: `tests/ingest/csv-stream.test.ts`, `tests/ingest/upsert.test.ts`

**Interfaces:**
- Consumes: `appPool` (Task 4)
- Produces:
  - `streamCsvRows(source: ReadableStream<Uint8Array> | NodeJS.ReadableStream): AsyncGenerator<Record<string, string>>`
  - `batched<T>(items: AsyncIterable<T>, size: number): AsyncGenerator<T[]>`
  - `upsertBatch(pool: Pool, table: string, columns: string[], conflictColumns: string[], rows: unknown[][]): Promise<number>` — returns rows affected.

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/ingest/csv-stream.test.ts
import { expect, test } from "bun:test";
import { Readable } from "node:stream";
import { batched, streamCsvRows } from "../../src/ingest/csv-stream";

function fromText(text: string): NodeJS.ReadableStream {
  return Readable.from([Buffer.from(text, "utf8")]);
}

async function collect<T>(gen: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of gen) out.push(item);
  return out;
}

test("yields one object per row keyed by header", async () => {
  const rows = await collect(streamCsvRows(fromText("a,b\n1,2\n3,4\n")));
  expect(rows).toEqual([{ a: "1", b: "2" }, { a: "3", b: "4" }]);
});

test("handles quoted fields containing commas", async () => {
  const rows = await collect(
    streamCsvRows(fromText('case_no,description\n1,"Heat, insufficient"\n')),
  );
  expect(rows[0]!.description).toBe("Heat, insufficient");
});

test("yields nothing for a header-only file", async () => {
  expect(await collect(streamCsvRows(fromText("a,b\n")))).toEqual([]);
});

test("batched groups items and emits a short final batch", async () => {
  async function* nums() { for (const n of [1, 2, 3, 4, 5]) yield n; }
  expect(await collect(batched(nums(), 2))).toEqual([[1, 2], [3, 4], [5]]);
});

test("batched emits nothing for an empty source", async () => {
  async function* none(): AsyncGenerator<number> {}
  expect(await collect(batched(none(), 10))).toEqual([]);
});
```

```typescript
// tests/ingest/upsert.test.ts
import { expect, test } from "bun:test";
import { buildUpsertSql } from "../../src/ingest/upsert";

test("builds a parameterised multi-row upsert", () => {
  const sql = buildUpsertSql("public_event", ["source_system", "source_record_id"], ["source_system", "source_record_id"], 2);
  expect(sql).toContain("INSERT INTO public_event (source_system, source_record_id)");
  expect(sql).toContain("VALUES ($1, $2), ($3, $4)");
  expect(sql).toContain("ON CONFLICT (source_system, source_record_id) DO UPDATE SET");
});

test("excludes conflict columns from the update clause", () => {
  const sql = buildUpsertSql("t", ["a", "b", "c"], ["a"], 1);
  expect(sql).toContain("b = excluded.b");
  expect(sql).toContain("c = excluded.c");
  expect(sql).not.toContain("a = excluded.a");
});

test("rejects an empty row count rather than emitting invalid sql", () => {
  expect(() => buildUpsertSql("t", ["a"], ["a"], 0)).toThrow(/at least one row/i);
});
```

- [ ] **Step 2: Run both tests and watch them fail**

Run: `bun test tests/ingest/`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write `src/ingest/csv-stream.ts`**

```typescript
import { parse } from "csv-parse";

export async function* streamCsvRows(
  source: NodeJS.ReadableStream,
): AsyncGenerator<Record<string, string>> {
  const parser = source.pipe(
    parse({ columns: true, skip_empty_lines: true, relax_column_count: true }),
  );
  for await (const row of parser) yield row as Record<string, string>;
}

export async function* batched<T>(
  items: AsyncIterable<T>,
  size: number,
): AsyncGenerator<T[]> {
  let batch: T[] = [];
  for await (const item of items) {
    batch = [...batch, item];
    if (batch.length >= size) {
      yield batch;
      batch = [];
    }
  }
  if (batch.length > 0) yield batch;
}
```

- [ ] **Step 4: Write `src/ingest/upsert.ts`**

```typescript
import type { Pool } from "pg";

export const BATCH_SIZE = 500;

function placeholders(columnCount: number, rowCount: number): string {
  return Array.from({ length: rowCount }, (_, rowIndex) => {
    const slots = Array.from(
      { length: columnCount },
      (_, colIndex) => `$${rowIndex * columnCount + colIndex + 1}`,
    );
    return `(${slots.join(", ")})`;
  }).join(", ");
}

function updateClause(columns: string[], conflictColumns: string[]): string {
  const conflict = new Set(conflictColumns);
  return columns
    .filter((column) => !conflict.has(column))
    .map((column) => `${column} = excluded.${column}`)
    .join(", ");
}

export function buildUpsertSql(
  table: string,
  columns: string[],
  conflictColumns: string[],
  rowCount: number,
): string {
  if (rowCount < 1) throw new Error("upsert needs at least one row");
  return [
    `INSERT INTO ${table} (${columns.join(", ")})`,
    `VALUES ${placeholders(columns.length, rowCount)}`,
    `ON CONFLICT (${conflictColumns.join(", ")}) DO UPDATE SET ${updateClause(columns, conflictColumns)}`,
  ].join(" ");
}

export async function upsertBatch(
  pool: Pool,
  table: string,
  columns: string[],
  conflictColumns: string[],
  rows: unknown[][],
): Promise<number> {
  if (rows.length === 0) return 0;
  const sql = buildUpsertSql(table, columns, conflictColumns, rows.length);
  const result = await pool.query(sql, rows.flat());
  return result.rowCount ?? 0;
}
```

- [ ] **Step 5: Run both tests and watch them pass**

Run: `bun test tests/ingest/`
Expected: 8 pass.

- [ ] **Step 6: Commit**

```bash
git add src/ingest/csv-stream.ts src/ingest/upsert.ts tests/ingest/
git commit -m "feat: streaming csv reader and idempotent batched upsert"
```

---

## Task 7: Address normalization

**Files:**
- Create: `src/address/normalize.ts`
- Test: `tests/address/normalize.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `type NormalizedAddress = { raw: string; normalized: string; streetNumber?: string; streetName?: string; suffix?: string; unit?: string; zip?: string }`
  - `normalizeAddress(raw: string, zip?: string): NormalizedAddress` — never mutates or discards `raw`.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/address/normalize.test.ts
import { expect, test } from "bun:test";
import { normalizeAddress } from "../../src/address/normalize";

test("preserves the raw input exactly", () => {
  expect(normalizeAddress("  302 sumner st.  ").raw).toBe("  302 sumner st.  ");
});

test("uppercases, collapses whitespace, and strips trailing punctuation", () => {
  expect(normalizeAddress("  302   sumner  st.  ").normalized).toBe("302 SUMNER ST");
});

test("standardises common street suffixes", () => {
  expect(normalizeAddress("10 Beacon Street").normalized).toBe("10 BEACON ST");
  expect(normalizeAddress("5 Commonwealth Avenue").normalized).toBe("5 COMMONWEALTH AVE");
  expect(normalizeAddress("7 Blue Hill Road").normalized).toBe("7 BLUE HILL RD");
});

test("standardises directionals", () => {
  expect(normalizeAddress("12 North Main Street").normalized).toBe("12 N MAIN ST");
});

test("extracts the unit and removes it from the normalized street", () => {
  const result = normalizeAddress("302 Sumner St Apt 3B");
  expect(result.unit).toBe("3B");
  expect(result.normalized).toBe("302 SUMNER ST");
});

test("treats # as a unit marker", () => {
  expect(normalizeAddress("302 Sumner St #2").unit).toBe("2");
});

test("splits structured components", () => {
  const result = normalizeAddress("302 Sumner St", "02128");
  expect(result.streetNumber).toBe("302");
  expect(result.streetName).toBe("SUMNER");
  expect(result.suffix).toBe("ST");
  expect(result.zip).toBe("02128");
});

test("keeps a hyphenated street-number range intact", () => {
  expect(normalizeAddress("181-183 State St").streetNumber).toBe("181-183");
});

test("returns no components for a non-address location", () => {
  const result = normalizeAddress("Intersection of A St and B St");
  expect(result.streetNumber).toBeUndefined();
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `bun test tests/address/normalize.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// src/address/normalize.ts
const SUFFIXES: Record<string, string> = {
  STREET: "ST", ST: "ST",
  AVENUE: "AVE", AVE: "AVE", AV: "AVE",
  ROAD: "RD", RD: "RD",
  PLACE: "PL", PL: "PL",
  BOULEVARD: "BLVD", BLVD: "BLVD",
  DRIVE: "DR", DR: "DR",
  COURT: "CT", CT: "CT",
  TERRACE: "TER", TER: "TER",
  LANE: "LN", LN: "LN",
  SQUARE: "SQ", SQ: "SQ",
  PARKWAY: "PKWY", PKWY: "PKWY",
  HIGHWAY: "HWY", HWY: "HWY",
};

const DIRECTIONALS: Record<string, string> = {
  NORTH: "N", SOUTH: "S", EAST: "E", WEST: "W",
};

const UNIT_PATTERN = /\s+(?:APT|UNIT|STE|SUITE|FL|FLOOR|RM|ROOM|#)\s*([A-Z0-9-]+)\s*$/;
const STREET_NUMBER_PATTERN = /^(\d+(?:-\d+)?[A-Z]?)\s+(.*)$/;

export type NormalizedAddress = {
  readonly raw: string;
  readonly normalized: string;
  readonly streetNumber?: string;
  readonly streetName?: string;
  readonly suffix?: string;
  readonly unit?: string;
  readonly zip?: string;
};

function standardiseToken(token: string): string {
  return DIRECTIONALS[token] ?? SUFFIXES[token] ?? token;
}

function collapse(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function standardise(collapsed: string): string {
  return collapsed.split(" ").map(standardiseToken).join(" ");
}

function splitUnit(text: string): { street: string; unit?: string } {
  const match = text.match(UNIT_PATTERN);
  if (!match) return { street: text };
  return { street: text.replace(UNIT_PATTERN, "").trim(), unit: match[1] };
}

function splitComponents(street: string): Pick<
  NormalizedAddress,
  "streetNumber" | "streetName" | "suffix"
> {
  const match = street.match(STREET_NUMBER_PATTERN);
  if (!match) return {};
  const parts = match[2]!.split(" ");
  const last = parts[parts.length - 1];
  const hasSuffix = parts.length > 1 && last !== undefined && Object.values(SUFFIXES).includes(last);
  return {
    streetNumber: match[1],
    streetName: (hasSuffix ? parts.slice(0, -1) : parts).join(" "),
    suffix: hasSuffix ? last : undefined,
  };
}

export function normalizeAddress(raw: string, zip?: string): NormalizedAddress {
  const { street, unit } = splitUnit(standardise(collapse(raw)));
  return {
    raw,
    normalized: street,
    unit,
    zip: zip?.trim() || undefined,
    ...splitComponents(street),
  };
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `bun test tests/address/normalize.test.ts`
Expected: 9 pass.

- [ ] **Step 5: Commit**

```bash
git add src/address/normalize.ts tests/address/normalize.test.ts
git commit -m "feat: boston address normalization preserving raw input"
```

---

## Task 8: SAM ingest — the canonical address table

**Files:**
- Create: `src/ingest/sam.ts`
- Test: `tests/ingest/sam.test.ts`

**Interfaces:**
- Consumes: `streamCsvRows`, `batched`, `upsertBatch`, `BATCH_SIZE` (Task 6); `appPool` (Task 4); `resolveResourceUrl`, `BOSTON_PACKAGES` (Task 5)
- Produces:
  - `type SamRow = Record<string, string>`
  - `toAddressEntity(row: SamRow, snapshotAt: Date): unknown[] | null` — returns column values in `ADDRESS_ENTITY_COLUMNS` order, or `null` for a row with no usable `SAM_ADDRESS_ID`.
  - `const ADDRESS_ENTITY_COLUMNS: string[]`
  - `ingestSam(csvStream: NodeJS.ReadableStream, snapshotAt: Date): Promise<number>`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/ingest/sam.test.ts
import { expect, test } from "bun:test";
import { ADDRESS_ENTITY_COLUMNS, toAddressEntity } from "../../src/ingest/sam";

const SNAPSHOT = new Date("2026-08-13T00:00:00Z");

const SUMNER: Record<string, string> = {
  SAM_ADDRESS_ID: "132380",
  FULL_ADDRESS: "302 Sumner St",
  STREET_NUMBER: "302",
  FULL_STREET_NAME: "Sumner St",
  UNIT: "",
  ZIP_CODE: "02128",
  MAILING_NEIGHBORHOOD: "East Boston",
  PARCEL_ID: "0104910000",
  BUILDING_ID: "130883",
  POINT_Y: "42.3690",
  POINT_X: "-71.0380",
};

function field(row: unknown[], name: string): unknown {
  return row[ADDRESS_ENTITY_COLUMNS.indexOf(name)];
}

test("maps the verified 302 Sumner St row to its canonical identifiers", () => {
  const row = toAddressEntity(SUMNER, SNAPSHOT)!;
  expect(field(row, "sam_address_id")).toBe(132380);
  expect(field(row, "full_address")).toBe("302 Sumner St");
  expect(field(row, "parcel_id")).toBe("0104910000");
  expect(field(row, "building_id")).toBe(130883);
});

test("stores coordinates as numbers", () => {
  const row = toAddressEntity(SUMNER, SNAPSHOT)!;
  expect(field(row, "lat")).toBeCloseTo(42.369, 3);
  expect(field(row, "lon")).toBeCloseTo(-71.038, 3);
});

test("turns a blank unit into null rather than an empty string", () => {
  expect(field(toAddressEntity(SUMNER, SNAPSHOT)!, "unit")).toBeNull();
});

test("skips a row with no SAM_ADDRESS_ID instead of inserting a broken key", () => {
  expect(toAddressEntity({ ...SUMNER, SAM_ADDRESS_ID: "" }, SNAPSHOT)).toBeNull();
});

test("skips a row whose SAM_ADDRESS_ID is not numeric", () => {
  expect(toAddressEntity({ ...SUMNER, SAM_ADDRESS_ID: "N/A" }, SNAPSHOT)).toBeNull();
});

test("tolerates a missing optional column", () => {
  const { PARCEL_ID, ...withoutParcel } = SUMNER;
  expect(field(toAddressEntity(withoutParcel, SNAPSHOT)!, "parcel_id")).toBeNull();
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `bun test tests/ingest/sam.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// src/ingest/sam.ts
import { appPool } from "../db/pool";
import { BOSTON_PACKAGES, resolveResourceUrl } from "../catalog/ckan";
import { batched, streamCsvRows } from "./csv-stream";
import { BATCH_SIZE, upsertBatch } from "./upsert";

export const ADDRESS_ENTITY_COLUMNS = [
  "sam_address_id", "full_address", "street_number", "street_name",
  "unit", "zip", "neighborhood", "parcel_id", "building_id",
  "lat", "lon", "sam_snapshot_at",
] as const;

export type SamRow = Record<string, string>;

function text(row: SamRow, key: string): string | null {
  const value = row[key]?.trim();
  return value ? value : null;
}

function integer(row: SamRow, key: string): number | null {
  const value = text(row, key);
  if (value === null) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function decimal(row: SamRow, key: string): number | null {
  const value = text(row, key);
  if (value === null) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function toAddressEntity(row: SamRow, snapshotAt: Date): unknown[] | null {
  const samAddressId = integer(row, "SAM_ADDRESS_ID");
  if (samAddressId === null) return null;
  return [
    samAddressId,
    text(row, "FULL_ADDRESS") ?? "",
    text(row, "STREET_NUMBER"),
    text(row, "FULL_STREET_NAME"),
    text(row, "UNIT"),
    text(row, "ZIP_CODE"),
    text(row, "MAILING_NEIGHBORHOOD"),
    text(row, "PARCEL_ID"),
    integer(row, "BUILDING_ID"),
    decimal(row, "POINT_Y"),
    decimal(row, "POINT_X"),
    snapshotAt,
  ];
}

async function* mapped(
  csvStream: NodeJS.ReadableStream,
  snapshotAt: Date,
): AsyncGenerator<unknown[]> {
  for await (const row of streamCsvRows(csvStream)) {
    const mappedRow = toAddressEntity(row, snapshotAt);
    if (mappedRow !== null) yield mappedRow;
  }
}

export async function ingestSam(
  csvStream: NodeJS.ReadableStream,
  snapshotAt: Date,
): Promise<number> {
  let total = 0;
  for await (const batch of batched(mapped(csvStream, snapshotAt), BATCH_SIZE)) {
    total += await upsertBatch(
      appPool(),
      "address_entity",
      [...ADDRESS_ENTITY_COLUMNS],
      ["sam_address_id"],
      batch,
    );
  }
  return total;
}

if (import.meta.main) {
  const url = await resolveResourceUrl(BOSTON_PACKAGES.sam, /.*/);
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`SAM download failed: ${response.status}`);
  }
  const { Readable } = await import("node:stream");
  const count = await ingestSam(
    Readable.fromWeb(response.body as never),
    new Date(),
  );
  console.log(`upserted ${count} address_entity rows`);
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `bun test tests/ingest/sam.test.ts`
Expected: 6 pass.

- [ ] **Step 5: Ingest for real, then verify against the known-good record**

```bash
bun run src/ingest/sam.ts
psql "$DATABASE_URL_ADMIN" -d homesafe -c \
  "SELECT sam_address_id, full_address, parcel_id, building_id FROM address_entity WHERE sam_address_id = 132380;"
```

Expected exactly: `132380 | 302 Sumner St | 0104910000 | 130883`.

**If the column names above do not match the live CSV header,** print the header first (`head -1` on the downloaded file) and correct the `text()`/`integer()` keys. Do not guess — the readiness doc names the fields but Boston can rename them on refresh.

- [ ] **Step 6: Confirm re-running does not duplicate**

```bash
psql "$DATABASE_URL_ADMIN" -d homesafe -c "SELECT count(*) FROM address_entity;"
bun run src/ingest/sam.ts
psql "$DATABASE_URL_ADMIN" -d homesafe -c "SELECT count(*) FROM address_entity;"
```

Expected: identical counts. The upsert is idempotent.

- [ ] **Step 7: Commit**

```bash
git add src/ingest/sam.ts tests/ingest/sam.test.ts
git commit -m "feat: SAM ingest establishing canonical boston addresses"
```

---

## Task 9: Address resolution against ingested SAM data

**Files:**
- Create: `src/address/resolve.ts`
- Test: `tests/address/resolve.test.ts`

**Interfaces:**
- Consumes: `normalizeAddress` (Task 7); `evidencePool` (Task 4)
- Produces:
  - `type AddressCandidate = { samAddressId: number; fullAddress: string; parcelId: string | null; buildingId: number | null; matchMethod: MatchMethod; matchConfidence: MatchConfidence }`
  - `type MatchMethod = "sam_exact_address_zip" | "structured_components" | "unmatched"`
  - `type MatchConfidence = "high" | "medium" | "low" | "ambiguous"`
  - `const RESOLVER_VERSION = "1.0.0"`
  - `confidenceFor(method: MatchMethod, candidateCount: number): MatchConfidence` — pure.
  - `resolveAddress(raw: string, zip?: string, pool?: Pool): Promise<AddressCandidate[]>` — always returns candidates for the caller to choose from; never silently picks one.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/address/resolve.test.ts
import { expect, test } from "bun:test";
import { confidenceFor, resolveAddress, RESOLVER_VERSION } from "../../src/address/resolve";

test("a single exact match is high confidence", () => {
  expect(confidenceFor("sam_exact_address_zip", 1)).toBe("high");
});

test("multiple exact matches are ambiguous, not high", () => {
  expect(confidenceFor("sam_exact_address_zip", 3)).toBe("ambiguous");
});

test("a single structured-component match is medium", () => {
  expect(confidenceFor("structured_components", 1)).toBe("medium");
});

test("multiple structured matches are ambiguous", () => {
  expect(confidenceFor("structured_components", 2)).toBe("ambiguous");
});

test("no match is ambiguous", () => {
  expect(confidenceFor("unmatched", 0)).toBe("ambiguous");
});

test("the resolver version is pinned so stored matches stay explainable", () => {
  expect(RESOLVER_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
});

test("resolves the verified demo address to SAM 132380 at high confidence", async () => {
  const candidates = await resolveAddress("302 Sumner St");
  expect(candidates.length).toBeGreaterThan(0);
  expect(candidates[0]!.samAddressId).toBe(132380);
  expect(candidates[0]!.parcelId).toBe("0104910000");
  expect(candidates[0]!.matchConfidence).toBe("high");
});

test("returns an empty list for an address that is not in Boston", async () => {
  expect(await resolveAddress("99999 Nowhere Blvd", "00000")).toEqual([]);
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `bun test tests/address/resolve.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// src/address/resolve.ts
import type { Pool } from "pg";
import { evidencePool } from "../db/pool";
import { normalizeAddress } from "./normalize";

export const RESOLVER_VERSION = "1.0.0";
const CANDIDATE_LIMIT = 10;

export type MatchMethod =
  | "sam_exact_address_zip"
  | "structured_components"
  | "unmatched";

export type MatchConfidence = "high" | "medium" | "low" | "ambiguous";

export type AddressCandidate = {
  readonly samAddressId: number;
  readonly fullAddress: string;
  readonly parcelId: string | null;
  readonly buildingId: number | null;
  readonly matchMethod: MatchMethod;
  readonly matchConfidence: MatchConfidence;
};

type Row = {
  sam_address_id: number;
  full_address: string;
  parcel_id: string | null;
  building_id: number | null;
};

export function confidenceFor(
  method: MatchMethod,
  candidateCount: number,
): MatchConfidence {
  if (method === "unmatched" || candidateCount === 0) return "ambiguous";
  if (candidateCount > 1) return "ambiguous";
  return method === "sam_exact_address_zip" ? "high" : "medium";
}

function toCandidates(rows: Row[], method: MatchMethod): AddressCandidate[] {
  const confidence = confidenceFor(method, rows.length);
  return rows.map((row) => ({
    samAddressId: row.sam_address_id,
    fullAddress: row.full_address,
    parcelId: row.parcel_id,
    buildingId: row.building_id,
    matchMethod: method,
    matchConfidence: confidence,
  }));
}

const SELECT_FIELDS =
  "sam_address_id, full_address, parcel_id, building_id";

async function byExactAddress(
  pool: Pool,
  normalized: string,
  zip: string | undefined,
): Promise<Row[]> {
  const { rows } = await pool.query<Row>(
    `SELECT ${SELECT_FIELDS} FROM address_entity
     WHERE upper(full_address) = $1 AND ($2::STRING IS NULL OR zip = $2)
     LIMIT ${CANDIDATE_LIMIT}`,
    [normalized, zip ?? null],
  );
  return rows;
}

async function byComponents(
  pool: Pool,
  streetNumber: string,
  streetName: string,
  zip: string | undefined,
): Promise<Row[]> {
  const { rows } = await pool.query<Row>(
    `SELECT ${SELECT_FIELDS} FROM address_entity
     WHERE street_number = $1
       AND upper(street_name) LIKE $2
       AND ($3::STRING IS NULL OR zip = $3)
     LIMIT ${CANDIDATE_LIMIT}`,
    [streetNumber, `${streetName}%`, zip ?? null],
  );
  return rows;
}

export async function resolveAddress(
  raw: string,
  zip?: string,
  pool: Pool = evidencePool(),
): Promise<AddressCandidate[]> {
  const parsed = normalizeAddress(raw, zip);

  const exact = await byExactAddress(pool, parsed.normalized, parsed.zip);
  if (exact.length > 0) return toCandidates(exact, "sam_exact_address_zip");

  if (!parsed.streetNumber || !parsed.streetName) return [];

  const structured = await byComponents(
    pool,
    parsed.streetNumber,
    parsed.streetName,
    parsed.zip,
  );
  return toCandidates(structured, "structured_components");
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `bun test tests/address/resolve.test.ts`
Expected: 8 pass.

**Note:** `resolveAddress` reads through `evidencePool()`, which proves the public-evidence path genuinely works under the restricted login rather than quietly relying on `app_rw`.

- [ ] **Step 5: Commit**

```bash
git add src/address/resolve.ts tests/address/resolve.test.ts
git commit -m "feat: address resolution returning candidates with explicit confidence"
```

---

## Task 10: Event categorisation and canonical caveats

**Files:**
- Create: `src/evidence/categorize.ts`, `src/evidence/caveats.ts`
- Test: `tests/evidence/categorize.test.ts`, `tests/evidence/caveats.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `type EventCategory = "heat_hot_water" | "pest" | "structural_safety" | "permit" | "utilities" | "sanitation" | "other"`
  - `categorize(text: string, sourceSystem: string): EventCategory`
  - `type SourceSystem = "boston_311_legacy" | "boston_311_new" | "building_violation" | "rentsmart" | "building_permit" | "property_assessment"`
  - `caveatFor(sourceSystem: SourceSystem): string` — throws on an unknown source rather than returning a vague default.

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/evidence/categorize.test.ts
import { expect, test } from "bun:test";
import { categorize } from "../../src/evidence/categorize";

test("a permit is a permit regardless of its description", () => {
  expect(categorize("Install new kitchen cabinets", "building_permit")).toBe("permit");
});

test("recognises heat and hot water language seen in real Boston data", () => {
  expect(categorize("Heat - Excessive, Insufficient", "building_violation")).toBe("heat_hot_water");
  expect(categorize("No hot water in unit", "boston_311_new")).toBe("heat_hot_water");
  expect(categorize("Radiator not working", "rentsmart")).toBe("heat_hot_water");
});

test("recognises pest language", () => {
  expect(categorize("Rodent infestation observed", "rentsmart")).toBe("pest");
  expect(categorize("Bed bugs reported", "boston_311_new")).toBe("pest");
});

test("recognises structural and egress language", () => {
  expect(categorize("Unsafe and Dangerous", "building_violation")).toBe("structural_safety");
  expect(categorize("Number of Exits or Exit Access", "building_violation")).toBe("structural_safety");
});

test("recognises utility language", () => {
  expect(categorize("Electrical hazard in hallway", "building_violation")).toBe("utilities");
});

test("recognises sanitation language", () => {
  expect(categorize("Trash and rubbish accumulation", "boston_311_legacy")).toBe("sanitation");
});

test("falls back to other rather than guessing", () => {
  expect(categorize("Miscellaneous inspection note", "building_violation")).toBe("other");
});

test("categorisation is case-insensitive", () => {
  expect(categorize("HEAT INSUFFICIENT", "building_violation")).toBe("heat_hot_water");
});

test("an empty description is other, not a crash", () => {
  expect(categorize("", "building_violation")).toBe("other");
});
```

```typescript
// tests/evidence/caveats.test.ts
import { expect, test } from "bun:test";
import { caveatFor } from "../../src/evidence/caveats";

test("the permit caveat states plainly that it does not prove a repair", () => {
  const caveat = caveatFor("building_permit");
  expect(caveat).toMatch(/does not establish/i);
  expect(caveat).toMatch(/repaired|resolved/i);
});

test("the violation caveat says it does not establish a current condition", () => {
  expect(caveatFor("building_violation")).toMatch(/current condition/i);
});

test("the rentsmart caveat says it is not a separate inspection outcome", () => {
  expect(caveatFor("rentsmart")).toMatch(/aggregat|not.*inspection/i);
});

test("both 311 schemas get a caveat about derived address matching", () => {
  expect(caveatFor("boston_311_new")).toMatch(/address match/i);
  expect(caveatFor("boston_311_legacy")).toMatch(/address match/i);
});

test("every caveat is non-empty, because the column is NOT NULL", () => {
  const sources = [
    "boston_311_legacy", "boston_311_new", "building_violation",
    "rentsmart", "building_permit", "property_assessment",
  ] as const;
  for (const source of sources) expect(caveatFor(source).length).toBeGreaterThan(20);
});

test("an unknown source throws rather than returning a vague default", () => {
  // @ts-expect-error deliberately invalid input
  expect(() => caveatFor("mystery_source")).toThrow(/unknown source system/i);
});
```

- [ ] **Step 2: Run both tests and watch them fail**

Run: `bun test tests/evidence/`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write `src/evidence/categorize.ts`**

```typescript
export type EventCategory =
  | "heat_hot_water" | "pest" | "structural_safety"
  | "permit" | "utilities" | "sanitation" | "other";

const RULES: ReadonlyArray<readonly [EventCategory, RegExp]> = [
  ["heat_hot_water", /\b(heat|heating|hot\s*water|boiler|radiator|furnace)\b/i],
  ["pest", /\b(rodent|roach|cockroach|pest|infest\w*|bed\s*bug|mice|mouse|rat)\b/i],
  ["structural_safety", /\b(unsafe|dangerous|structur\w*|exit|egress|collapse|railing|stair)\b/i],
  ["utilities", /\b(electric\w*|gas|plumb\w*|utility|utilities|sewer|water\s*leak)\b/i],
  ["sanitation", /\b(trash|rubbish|sanitat\w*|garbage|debris|dumpster)\b/i],
];

export function categorize(text: string, sourceSystem: string): EventCategory {
  if (sourceSystem === "building_permit") return "permit";
  const match = RULES.find(([, pattern]) => pattern.test(text));
  return match ? match[0] : "other";
}
```

- [ ] **Step 4: Write `src/evidence/caveats.ts`**

```typescript
export type SourceSystem =
  | "boston_311_legacy" | "boston_311_new" | "building_violation"
  | "rentsmart" | "building_permit" | "property_assessment";

const DERIVED_MATCH =
  "This record was linked to the address by a derived address match rather than " +
  "a shared identifier, so the linkage carries a stated confidence level.";

const CAVEATS: Record<SourceSystem, string> = {
  building_permit:
    "This public permit records authorized or issued work. It does not establish " +
    "that a specific resident concern has been repaired or resolved.",
  building_violation:
    "This is a historical public enforcement record. It does not establish a " +
    "current condition at the property.",
  rentsmart:
    "RentSmart is an aggregated housing-signal dataset. It is not a separate " +
    "verified inspection outcome and must not be read as a property score.",
  boston_311_new: `This is a public service request. ${DERIVED_MATCH}`,
  boston_311_legacy: `This is a public service request from the legacy 311 system. ${DERIVED_MATCH}`,
  property_assessment:
    "This is annually published property reference data, not a record of any " +
    "housing condition or complaint.",
};

export function caveatFor(sourceSystem: SourceSystem): string {
  const caveat = CAVEATS[sourceSystem];
  if (!caveat) throw new Error(`unknown source system: ${sourceSystem}`);
  return caveat;
}
```

- [ ] **Step 5: Run both tests and watch them pass**

Run: `bun test tests/evidence/`
Expected: 15 pass.

- [ ] **Step 6: Commit**

```bash
git add src/evidence/categorize.ts src/evidence/caveats.ts tests/evidence/
git commit -m "feat: event categorisation and mandatory per-source caveats"
```

---

## Task 11: Violations ingest via the verified `sam_id` join

**Files:**
- Create: `src/ingest/violations.ts`
- Test: `tests/ingest/violations.test.ts`

**Interfaces:**
- Consumes: Tasks 4, 5, 6, 10
- Produces:
  - `const PUBLIC_EVENT_COLUMNS: string[]` and `const ADDRESS_MATCH_COLUMNS: string[]` — shared with Task 12
  - `toViolationEvent(row: Record<string,string>, retrievedAt: Date): { event: unknown[]; match: unknown[] } | null`
  - `ingestViolations(csvStream: NodeJS.ReadableStream, retrievedAt: Date): Promise<number>`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/ingest/violations.test.ts
import { expect, test } from "bun:test";
import {
  ADDRESS_MATCH_COLUMNS,
  PUBLIC_EVENT_COLUMNS,
  toViolationEvent,
} from "../../src/ingest/violations";

const RETRIEVED = new Date("2026-08-13T12:00:00Z");

const ROW: Record<string, string> = {
  case_no: "V-2026-0442",
  status_dttm: "2026-07-02 09:14:00",
  status: "Open",
  code: "780 CMR",
  description: "Heat - Excessive, Insufficient",
  violation_stno: "302",
  violation_street: "Sumner",
  violation_suffix: "St",
  zip: "02128",
  sam_id: "132380",
  latitude: "42.3690",
  longitude: "-71.0380",
};

function eventField(row: unknown[], name: string): unknown {
  return row[PUBLIC_EVENT_COLUMNS.indexOf(name)];
}
function matchField(row: unknown[], name: string): unknown {
  return row[ADDRESS_MATCH_COLUMNS.indexOf(name)];
}

test("uses case_no as the source record id", () => {
  const { event } = toViolationEvent(ROW, RETRIEVED)!;
  expect(eventField(event, "source_record_id")).toBe("V-2026-0442");
  expect(eventField(event, "source_system")).toBe("building_violation");
});

test("categorises the description", () => {
  const { event } = toViolationEvent(ROW, RETRIEVED)!;
  expect(eventField(event, "event_category")).toBe("heat_hot_water");
});

test("attaches the mandatory caveat", () => {
  const { event } = toViolationEvent(ROW, RETRIEVED)!;
  expect(eventField(event, "caveat")).toMatch(/current condition/i);
});

test("a sam_id join is address scope at high confidence", () => {
  const { event, match } = toViolationEvent(ROW, RETRIEVED)!;
  expect(eventField(event, "address_scope")).toBe("address");
  expect(matchField(match, "match_method")).toBe("sam_id_direct");
  expect(matchField(match, "match_confidence")).toBe("high");
});

test("records the raw source address on the match, not the event", () => {
  const { match } = toViolationEvent(ROW, RETRIEVED)!;
  expect(matchField(match, "raw_address")).toBe("302 Sumner St 02128");
});

test("a row with no sam_id becomes unknown scope and ambiguous confidence", () => {
  const { event, match } = toViolationEvent({ ...ROW, sam_id: "" }, RETRIEVED)!;
  expect(eventField(event, "address_scope")).toBe("unknown");
  expect(matchField(match, "match_method")).toBe("unmatched");
  expect(matchField(match, "match_confidence")).toBe("ambiguous");
});

test("a row with no case_no is skipped — no stable identity to upsert on", () => {
  expect(toViolationEvent({ ...ROW, case_no: "" }, RETRIEVED)).toBeNull();
});

test("preserves the whole source row as raw_payload for provenance", () => {
  const { event } = toViolationEvent(ROW, RETRIEVED)!;
  expect(JSON.parse(eventField(event, "raw_payload") as string).sam_id).toBe("132380");
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `bun test tests/ingest/violations.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// src/ingest/violations.ts
import { appPool } from "../db/pool";
import { BOSTON_PACKAGES, resolveResourceUrl } from "../catalog/ckan";
import { RESOLVER_VERSION } from "../address/resolve";
import { caveatFor } from "../evidence/caveats";
import { categorize } from "../evidence/categorize";
import { batched, streamCsvRows } from "./csv-stream";
import { BATCH_SIZE, upsertBatch } from "./upsert";

const SOURCE_SYSTEM = "building_violation";
const SOURCE_URL =
  "https://data.boston.gov/dataset/building-and-property-violations1";

export const PUBLIC_EVENT_COLUMNS = [
  "source_system", "source_record_id", "address_entity_id", "address_scope",
  "event_category", "source_status", "title", "description",
  "occurred_at", "occurred_precision", "retrieved_at", "source_url",
  "raw_payload", "caveat",
] as const;

export const ADDRESS_MATCH_COLUMNS = [
  "source_system", "source_record_id", "raw_address",
  "candidate_sam_address_id", "match_method", "match_confidence",
  "resolver_version",
] as const;

function trimmed(row: Record<string, string>, key: string): string | null {
  const value = row[key]?.trim();
  return value ? value : null;
}

function timestamp(row: Record<string, string>, key: string): Date | null {
  const value = trimmed(row, key);
  if (value === null) return null;
  const parsed = new Date(value.replace(" ", "T"));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function rawAddress(row: Record<string, string>): string {
  return [
    trimmed(row, "violation_stno"),
    trimmed(row, "violation_street"),
    trimmed(row, "violation_suffix"),
    trimmed(row, "zip"),
  ]
    .filter((part): part is string => part !== null)
    .join(" ");
}

function samId(row: Record<string, string>): number | null {
  const value = trimmed(row, "sam_id");
  if (value === null) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function toViolationEvent(
  row: Record<string, string>,
  retrievedAt: Date,
): { event: unknown[]; match: unknown[] } | null {
  const caseNo = trimmed(row, "case_no");
  if (caseNo === null) return null;

  const sam = samId(row);
  const description = trimmed(row, "description") ?? "";

  const event = [
    SOURCE_SYSTEM,
    caseNo,
    null, // address_entity_id backfilled in Step 5
    sam === null ? "unknown" : "address",
    categorize(description, SOURCE_SYSTEM),
    trimmed(row, "status"),
    trimmed(row, "code"),
    description,
    timestamp(row, "status_dttm"),
    "day",
    retrievedAt,
    SOURCE_URL,
    JSON.stringify(row),
    caveatFor(SOURCE_SYSTEM),
  ];

  const match = [
    SOURCE_SYSTEM,
    caseNo,
    rawAddress(row),
    sam,
    sam === null ? "unmatched" : "sam_id_direct",
    sam === null ? "ambiguous" : "high",
    RESOLVER_VERSION,
  ];

  return { event, match };
}

async function* mapped(
  csvStream: NodeJS.ReadableStream,
  retrievedAt: Date,
): AsyncGenerator<{ event: unknown[]; match: unknown[] }> {
  for await (const row of streamCsvRows(csvStream)) {
    const result = toViolationEvent(row, retrievedAt);
    if (result !== null) yield result;
  }
}

export async function ingestViolations(
  csvStream: NodeJS.ReadableStream,
  retrievedAt: Date,
): Promise<number> {
  const pool = appPool();
  let total = 0;
  for await (const batch of batched(mapped(csvStream, retrievedAt), BATCH_SIZE)) {
    await upsertBatch(pool, "address_match", [...ADDRESS_MATCH_COLUMNS],
      ["source_system", "source_record_id"], batch.map((b) => b.match));
    total += await upsertBatch(pool, "public_event", [...PUBLIC_EVENT_COLUMNS],
      ["source_system", "source_record_id"], batch.map((b) => b.event));
  }
  return total;
}

if (import.meta.main) {
  const url = await resolveResourceUrl(BOSTON_PACKAGES.violations, /.*/);
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`violations download failed: ${response.status}`);
  }
  const { Readable } = await import("node:stream");
  const count = await ingestViolations(
    Readable.fromWeb(response.body as never),
    new Date(),
  );
  console.log(`upserted ${count} violation events`);
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `bun test tests/ingest/violations.test.ts`
Expected: 8 pass.

- [ ] **Step 5: Ingest, then link events to addresses and verify**

```bash
bun run src/ingest/violations.ts
psql "$DATABASE_URL_ADMIN" -d homesafe <<'SQL'
UPDATE public_event pe
SET address_entity_id = ae.address_entity_id,
    address_match_id  = am.match_id
FROM address_match am
JOIN address_entity ae ON ae.sam_address_id = am.candidate_sam_address_id
WHERE am.source_system = pe.source_system
  AND am.source_record_id = pe.source_record_id
  AND pe.address_entity_id IS NULL;

SELECT count(*) AS linked_violations
FROM public_event WHERE source_system = 'building_violation' AND address_entity_id IS NOT NULL;
SQL
```

Expected: a non-zero `linked_violations` count.

- [ ] **Step 6: Commit**

```bash
git add src/ingest/violations.ts tests/ingest/violations.test.ts
git commit -m "feat: violations ingest joined through the verified sam_id"
```

---

## Task 12: Permits ingest via the verified `property_id` join

**Files:**
- Create: `src/ingest/permits.ts`
- Test: `tests/ingest/permits.test.ts`

**Interfaces:**
- Consumes: `PUBLIC_EVENT_COLUMNS`, `ADDRESS_MATCH_COLUMNS` (Task 11); Tasks 4, 5, 6, 10
- Produces: `toPermitEvent(row, retrievedAt): { event: unknown[]; match: unknown[] } | null`, `ingestPermits(csvStream, retrievedAt): Promise<number>`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/ingest/permits.test.ts
import { expect, test } from "bun:test";
import { ADDRESS_MATCH_COLUMNS, PUBLIC_EVENT_COLUMNS } from "../../src/ingest/violations";
import { toPermitEvent } from "../../src/ingest/permits";

const RETRIEVED = new Date("2026-08-13T12:00:00Z");

// property_id 130392 is the readiness doc's verified permit → 181-183 State St
const ROW: Record<string, string> = {
  permitnumber: "ALT1234567",
  worktype: "INTEXT",
  permittypedescr: "Alteration",
  description: "Replace heating system components",
  issued_date: "2026-07-15 00:00:00",
  expiration_date: "2027-01-15 00:00:00",
  status: "Open",
  address: "181-183 State St",
  zip: "02109",
  property_id: "130392",
  parcel_id: "0303807000",
};

function eventField(row: unknown[], name: string): unknown {
  return row[PUBLIC_EVENT_COLUMNS.indexOf(name)];
}
function matchField(row: unknown[], name: string): unknown {
  return row[ADDRESS_MATCH_COLUMNS.indexOf(name)];
}

test("uses permitnumber as the source record id", () => {
  const { event } = toPermitEvent(ROW, RETRIEVED)!;
  expect(eventField(event, "source_record_id")).toBe("ALT1234567");
  expect(eventField(event, "source_system")).toBe("building_permit");
});

test("every permit is category permit, never inferred from its description", () => {
  const { event } = toPermitEvent(ROW, RETRIEVED)!;
  expect(eventField(event, "event_category")).toBe("permit");
});

test("carries the caveat that a permit does not prove a repair", () => {
  const { event } = toPermitEvent(ROW, RETRIEVED)!;
  expect(eventField(event, "caveat")).toMatch(/does not establish/i);
  expect(eventField(event, "caveat")).toMatch(/repaired|resolved/i);
});

test("property_id joins to SAM at high confidence", () => {
  const { match } = toPermitEvent(ROW, RETRIEVED)!;
  expect(matchField(match, "candidate_sam_address_id")).toBe(130392);
  expect(matchField(match, "match_method")).toBe("sam_id_direct");
  expect(matchField(match, "match_confidence")).toBe("high");
});

test("uses issued_date as the event time", () => {
  const { event } = toPermitEvent(ROW, RETRIEVED)!;
  expect((eventField(event, "occurred_at") as Date).toISOString()).toStartWith("2026-07-15");
});

test("a row with no permitnumber is skipped", () => {
  expect(toPermitEvent({ ...ROW, permitnumber: "" }, RETRIEVED)).toBeNull();
});

test("a row with no property_id falls back to parcel scope, not address scope", () => {
  const { event, match } = toPermitEvent({ ...ROW, property_id: "" }, RETRIEVED)!;
  expect(eventField(event, "address_scope")).toBe("parcel");
  expect(matchField(match, "match_method")).toBe("parcel_direct");
  expect(matchField(match, "match_confidence")).toBe("medium");
});

test("a row with neither property_id nor parcel_id is unknown and ambiguous", () => {
  const { event, match } = toPermitEvent({ ...ROW, property_id: "", parcel_id: "" }, RETRIEVED)!;
  expect(eventField(event, "address_scope")).toBe("unknown");
  expect(matchField(match, "match_confidence")).toBe("ambiguous");
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `bun test tests/ingest/permits.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// src/ingest/permits.ts
import { appPool } from "../db/pool";
import { BOSTON_PACKAGES, resolveResourceUrl } from "../catalog/ckan";
import { RESOLVER_VERSION } from "../address/resolve";
import { caveatFor } from "../evidence/caveats";
import { batched, streamCsvRows } from "./csv-stream";
import { BATCH_SIZE, upsertBatch } from "./upsert";
import { ADDRESS_MATCH_COLUMNS, PUBLIC_EVENT_COLUMNS } from "./violations";

const SOURCE_SYSTEM = "building_permit";
const SOURCE_URL = "https://data.boston.gov/dataset/approved-building-permits";

type Linkage = {
  readonly samAddressId: number | null;
  readonly scope: "address" | "parcel" | "unknown";
  readonly method: "sam_id_direct" | "parcel_direct" | "unmatched";
  readonly confidence: "high" | "medium" | "ambiguous";
};

function trimmed(row: Record<string, string>, key: string): string | null {
  const value = row[key]?.trim();
  return value ? value : null;
}

function timestamp(row: Record<string, string>, key: string): Date | null {
  const value = trimmed(row, key);
  if (value === null) return null;
  const parsed = new Date(value.replace(" ", "T"));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function integerField(row: Record<string, string>, key: string): number | null {
  const value = trimmed(row, key);
  if (value === null) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function linkageFor(row: Record<string, string>): Linkage {
  const propertyId = integerField(row, "property_id");
  if (propertyId !== null) {
    return { samAddressId: propertyId, scope: "address", method: "sam_id_direct", confidence: "high" };
  }
  if (trimmed(row, "parcel_id") !== null) {
    return { samAddressId: null, scope: "parcel", method: "parcel_direct", confidence: "medium" };
  }
  return { samAddressId: null, scope: "unknown", method: "unmatched", confidence: "ambiguous" };
}

export function toPermitEvent(
  row: Record<string, string>,
  retrievedAt: Date,
): { event: unknown[]; match: unknown[] } | null {
  const permitNumber = trimmed(row, "permitnumber");
  if (permitNumber === null) return null;

  const link = linkageFor(row);

  const event = [
    SOURCE_SYSTEM,
    permitNumber,
    null,
    link.scope,
    "permit",
    trimmed(row, "status"),
    trimmed(row, "permittypedescr"),
    trimmed(row, "description"),
    timestamp(row, "issued_date"),
    "day",
    retrievedAt,
    SOURCE_URL,
    JSON.stringify(row),
    caveatFor(SOURCE_SYSTEM),
  ];

  const match = [
    SOURCE_SYSTEM,
    permitNumber,
    [trimmed(row, "address"), trimmed(row, "zip")].filter(Boolean).join(" "),
    link.samAddressId,
    link.method,
    link.confidence,
    RESOLVER_VERSION,
  ];

  return { event, match };
}

async function* mapped(
  csvStream: NodeJS.ReadableStream,
  retrievedAt: Date,
): AsyncGenerator<{ event: unknown[]; match: unknown[] }> {
  for await (const row of streamCsvRows(csvStream)) {
    const result = toPermitEvent(row, retrievedAt);
    if (result !== null) yield result;
  }
}

export async function ingestPermits(
  csvStream: NodeJS.ReadableStream,
  retrievedAt: Date,
): Promise<number> {
  const pool = appPool();
  let total = 0;
  for await (const batch of batched(mapped(csvStream, retrievedAt), BATCH_SIZE)) {
    await upsertBatch(pool, "address_match", [...ADDRESS_MATCH_COLUMNS],
      ["source_system", "source_record_id"], batch.map((b) => b.match));
    total += await upsertBatch(pool, "public_event", [...PUBLIC_EVENT_COLUMNS],
      ["source_system", "source_record_id"], batch.map((b) => b.event));
  }
  return total;
}

if (import.meta.main) {
  const url = await resolveResourceUrl(BOSTON_PACKAGES.permits, /.*/);
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`permits download failed: ${response.status}`);
  }
  const { Readable } = await import("node:stream");
  const count = await ingestPermits(
    Readable.fromWeb(response.body as never),
    new Date(),
  );
  console.log(`upserted ${count} permit events`);
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `bun test tests/ingest/permits.test.ts`
Expected: 8 pass.

- [ ] **Step 5: Ingest and link**

```bash
bun run src/ingest/permits.ts
psql "$DATABASE_URL_ADMIN" -d homesafe <<'SQL'
UPDATE public_event pe
SET address_entity_id = ae.address_entity_id,
    address_match_id  = am.match_id
FROM address_match am
JOIN address_entity ae ON ae.sam_address_id = am.candidate_sam_address_id
WHERE am.source_system = pe.source_system
  AND am.source_record_id = pe.source_record_id
  AND pe.address_entity_id IS NULL;

SELECT source_system, count(*) FROM public_event GROUP BY source_system;
SQL
```

Expected: non-zero counts for both `building_violation` and `building_permit`.

- [ ] **Step 6: Commit**

```bash
git add src/ingest/permits.ts tests/ingest/permits.test.ts
git commit -m "feat: permits ingest joined through property_id with repair caveat"
```

---

## Task 13: Evidence query service and CLI

The deliverable. Everything before this exists to make this command truthful.

**Files:**
- Create: `src/evidence/query.ts`, `src/cli/evidence.ts`
- Test: `tests/evidence/query.test.ts`

**Interfaces:**
- Consumes: `evidencePool` (Task 4), `resolveAddress` (Task 9), `SourceSystem` (Task 10)
- Produces:
  - `type EvidenceItem = { ref: string; sourceSystem: SourceSystem; sourceRecordId: string; title: string | null; description: string | null; sourceStatus: string | null; occurredAt: Date | null; eventCategory: string; addressScope: string; matchMethod: string | null; matchConfidence: string | null; sourceUrl: string; caveat: string }`
  - `publicTimeline(samAddressId: number, pool?: Pool): Promise<EvidenceItem[]>` — newest first.
  - `bun run evidence "302 Sumner St"`

The `ref` field is the opaque citation token plan 3's retrieval receipt and claim validator depend on. Format: `evt_<event_id>`. The model will only ever see this token, never a source URL, so a fabricated citation becomes a validator error rather than a dead link.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/evidence/query.test.ts
import { expect, test } from "bun:test";
import { publicTimeline } from "../../src/evidence/query";
import { resolveAddress } from "../../src/address/resolve";

const SUMNER_SAM_ID = 132380;

test("returns evidence items for the verified demo address", async () => {
  const items = await publicTimeline(SUMNER_SAM_ID);
  expect(Array.isArray(items)).toBe(true);
});

test("every item carries a citation ref shaped for the claim validator", async () => {
  for (const item of await publicTimeline(SUMNER_SAM_ID)) {
    expect(item.ref).toMatch(/^evt_[0-9a-f-]{36}$/);
  }
});

test("every item carries a non-empty caveat — the column is NOT NULL", async () => {
  for (const item of await publicTimeline(SUMNER_SAM_ID)) {
    expect(item.caveat.length).toBeGreaterThan(20);
  }
});

test("every item carries a source url for verification", async () => {
  for (const item of await publicTimeline(SUMNER_SAM_ID)) {
    expect(item.sourceUrl).toStartWith("https://data.boston.gov/");
  }
});

test("every item declares its address scope and match confidence", async () => {
  const scopes = ["unit", "address", "building", "parcel", "nearby", "unknown"];
  for (const item of await publicTimeline(SUMNER_SAM_ID)) {
    expect(scopes).toContain(item.addressScope);
    expect(item.matchConfidence).not.toBeNull();
  }
});

test("items are ordered newest first", async () => {
  const dated = (await publicTimeline(SUMNER_SAM_ID))
    .map((item) => item.occurredAt)
    .filter((date): date is Date => date !== null);
  for (let i = 1; i < dated.length; i += 1) {
    expect(dated[i - 1]!.getTime()).toBeGreaterThanOrEqual(dated[i]!.getTime());
  }
});

test("permit items always carry the not-proof-of-repair caveat", async () => {
  const permits = (await publicTimeline(SUMNER_SAM_ID)).filter(
    (item) => item.sourceSystem === "building_permit",
  );
  for (const permit of permits) {
    expect(permit.caveat).toMatch(/does not establish/i);
  }
});

test("an address with no records returns an empty list, not an error", async () => {
  expect(await publicTimeline(-1)).toEqual([]);
});

test("end to end: a typed address resolves and yields its timeline", async () => {
  const [candidate] = await resolveAddress("302 Sumner St");
  expect(candidate).toBeDefined();
  const items = await publicTimeline(candidate!.samAddressId);
  expect(Array.isArray(items)).toBe(true);
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `bun test tests/evidence/query.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/evidence/query.ts`**

```typescript
import type { Pool } from "pg";
import { evidencePool } from "../db/pool";
import type { SourceSystem } from "./caveats";

const MAX_ITEMS = 200;

export type EvidenceItem = {
  readonly ref: string;
  readonly sourceSystem: SourceSystem;
  readonly sourceRecordId: string;
  readonly title: string | null;
  readonly description: string | null;
  readonly sourceStatus: string | null;
  readonly occurredAt: Date | null;
  readonly eventCategory: string;
  readonly addressScope: string;
  readonly matchMethod: string | null;
  readonly matchConfidence: string | null;
  readonly sourceUrl: string;
  readonly caveat: string;
};

type Row = {
  event_id: string;
  source_system: SourceSystem;
  source_record_id: string;
  title: string | null;
  description: string | null;
  source_status: string | null;
  occurred_at: Date | null;
  event_category: string;
  address_scope: string;
  match_method: string | null;
  match_confidence: string | null;
  source_url: string;
  caveat: string;
};

const TIMELINE_SQL = `
  SELECT pe.event_id, pe.source_system, pe.source_record_id, pe.title,
         pe.description, pe.source_status, pe.occurred_at, pe.event_category,
         pe.address_scope, am.match_method, am.match_confidence,
         pe.source_url, pe.caveat
  FROM public_event pe
  JOIN address_entity ae ON ae.address_entity_id = pe.address_entity_id
  LEFT JOIN address_match am ON am.match_id = pe.address_match_id
  WHERE ae.sam_address_id = $1
  ORDER BY pe.occurred_at DESC NULLS LAST
  LIMIT ${MAX_ITEMS}
`;

function toItem(row: Row): EvidenceItem {
  return {
    ref: `evt_${row.event_id}`,
    sourceSystem: row.source_system,
    sourceRecordId: row.source_record_id,
    title: row.title,
    description: row.description,
    sourceStatus: row.source_status,
    occurredAt: row.occurred_at,
    eventCategory: row.event_category,
    addressScope: row.address_scope,
    matchMethod: row.match_method,
    matchConfidence: row.match_confidence,
    sourceUrl: row.source_url,
    caveat: row.caveat,
  };
}

export async function publicTimeline(
  samAddressId: number,
  pool: Pool = evidencePool(),
): Promise<EvidenceItem[]> {
  const { rows } = await pool.query<Row>(TIMELINE_SQL, [samAddressId]);
  return rows.map(toItem);
}
```

- [ ] **Step 4: Write `src/cli/evidence.ts`**

```typescript
import { resolveAddress } from "../address/resolve";
import { publicTimeline } from "../evidence/query";
import { closePools } from "../db/pool";

function printCandidates(candidates: Awaited<ReturnType<typeof resolveAddress>>): void {
  console.log("\nAddress candidates:");
  for (const candidate of candidates) {
    console.log(
      `  SAM ${candidate.samAddressId}  ${candidate.fullAddress}  ` +
        `parcel=${candidate.parcelId ?? "-"}  ` +
        `[${candidate.matchMethod}, ${candidate.matchConfidence}]`,
    );
  }
}

function printItem(item: Awaited<ReturnType<typeof publicTimeline>>[number]): void {
  const when = item.occurredAt?.toISOString().slice(0, 10) ?? "undated";
  console.log(`\n  ${when}  [${item.sourceSystem}]  ${item.eventCategory}`);
  console.log(`    ${item.title ?? ""} ${item.description ?? ""}`.trimEnd());
  console.log(`    scope=${item.addressScope} confidence=${item.matchConfidence ?? "-"}`);
  console.log(`    ref=${item.ref}`);
  console.log(`    source: ${item.sourceUrl}`);
  console.log(`    caveat: ${item.caveat}`);
}

async function main(): Promise<void> {
  const raw = process.argv.slice(2).join(" ").trim();
  if (!raw) {
    console.error('usage: bun run evidence "302 Sumner St"');
    process.exitCode = 1;
    return;
  }

  const candidates = await resolveAddress(raw);
  if (candidates.length === 0) {
    console.log(`No canonical Boston address matched "${raw}".`);
    return;
  }

  printCandidates(candidates);
  const chosen = candidates[0]!;
  const items = await publicTimeline(chosen.samAddressId);
  console.log(`\n${items.length} public record(s) for SAM ${chosen.samAddressId}:`);
  items.forEach(printItem);
}

try {
  await main();
} finally {
  await closePools();
}
```

- [ ] **Step 5: Add the CLI script to `package.json`**

```json
{
  "scripts": {
    "migrate": "bun run db/migrate.ts",
    "test": "bun test",
    "evidence": "bun run src/cli/evidence.ts"
  }
}
```

- [ ] **Step 6: Run the test and watch it pass**

Run: `bun test tests/evidence/query.test.ts`
Expected: 9 pass.

- [ ] **Step 7: Run the whole suite and check coverage**

```bash
bun test --coverage
```

Expected: all tests pass, coverage at or above 80%. If a file is below, add the missing cases before committing — coverage is a project rule, not a nice-to-have.

- [ ] **Step 8: Run the deliverable and capture it**

```bash
bun run evidence "302 Sumner St" | tee docs/evidence/timeline-302-sumner.txt
```

Expected: the SAM candidate at high confidence, then real Boston public records — each with a category, address scope, match confidence, opaque `evt_` ref, a live `data.boston.gov` source URL, and a caveat. Any permit must show the not-proof-of-repair caveat.

- [ ] **Step 9: Commit**

```bash
git add src/evidence/query.ts src/cli/evidence.ts package.json tests/evidence/query.test.ts docs/evidence/timeline-302-sumner.txt
git commit -m "feat: evidence timeline query and cli with provenance and caveats"
```

---

## Definition of done for plan 1

- [ ] `bun test --coverage` — all green, ≥80%
- [ ] `tests/db/logins.test.ts` proves `evidence_ro` cannot read any private table, and `app_rw` cannot mutate `audit_log`
- [ ] `bun run evidence "302 Sumner St"` prints real Boston records with source URLs, scope badges, confidence, and caveats
- [ ] SAM `132380` resolves to parcel `0104910000` and building `130883`
- [ ] Re-running any ingest changes no row counts
- [ ] No `tmp*.csv` filename appears anywhere in `src/`
- [ ] `docs/evidence/` holds the negative-test output and the timeline output
- [ ] A `docs/LEARNING-LOG.md` entry exists for anything that surprised you — especially live CSV headers differing from the readiness doc

---

## Self-review notes

**Spec coverage.** §5.1 → Task 2. §5.2 → Task 3. §5.3 → Task 4. §6.4 cascade steps 1–2 → Task 9; steps 3–4 (coordinate proximity, nearby/ambiguous) are deferred to plan 2 with 311, where they first have data to act on. §7 error rows for ingestion, CSV rotation, and ambiguous addresses → Tasks 5, 6, 9. §9.1 grant-boundary and append-only-audit tests → Task 4. §9.1 permit-caveat test → Tasks 10 and 12. Spec §4 receipt, §6.1–6.3 agent behaviour, §9.1 injection and citation tests → plan 3, which is where an agent first exists. Timeline load budget (<3s) → plan 2, once there is a UI to measure.

**Deliberate omission worth flagging:** the vector *index* is not created here, only the `VECTOR(1024)` column. Creating an index before any rows exist would be verifying syntax against an empty table, and the syntax needs a docs check anyway (Task 3, Step 3). Plan 3 creates it alongside the first embeddings.

**Type consistency checked.** `PUBLIC_EVENT_COLUMNS` and `ADDRESS_MATCH_COLUMNS` are defined once in Task 11 and imported by Task 12 — not redeclared. `RESOLVER_VERSION` is defined in Task 9 and consumed by Tasks 11 and 12. `SourceSystem` is defined in Task 10 and consumed by Task 13. `MatchMethod` values in Task 9 are a subset of the `match_method_known` CHECK constraint in Task 2. `appPool`/`evidencePool`/`closePools` signatures match every call site.
