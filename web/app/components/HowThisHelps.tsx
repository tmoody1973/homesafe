import { Card } from "@heroui/react";

// Denise's question, answered on the screen where she asked it: "how is this
// supposed to help me and keep my landlord accountable?" In her words, not
// ours — no "cases", no "receipts", no "consent scopes".
export function HowThisHelps({ noteCount }: { readonly noteCount: number }) {
  return (
    <Card variant="secondary">
      <Card.Header>
        <Card.Title>How this helps you hold your landlord accountable</Card.Title>
      </Card.Header>
      <Card.Content>
        <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm leading-relaxed">
          <li>
            <span className="font-semibold">Write down what happens, when it happens</span>{" "}
            (the <em>My journal</em> tab). A dated record beats memory. &ldquo;The heat has
            been out a lot&rdquo; loses arguments — &ldquo;out on the 8th, 11th and 14th,
            landlord told on the 4th, no reply&rdquo; wins them.
          </li>
          <li>
            <span className="font-semibold">See what the city already knows</span> (the{" "}
            <em>Building history</em> tab). If your building has a paper trail of
            complaints, you are not one voice — you are part of a pattern, and patterns are
            what inspectors act on.
          </li>
          <li>
            <span className="font-semibold">Get answers with proof attached</span> (the{" "}
            <em>Get answers</em> tab). Every answer shows exactly where it came from, so
            nobody — not a landlord, not a lawyer — can say you made it up.
          </li>
        </ol>
        {noteCount === 0 && (
          <p className="mt-3 text-sm font-semibold">
            Start with step 1: open <em>My journal</em> and write what happened today.
          </p>
        )}
      </Card.Content>
    </Card>
  );
}
