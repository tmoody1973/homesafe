import { notFound } from "next/navigation";
import { appPool } from "../../../../../src/db/pool";
import { readSession } from "../../../../lib/session";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type PhotoRow = { content: Buffer; content_type: string };

// Ownership is in the SQL, same as everywhere else: the photo row is joined
// to the case and the case to the session's user, so a stranger who knows a
// photo id gets the same 404 as a photo that does not exist.
export async function GET(
  _request: Request,
  context: { params: Promise<{ photoId: string }> },
): Promise<Response> {
  const { photoId } = await context.params;
  if (!UUID.test(photoId)) notFound();
  const session = await readSession();
  if (!session) notFound();

  const { rows } = await appPool().query<PhotoRow>(
    `SELECT p.content, p.content_type
     FROM observation_photo p
     JOIN housing_case c ON c.case_id = p.case_id
     WHERE p.photo_id = $1 AND c.user_id = $2`,
    [photoId, session.userId],
  );
  const photo = rows[0];
  if (!photo) notFound();

  return new Response(new Uint8Array(photo!.content), {
    headers: {
      "Content-Type": photo!.content_type,
      "Cache-Control": "private, no-store",
    },
  });
}
