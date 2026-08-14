import { Pool } from "pg";
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

export async function closePools(): Promise<void> {
  await Promise.all([app?.end(), evidence?.end()]);
  app = undefined;
  evidence = undefined;
}
