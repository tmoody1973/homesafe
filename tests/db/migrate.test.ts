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
