import { Button, Card, Chip, Link } from "@heroui/react";
import { redirect } from "next/navigation";
import { AddressAutocomplete } from "../components/AddressAutocomplete";
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

export default async function MePage() {
  const session = await readSession();
  if (!session) redirect("/signin");
  const cases = await myCases(session.userId);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold">Hi, {session.displayName}</h1>
        <p className="text-muted">Your cases live here. Only you can see them.</p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Your cases</h2>
        <CaseList cases={cases} />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Start a case</h2>
        <AddressAutocomplete />
      </section>
    </main>
  );
}
