// Case data lives behind `app_rw`. The ingest admin login never touches it,
// and `evidence_ro` has no grant on any table in this file — that absence is
// MOO-604 and it is the product, not a precaution.

import { appPool } from "../db/pool";

export type NewCase = {
  readonly userId: string;
  readonly rawAddress: string;
  readonly addressEntityId: string | null;
  readonly issueCategory: string;
};

export type Observation = {
  readonly observationId: string;
  readonly body: string;
  readonly category: string | null;
  readonly privacy: string;
  readonly recordedAt: Date;
};

type ObservationRow = {
  observation_id: string;
  body: string;
  category: string | null;
  privacy: string;
  recorded_at: Date;
};

export async function createResident(displayName: string): Promise<string> {
  const { rows } = await appPool().query<{ user_id: string }>(
    `INSERT INTO user_account (display_name, role) VALUES ($1, 'resident')
     RETURNING user_id`,
    [displayName],
  );
  return rows[0]!.user_id;
}

export async function createCase(input: NewCase): Promise<string> {
  const { rows } = await appPool().query<{ case_id: string }>(
    `INSERT INTO housing_case
       (user_id, raw_address_input, address_entity_id, issue_category)
     VALUES ($1, $2, $3, $4)
     RETURNING case_id`,
    [input.userId, input.rawAddress, input.addressEntityId, input.issueCategory],
  );
  return rows[0]!.case_id;
}

// Ownership is checked in SQL, never by comparing ids after the read. A row
// this caller may not see should never reach this process at all.
export async function listObservations(
  caseId: string,
  userId: string,
): Promise<Observation[]> {
  const { rows } = await appPool().query<ObservationRow>(
    `SELECT observation_id, body, category, privacy, recorded_at
     FROM resident_observation
     WHERE case_id = $1
       AND deleted_at IS NULL
       AND case_id IN (SELECT case_id FROM housing_case WHERE user_id = $2)
     ORDER BY recorded_at DESC`,
    [caseId, userId],
  );
  return rows.map((row) => ({
    observationId: row.observation_id,
    body: row.body,
    category: row.category,
    privacy: row.privacy,
    recordedAt: row.recorded_at,
  }));
}
