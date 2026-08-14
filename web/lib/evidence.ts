import "server-only";

import { evidencePool } from "../../src/db/pool";
import { publicTimeline, type EvidenceItem } from "../../src/evidence/query";
import { resolveAddress, type AddressCandidate } from "../../src/address/resolve";

export type { AddressCandidate, EvidenceItem };
export { publicTimeline, resolveAddress };

const REQUIRED_LOGIN = "evidence_ro";

let confirmedLogin: Promise<void> | undefined;

// The gate's stated risk: if DATABASE_URL_EVIDENCE is ever pointed at the admin
// login by mistake, this read-only page silently gains the ability to write, and
// nothing about the UI would look different. The whole product is the claim that
// the wrong rows are unreachable rather than merely un-asked-for, so the claim is
// checked at runtime instead of trusted.
//
// Checked once per process, not per request — the answer cannot change while a
// pool is open.
async function assertReadOnlyLogin(): Promise<void> {
  const { rows } = await evidencePool().query<{ current_user: string }>(
    "SELECT current_user",
  );
  const login = rows[0]?.current_user;
  if (login !== REQUIRED_LOGIN) {
    throw new Error(
      `Evidence connection is authenticated as "${login}", not "${REQUIRED_LOGIN}". ` +
        "Refusing to serve: this page must never hold write access.",
    );
  }
}

async function withVerifiedLogin<T>(read: () => Promise<T>): Promise<T> {
  confirmedLogin ??= assertReadOnlyLogin();
  await confirmedLogin;
  return read();
}

export function timelineFor(samAddressId: number): Promise<EvidenceItem[]> {
  return withVerifiedLogin(() => publicTimeline(samAddressId));
}

export function candidatesFor(rawAddress: string): Promise<AddressCandidate[]> {
  return withVerifiedLogin(() => resolveAddress(rawAddress));
}

export async function addressFor(samAddressId: number): Promise<string | null> {
  return withVerifiedLogin(async () => {
    const { rows } = await evidencePool().query<{ full_address: string }>(
      "SELECT full_address FROM address_entity WHERE sam_address_id = $1",
      [samAddressId],
    );
    return rows[0]?.full_address ?? null;
  });
}
