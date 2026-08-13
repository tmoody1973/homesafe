import { expect, test } from "bun:test";
import { categorize } from "../../src/evidence/categorize";

test("a permit is a permit regardless of its description", () => {
  expect(categorize("Install new kitchen cabinets", "building_permit")).toBe("permit");
});

test("recognises heat and hot water language seen in real Boston data", () => {
  expect(categorize("Heat - Excessive, Insufficient", "building_violation")).toBe("heat_hot_water");
  expect(categorize("No hot water in unit", "boston_311_new")).toBe("heat_hot_water");
  expect(categorize("Radiator not working", "rentsmart")).toBe("heat_hot_water");
});

test("recognises pest language", () => {
  expect(categorize("Rodent infestation observed", "rentsmart")).toBe("pest");
  expect(categorize("Bed bugs reported", "boston_311_new")).toBe("pest");
});

test("recognises structural and egress language", () => {
  expect(categorize("Unsafe and Dangerous", "building_violation")).toBe("structural_safety");
  expect(categorize("Number of Exits or Exit Access", "building_violation")).toBe("structural_safety");
});

test("recognises utility language", () => {
  expect(categorize("Electrical hazard in hallway", "building_violation")).toBe("utilities");
});

test("recognises sanitation language", () => {
  expect(categorize("Trash and rubbish accumulation", "boston_311_legacy")).toBe("sanitation");
});

test("falls back to other rather than guessing", () => {
  expect(categorize("Miscellaneous inspection note", "building_violation")).toBe("other");
});

test("categorisation is case-insensitive", () => {
  expect(categorize("HEAT INSUFFICIENT", "building_violation")).toBe("heat_hot_water");
});

test("an empty description is other, not a crash", () => {
  expect(categorize("", "building_violation")).toBe("other");
});

test("recognises fire-safety language, the largest real hazard vocabulary in the violations file", () => {
  expect(categorize("Fire Protection Systems", "building_violation")).toBe("structural_safety");
  expect(categorize("Smoke Detectors", "building_violation")).toBe("structural_safety");
  expect(categorize("Automatic Sprinkler System", "building_violation")).toBe("structural_safety");
  expect(categorize("Emergency Escape & Rescue", "building_violation")).toBe("structural_safety");
  expect(categorize("Hand Rails", "building_violation")).toBe("structural_safety");
});

test("recognises the abbreviated electrical language Boston actually files", () => {
  expect(categorize("Elec. Equip. & Connections", "building_violation")).toBe("utilities");
  expect(categorize("Wiring Integrity", "building_violation")).toBe("utilities");
  expect(categorize("Dwelling unit branch circuits.", "building_violation")).toBe("utilities");
});

test("a violation about permitting is categorised permit", () => {
  expect(categorize("Failure to Obtain Permit", "building_violation")).toBe("permit");
  expect(categorize("Failed to comply w PRMT terms", "building_violation")).toBe("permit");
});

test("a hazard mentioned alongside a permit is reported as the hazard, not the paperwork", () => {
  expect(categorize("Electrical work without a permit", "building_violation")).toBe("utilities");
});

test("administrative process language stays in other rather than being forced into a category", () => {
  expect(categorize("Right of Entry", "building_violation")).toBe("other");
  expect(categorize("Certificate of Occupancy", "building_violation")).toBe("other");
  expect(categorize("Maintenance", "building_violation")).toBe("other");
});
