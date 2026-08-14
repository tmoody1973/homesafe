import { Card, Chip } from "@heroui/react";
import type { EvidenceItem } from "../../lib/evidence";
import { ConfidenceBadge, ScopeBadge, scopeExplanation } from "./ScopeBadge";
import { MatchDrawer } from "./MatchDrawer";

const SOURCE_LABELS: Record<string, string> = {
  building_violation: "City enforcement record",
  building_permit: "Building permit",
  rentsmart: "RentSmart housing signal",
  boston_311_new: "311 service request",
  boston_311_legacy: "311 service request (older system)",
  property_assessment: "Property reference data",
};

const CATEGORY_LABELS: Record<string, string> = {
  heat_hot_water: "Heat / hot water",
  pest: "Pests",
  structural_safety: "Structure & safety",
  permit: "Permitted work",
  utilities: "Utilities",
  sanitation: "Sanitation",
  other: "Other",
};

function formatDate(occurredAt: Date | null): string {
  if (occurredAt === null) return "Date not recorded";
  return occurredAt.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function EvidenceCard({ item }: { readonly item: EvidenceItem }) {
  const headline = item.description ?? item.title ?? "Record";
  const sourceLabel = SOURCE_LABELS[item.sourceSystem] ?? item.sourceSystem;

  return (
    <Card className="w-full">
      <Card.Header>
        <div className="flex flex-wrap items-center gap-2">
          <Chip size="sm" variant="soft">
            <Chip.Label>{CATEGORY_LABELS[item.eventCategory] ?? item.eventCategory}</Chip.Label>
          </Chip>
          <ScopeBadge scope={item.addressScope} />
          <ConfidenceBadge confidence={item.matchConfidence} />
        </div>
        <Card.Title>{headline}</Card.Title>
        <Card.Description>
          {sourceLabel} &middot; {formatDate(item.occurredAt)}
          {item.sourceStatus !== null && ` · ${item.sourceStatus}`}
        </Card.Description>
      </Card.Header>
      <Card.Footer className="flex-col items-start gap-2">
        {/* The caveat is never behind the drawer alone. A record whose limits are
            one click away is a record most people will read without them. */}
        <p className="text-sm text-muted">{item.caveat}</p>
        <MatchDrawer
          caveat={item.caveat}
          matchMethod={item.matchMethod}
          reference={item.ref}
          scopeExplanation={scopeExplanation(item.addressScope)}
          sourceUrl={item.sourceUrl}
        />
      </Card.Footer>
    </Card>
  );
}
