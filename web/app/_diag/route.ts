// TEMPORARY diagnostic — removed once the runtime env question is answered.
// Reports only presence and length. Never the value.
export const dynamic = "force-dynamic";

export async function GET() {
  const names = ["DATABASE_URL_EVIDENCE", "DATABASE_URL_APP", "AMPLIFY_MONOREPO_APP_ROOT"];
  const seen = Object.fromEntries(
    names.map((n) => [n, process.env[n] ? `present, ${process.env[n]!.length} chars` : "ABSENT"]),
  );

  let dbError: string | null = null;
  try {
    const { evidencePool } = await import("../../../src/db/pool");
    const { rows } = await evidencePool().query<{ current_user: string }>("SELECT current_user");
    dbError = `ok, connected as ${rows[0]?.current_user}`;
  } catch (error) {
    dbError = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  }

  return Response.json({ env: seen, db: dbError });
}
