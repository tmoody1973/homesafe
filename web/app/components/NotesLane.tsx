import { Alert, Card, Chip } from "@heroui/react";
import type { ObservationWithPhotos } from "../../lib/case";

const PRIVACY_LABELS: Record<string, string> = {
  private_to_resident: "Only you can see this",
  shared_with_reviewer: "Shared with a reviewer",
};

function formatDate(recordedAt: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/New_York",
  }).format(recordedAt);
}

export function NotesLane({ notes }: { readonly notes: readonly ObservationWithPhotos[] }) {
  if (notes.length === 0) {
    return (
      <Alert>
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>You have not written anything yet</Alert.Title>
          <Alert.Description>
            Notes you write stay private to you. HomeSafe shares nothing unless you choose to
            share it.
          </Alert.Description>
        </Alert.Content>
      </Alert>
    );
  }

  return (
    <ul className="flex flex-col gap-4">
      {notes.map((note) => (
        <li key={note.observationId}>
          <Card>
            <Card.Header>
              <Chip>
                {/* Stated on every note rather than once at the top of the
                    lane. A promise made in a header is a promise the reader
                    has to remember; one made on the item is one they can see
                    while looking at the thing it protects. */}
                <Chip.Label>{PRIVACY_LABELS[note.privacy] ?? note.privacy}</Chip.Label>
              </Chip>
              <Card.Description>{formatDate(note.recordedAt)}</Card.Description>
            </Card.Header>
            <Card.Content className="flex flex-col gap-3">
              <p className="leading-relaxed">{note.body}</p>
              {note.photoIds.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {note.photoIds.map((photoId) => (
                    // The resident's own words above are the only caption a
                    // photo gets. The AI is locked out of this table entirely
                    // — no embedding, no description, no path into a prompt.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      alt="Photo you attached to this note"
                      className="h-40 max-w-full rounded-xl object-cover"
                      key={photoId}
                      src={`/api/photo/${photoId}`}
                    />
                  ))}
                </div>
              )}
              {note.photoIds.length > 0 && (
                <p className="text-xs text-muted">
                  Your photo, described by you — HomeSafe does not analyse images.
                </p>
              )}
            </Card.Content>
          </Card>
        </li>
      ))}
    </ul>
  );
}
