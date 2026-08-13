export type EventCategory =
  | "heat_hot_water" | "pest" | "structural_safety"
  | "permit" | "utilities" | "sanitation" | "other";

// `permit` is assigned ONLY by source system, never by keyword. Verified against
// the full live violations file 2026-08-13: a keyword rule put 4,408 rows here,
// and they mean the OPPOSITE of an issued permit —
//   "Failure to secure permit"        (422)
//   "Failed to comply w permit term"  (485)
//   "Working Without a Permit"        (14)
// An issued permit means work was authorised. These mean work happened WITHOUT
// authorisation, which is a safety concern, not reassurance. Rendering both under
// one badge would tell a resident their problem was being handled when the record
// says the reverse. So there is deliberately no permit pattern below.
//
// `wall` was also removed from structural_safety: it matched "Wall Space
// Receptacles", which is an electrical fixture, not a structural defect.
const RULES: ReadonlyArray<readonly [EventCategory, RegExp]> = [
  ["heat_hot_water", /\b(heat|heating|hot\s*water|boiler|radiator|furnace)\b/i],
  ["pest", /\b(rodent|roach|cockroach|pest|infest\w*|bed\s*bug\w*|mice|mouse|rat)\b/i],
  ["utilities",
    /\b(elec\w*|gas|plumb\w*|utility|utilities|sewer|water\s*leak|wiring|circuit\w*|receptacles?|outlets?|meter|drainage|exhaust|cords?|cables?)\b/i],
  ["structural_safety",
    /\b(unsafe|dangerous|structur\w*|exit|egress|collapse|railing|hand\s*rails?|stair|fire|smoke|sprinkler|alarm|escape|emergency|corridor|retaining|deteriorat\w*|safeguard\w*)\b/i],
  ["sanitation", /\b(trash|rubbish|sanitat\w*|garbage|debris|dumpster)\b/i],
];

export function categorize(text: string, sourceSystem: string): EventCategory {
  if (sourceSystem === "building_permit") return "permit";
  const match = RULES.find(([, pattern]) => pattern.test(text));
  return match ? match[0] : "other";
}
