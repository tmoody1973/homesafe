import { expect, test } from "bun:test";
import { normalizeAddress } from "../../src/address/normalize";

test("preserves the raw input exactly", () => {
  expect(normalizeAddress("  302 sumner st.  ").raw).toBe("  302 sumner st.  ");
});

test("uppercases, collapses whitespace, and strips trailing punctuation", () => {
  expect(normalizeAddress("  302   sumner  st.  ").normalized).toBe("302 SUMNER ST");
});

test("standardises common street suffixes", () => {
  expect(normalizeAddress("10 Beacon Street").normalized).toBe("10 BEACON ST");
  expect(normalizeAddress("5 Commonwealth Avenue").normalized).toBe("5 COMMONWEALTH AVE");
  expect(normalizeAddress("7 Blue Hill Road").normalized).toBe("7 BLUE HILL RD");
});

test("standardises directionals", () => {
  expect(normalizeAddress("12 North Main Street").normalized).toBe("12 N MAIN ST");
});

test("extracts the unit and removes it from the normalized street", () => {
  const result = normalizeAddress("302 Sumner St Apt 3B");
  expect(result.unit).toBe("3B");
  expect(result.normalized).toBe("302 SUMNER ST");
});

test("treats # as a unit marker", () => {
  expect(normalizeAddress("302 Sumner St #2").unit).toBe("2");
});

test("splits structured components", () => {
  const result = normalizeAddress("302 Sumner St", "02128");
  expect(result.streetNumber).toBe("302");
  expect(result.streetName).toBe("SUMNER");
  expect(result.suffix).toBe("ST");
  expect(result.zip).toBe("02128");
});

test("keeps a hyphenated street-number range intact", () => {
  expect(normalizeAddress("181-183 State St").streetNumber).toBe("181-183");
});

test("returns no components for a non-address location", () => {
  const result = normalizeAddress("Intersection of A St and B St");
  expect(result.streetNumber).toBeUndefined();
});

// Every suffix below was observed in the live SAM file. A resident typing the
// long form has to reach the same string SAM stores, or the match silently
// finds nothing and the timeline reads as "no records at this address".
test("standardises the suffixes Boston actually uses", () => {
  expect(normalizeAddress("15 Bellevue Circle").normalized).toBe("15 BELLEVUE CIR");
  expect(normalizeAddress("100 Commercial Wharf").normalized).toBe("100 COMMERCIAL WHF");
  expect(normalizeAddress("1 City Hall Plaza").normalized).toBe("1 CITY HALL PLZ");
});

test("recognises suffixes that have no separate abbreviation", () => {
  expect(normalizeAddress("30 Nashua Way").suffix).toBe("WAY");
  expect(normalizeAddress("6 Franklin Park").suffix).toBe("PARK");
});
