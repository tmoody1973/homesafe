import { expect, test } from "bun:test";
import { loadEnv, requireEnv } from "../../src/config/env";

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

// The read-only web tier must be able to start holding ONLY the evidence
// credential. Requiring all three would have forced the public runtime to carry
// app_rw, the login that can write residents' private notes.
test("each connection requires only its own variable", () => {
  const evidenceOnly = { DATABASE_URL_EVIDENCE: "postgresql://evidence_ro@host/db" };
  expect(requireEnv(evidenceOnly, "DATABASE_URL_EVIDENCE")).toBe(
    "postgresql://evidence_ro@host/db",
  );
  expect(() => requireEnv(evidenceOnly, "DATABASE_URL_APP")).toThrow(
    /DATABASE_URL_APP/,
  );
});

test("a blank value is missing, not present", () => {
  expect(() => requireEnv({ DATABASE_URL_APP: "   " }, "DATABASE_URL_APP")).toThrow(
    /DATABASE_URL_APP/,
  );
});
