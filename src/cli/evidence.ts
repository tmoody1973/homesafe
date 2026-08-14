// bun run evidence "302 Sumner St"
//
// FR-01 says the application never silently picks an address for the resident.
// SAM is unit-level, so a street address in a multi-unit building matches many
// rows and `resolveAddress` deliberately returns a list. This CLI honours that:
// one candidate prints its timeline, several print the choices and stop. Taking
// the first of several would attach someone's housing complaint to a home they
// may not live in.

import type { AddressCandidate } from "../address/resolve";
import { resolveAddress } from "../address/resolve";
import type { EvidenceItem } from "../evidence/query";
import { MAX_ITEMS, publicTimeline } from "../evidence/query";
import { closePools, evidencePool } from "../db/pool";

const USAGE = 'usage: bun run evidence "302 Sumner St"   |   bun run evidence 132380';

function printCandidate(candidate: AddressCandidate): void {
  console.log(
    `  SAM ${candidate.samAddressId}  ${candidate.fullAddress}  ` +
      `parcel=${candidate.parcelId ?? "-"}  ` +
      `[${candidate.matchMethod}, ${candidate.matchConfidence}]`,
  );
}

function printItem(item: EvidenceItem): void {
  const when = item.occurredAt?.toISOString().slice(0, 10) ?? "undated";
  console.log(`\n  ${when}  [${item.sourceSystem}]  ${item.eventCategory}`);
  console.log(`    ${item.title ?? ""} ${item.description ?? ""}`.trimEnd());
  console.log(
    `    scope=${item.addressScope} confidence=${item.matchConfidence ?? "-"}` +
      ` via=${item.matchMethod ?? "-"}`,
  );
  console.log(`    ref=${item.ref}`);
  console.log(`    source: ${item.sourceUrl}`);
  console.log(`    caveat: ${item.caveat}`);
}

async function printTimeline(samAddressId: number): Promise<void> {
  const items = await publicTimeline(samAddressId);
  const capped = items.length === MAX_ITEMS;
  console.log(
    `\n${items.length} public record(s) for SAM ${samAddressId}` +
      (capped ? ` — the newest ${MAX_ITEMS}; older records exist` : "") +
      ":",
  );
  items.forEach(printItem);
}

async function addressFor(samAddressId: number): Promise<string | null> {
  const { rows } = await evidencePool().query<{ full_address: string }>(
    "SELECT full_address FROM address_entity WHERE sam_address_id = $1",
    [samAddressId],
  );
  return rows[0]?.full_address ?? null;
}

function asSamAddressId(input: string): number | null {
  if (!/^\d+$/.test(input)) return null;
  const parsed = Number.parseInt(input, 10);
  return parsed > 0 ? parsed : null;
}

async function runForSamId(samAddressId: number): Promise<void> {
  const fullAddress = await addressFor(samAddressId);
  if (fullAddress === null) {
    console.log(`No Boston address carries SAM id ${samAddressId}.`);
    return;
  }
  console.log(`\nSAM ${samAddressId}  ${fullAddress}`);
  await printTimeline(samAddressId);
}

async function runForText(raw: string): Promise<void> {
  const candidates = await resolveAddress(raw);

  if (candidates.length === 0) {
    console.log(`No canonical Boston address matched "${raw}".`);
    return;
  }

  console.log("\nAddress candidates:");
  candidates.forEach(printCandidate);

  if (candidates.length > 1) {
    console.log(
      `\n${candidates.length} addresses match "${raw}" equally well — most likely` +
        " separate units in one building. Choosing for you could attach these" +
        " records to the wrong home, so pick one and re-run with its SAM id:",
    );
    console.log(`  bun run evidence ${candidates[0]!.samAddressId}`);
    return;
  }

  await printTimeline(candidates[0]!.samAddressId);
}

async function main(): Promise<void> {
  const raw = process.argv.slice(2).join(" ").trim();
  if (!raw) {
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }

  const samAddressId = asSamAddressId(raw);
  if (samAddressId !== null) await runForSamId(samAddressId);
  else await runForText(raw);
}

try {
  await main();
} finally {
  await closePools();
}
