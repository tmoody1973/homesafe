import { Alert } from "@heroui/react";
import { notFound } from "next/navigation";
import { caseHeaderFor, latestAnswerFor, observationsFor } from "../../../lib/case";
import { timelineFor } from "../../../lib/evidence";
import { AnalysisLane } from "../../components/AnalysisLane";
import { NotesLane } from "../../components/NotesLane";
import { ThreeLanes } from "../../components/ThreeLanes";

// Per request by nature: this page reads a resident's live case as `app_rw`.
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function CasePage(props: PageProps<"/case/[caseId]">) {
  const { caseId } = await props.params;
  if (!UUID.test(caseId)) notFound();

  const header = await caseHeaderFor(caseId);
  if (header === null) notFound();

  const [notes, answer, publicRecords] = await Promise.all([
    observationsFor(caseId, header.userId),
    latestAnswerFor(caseId),
    header.samAddressId === null
      ? Promise.resolve([])
      : timelineFor(header.samAddressId),
  ]);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold">{header.rawAddress}</h1>
        <p className="text-muted">
          {header.issueCategory} · {notes.length} note{notes.length === 1 ? "" : "s"} ·{" "}
          {publicRecords.length} public record{publicRecords.length === 1 ? "" : "s"}
        </p>
      </header>

      {header.samAddressId === null && (
        // FR-01: the application never silently picks an address. A case with
        // no confirmed address shows no public records and says why, rather
        // than attaching someone else's building to this resident's home.
        <Alert status="warning">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>No address confirmed yet</Alert.Title>
            <Alert.Description>
              Public records are only shown once you have confirmed which address is yours.
              HomeSafe will not guess between units.
            </Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      <ThreeLanes
        analysis={<AnalysisLane answer={answer} />}
        items={publicRecords}
        notes={<NotesLane notes={notes} />}
      />
    </main>
  );
}
