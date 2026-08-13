import { expect, test } from "bun:test";
import { pickCsvResource, resolveResourceUrl } from "../../src/catalog/ckan";

const RESOURCES = [
  { id: "a", name: "Metadata", format: "PDF", url: "http://x/meta.pdf" },
  { id: "b", name: "Violations 2026", format: "CSV", url: "http://x/tmp1.csv" },
  { id: "c", name: "Violations Archive", format: "CSV", url: "http://x/tmp2.csv" },
];

function fakeFetch(body: unknown, status = 200): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
}

test("picks the CSV whose name matches the pattern", () => {
  expect(pickCsvResource(RESOURCES, /2026/).url).toBe("http://x/tmp1.csv");
});

test("matches format case-insensitively — Boston uses both CSV and csv", () => {
  const lower = [{ id: "d", name: "Data", format: "csv", url: "http://x/d.csv" }];
  expect(pickCsvResource(lower, /Data/).url).toBe("http://x/d.csv");
});

test("ignores non-CSV resources even when the name matches", () => {
  const pdfOnly = [{ id: "e", name: "Violations 2026", format: "PDF", url: "http://x/e.pdf" }];
  expect(() => pickCsvResource(pdfOnly, /2026/)).toThrow(/no CSV resource/i);
});

test("throws naming what it did find, rather than returning undefined", () => {
  // An ingest that silently finds no file is the failure mode this prevents:
  // it would look like "no records at this address" instead of an error.
  expect(() => pickCsvResource(RESOURCES, /Permits/)).toThrow(/no CSV resource/i);
  expect(() => pickCsvResource(RESOURCES, /Permits/)).toThrow(/Violations 2026/);
});

test("resolveResourceUrl reads the url out of a catalog response", async () => {
  const url = await resolveResourceUrl(
    "building-and-property-violations1",
    /2026/,
    fakeFetch({ success: true, result: { resources: RESOURCES } }),
  );
  expect(url).toBe("http://x/tmp1.csv");
});

test("throws with the status code on a non-200", async () => {
  await expect(
    resolveResourceUrl("pkg", /x/, fakeFetch({}, 503)),
  ).rejects.toThrow(/503/);
});

test("throws when the catalog returns a body with no resources", async () => {
  await expect(
    resolveResourceUrl("pkg", /x/, fakeFetch({ success: true, result: {} })),
  ).rejects.toThrow(/no CSV resource/i);
});

test("every Boston package id is a non-empty slug", async () => {
  const { BOSTON_PACKAGES } = await import("../../src/catalog/ckan");
  const ids = Object.values(BOSTON_PACKAGES);
  expect(ids.length).toBe(5);
  for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
});
