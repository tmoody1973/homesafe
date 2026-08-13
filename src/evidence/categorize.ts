export type EventCategory =
  | "heat_hot_water" | "pest" | "structural_safety"
  | "permit" | "utilities" | "sanitation" | "other";

// A habitability signal outranks an administrative one, so the permit rule is last:
// "Electrical work without a permit" is reported to a resident as an electrical hazard.
const RULES: ReadonlyArray<readonly [EventCategory, RegExp]> = [
  ["heat_hot_water", /\b(heat|heating|hot\s*water|boiler|radiator|furnace)\b/i],
  ["pest", /\b(rodent|roach|cockroach|pest|infest\w*|bed\s*bug\w*|mice|mouse|rat)\b/i],
  ["structural_safety",
    /\b(unsafe|dangerous|structur\w*|exit|egress|collapse|railing|hand\s*rails?|stair|fire|smoke|sprinkler|alarm|escape|emergency|corridor|retaining|wall|walls|deteriorat\w*|safeguard\w*)\b/i],
  ["utilities", /\b(elec\w*|gas|plumb\w*|utility|utilities|sewer|water\s*leak|wiring|circuit\w*|meter|drainage|exhaust)\b/i],
  ["sanitation", /\b(trash|rubbish|sanitat\w*|garbage|debris|dumpster)\b/i],
  ["permit", /\b(permit\w*|prmt)\b/i],
];

export function categorize(text: string, sourceSystem: string): EventCategory {
  if (sourceSystem === "building_permit") return "permit";
  const match = RULES.find(([, pattern]) => pattern.test(text));
  return match ? match[0] : "other";
}
