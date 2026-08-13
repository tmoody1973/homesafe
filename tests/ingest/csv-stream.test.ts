import { expect, test } from "bun:test";
import { Readable } from "node:stream";
import { batched, streamCsvRows } from "../../src/ingest/csv-stream";

function fromText(text: string): NodeJS.ReadableStream {
  return Readable.from([Buffer.from(text, "utf8")]);
}

async function collect<T>(gen: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of gen) out.push(item);
  return out;
}

test("yields one object per row keyed by header", async () => {
  const rows = await collect(streamCsvRows(fromText("a,b\n1,2\n3,4\n")));
  expect(rows).toEqual([{ a: "1", b: "2" }, { a: "3", b: "4" }]);
});

test("handles quoted fields containing commas", async () => {
  const rows = await collect(
    streamCsvRows(fromText('case_no,description\n1,"Heat, insufficient"\n')),
  );
  expect(rows[0]!.description).toBe("Heat, insufficient");
});

test("yields nothing for a header-only file", async () => {
  expect(await collect(streamCsvRows(fromText("a,b\n")))).toEqual([]);
});

test("batched groups items and emits a short final batch", async () => {
  async function* nums() { for (const n of [1, 2, 3, 4, 5]) yield n; }
  expect(await collect(batched(nums(), 2))).toEqual([[1, 2], [3, 4], [5]]);
});

test("batched emits nothing for an empty source", async () => {
  async function* none(): AsyncGenerator<number> {}
  expect(await collect(batched(none(), 10))).toEqual([]);
});
