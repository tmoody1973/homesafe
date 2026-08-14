import { Chip } from "@heroui/react";

// How precisely a record attaches to a home. This is shown on purpose: a
// parcel-level record presented as apartment-level is a lie by omission, and it
// is the specific lie this product exists to avoid.
const SCOPES = {
  unit: { label: "This unit", color: "success", explain: "Filed against this exact apartment." },
  address: { label: "This address", color: "success", explain: "Filed against this street address, not one apartment inside it." },
  building: { label: "This building", color: "warning", explain: "Filed against the building, which may hold several homes." },
  parcel: { label: "This property", color: "warning", explain: "Filed against the plot of land, which may hold several addresses." },
  nearby: { label: "Nearby", color: "danger", explain: "Matched by location only. It may not concern this home at all." },
  unknown: { label: "Address unclear", color: "danger", explain: "We could not tie this record to an address with confidence." },
} as const;

export type Scope = keyof typeof SCOPES;

function isScope(value: string): value is Scope {
  return value in SCOPES;
}

export function scopeExplanation(scope: string): string {
  return isScope(scope) ? SCOPES[scope].explain : SCOPES.unknown.explain;
}

export function ScopeBadge({ scope }: { readonly scope: string }) {
  const { label, color } = isScope(scope) ? SCOPES[scope] : SCOPES.unknown;
  return (
    <Chip color={color} size="sm" variant="soft">
      <Chip.Label>{label}</Chip.Label>
    </Chip>
  );
}

const CONFIDENCE_LABELS = {
  high: "Confident match",
  medium: "Likely match",
  low: "Weak match",
  ambiguous: "Uncertain match",
} as const;

export function ConfidenceBadge({ confidence }: { readonly confidence: string | null }) {
  if (confidence === null) return null;
  const label =
    confidence in CONFIDENCE_LABELS
      ? CONFIDENCE_LABELS[confidence as keyof typeof CONFIDENCE_LABELS]
      : confidence;
  const color = confidence === "high" ? "success" : confidence === "ambiguous" ? "danger" : "warning";
  return (
    <Chip color={color} size="sm" variant="soft">
      <Chip.Label>{label}</Chip.Label>
    </Chip>
  );
}
