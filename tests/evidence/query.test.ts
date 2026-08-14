import { expect, test } from "bun:test";
import { publicTimeline } from "../../src/evidence/query";
import { resolveAddress } from "../../src/address/resolve";

const SUMNER_SAM_ID = 132380;

test("returns evidence items for the verified demo address", async () => {
  const items = await publicTimeline(SUMNER_SAM_ID);
  expect(Array.isArray(items)).toBe(true);
  expect(items.length).toBeGreaterThan(0);
});

test("every item carries a citation ref shaped for the claim validator", async () => {
  for (const item of await publicTimeline(SUMNER_SAM_ID)) {
    expect(item.ref).toMatch(/^evt_[0-9a-f-]{36}$/);
  }
});

test("every item carries a non-empty caveat — the column is NOT NULL", async () => {
  for (const item of await publicTimeline(SUMNER_SAM_ID)) {
    expect(item.caveat.length).toBeGreaterThan(20);
  }
});

test("every item carries a source url for verification", async () => {
  for (const item of await publicTimeline(SUMNER_SAM_ID)) {
    expect(item.sourceUrl).toStartWith("https://data.boston.gov/");
  }
});

test("every item declares its address scope and match confidence", async () => {
  const scopes = ["unit", "address", "building", "parcel", "nearby", "unknown"];
  for (const item of await publicTimeline(SUMNER_SAM_ID)) {
    expect(scopes).toContain(item.addressScope);
    expect(item.matchConfidence).not.toBeNull();
  }
});

test("items are ordered newest first", async () => {
  const dated = (await publicTimeline(SUMNER_SAM_ID))
    .map((item) => item.occurredAt)
    .filter((date): date is Date => date !== null);
  for (let i = 1; i < dated.length; i += 1) {
    expect(dated[i - 1]!.getTime()).toBeGreaterThanOrEqual(dated[i]!.getTime());
  }
});

test("permit items always carry the not-proof-of-repair caveat", async () => {
  const permits = (await publicTimeline(SUMNER_SAM_ID)).filter(
    (item) => item.sourceSystem === "building_permit",
  );
  expect(permits.length).toBeGreaterThan(0);
  for (const permit of permits) {
    expect(permit.caveat).toMatch(/does not establish/i);
  }
});

// Decision 2026-08-14: parcel-filed records are where every heat and pest
// record lives. An address-only timeline returns none of them.
test("parcel-filed records reach the timeline, marked parcel scope", async () => {
  const items = await publicTimeline(SUMNER_SAM_ID);
  const parcelItems = items.filter((item) => item.addressScope === "parcel");
  expect(parcelItems.length).toBeGreaterThan(0);
  for (const item of parcelItems) {
    expect(item.matchMethod).toBe("parcel_direct");
    expect(item.matchConfidence).toBe("medium");
  }
});

test("a parcel record never claims address scope", async () => {
  for (const item of await publicTimeline(SUMNER_SAM_ID)) {
    if (item.matchMethod === "parcel_direct") {
      expect(item.addressScope).toBe("parcel");
    }
  }
});

test("no item is returned twice", async () => {
  const refs = (await publicTimeline(SUMNER_SAM_ID)).map((item) => item.ref);
  expect(new Set(refs).size).toBe(refs.length);
});

test("an address with no records returns an empty list, not an error", async () => {
  expect(await publicTimeline(-1)).toEqual([]);
});

test("end to end: a typed address resolves and yields its timeline", async () => {
  const [candidate] = await resolveAddress("302 Sumner St");
  expect(candidate).toBeDefined();
  const items = await publicTimeline(candidate!.samAddressId);
  expect(Array.isArray(items)).toBe(true);
});
