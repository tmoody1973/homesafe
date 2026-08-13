import { expect, test } from "bun:test";
import { caveatFor } from "../../src/evidence/caveats";

test("the permit caveat states plainly that it does not prove a repair", () => {
  const caveat = caveatFor("building_permit");
  expect(caveat).toMatch(/does not establish/i);
  expect(caveat).toMatch(/repaired|resolved/i);
});

test("the violation caveat says it does not establish a current condition", () => {
  expect(caveatFor("building_violation")).toMatch(/current condition/i);
});

test("the rentsmart caveat says it is not a separate inspection outcome", () => {
  expect(caveatFor("rentsmart")).toMatch(/aggregat|not.*inspection/i);
});

test("both 311 schemas get a caveat about derived address matching", () => {
  expect(caveatFor("boston_311_new")).toMatch(/address match/i);
  expect(caveatFor("boston_311_legacy")).toMatch(/address match/i);
});

test("every caveat is non-empty, because the column is NOT NULL", () => {
  const sources = [
    "boston_311_legacy", "boston_311_new", "building_violation",
    "rentsmart", "building_permit", "property_assessment",
  ] as const;
  for (const source of sources) expect(caveatFor(source).length).toBeGreaterThan(20);
});

test("an unknown source throws rather than returning a vague default", () => {
  // @ts-expect-error deliberately invalid input
  expect(() => caveatFor("mystery_source")).toThrow(/unknown source system/i);
});
