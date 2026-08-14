"use server";

// Every action derives who is acting from the signed session cookie — never
// from anything the browser sends. A form field that names a user id would be
// an ownership check the visitor fills in themselves.

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { runAgentTurn } from "../../src/agent/converse";
import { createCase, createResident } from "../../src/case/cases";
import { addObservation } from "../../src/memory/observations";
import { appPool } from "../../src/db/pool";
import { candidatesFor } from "../lib/evidence";
import { clearSession, createSession, readSession, type Session } from "../lib/session";

async function requireSession(): Promise<Session> {
  const session = await readSession();
  if (!session) redirect("/signin");
  return session;
}

async function requireCaseOwner(caseId: string): Promise<Session> {
  const session = await requireSession();
  const { rows } = await appPool().query(
    "SELECT 1 FROM housing_case WHERE case_id = $1 AND user_id = $2",
    [caseId, session.userId],
  );
  if (rows.length === 0) redirect("/me");
  return session;
}

export async function signInAction(formData: FormData): Promise<void> {
  const displayName = String(formData.get("display_name") ?? "").trim();
  if (displayName === "") redirect("/signin");
  const userId = await createResident(displayName);
  await createSession({ userId, displayName, role: "resident" });
  redirect("/me");
}

export async function signOutAction(): Promise<void> {
  await clearSession();
  redirect("/");
}

// Two-step on purpose (FR-01): this action only finds candidates. The
// resident picks one; the app never picks for them.
export async function findAddressAction(formData: FormData): Promise<void> {
  await requireSession();
  const rawAddress = String(formData.get("raw_address") ?? "").trim();
  if (rawAddress === "") redirect("/me");
  redirect(`/me?q=${encodeURIComponent(rawAddress)}`);
}

export async function createCaseAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const rawAddress = String(formData.get("raw_address") ?? "").trim();
  const samAddressId = Number(formData.get("sam_address_id"));
  if (rawAddress === "" || !Number.isInteger(samAddressId) || samAddressId <= 0) {
    redirect("/me");
  }
  // Re-resolve on the server: the sam id must be one of the candidates for
  // the typed address, not whatever number arrived in the form.
  const candidates = await candidatesFor(rawAddress);
  const chosen = candidates.find((c) => c.samAddressId === samAddressId);
  if (!chosen) redirect("/me");
  const { rows } = await appPool().query<{ address_entity_id: string }>(
    "SELECT address_entity_id FROM address_entity WHERE sam_address_id = $1",
    [samAddressId],
  );
  const caseId = await createCase({
    userId: session.userId,
    rawAddress,
    addressEntityId: rows[0]?.address_entity_id ?? null,
    issueCategory: String(formData.get("issue_category") ?? "other"),
  });
  redirect(`/case/${caseId}`);
}

export async function addNoteAction(formData: FormData): Promise<void> {
  const caseId = String(formData.get("case_id") ?? "");
  await requireCaseOwner(caseId);
  const body = String(formData.get("body") ?? "").trim();
  if (body === "") return;
  await addObservation({ caseId, body, category: null });
  revalidatePath(`/case/${caseId}`);
}

// "Preview as reviewer" runs the owner's own question with the reviewer role,
// so the consent filter withholds their private notes and says how many. Real
// reviewer accounts arrive with plan 4's consent grants; this shows the same
// SQL doing the same withholding, honestly labelled as a preview.
export async function askAgentAction(formData: FormData): Promise<void> {
  const caseId = String(formData.get("case_id") ?? "");
  const session = await requireCaseOwner(caseId);
  const question = String(formData.get("question") ?? "").trim();
  if (question === "") return;
  const role = formData.get("as_reviewer") === "on" ? "reviewer" : "resident";
  await runAgentTurn({ caseId, userId: session.userId, role }, question);
  revalidatePath(`/case/${caseId}`);
}
