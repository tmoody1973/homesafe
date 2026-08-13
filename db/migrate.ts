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
