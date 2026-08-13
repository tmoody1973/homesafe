-- The only three tables `evidence_ro` will be granted SELECT on.
CREATE TABLE IF NOT EXISTS address_entity (
  address_entity_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sam_address_id    INT8 NOT NULL UNIQUE,
  full_address      STRING NOT NULL,
  street_number     STRING,
  street_name       STRING,
  unit              STRING,
  zip               STRING,
  neighborhood      STRING,
  parcel_id         STRING,
  building_id       INT8,
  lat               FLOAT8,
  lon               FLOAT8,
  sam_snapshot_at   TIMESTAMPTZ NOT NULL,
  INDEX (parcel_id),
  INDEX (zip, street_name, street_number)
);

-- A fallible linkage decision, stored apart from the record it links.
CREATE TABLE IF NOT EXISTS address_match (
  match_id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_system            STRING NOT NULL,
  source_record_id         STRING NOT NULL,
  raw_address              STRING NOT NULL,
  candidate_sam_address_id INT8,
  match_method             STRING NOT NULL,
  match_confidence         STRING NOT NULL,
  coord_distance_m         FLOAT8,
  resolver_version         STRING NOT NULL,
  review_status            STRING NOT NULL DEFAULT 'automated',
  reviewed_by              STRING,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_system, source_record_id),
  CONSTRAINT match_method_known CHECK (match_method IN (
    'sam_id_direct', 'parcel_direct', 'sam_exact_address_zip',
    'structured_components', 'coordinate_proximity', 'unmatched'
  )),
  CONSTRAINT match_confidence_known CHECK (match_confidence IN (
    'high', 'medium', 'low', 'ambiguous'
  ))
);

CREATE TABLE IF NOT EXISTS public_event (
  event_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_system      STRING NOT NULL,
  source_record_id   STRING NOT NULL,
  address_entity_id  UUID REFERENCES address_entity,
  address_match_id   UUID REFERENCES address_match,
  address_scope      STRING NOT NULL,
  event_category     STRING NOT NULL,
  source_status      STRING,
  title              STRING,
  description        STRING,
  occurred_at        TIMESTAMPTZ,
  occurred_precision STRING,
  closed_at          TIMESTAMPTZ,
  retrieved_at       TIMESTAMPTZ NOT NULL,
  source_url         STRING NOT NULL,
  raw_payload        JSONB,
  -- NOT NULL on purpose: a public record cannot exist here without an
  -- explicit statement of what it does not prove.
  caveat             STRING NOT NULL,
  UNIQUE (source_system, source_record_id),
  INDEX (address_entity_id, occurred_at DESC),
  INDEX (event_category),
  CONSTRAINT source_system_known CHECK (source_system IN (
    'boston_311_legacy', 'boston_311_new', 'building_violation',
    'rentsmart', 'building_permit', 'property_assessment'
  )),
  CONSTRAINT address_scope_known CHECK (address_scope IN (
    'unit', 'address', 'building', 'parcel', 'nearby', 'unknown'
  )),
  CONSTRAINT event_category_known CHECK (event_category IN (
    'heat_hot_water', 'pest', 'structural_safety', 'permit',
    'utilities', 'sanitation', 'other'
  ))
);
