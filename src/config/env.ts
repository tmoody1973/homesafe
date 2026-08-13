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
