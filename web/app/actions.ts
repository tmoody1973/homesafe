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

export async function createCaseAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const samAddressId = Number(formData.get("sam_address_id"));
  if (!Number.isInteger(samAddressId) || samAddressId <= 0) redirect("/me");
  // The server looks the address up itself and stores the canonical form, so
  // a tampered form can at worst attach a real public address the visitor
  // could have picked anyway — never an address that does not exist.
  const { rows } = await appPool().query<{
    address_entity_id: string;
    full_address: string;
  }>(
    "SELECT address_entity_id, full_address FROM address_entity WHERE sam_address_id = $1",
    [samAddressId],
  );
  const found = rows[0];
  if (!found) redirect("/me");
  const caseId = await createCase({
    userId: session.userId,
    rawAddress: found!.full_address,
    addressEntityId: found!.address_entity_id,
    issueCategory: String(formData.get("issue_category") ?? "other"),
  });
  redirect(`/case/${caseId}`);
}

const MAX_PHOTO_BYTES = 4 * 1024 * 1024;

// The photo arrives already re-encoded by the browser's canvas, which strips
// EXIF metadata — including the GPS position phones embed in every shot. The
// AI never sees it: no embedding, no description. The resident's own words
// are the only caption.
async function savePhoto(caseId: string, observationId: string, photo: File): Promise<void> {
  if (photo.size === 0 || photo.size > MAX_PHOTO_BYTES) return;
  if (!photo.type.startsWith("image/")) return;
  const content = Buffer.from(await photo.arrayBuffer());
  await appPool().query(
    `INSERT INTO observation_photo (observation_id, case_id, content_type, content, byte_size)
     VALUES ($1, $2, $3, $4, $5)`,
    [observationId, caseId, photo.type, content, content.length],
  );
}

export async function addNoteAction(formData: FormData): Promise<void> {
  const caseId = String(formData.get("case_id") ?? "");
  await requireCaseOwner(caseId);
  const body = String(formData.get("body") ?? "").trim();
  if (body === "") return;
  const { observationId } = await addObservation({ caseId, body, category: null });
  const photo = formData.get("photo");
  if (photo instanceof File && photo.size > 0) {
    await savePhoto(caseId, observationId, photo);
  }
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
