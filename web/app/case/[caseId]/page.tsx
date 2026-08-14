import { Alert, Link } from "@heroui/react";
import { notFound, redirect } from "next/navigation";
import { caseHeaderFor, latestAnswerFor, observationsFor, tasksFor } from "../../../lib/case";
import { readSession } from "../../../lib/session";
import { timelineFor } from "../../../lib/evidence";
import { AddressMap } from "../../components/AddressMap";
import { AnalysisLane } from "../../components/AnalysisLane";
import { AskForm, NoteForm } from "../../components/CaseForms";
import { NotesLane } from "../../components/NotesLane";
import { TaskList } from "../../components/TaskList";
import { ThreeLanes } from "../../components/ThreeLanes";

// Per request by nature: this page reads a resident's live case as `app_rw`.
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function CasePage(props: PageProps<"/case/[caseId]">) {
  const { caseId } = await props.params;
  if (!UUID.test(caseId)) notFound();

  const session = await readSession();
  if (!session) redirect("/signin");

  const header = await caseHeaderFor(caseId);
  if (header === null) notFound();
  // Knowing the URL is not owning the case. A stranger's session sees the
  // same 404 as a case that does not exist — not a hint that it does.
  if (header.userId !== session.userId) notFound();

  const [notes, answer, publicRecords, tasks] = await Promise.all([
    observationsFor(caseId, session.userId),
    latestAnswerFor(caseId),
    header.samAddressId === null
      ? Promise.resolve([])
      : timelineFor(header.samAddressId),
    tasksFor(caseId, session.userId),
  ]);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-2">
        <Link href="/me">← Your cases</Link>
        <h1 className="text-3xl font-semibold">{header.rawAddress}</h1>
        <p className="text-muted">
          {header.issueCategory} · {notes.length} note{notes.length === 1 ? "" : "s"} ·{" "}
          {publicRecords.length} public record{publicRecords.length === 1 ? "" : "s"}
        </p>
      </header>

      {header.lat !== null && header.lon !== null && (
        <AddressMap lat={header.lat} lon={header.lon} label={header.rawAddress} />
      )}

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
        analysis={
          <div className="flex flex-col gap-6">
            <AskForm caseId={caseId} />
            <AnalysisLane answer={answer} />
            <TaskList caseId={caseId} tasks={tasks} />
          </div>
        }
        items={publicRecords}
        notes={
          <div className="flex flex-col gap-6">
            <NoteForm caseId={caseId} />
            <NotesLane notes={notes} />
          </div>
        }
      />
    </main>
  );
}
