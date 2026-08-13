import { afterAll, expect, test } from "bun:test";
import { appPool, closePools, evidencePool } from "../../src/db/pool";

// The tables that hold a resident's private case. If evidence_ro can read any
// one of these, HomeSafe's promise — "your notes stay private until you choose
// to share them" — is false, and the build stops here.
const PRIVATE_TABLES = [
  "resident_observation",
  "memory_item",
  "consent_grant",
  "evidence_packet",
  "housing_case",
];

const PUBLIC_TABLES = ["address_entity", "address_match", "public_event"];

// CockroachDB phrases a privilege refusal as
//   "user evidence_ro does not have SELECT privilege on relation memory_item"
// not Postgres's "permission denied for table ...". Both are matched so the
// suite does not silently pass if the wording changes to the Postgres form.
// Getting this wrong the first time made nine real denials look like nine
// failures — the boundary held, the assertion did not.
const DENIED =
  /does not have \w+ privilege on relation|permission denied|does not exist|no privileges/i;

afterAll(async () => {
  await closePools();
});

test.each(PUBLIC_TABLES)(
  "evidence_ro CAN read %s",
  async (table) => {
    const result = await evidencePool().query(`SELECT * FROM ${table} LIMIT 1`);
    expect(result.rowCount).not.toBeNull();
  },
);

test.each(PRIVATE_TABLES)(
  "evidence_ro CANNOT read %s — the boundary the product rests on",
  async (table) => {
    await expect(
      evidencePool().query(`SELECT * FROM ${table} LIMIT 1`),
    ).rejects.toThrow(DENIED);
  },
);

test("evidence_ro cannot write to a table it is allowed to read", async () => {
  await expect(
    evidencePool().query(
      `INSERT INTO public_event
         (source_system, source_record_id, address_scope, event_category,
          retrieved_at, source_url, caveat)
       VALUES ('building_violation','deny-test','address','other',
               now(),'http://example.invalid','c')`,
    ),
  ).rejects.toThrow(DENIED);
});

test("app_rw cannot UPDATE audit_log — append-only by a missing grant", async () => {
  await expect(
    appPool().query("UPDATE audit_log SET action = 'tampered'"),
  ).rejects.toThrow(DENIED);
});

test("app_rw cannot DELETE from audit_log", async () => {
  await expect(
    appPool().query("DELETE FROM audit_log"),
  ).rejects.toThrow(DENIED);
});

test("app_rw cannot write to public_event — evidence is read-only to the app", async () => {
  await expect(
    appPool().query("UPDATE public_event SET caveat = 'rewritten'"),
  ).rejects.toThrow(DENIED);
});

test("neither login is a superuser or a member of admin", async () => {
  const { rows } = await appPool().query<{ member: string }>(
    "SELECT member FROM [SHOW GRANTS ON ROLE admin]",
  );
  const admins = rows.map((r) => r.member);
  expect(admins).not.toContain("app_rw");
  expect(admins).not.toContain("evidence_ro");
});

test("PUBLIC no longer holds CREATE on the schema", async () => {
  const { rows } = await appPool().query<{ grantee: string; privilege_type: string }>(
    "SHOW GRANTS ON SCHEMA public",
  );
  const publicCreate = rows.filter(
    (r) => r.grantee === "public" && r.privilege_type === "CREATE",
  );
  expect(publicCreate).toEqual([]);
});
