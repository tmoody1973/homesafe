// Boston writes two timestamp shapes across its files, and only one of them is
// ISO 8601. Violations use `2013-10-22 00:00:00`; permits use
// `2021-01-28 16:29:26+00`, whose one-digit-pair offset JavaScript rejects
// outright — `new Date("2021-01-28T16:29:26+00")` is Invalid Date.
//
// That mattered: an unnormalised parse returns null for every permit, so every
// permit lands with occurred_at NULL and drops out of a timeline ordered by
// date. Nothing throws and no test fails; the records simply stop appearing.
// So the offset is padded to `+00:00` before parsing.

const SPACE_SEPARATOR = /^(\d{4}-\d{2}-\d{2}) /;
const SHORT_OFFSET = /([+-]\d{2})$/;

function toIso8601(value: string): string {
  return value.replace(SPACE_SEPARATOR, "$1T").replace(SHORT_OFFSET, "$1:00");
}

// A value with no offset is read as local Boston time, which is what the source
// means; one carrying an offset keeps it.
export function parseSourceTimestamp(value: string | null): Date | null {
  if (value === null) return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = new Date(toIso8601(trimmed));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
