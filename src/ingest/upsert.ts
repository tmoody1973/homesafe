import type { Pool } from "pg";

export const BATCH_SIZE = 500;

function placeholders(columnCount: number, rowCount: number): string {
  return Array.from({ length: rowCount }, (_, rowIndex) => {
    const slots = Array.from(
      { length: columnCount },
      (_, colIndex) => `$${rowIndex * columnCount + colIndex + 1}`,
    );
    return `(${slots.join(", ")})`;
  }).join(", ");
}

function updateClause(columns: string[], conflictColumns: string[]): string {
  const conflict = new Set(conflictColumns);
  return columns
    .filter((column) => !conflict.has(column))
    .map((column) => `${column} = excluded.${column}`)
    .join(", ");
}

export function buildUpsertSql(
  table: string,
  columns: string[],
  conflictColumns: string[],
  rowCount: number,
): string {
  if (rowCount < 1) throw new Error("upsert needs at least one row");
  return [
    `INSERT INTO ${table} (${columns.join(", ")})`,
    `VALUES ${placeholders(columns.length, rowCount)}`,
    `ON CONFLICT (${conflictColumns.join(", ")}) DO UPDATE SET ${updateClause(columns, conflictColumns)}`,
  ].join(" ");
}

// Boston's violations CSV carries `contact_addr1/2`, `contact_city`,
// `contact_state`, `contact_zip` — the owner's mailing address. Permits carry
// `applicant`. Verified against live headers 2026-08-13.
//
// The spec forbids showing owner data in the resident-facing path, and it named
// only RentSmart and Property Assessment. It missed these two. Storing the whole
// source row as `raw_payload` would write owner contact addresses into a table
// `evidence_ro` can read — one careless SELECT from turning a housing-safety
// tool into a landlord-targeting one.
//
// So personal fields are dropped at ingest and never enter the database.
const PERSONAL_FIELD_PATTERN = /^(contact_|applicant$|owner$)/i;

export function stripPersonalFields(
  row: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(row).filter(([key]) => !PERSONAL_FIELD_PATTERN.test(key)),
  );
}

export async function upsertBatch(
  pool: Pool,
  table: string,
  columns: string[],
  conflictColumns: string[],
  rows: unknown[][],
): Promise<number> {
  if (rows.length === 0) return 0;
  const sql = buildUpsertSql(table, columns, conflictColumns, rows.length);
  const result = await pool.query(sql, rows.flat());
  return result.rowCount ?? 0;
}
