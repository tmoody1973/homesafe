import { Alert, Button, Card, Chip, Input, Label, Link, TextField } from "@heroui/react";
import { redirect } from "next/navigation";
import { createCaseAction, findAddressAction, signOutAction } from "../actions";
import { candidatesFor } from "../../lib/evidence";
import { appPool } from "../../../src/db/pool";
import { readSession } from "../../lib/session";

export const dynamic = "force-dynamic";

type CaseRow = {
  case_id: string;
  raw_address_input: string;
  issue_category: string;
  created_at: Date;
};

async function myCases(userId: string): Promise<CaseRow[]> {
  const { rows } = await appPool().query<CaseRow>(
    `SELECT case_id, raw_address_input, issue_category, created_at
     FROM housing_case WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId],
  );
  return rows;
}

function CaseList({ cases }: { readonly cases: readonly CaseRow[] }) {
  if (cases.length === 0) {
    return <p className="text-muted">No cases yet — start one with your address below.</p>;
  }
  return (
    <ul className="flex flex-col gap-3">
      {cases.map((row) => (
        <li key={row.case_id}>
          <Card>
            <Card.Header>
              <Chip>
                <Chip.Label>{row.issue_category}</Chip.Label>
              </Chip>
              <Card.Title>
                <Link href={`/case/${row.case_id}`}>{row.raw_address_input}</Link>
              </Card.Title>
            </Card.Header>
          </Card>
        </li>
      ))}
    </ul>
  );
}

// FR-01 on screen: several candidates render as several buttons, and the
// resident presses one. Nothing is chosen for them.
async function CandidatePicker({ query }: { readonly query: string }) {
  const candidates = await candidatesFor(query);
  if (candidates.length === 0) {
    return (
      <Alert status="warning">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>No Boston address matched</Alert.Title>
          <Alert.Description>
            Try the street number and name, like &ldquo;302 Sumner St&rdquo;.
          </Alert.Description>
        </Alert.Content>
      </Alert>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">
        {candidates.length === 1
          ? "One match — confirm it is yours:"
          : `${candidates.length} matches. Only you know which is your home — pick it:`}
      </p>
      <ul className="flex flex-col gap-2">
        {candidates.map((candidate) => (
          <li key={candidate.samAddressId}>
            <form action={createCaseAction}>
              <input name="raw_address" type="hidden" value={query} />
              <input name="sam_address_id" type="hidden" value={candidate.samAddressId} />
              <input name="issue_category" type="hidden" value="heat" />
              <Button className="w-full justify-start" type="submit" variant="secondary">
                {candidate.fullAddress}
              </Button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function MePage(props: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await readSession();
  if (!session) redirect("/signin");
  const { q } = await props.searchParams;
  const cases = await myCases(session.userId);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-12">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-semibold">Hi, {session.displayName}</h1>
          <p className="text-muted">Your cases live here. Only you can see them.</p>
        </div>
        <form action={signOutAction}>
          <Button size="sm" type="submit" variant="ghost">
            Sign out
          </Button>
        </form>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Your cases</h2>
        <CaseList cases={cases} />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Start a case</h2>
        <form action={findAddressAction} className="flex items-end gap-3">
          <TextField className="flex-1" defaultValue={q} isRequired name="raw_address">
            <Label>Your Boston address</Label>
            <Input placeholder="302 Sumner St" />
          </TextField>
          <Button type="submit">Find it</Button>
        </form>
        {q && <CandidatePicker query={q} />}
      </section>
    </main>
  );
}
