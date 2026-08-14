import { expect, test } from "bun:test";
import { confidenceFor, resolveAddress, RESOLVER_VERSION } from "../../src/address/resolve";

test("a single exact match is high confidence", () => {
  expect(confidenceFor("sam_exact_address_zip", 1)).toBe("high");
});

test("multiple exact matches are ambiguous, not high", () => {
  expect(confidenceFor("sam_exact_address_zip", 3)).toBe("ambiguous");
});

test("a single structured-component match is medium", () => {
  expect(confidenceFor("structured_components", 1)).toBe("medium");
});

test("multiple structured matches are ambiguous", () => {
  expect(confidenceFor("structured_components", 2)).toBe("ambiguous");
});

test("no match is ambiguous", () => {
  expect(confidenceFor("unmatched", 0)).toBe("ambiguous");
});

test("the resolver version is pinned so stored matches stay explainable", () => {
  expect(RESOLVER_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
});

test("resolves the verified demo address to SAM 132380 at high confidence", async () => {
  const candidates = await resolveAddress("302 Sumner St");
  expect(candidates.length).toBeGreaterThan(0);
  expect(candidates[0]!.samAddressId).toBe(132380);
  expect(candidates[0]!.parcelId).toBe("0104910000");
  expect(candidates[0]!.matchConfidence).toBe("high");
});

test("returns an empty list for an address that is not in Boston", async () => {
  expect(await resolveAddress("99999 Nowhere Blvd", "00000")).toEqual([]);
});

// 1313 Washington St exists in SAM only as 156 individual apartments and no
// building-level row, so a resident typing the street address genuinely could
// mean any of them. Reporting that as `high` would attach their complaint to one
// arbitrary neighbour's apartment.
test("a multi-unit building with no building-level row is ambiguous, never high", async () => {
  const candidates = await resolveAddress("1313 Washington St");
  expect(candidates.length).toBeGreaterThan(1);
  for (const candidate of candidates) {
    expect(candidate.matchConfidence).toBe("ambiguous");
  }
});
