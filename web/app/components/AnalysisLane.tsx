import { Alert } from "@heroui/react";
import type { LatestAnswer } from "../../lib/case";
import { CitedText } from "./CitedText";
import { WhyDrawer } from "./WhyDrawer";

// Spec §7: when the validator cannot verify the answer, the prose is not
// rendered at all. The receipt is, because a system that admits it cannot
// verify itself is more use than one that quietly shows you the unverified
// version.
function CouldNotVerify({ answer }: { readonly answer: LatestAnswer }) {
  return (
    <div className="flex flex-col gap-4">
      <Alert status="warning">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>I could not verify my own answer</Alert.Title>
          <Alert.Description>
            Every claim HomeSafe makes has to cite something it actually read. This answer did
            not, so it is not being shown. What it read is below, unchanged.
          </Alert.Description>
        </Alert.Content>
      </Alert>
      <WhyDrawer receipt={answer.receipt} />
    </div>
  );
}

function Stripped({ count }: { readonly count: number }) {
  return (
    <Alert status="warning">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title>
          {count} {count === 1 ? "claim was" : "claims were"} removed from this answer
        </Alert.Title>
        <Alert.Description>
          {count === 1 ? "It cited" : "They cited"} a source HomeSafe never read, so{" "}
          {count === 1 ? "it was" : "they were"} deleted before you saw{" "}
          {count === 1 ? "it" : "them"}. The run is flagged.
        </Alert.Description>
      </Alert.Content>
    </Alert>
  );
}

export function AnalysisLane({ answer }: { readonly answer: LatestAnswer | null }) {
  if (answer === null) {
    return (
      <Alert>
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>Nothing asked yet</Alert.Title>
          <Alert.Description>
            When you ask HomeSafe a question, its answer appears here, with a receipt of
            everything it read to write it.
          </Alert.Description>
        </Alert.Content>
      </Alert>
    );
  }

  if (!answer.validation.ok) return <CouldNotVerify answer={answer} />;

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted">You asked: {answer.question}</p>
      {answer.validation.flagged && <Stripped count={answer.validation.strippedCount} />}

      {/* Four headed sections rather than one block. The shape exists so a
          tired person can find the part they need without reading the rest. */}
      {answer.sections.map((section) => (
        <section className="flex flex-col gap-2" key={section.title}>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">
            {section.title}
          </h3>
          <CitedText items={answer.receipt.items} text={section.text} />
        </section>
      ))}

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">
          Why I remember this
        </h3>
        {/* The fifth section, and the only one the model does not write. */}
        <WhyDrawer receipt={answer.receipt} />
      </section>

      <p className="text-xs text-muted">
        Answered by {answer.modelId}
        {answer.latencyMs !== null && ` in ${(answer.latencyMs / 1000).toFixed(1)} seconds`}.
        The numbers are citations; every one is in the receipt above.
      </p>
    </div>
  );
}
