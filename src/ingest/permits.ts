// A permit records that work was AUTHORIZED. It does not record that the work
// happened, that it worked, or that it fixed the resident's problem — a permit
// filed after a heat complaint looks like a repair and is not. That is why the
// category comes from the source system and the caveat is mandatory.

import { BOSTON_PACKAGES } from "../catalog/ckan";
import { RESOLVER_VERSION } from "../address/resolve";
import { caveatFor } from "../evidence/caveats";
import { ingestEvents, openBostonCsv, type SourceEvent } from "./events";
import { linkEventsToAddresses } from "./link";
import { ingestPool } from "./pool";
import { parseSourceTimestamp } from "./timestamp";
import { stripPersonalFields } from "./upsert";

const SOURCE_SYSTEM = "building_permit";
const SOURCE_URL = "https://data.boston.gov/dataset/approved-building-permits";

type Linkage = {
  readonly samAddressId: number | null;
  readonly parcelId: string | null;
  readonly scope: "address" | "parcel" | "unknown";
  readonly method: "sam_id_direct" | "parcel_direct" | "unmatched";
  readonly confidence: "high" | "medium" | "ambiguous";
};

function trimmed(row: Record<string, string>, key: string): string | null {
  const value = row[key]?.trim();
  return value ? value : null;
}

// `property_id` is a SAM address id. Zero is Boston's absent-address sentinel
// across its files, so a non-positive value counts as absent here too.
function samAddressId(row: Record<string, string>): number | null {
  const value = trimmed(row, "property_id");
  if (value === null) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

// A parcel is a piece of land and may hold several addresses, so a parcel match
// is deliberately weaker than an address match and says so in both the scope
// shown to the resident and the confidence stored on the linkage.
function linkageFor(row: Record<string, string>): Linkage {
  const samId = samAddressId(row);
  const parcelId = trimmed(row, "parcel_id");
  if (samId !== null) {
    return { samAddressId: samId, parcelId, scope: "address", method: "sam_id_direct", confidence: "high" };
  }
  if (parcelId !== null) {
    return { samAddressId: null, parcelId, scope: "parcel", method: "parcel_direct", confidence: "medium" };
  }
  return { samAddressId: null, parcelId: null, scope: "unknown", method: "unmatched", confidence: "ambiguous" };
}

export function toPermitEvent(
  row: Record<string, string>,
  retrievedAt: Date,
): SourceEvent | null {
  const permitNumber = trimmed(row, "permitnumber");
  if (permitNumber === null) return null;

  const link = linkageFor(row);

  const event = [
    SOURCE_SYSTEM,
    permitNumber,
    link.scope,
    // Never inferred from the description: "Failure to secure permit" is a
    // violation meaning the opposite of an issued permit. See categorize().
    "permit",
    trimmed(row, "status"),
    trimmed(row, "permittypedescr"),
    trimmed(row, "description"),
    parseSourceTimestamp(trimmed(row, "issued_date")),
    "day",
    retrievedAt,
    SOURCE_URL,
    JSON.stringify(stripPersonalFields(row)),
    caveatFor(SOURCE_SYSTEM),
  ];

  const match = [
    SOURCE_SYSTEM,
    permitNumber,
    [trimmed(row, "address"), trimmed(row, "zip")]
      .filter((part): part is string => part !== null)
      .join(" "),
    link.samAddressId,
    link.parcelId,
    link.method,
    link.confidence,
    RESOLVER_VERSION,
  ];

  return { event, match };
}

if (import.meta.main) {
  const pool = ingestPool();
  try {
    const csv = await openBostonCsv(BOSTON_PACKAGES.permits);
    const count = await ingestEvents(pool, csv, new Date(), toPermitEvent);
    const linked = await linkEventsToAddresses(pool, SOURCE_SYSTEM);
    console.log(`upserted ${count} permit events, linked ${linked}`);
  } finally {
    await pool.end();
  }
}
