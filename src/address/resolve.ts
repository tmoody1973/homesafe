// FR-01: the application never silently picks an address for the resident. Every
// lookup returns a LIST with an explicit confidence on each candidate; choosing
// is the resident's job. One confident match and three plausible ones are
// different situations, and reporting them identically is how a tool attaches
// someone's housing complaint to a building they don't live in.
//
// Hence the rule that carries the weight: more than one candidate is
// `ambiguous`, never `high`.

import type { Pool } from "pg";
import { evidencePool } from "../db/pool";
import { normalizeAddress } from "./normalize";

export const RESOLVER_VERSION = "1.0.0";
const CANDIDATE_LIMIT = 10;

export type MatchMethod =
  | "sam_exact_address_zip"
  | "structured_components"
  | "unmatched";

export type MatchConfidence = "high" | "medium" | "low" | "ambiguous";

export type AddressCandidate = {
  readonly samAddressId: number;
  readonly fullAddress: string;
  readonly parcelId: string | null;
  readonly buildingId: number | null;
  readonly matchMethod: MatchMethod;
  readonly matchConfidence: MatchConfidence;
};

// INT8 columns arrive as strings: node-postgres will not narrow a 64-bit
// integer to a JS number on its own, because most int8 values cannot survive
// the trip. SAM and building ids are six digits, so converting here is safe and
// keeps a numeric id numeric for every caller.
type Row = {
  sam_address_id: string;
  full_address: string;
  parcel_id: string | null;
  building_id: string | null;
};

export function confidenceFor(
  method: MatchMethod,
  candidateCount: number,
): MatchConfidence {
  if (method === "unmatched" || candidateCount === 0) return "ambiguous";
  if (candidateCount > 1) return "ambiguous";
  return method === "sam_exact_address_zip" ? "high" : "medium";
}

function toCandidates(rows: Row[], method: MatchMethod): AddressCandidate[] {
  const confidence = confidenceFor(method, rows.length);
  return rows.map((row) => ({
    samAddressId: Number(row.sam_address_id),
    fullAddress: row.full_address,
    parcelId: row.parcel_id,
    buildingId: row.building_id === null ? null : Number(row.building_id),
    matchMethod: method,
    matchConfidence: confidence,
  }));
}

const SELECT_FIELDS =
  "sam_address_id, full_address, parcel_id, building_id";

async function byExactAddress(
  pool: Pool,
  normalized: string,
  zip: string | undefined,
): Promise<Row[]> {
  const { rows } = await pool.query<Row>(
    `SELECT ${SELECT_FIELDS} FROM address_entity
     WHERE upper(full_address) = $1 AND ($2::STRING IS NULL OR zip = $2)
     LIMIT ${CANDIDATE_LIMIT}`,
    [normalized, zip ?? null],
  );
  return rows;
}

async function byComponents(
  pool: Pool,
  streetNumber: string,
  streetName: string,
  zip: string | undefined,
): Promise<Row[]> {
  const { rows } = await pool.query<Row>(
    `SELECT ${SELECT_FIELDS} FROM address_entity
     WHERE street_number = $1
       AND upper(street_name) LIKE $2
       AND ($3::STRING IS NULL OR zip = $3)
     LIMIT ${CANDIDATE_LIMIT}`,
    [streetNumber, `${streetName}%`, zip ?? null],
  );
  return rows;
}

export async function resolveAddress(
  raw: string,
  zip?: string,
  pool: Pool = evidencePool(),
): Promise<AddressCandidate[]> {
  const parsed = normalizeAddress(raw, zip);

  const exact = await byExactAddress(pool, parsed.normalized, parsed.zip);
  if (exact.length > 0) return toCandidates(exact, "sam_exact_address_zip");

  if (!parsed.streetNumber || !parsed.streetName) return [];

  const structured = await byComponents(
    pool,
    parsed.streetNumber,
    parsed.streetName,
    parsed.zip,
  );
  return toCandidates(structured, "structured_components");
}
