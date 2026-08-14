import { afterEach, expect, test } from "bun:test";
import { ingestPool } from "../../src/ingest/pool";

const original = process.env.DATABASE_URL_ADMIN;

afterEach(() => {
  if (original === undefined) delete process.env.DATABASE_URL_ADMIN;
  else process.env.DATABASE_URL_ADMIN = original;
});

// Failing loudly here matters: without the admin URL an ingest would otherwise
// fall back to an application login that has SELECT only, and the failure would
// surface as a permission error deep inside the first batch instead of at start.
test("refuses to build a pool without the admin connection string", () => {
  delete process.env.DATABASE_URL_ADMIN;
  expect(() => ingestPool()).toThrow(/DATABASE_URL_ADMIN/);
});

test("verifies the server certificate rather than trusting the URL", async () => {
  process.env.DATABASE_URL_ADMIN = "postgresql://user:pw@localhost:26257/homesafe";
  const pool = ingestPool();
  try {
    // node-postgres reads `sslrootcert=system` in a URL as a filename and dies,
    // so the connection strings omit it and verification is stated in code.
    expect(pool.options.ssl).toEqual({ rejectUnauthorized: true });
  } finally {
    await pool.end();
  }
});
