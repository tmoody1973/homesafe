export type SourceSystem =
  | "boston_311_legacy" | "boston_311_new" | "building_violation"
  | "rentsmart" | "building_permit" | "property_assessment";

const DERIVED_MATCH =
  "This record was linked to the address by a derived address match rather than " +
  "a shared identifier, so the linkage carries a stated confidence level.";

const CAVEATS: Record<SourceSystem, string> = {
  building_permit:
    "This public permit records authorized or issued work. It does not establish " +
    "that a specific resident concern has been repaired or resolved.",
  building_violation:
    "This is a historical public enforcement record. It does not establish a " +
    "current condition at the property.",
  rentsmart:
    "RentSmart is an aggregated housing-signal dataset. It is not a separate " +
    "verified inspection outcome and must not be read as a property score.",
  boston_311_new: `This is a public service request. ${DERIVED_MATCH}`,
  boston_311_legacy: `This is a public service request from the legacy 311 system. ${DERIVED_MATCH}`,
  property_assessment:
    "This is annually published property reference data, not a record of any " +
    "housing condition or complaint.",
};

export function caveatFor(sourceSystem: SourceSystem): string {
  const caveat = CAVEATS[sourceSystem];
  if (!caveat) throw new Error(`unknown source system: ${sourceSystem}`);
  return caveat;
}
