// FR-01: a resident's typed address is never silently rewritten. `raw` comes
// back byte-identical alongside the normalized form, so a wrong match is
// visible in the record rather than hidden behind a confident-looking guess.
//
// A non-address location ("Intersection of A St and B St") yields NO structured
// components on purpose. 311 data is full of intersections and landmarks, and
// inventing a street number for one would attach a public record to a
// residence that has nothing to do with it.

const SUFFIXES: Record<string, string> = {
  STREET: "ST", ST: "ST",
  AVENUE: "AVE", AVE: "AVE", AV: "AVE",
  ROAD: "RD", RD: "RD",
  PLACE: "PL", PL: "PL",
  BOULEVARD: "BLVD", BLVD: "BLVD",
  DRIVE: "DR", DR: "DR",
  COURT: "CT", CT: "CT",
  TERRACE: "TER", TER: "TER",
  LANE: "LN", LN: "LN",
  SQUARE: "SQ", SQ: "SQ",
  PARKWAY: "PKWY", PKWY: "PKWY",
  HIGHWAY: "HWY", HWY: "HWY",
  // Below this line: every entry was observed in the live SAM file rather than
  // guessed. WAY, PARK, PIER and MALL map to themselves because Boston has no
  // shorter form — they are listed so the suffix is recognised as a suffix and
  // does not get absorbed into the street name.
  CIRCLE: "CIR", CIR: "CIR",
  WHARF: "WHF", WHF: "WHF",
  PLAZA: "PLZ", PLZ: "PLZ",
  EXTENSION: "EXT", EXT: "EXT",
  WAY: "WAY",
  PARK: "PARK",
  PIER: "PIER",
  MALL: "MALL",
};

const DIRECTIONALS: Record<string, string> = {
  NORTH: "N", SOUTH: "S", EAST: "E", WEST: "W",
};

const UNIT_PATTERN = /\s+(?:APT|UNIT|STE|SUITE|FL|FLOOR|RM|ROOM|#)\s*([A-Z0-9-]+)\s*$/;

// The hyphen is deliberate: `181-183 State St` is ONE Boston address with one
// SAM id, not a range. Splitting it would look up a building that doesn't exist.
const STREET_NUMBER_PATTERN = /^(\d+(?:-\d+)?[A-Z]?)\s+(.*)$/;

export type NormalizedAddress = {
  readonly raw: string;
  readonly normalized: string;
  readonly streetNumber?: string;
  readonly streetName?: string;
  readonly suffix?: string;
  readonly unit?: string;
  readonly zip?: string;
};

function standardiseToken(token: string): string {
  return DIRECTIONALS[token] ?? SUFFIXES[token] ?? token;
}

function collapse(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function standardise(collapsed: string): string {
  return collapsed.split(" ").map(standardiseToken).join(" ");
}

function splitUnit(text: string): { street: string; unit?: string } {
  const match = text.match(UNIT_PATTERN);
  if (!match) return { street: text };
  return { street: text.replace(UNIT_PATTERN, "").trim(), unit: match[1] };
}

function splitComponents(street: string): Pick<
  NormalizedAddress,
  "streetNumber" | "streetName" | "suffix"
> {
  const match = street.match(STREET_NUMBER_PATTERN);
  if (!match) return {};
  const parts = match[2]!.split(" ");
  const last = parts[parts.length - 1];
  const hasSuffix = parts.length > 1 && last !== undefined && Object.values(SUFFIXES).includes(last);
  return {
    streetNumber: match[1],
    streetName: (hasSuffix ? parts.slice(0, -1) : parts).join(" "),
    suffix: hasSuffix ? last : undefined,
  };
}

export function normalizeAddress(raw: string, zip?: string): NormalizedAddress {
  const { street, unit } = splitUnit(standardise(collapse(raw)));
  return {
    raw,
    normalized: street,
    unit,
    zip: zip?.trim() || undefined,
    ...splitComponents(street),
  };
}
