import { NextResponse } from "next/server";
import { evidencePool } from "../../../../src/db/pool";

export const dynamic = "force-dynamic";

const MAX_SUGGESTIONS = 8;
const MIN_QUERY_LENGTH = 3;

type SuggestionRow = {
  sam_address_id: string;
  full_address: string;
  neighborhood: string | null;
};

// Prefix search served by the expression index from migration 004 —
// upper(full_address) LIKE 'PREFIX%' is exactly the shape it covers.
// Public data, read as evidence_ro; there is nothing here to protect.
export async function GET(request: Request): Promise<NextResponse> {
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < MIN_QUERY_LENGTH) return NextResponse.json({ suggestions: [] });

  const escaped = query.toUpperCase().replaceAll(/[%_\\]/g, "\\$&");
  const { rows } = await evidencePool().query<SuggestionRow>(
    `SELECT sam_address_id, full_address, neighborhood
     FROM address_entity
     WHERE upper(full_address) LIKE $1
     ORDER BY full_address
     LIMIT $2`,
    [`${escaped}%`, MAX_SUGGESTIONS],
  );
  return NextResponse.json({
    suggestions: rows.map((row) => ({
      samAddressId: Number(row.sam_address_id),
      fullAddress: row.full_address,
      neighborhood: row.neighborhood,
    })),
  });
}
