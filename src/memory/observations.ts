// Writing a resident note is two writes that must agree: the note itself, and
// the searchable memory built from it. They go in one transaction, because a
// note that saved but never became searchable is a note the resident will
// reasonably believe the agent has.
//
// Spec §7 pulls the other way: if Bedrock is down, the note must still save.
// So the embedding is attempted BEFORE the transaction. Success writes both
// rows together; failure writes the note alone and leaves it for the out-of-
// band retry below. A model outage must never cost a resident their words.

import type { PoolClient } from "pg";
import { appPool, withTransaction } from "../db/pool";
import { embed } from "./embed";

export type NewObservation = {
  readonly caseId: string;
  readonly body: string;
  readonly category: string | null;
};

export type ObservationWritten = {
  readonly observationId: string;
  readonly memoryId: string | null;
};

export type EmbedFn = (text: string) => Promise<number[]>;

// CockroachDB accepts a VECTOR as its bracketed text form; the cast keeps the
// driver from guessing a type for an array of 1024 floats.
function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(",")}]`;
}

async function tryEmbed(text: string, embedText: EmbedFn): Promise<number[] | null> {
  try {
    return await embedText(text);
  } catch {
    return null;
  }
}

async function insertObservation(
  client: PoolClient,
  input: NewObservation,
): Promise<string> {
  // privacy is left to the column default, `private_to_resident`. A consent
  // model whose default is permissive is not a consent model.
  const { rows } = await client.query<{ observation_id: string }>(
    `INSERT INTO resident_observation (case_id, body, category)
     VALUES ($1, $2, $3) RETURNING observation_id`,
    [input.caseId, input.body, input.category],
  );
  return rows[0]!.observation_id;
}

async function insertMemory(
  client: PoolClient,
  input: NewObservation,
  observationId: string,
  vector: number[],
): Promise<string> {
  const { rows } = await client.query<{ memory_id: string }>(
    `INSERT INTO memory_item
       (case_id, memory_type, source_observation_id, body, embedding)
     VALUES ($1, 'resident_observation', $2, $3, $4::VECTOR)
     RETURNING memory_id`,
    [input.caseId, observationId, input.body, toVectorLiteral(vector)],
  );
  return rows[0]!.memory_id;
}

export async function addObservation(
  input: NewObservation,
  embedText: EmbedFn = embed,
): Promise<ObservationWritten> {
  if (input.body.trim() === "") {
    throw new Error("An observation needs a body");
  }
  const vector = await tryEmbed(input.body, embedText);
  return withTransaction(appPool(), async (client) => {
    const observationId = await insertObservation(client, input);
    const memoryId = vector
      ? await insertMemory(client, input, observationId, vector)
      : null;
    return { observationId, memoryId };
  });
}

type PendingRow = { observation_id: string; case_id: string; body: string };

async function selectPending(limit: number): Promise<PendingRow[]> {
  const { rows } = await appPool().query<PendingRow>(
    `SELECT o.observation_id, o.case_id, o.body
     FROM resident_observation o
     LEFT JOIN memory_item m ON m.source_observation_id = o.observation_id
     WHERE m.memory_id IS NULL AND o.deleted_at IS NULL
     LIMIT $1`,
    [limit],
  );
  return rows;
}

// The out-of-band half of the promise above: notes saved during an outage
// become searchable once the model answers again. Returns how many caught up.
export async function embedPendingObservations(
  limit = 100,
  embedText: EmbedFn = embed,
): Promise<number> {
  const pending = await selectPending(limit);
  let embedded = 0;
  for (const row of pending) {
    const vector = await tryEmbed(row.body, embedText);
    if (!vector) continue;
    const input = { caseId: row.case_id, body: row.body, category: null };
    await withTransaction(appPool(), (client) =>
      insertMemory(client, input, row.observation_id, vector),
    );
    embedded += 1;
  }
  return embedded;
}

const REVOCATION_GRACE = "30 days";

// Revoking hides the memory from every query instantly (revoked_at) and
// schedules its physical deletion by the database's own TTL job (expires_at,
// migration 008). Ownership is checked in the same statement: a memory id
// belonging to someone else updates zero rows and reports failure.
export async function revokeMemory(
  memoryId: string,
  userId: string,
): Promise<boolean> {
  const { rowCount } = await appPool().query(
    `UPDATE memory_item
     SET revoked_at = now(), expires_at = now() + $3::INTERVAL
     WHERE memory_id = $1
       AND revoked_at IS NULL
       AND case_id IN (SELECT case_id FROM housing_case WHERE user_id = $2)`,
    [memoryId, userId, REVOCATION_GRACE],
  );
  return (rowCount ?? 0) > 0;
}
