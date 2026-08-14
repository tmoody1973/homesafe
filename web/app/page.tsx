import { Alert, Card, Link, SearchField } from "@heroui/react";
import { candidatesFor } from "../lib/evidence";

// Next 16: searchParams is a Promise. Synchronous access was removed, not
// deprecated — reading it directly throws.
export const dynamic = "force-dynamic";

function Candidates({ candidates, query }: {
  readonly candidates: Awaited<ReturnType<typeof candidatesFor>>;
  readonly query: string;
}) {
  if (candidates.length === 0) {
    return (
      <Alert status="warning">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>No Boston address matched &ldquo;{query}&rdquo;</Alert.Title>
          <Alert.Description>
            Try the street number and name, for example &ldquo;302 Sumner St&rdquo;.
          </Alert.Description>
        </Alert.Content>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {candidates.length > 1 && (
        // FR-01. Boston's address register is unit-level, so a street address in
        // a multi-unit building matches many rows. Choosing one for the resident
        // would attach these records to a home they may not live in.
        <Alert status="accent">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>{candidates.length} addresses match equally well</Alert.Title>
            <Alert.Description>
              These are most likely separate units in one building. We will not pick for
              you — choose the one that is yours.
            </Alert.Description>
          </Alert.Content>
        </Alert>
      )}
      <ul className="flex flex-col gap-3">
        {candidates.map((candidate) => (
          <li key={candidate.samAddressId}>
            <Card>
              <Card.Header>
                <Card.Title>
                  <Link href={`/address/${candidate.samAddressId}`}>
                    {candidate.fullAddress}
                  </Link>
                </Card.Title>
                <Card.Description>
                  Boston address ID {candidate.samAddressId}
                </Card.Description>
              </Card.Header>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function Home(props: PageProps<"/">) {
  const params = await props.searchParams;
  const raw = typeof params.q === "string" ? params.q.trim() : "";
  const candidates = raw === "" ? null : await candidatesFor(raw);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-16">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold">HomeSafe</h1>
        <p className="text-muted">
          What the City of Boston has on record about a home — with what each record does
          not prove stated alongside it.
        </p>
      </header>

      <form className="flex flex-col gap-3" method="get">
        <SearchField defaultValue={raw} name="q">
          <SearchField.Group>
            <SearchField.SearchIcon />
            <SearchField.Input
              aria-label="Boston street address"
              className="w-full"
              placeholder="302 Sumner St"
            />
            <SearchField.ClearButton />
          </SearchField.Group>
        </SearchField>
      </form>

      {candidates !== null && <Candidates candidates={candidates} query={raw} />}
    </main>
  );
}
