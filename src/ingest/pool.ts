// Ingestion connects as the admin identity that runs migrations, NOT as an
// application login. Migration 003 grants `app_rw` SELECT only on
// address_entity, address_match and public_event, on purpose: application code
// can never alter the public record it later cites as evidence. That grant makes
// ingesting through appPool() fail at runtime, so the credential lives here —
// in the offline pipeline — and never reaches an application code path.

import { Pool } from "pg";

const INGEST_MAX_CLIENTS = 5;

export function ingestPool(): Pool {
  const connectionString = process.env.DATABASE_URL_ADMIN;
  if (!connectionString) {
    throw new Error("DATABASE_URL_ADMIN is required to ingest public evidence");
  }
  // Stated here, not in the URL: node-postgres reads `sslrootcert=system` as a
  // filename and fails with ENOENT, so .env omits it. Same reasoning as pool.ts.
  return new Pool({
    connectionString,
    max: INGEST_MAX_CLIENTS,
    ssl: { rejectUnauthorized: true },
  });
}
