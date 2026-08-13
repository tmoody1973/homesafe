// Permits is roughly 237 MB and SAM roughly 121 MB. Both are read a row at a
// time so peak memory stays flat regardless of how large Boston's files get.

import { parse } from "csv-parse";

export async function* streamCsvRows(
  source: NodeJS.ReadableStream,
): AsyncGenerator<Record<string, string>> {
  const parser = source.pipe(
    parse({ columns: true, skip_empty_lines: true, relax_column_count: true }),
  );
  for await (const row of parser) yield row as Record<string, string>;
}

export async function* batched<T>(
  items: AsyncIterable<T>,
  size: number,
): AsyncGenerator<T[]> {
  let batch: T[] = [];
  for await (const item of items) {
    batch = [...batch, item];
    if (batch.length >= size) {
      yield batch;
      batch = [];
    }
  }
  if (batch.length > 0) yield batch;
}
