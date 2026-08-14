import { Alert, Tabs } from "@heroui/react";
import type { ReactNode } from "react";
import type { EvidenceItem } from "../../lib/evidence";
import { EvidenceCard } from "./EvidenceCard";

// Two of these three lanes are deliberately empty and say so. Filling them with
// sample content would make the demo read better and would be the one thing this
// product cannot do — an interface about the difference between evidence and
// assertion cannot itself assert.
function ComingLater({ what }: { readonly what: string }) {
  return (
    <Alert>
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title>Not built yet</Alert.Title>
        <Alert.Description>{what}</Alert.Description>
      </Alert.Content>
    </Alert>
  );
}

function PublicLane({ items }: { readonly items: readonly EvidenceItem[] }) {
  if (items.length === 0) {
    // Spec §7: absence of data must never read as absence of a problem.
    return (
      <Alert status="warning">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>No public records found for this address</Alert.Title>
          <Alert.Description>
            This is not an all-clear. It means the City of Boston has published nothing we
            could tie to this address — a problem can exist without ever having been reported.
          </Alert.Description>
        </Alert.Content>
      </Alert>
    );
  }

  return (
    <ul className="flex flex-col gap-4">
      {items.map((item) => (
        <li key={item.ref}>
          <EvidenceCard item={item} />
        </li>
      ))}
    </ul>
  );
}

type Props = {
  readonly items: readonly EvidenceItem[];
  // Slots rather than data. The address page has no case behind it and passes
  // nothing; the case page fills both. Keeping this component a layout means
  // the public timeline never imports anything that reads private tables.
  readonly notes?: ReactNode;
  readonly analysis?: ReactNode;
};

export function ThreeLanes({ items, notes, analysis }: Props) {
  return (
    <Tabs className="w-full">
      <Tabs.ListContainer>
        <Tabs.List aria-label="Timeline lanes">
          <Tabs.Tab id="public">
            Public record
            <Tabs.Indicator />
          </Tabs.Tab>
          <Tabs.Tab id="notes">
            Your notes
            <Tabs.Indicator />
          </Tabs.Tab>
          <Tabs.Tab id="analysis">
            HomeSafe analysis
            <Tabs.Indicator />
          </Tabs.Tab>
        </Tabs.List>
      </Tabs.ListContainer>

      <Tabs.Panel className="pt-6" id="public">
        <h2 className="sr-only">Public record</h2>
        <PublicLane items={items} />
      </Tabs.Panel>
      <Tabs.Panel className="pt-6" id="notes">
        <h2 className="sr-only">Your notes</h2>
        {notes ?? (
          <ComingLater what="Your own notes about this home will appear here, kept private to you." />
        )}
      </Tabs.Panel>
      <Tabs.Panel className="pt-6" id="analysis">
        <h2 className="sr-only">HomeSafe analysis</h2>
        {analysis ?? (
          <ComingLater what="HomeSafe's read of these records will appear here, with a citation for every claim it makes." />
        )}
      </Tabs.Panel>
    </Tabs>
  );
}
