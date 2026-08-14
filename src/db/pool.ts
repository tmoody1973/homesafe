import { Pool, type PoolClient } from "pg";
import { requireEnv } from "../config/env";

const MAX_CLIENTS = 5;

let app: Pool | undefined;
let evidence: Pool | undefined;

function makePool(connectionString: string): Pool {
  // ssl is stated here rather than left to the URL's sslmode. Verified
  // 2026-08-13: node-postgres treats `sslrootcert=system` as a filename and
  // fails with ENOENT, so the connection strings omit it and certificate
  // verification is asserted explicitly. Do not add sslrootcert to the URL.
  return new Pool({
    connectionString,
    max: MAX_CLIENTS,
    ssl: { rejectUnauthorized: true },
  });
}

export function appPool(): Pool {
  app ??= makePool(requireEnv(process.env, "DATABASE_URL_APP"));
  return app;
}

export function evidencePool(): Pool {
  evidence ??= makePool(requireEnv(process.env, "DATABASE_URL_EVIDENCE"));
  return evidence;
}

// A note that saved but never became searchable is a note the resident will
// reasonably believe the agent has. Writes that must land together get one
// client and one transaction rather than two hopeful statements.
export async function withTransaction<T>(
  pool: Pool,
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function closePools(): Promise<void> {
  await Promise.all([app?.end(), evidence?.end()]);
  app = undefined;
  evidence = undefined;
}
