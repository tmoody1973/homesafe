import { Alert, Link } from "@heroui/react";
import { notFound } from "next/navigation";
import { addressFor, timelineFor } from "../../../lib/evidence";
import { ThreeLanes } from "../../components/ThreeLanes";

// Without this, Next runs the database query at build time and the build fails.
// The timeline is per-request by nature: it reads live public records as a
// specific, restricted login.
export const dynamic = "force-dynamic";

const MAX_ITEMS = 200;

function parseSamId(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const parsed = Number.parseInt(raw, 10);
  return parsed > 0 ? parsed : null;
}

export default async function AddressTimeline(props: PageProps<"/address/[samId]">) {
  const { samId } = await props.params;
  const samAddressId = parseSamId(samId);
  if (samAddressId === null) notFound();

  const fullAddress = await addressFor(samAddressId);
  if (fullAddress === null) notFound();

  const items = await timelineFor(samAddressId);
  const capped = items.length === MAX_ITEMS;

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-2">
        <Link href="/">Search another address</Link>
        <h1 className="text-3xl font-semibold">{fullAddress}</h1>
        <p className="text-muted">
          {items.length} public record{items.length === 1 ? "" : "s"}
          {capped && `. Showing the newest ${MAX_ITEMS}; older records exist`}
        </p>
      </header>

      {capped && (
        // A truthful count that gives a false impression is the failure this
        // product exists to prevent, so the truncation says so out loud.
        <Alert status="warning">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>This list is cut off</Alert.Title>
            <Alert.Description>
              We are showing the {MAX_ITEMS} most recent records. There are older ones we
              have not drawn here.
            </Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      <ThreeLanes items={items} />
    </main>
  );
}
