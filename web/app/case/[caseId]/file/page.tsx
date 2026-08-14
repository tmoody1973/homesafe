import { notFound, redirect } from "next/navigation";
import { caseHeaderFor, observationsFor } from "../../../../lib/case";
import { readSession } from "../../../../lib/session";
import { timelineFor } from "../../../../lib/evidence";
import { PrintButton } from "../../../components/PrintButton";

// The accountability artifact: a print-ready case file Denise can hand to
// 311, a housing counselor, or a court clerk. Plain paper layout on purpose —
// this page is designed to leave the app. The full consent-gated sharing flow
// is plan 4; printing your own file needs no consent machinery because the
// only person holding it is you.
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RECORD_LIMIT = 30;

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "long",
    timeZone: "America/New_York",
  }).format(value);
}

export default async function CaseFilePage(props: PageProps<"/case/[caseId]/file">) {
  const { caseId } = await props.params;
  if (!UUID.test(caseId)) notFound();
  const session = await readSession();
  if (!session) redirect("/signin");
  const header = await caseHeaderFor(caseId);
  if (header === null || header.userId !== session.userId) notFound();

  const [notes, records] = await Promise.all([
    observationsFor(caseId, session.userId),
    header.samAddressId === null
      ? Promise.resolve([])
      : timelineFor(header.samAddressId),
  ]);
  const shown = records.slice(0, RECORD_LIMIT);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-10 print:py-2">
      <header className="flex flex-col gap-2 border-b pb-4">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-2xl font-semibold">Housing case file</h1>
          <PrintButton />
        </div>
        <p>
          <span className="font-semibold">{header.rawAddress}</span> · prepared for{" "}
          {session.displayName} · {formatDate(new Date())}
        </p>
        <p className="text-sm text-muted">
          Resident statements are the resident&rsquo;s own words and are marked as such.
          Public records come from the City of Boston&rsquo;s published datasets; each entry
          states what it does not prove. Assembled by HomeSafe, a CockroachDB × AWS hackathon build.
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">
          Resident&rsquo;s dated journal ({notes.length}{" "}
          {notes.length === 1 ? "entry" : "entries"})
        </h2>
        {notes.length === 0 && <p className="text-sm text-muted">No entries yet.</p>}
        <ol className="flex flex-col gap-3">
          {[...notes].reverse().map((note) => (
            <li className="border-l-2 pl-4" key={note.observationId}>
              <p className="text-sm font-semibold">{formatDate(note.recordedAt)}</p>
              <p className="leading-relaxed">{note.body}</p>
              <p className="text-xs text-muted">
                Resident-provided statement; not independently verified.
                {note.photoIds.length > 0 &&
                  ` ${note.photoIds.length} photo${note.photoIds.length === 1 ? "" : "s"} on file, described by the resident.`}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">
          City of Boston records for this property (newest {shown.length} of{" "}
          {records.length})
        </h2>
        <ol className="flex flex-col gap-3">
          {shown.map((record) => (
            <li className="border-l-2 pl-4" key={record.ref}>
              <p className="text-sm font-semibold">
                {record.occurredAt ? formatDate(record.occurredAt) : "Date not recorded"} ·{" "}
                {record.sourceSystem.replaceAll("_", " ")}
              </p>
              <p className="leading-relaxed">
                {[record.title, record.description].filter(Boolean).join(": ")}
              </p>
              <p className="text-xs text-muted">
                {record.caveat} Match: {record.addressScope}
                {record.matchConfidence ? `, ${record.matchConfidence} confidence` : ""}.
                Source: {record.sourceUrl}
              </p>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
