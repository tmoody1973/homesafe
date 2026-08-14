"use client";

import { Button, Card, Chip, Disclosure } from "@heroui/react";
import type { RenderedItem, RenderedReceipt, ReceiptRow } from "../../../src/receipt/render";

type Props = {
  readonly receipt: RenderedReceipt;
};

const KIND_LABELS: Record<RenderedItem["kind"], string> = {
  resident_observation: "Your own note",
  agent_memory: "Something HomeSafe stored",
  public_event: "Boston public record",
};

function Rows({ rows }: { readonly rows: readonly ReceiptRow[] }) {
  return (
    <dl className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-x-4 gap-y-2 text-sm">
      {rows.map((row) => (
        <div className="contents" key={row.label}>
          <dt className="text-muted">{row.label}</dt>
          <dd className="break-words">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function ReadItem({ item }: { readonly item: RenderedItem }) {
  return (
    <Card variant="transparent">
      <Card.Header>
        <Chip>
          <Chip.Label>{KIND_LABELS[item.kind]}</Chip.Label>
        </Chip>
        <Card.Title>{item.headline}</Card.Title>
      </Card.Header>
      <Card.Content className="flex flex-col gap-3">
        <Rows rows={item.rows} />
        {item.sourceUrl !== null && (
          <a
            className="text-sm underline underline-offset-4"
            href={item.sourceUrl}
            rel="noopener noreferrer"
            target="_blank"
          >
            Check it yourself in the City of Boston&rsquo;s published data
          </a>
        )}
        <p className="font-mono text-xs text-muted">{item.ref}</p>
      </Card.Content>
    </Card>
  );
}

// The count is the proof. A resident cannot inspect a filter, but they can
// watch a number move, and this one only moves because the query withheld
// something. It reports how many and never what.
function Withheld({ receipt }: Props) {
  if (receipt.withheldTotal === 0) {
    return (
      <p className="text-sm">
        Nothing was withheld from this answer. The filter still ran — it had nothing to hold
        back.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm">
        <span className="font-semibold">{receipt.withheldTotal}</span>{" "}
        {receipt.withheldTotal === 1 ? "item was" : "items were"} withheld from this answer.
        HomeSafe counted them. It did not read them.
      </p>
      <Rows rows={receipt.excluded} />
    </div>
  );
}

function Section({
  title,
  children,
}: {
  readonly title: string;
  readonly children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">{title}</h3>
      {children}
    </section>
  );
}

// Every value here comes from `agent_run.receipt` through renderReceipt, which
// is the same artifact the validator checked the answer against. This panel is
// not HomeSafe's account of what it remembered; it is the record of what was
// read.
export function WhyDrawer({ receipt }: Props) {
  return (
    <Disclosure>
      <Button size="sm" slot="trigger" variant="ghost">
        Why do I remember this?
        <Disclosure.Indicator />
      </Button>
      <Disclosure.Content>
        <Disclosure.Body className="mt-3 flex flex-col gap-6 rounded-xl bg-surface p-4">
          <Section title="This answer">
            <Rows rows={receipt.header} />
          </Section>
          <Section title="What was withheld">
            <Withheld receipt={receipt} />
          </Section>
          <Section title="The filter that decided">
            <Rows rows={receipt.consentFilter} />
          </Section>
          <Section title="What changed since last time">
            <Rows rows={receipt.delta} />
          </Section>
          <Section title={`Everything that was read (${receipt.items.length})`}>
            <ul className="flex flex-col gap-4">
              {receipt.items.map((item) => (
                <li key={item.ref}>
                  <ReadItem item={item} />
                </li>
              ))}
            </ul>
          </Section>
        </Disclosure.Body>
      </Disclosure.Content>
    </Disclosure>
  );
}
