export type Env = {
  readonly appDatabaseUrl: string;
  readonly evidenceDatabaseUrl: string;
  readonly awsRegion: string;
};

const REQUIRED = [
  "DATABASE_URL_APP",
  "DATABASE_URL_EVIDENCE",
  "AWS_REGION",
] as const;

function missingKeys(source: Record<string, string | undefined>): string[] {
  return REQUIRED.filter((key) => (source[key] ?? "").trim() === "");
}

// Each connection asks for its own variable and nothing else. loadEnv demands
// all three at once, which meant a process that only ever reads public evidence
// could not start without also being handed `app_rw` — the login that can write
// residents' private notes, consent records and case data.
//
// Found on 2026-08-14 while deploying the read-only web tier: making it boot
// would have required shipping the write credential to the public internet-
// facing runtime. An unused credential is still a credential that leaked.
export function requireEnv(
  source: Record<string, string | undefined>,
  key: string,
): string {
  const value = (source[key] ?? "").trim();
  if (value === "") {
    throw new Error(`Missing or blank required environment variable: ${key}`);
  }
  return value;
}

export function loadEnv(source: Record<string, string | undefined>): Env {
  const missing = missingKeys(source);
  if (missing.length > 0) {
    throw new Error(
      `Missing or blank required environment variables: ${missing.join(", ")}`,
    );
  }
  return {
    appDatabaseUrl: source.DATABASE_URL_APP!.trim(),
    evidenceDatabaseUrl: source.DATABASE_URL_EVIDENCE!.trim(),
    awsRegion: source.AWS_REGION!.trim(),
  };
}
