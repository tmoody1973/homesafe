"use client";

import { Button, Disclosure } from "@heroui/react";
import { useState } from "react";

type Props = {
  readonly scopeExplanation: string;
  readonly matchMethod: string | null;
  readonly sourceUrl: string;
  readonly reference: string;
  readonly caveat: string;
};

// How the record was tied to this address, in the resident's words rather than
// the database's. Closed by default so the timeline stays readable, but never
// more than one click away — a claim a resident cannot interrogate is a claim
// they have to take on faith.
const METHODS: Record<string, string> = {
  sam_id_direct: "Boston's own records give this an address ID, and it matches this address exactly.",
  parcel_direct: "Boston filed this against the plot of land rather than a street address.",
  sam_exact_address_zip: "The written address and postcode matched this address exactly.",
  structured_components: "The street number, name and postcode matched. The unit was not specified.",
  coordinate_proximity: "Matched by map position only, so it may belong to a neighbouring property.",
  unmatched: "We could not tie this record to an address with confidence, so it is shown unmatched rather than hidden.",
};

export function MatchDrawer({
  scopeExplanation,
  matchMethod,
  sourceUrl,
  reference,
  caveat,
}: Props) {
  const [isExpanded, setIsExpanded] = useState(false);
  const howItMatched = matchMethod === null ? null : METHODS[matchMethod] ?? matchMethod;

  return (
    <Disclosure isExpanded={isExpanded} onExpandedChange={setIsExpanded}>
      <Disclosure.Heading>
        {/* HeroUI's own Button, not a raw <button>. The raw element rendered
            and clicked fine but never toggled the disclosure — the trigger
            wiring lives in their component. */}
        <Button size="sm" slot="trigger" variant="ghost">
          Why is this record here?
          <Disclosure.Indicator />
        </Button>
      </Disclosure.Heading>
      <Disclosure.Content>
        <Disclosure.Body className="mt-3 flex flex-col gap-3 rounded-xl bg-surface p-4 text-sm">
          <p>
            <span className="font-semibold">What this does not prove. </span>
            {caveat}
          </p>
          <p>
            <span className="font-semibold">How precisely it attaches. </span>
            {scopeExplanation}
          </p>
          {howItMatched !== null && (
            <p>
              <span className="font-semibold">How we matched it. </span>
              {howItMatched}
            </p>
          )}
          <p className="text-muted">
            Check it yourself:{" "}
            <a
              className="underline underline-offset-4"
              href={sourceUrl}
              rel="noopener noreferrer"
              target="_blank"
            >
              the City of Boston&rsquo;s published dataset
            </a>
          </p>
          <p className="font-mono text-xs text-muted">{reference}</p>
        </Disclosure.Body>
      </Disclosure.Content>
    </Disclosure>
  );
}
