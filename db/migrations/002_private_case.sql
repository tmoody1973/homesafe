CREATE TABLE IF NOT EXISTS user_account (
  user_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name  STRING NOT NULL,
  role          STRING NOT NULL CHECK (role IN ('resident','reviewer','admin')),
  language_pref STRING DEFAULT 'en',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS housing_case (
  case_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES user_account,
  address_entity_id UUID REFERENCES address_entity,
  raw_address_input STRING NOT NULL,
  issue_category    STRING NOT NULL,
  status            STRING NOT NULL DEFAULT 'open',
  is_demo           BOOL NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_reviewed_at  TIMESTAMPTZ,
  INDEX (user_id)
);

CREATE TABLE IF NOT EXISTS resident_observation (
  observation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id        UUID NOT NULL REFERENCES housing_case ON DELETE CASCADE,
  body           STRING NOT NULL,
  category       STRING,
  privacy        STRING NOT NULL DEFAULT 'private_to_resident',
  recorded_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at     TIMESTAMPTZ,
  INDEX (case_id, recorded_at DESC)
);

-- VECTOR(1024) matches amazon.titan-embed-text-v2:0, measured not guessed.
CREATE TABLE IF NOT EXISTS memory_item (
  memory_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id               UUID REFERENCES housing_case ON DELETE CASCADE,
  memory_type           STRING NOT NULL CHECK (memory_type IN (
                          'resident_observation','agent_summary',
                          'policy_guidance','issue_definition')),
  source_observation_id UUID REFERENCES resident_observation,
  body                  STRING NOT NULL,
  embedding             VECTOR(1024) NOT NULL,
  consent_scope         STRING NOT NULL DEFAULT 'private_to_resident',
  retention_policy      STRING NOT NULL DEFAULT 'case_lifetime',
  revoked_at            TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  INDEX (case_id)
);

CREATE TABLE IF NOT EXISTS consent_grant (
  consent_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id           UUID NOT NULL REFERENCES housing_case ON DELETE CASCADE,
  scope             STRING NOT NULL,
  item_refs         STRING[] NOT NULL,
  recipient_role    STRING NOT NULL,
  recipient_user_id UUID REFERENCES user_account,
  granted_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at        TIMESTAMPTZ,
  revoked_at        TIMESTAMPTZ,
  INDEX (case_id)
);

CREATE TABLE IF NOT EXISTS evidence_packet (
  packet_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id           UUID NOT NULL REFERENCES housing_case,
  version           INT NOT NULL,
  status            STRING NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','shared','revoked')),
  resident_summary  STRING,
  staff_summary     STRING,
  content_hash      STRING,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at       TIMESTAMPTZ,
  approved_by       UUID REFERENCES user_account,
  recipient_user_id UUID REFERENCES user_account,
  UNIQUE (case_id, version)
);

CREATE TABLE IF NOT EXISTS evidence_packet_item (
  packet_id         UUID NOT NULL REFERENCES evidence_packet ON DELETE CASCADE,
  item_ref          STRING NOT NULL,
  item_type         STRING NOT NULL,
  item_hash         STRING NOT NULL,
  resident_approved BOOL NOT NULL DEFAULT false,
  PRIMARY KEY (packet_id, item_ref)
);

CREATE TABLE IF NOT EXISTS task (
  task_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id           UUID NOT NULL REFERENCES housing_case ON DELETE CASCADE,
  owner_role        STRING NOT NULL,
  title             STRING NOT NULL,
  status            STRING NOT NULL DEFAULT 'draft',
  due_date          DATE,
  requires_approval BOOL NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The retrieval receipt, persisted. One write serves the why-panel,
-- the audit trail, and the citation validator.
CREATE TABLE IF NOT EXISTS agent_run (
  run_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id          UUID REFERENCES housing_case,
  actor_user_id    UUID REFERENCES user_account,
  actor_role       STRING NOT NULL,
  question         STRING,
  model_id         STRING NOT NULL,
  receipt          JSONB NOT NULL,
  model_output     STRING,
  validator_result JSONB,
  latency_ms       INT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  INDEX (case_id, created_at DESC)
);

CREATE TABLE IF NOT EXISTS audit_log (
  audit_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID,
  actor_role    STRING,
  action        STRING NOT NULL,
  object_type   STRING NOT NULL,
  object_id     STRING NOT NULL,
  detail        JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  INDEX (object_type, object_id),
  INDEX (created_at DESC)
);
