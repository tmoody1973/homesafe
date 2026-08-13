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
