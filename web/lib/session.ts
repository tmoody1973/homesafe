import "server-only";

import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";
import { requireEnv } from "../../src/config/env";

// Demo sign-in, decision for the hackathon: a name and a role, no passwords.
// What it does NOT skimp on is the part the product is about — the cookie is
// signed, so a visitor cannot edit it to become another resident, and every
// query still checks ownership in SQL. The identity is weak by choice; the
// boundary around it is not.

export type Session = {
  readonly userId: string;
  readonly displayName: string;
  readonly role: "resident" | "reviewer";
};

const COOKIE_NAME = "homesafe_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

function sign(payload: string): string {
  return createHmac("sha256", requireEnv(process.env, "SESSION_SECRET"))
    .update(payload)
    .digest("base64url");
}

function verify(payload: string, signature: string): boolean {
  const expected = Buffer.from(sign(payload));
  const received = Buffer.from(signature);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export async function createSession(session: Session): Promise<void> {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  (await cookies()).set(COOKIE_NAME, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: MAX_AGE_SECONDS,
    path: "/",
  });
}

export async function readSession(): Promise<Session | null> {
  const raw = (await cookies()).get(COOKIE_NAME)?.value;
  if (!raw) return null;
  const [payload, signature] = raw.split(".");
  if (!payload || !signature || !verify(payload, signature)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString()) as Session;
    if (parsed.role !== "resident" && parsed.role !== "reviewer") return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  (await cookies()).delete(COOKIE_NAME);
}
