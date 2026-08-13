-- Two logins, one cluster, no overlap.
--
-- `evidence_ro` may SELECT three public-evidence tables and nothing else.
-- `app_rw` handles case, consent, and memory data.
--
-- Private resident notes are not *restricted* from `evidence_ro`; they are
-- *invisible* to it. That distinction is the whole product promise — see
-- docs/decisions/003-mcp-build-time-only.md for why `managed-mcp` could not
-- be scoped this way and these logins can.
--
-- Passwords are NOT set here. They are applied out of band so no credential
-- ever enters git. See MOO-604.
--
-- Written with the `hardening-user-privileges` CockroachDB Agent Skill, whose
-- audit step found three things this file would otherwise have got wrong.
-- They are marked (SKILL) below.

CREATE USER IF NOT EXISTS app_rw;
CREATE USER IF NOT EXISTS evidence_ro;

-- (SKILL) The trap. `SHOW GRANTS ON SCHEMA public` showed PUBLIC holding
-- CREATE — meaning ANY login, including evidence_ro, could create its own
-- tables in our schema. Restricting a login while leaving this in place
-- accomplishes very little. USAGE stays; CREATE goes.
REVOKE CREATE ON SCHEMA public FROM public;

-- TEMPORARY lets any login create temp tables. Neither of ours needs it.
REVOKE TEMPORARY ON DATABASE homesafe FROM public;

-- (SKILL) Grant connection and schema access EXPLICITLY rather than relying on
-- PUBLIC's defaults. Depending on a grant we are simultaneously tightening is
-- how a login mysteriously stops working later.
GRANT CONNECT ON DATABASE homesafe TO app_rw, evidence_ro;
GRANT USAGE ON SCHEMA public TO app_rw, evidence_ro;

-- ---------------------------------------------------------------------------
-- evidence_ro — read three tables. No write, anywhere, ever.
-- ---------------------------------------------------------------------------
GRANT SELECT ON TABLE address_entity, address_match, public_event TO evidence_ro;

-- ---------------------------------------------------------------------------
-- app_rw — the nine private tables, read/write.
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  user_account,
  housing_case,
  resident_observation,
  memory_item,
  consent_grant,
  evidence_packet,
  evidence_packet_item,
  task,
  agent_run
TO app_rw;

-- (SKILL) Public evidence is READ-ONLY to the application too. An earlier draft
-- used `GRANT ... ON ALL TABLES IN SCHEMA public`, which would have handed
-- app_rw INSERT and UPDATE on `public_event` — letting application code alter
-- the public record it cites as evidence. Explicit table lists prevent that.
GRANT SELECT ON TABLE address_entity, address_match, public_event TO app_rw;

-- ---------------------------------------------------------------------------
-- audit_log — append-only by a MISSING grant, not by code choosing not to
-- update. No UPDATE. No DELETE. Nobody rewrites history, including us.
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT ON TABLE audit_log TO app_rw;

-- (SKILL) Deliberately NO `ALTER DEFAULT PRIVILEGES`. The skill recommends it
-- so future tables inherit intended access, and for a general application role
-- that is right. Here it is wrong: a table added in plan 3 or 4 must not become
-- readable by `evidence_ro` merely because it was created. Every grant stays
-- explicit, and a new table starts unreachable until someone decides otherwise.
