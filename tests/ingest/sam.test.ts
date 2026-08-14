import { expect, test } from "bun:test";
import { ADDRESS_ENTITY_COLUMNS, toAddressEntity } from "../../src/ingest/sam";

const SNAPSHOT = new Date("2026-08-13T00:00:00Z");

const SUMNER: Record<string, string> = {
  SAM_ADDRESS_ID: "132380",
  FULL_ADDRESS: "302 Sumner St",
  STREET_NUMBER: "302",
  FULL_STREET_NAME: "Sumner St",
  UNIT: "",
  ZIP_CODE: "02128",
  MAILING_NEIGHBORHOOD: "East Boston",
  PARCEL_ID: "0104910000",
  BUILDING_ID: "130883",
  POINT_Y: "42.3690",
  POINT_X: "-71.0380",
};

function field(
  row: unknown[],
  name: (typeof ADDRESS_ENTITY_COLUMNS)[number],
): unknown {
  return row[ADDRESS_ENTITY_COLUMNS.indexOf(name)];
}

test("maps the verified 302 Sumner St row to its canonical identifiers", () => {
  const row = toAddressEntity(SUMNER, SNAPSHOT)!;
  expect(field(row, "sam_address_id")).toBe(132380);
  expect(field(row, "full_address")).toBe("302 Sumner St");
  expect(field(row, "parcel_id")).toBe("0104910000");
  expect(field(row, "building_id")).toBe(130883);
});

test("stores coordinates as numbers", () => {
  const row = toAddressEntity(SUMNER, SNAPSHOT)!;
  expect(field(row, "lat")).toBeCloseTo(42.369, 3);
  expect(field(row, "lon")).toBeCloseTo(-71.038, 3);
});

test("turns a blank unit into null rather than an empty string", () => {
  expect(field(toAddressEntity(SUMNER, SNAPSHOT)!, "unit")).toBeNull();
});

test("skips a row with no SAM_ADDRESS_ID instead of inserting a broken key", () => {
  expect(toAddressEntity({ ...SUMNER, SAM_ADDRESS_ID: "" }, SNAPSHOT)).toBeNull();
});

test("skips a row whose SAM_ADDRESS_ID is not numeric", () => {
  expect(toAddressEntity({ ...SUMNER, SAM_ADDRESS_ID: "N/A" }, SNAPSHOT)).toBeNull();
});

test("tolerates a missing optional column", () => {
  const { PARCEL_ID, ...withoutParcel } = SUMNER;
  expect(field(toAddressEntity(withoutParcel, SNAPSHOT)!, "parcel_id")).toBeNull();
});

// Boston's SAM CSV opens with a UTF-8 byte-order mark, so the parser names the
// first column "﻿SAM_ADDRESS_ID". Reading it as "SAM_ADDRESS_ID" skipped
// all 399,452 rows and reported success.
test("reads the first column even when a byte-order mark is glued to its name", () => {
  const { SAM_ADDRESS_ID: _dropped, ...rest } = SUMNER;
  const withBom = { ...rest, "﻿SAM_ADDRESS_ID": "132380" };
  expect(field(toAddressEntity(withBom, SNAPSHOT)!, "sam_address_id")).toBe(132380);
});

// 181-183 State St is a real Boston address whose street number is a range.
// Parsing it as a number would silently store "181" and break the join back to
// the resident's own address.
test("keeps a hyphenated street number range intact", () => {
  const range = {
    ...SUMNER,
    SAM_ADDRESS_ID: "130392",
    FULL_ADDRESS: "181-183 State St",
    STREET_NUMBER: "181-183",
    FULL_STREET_NAME: "State St",
    PARCEL_ID: "0303807000",
  };
  const row = toAddressEntity(range, SNAPSHOT)!;
  expect(field(row, "street_number")).toBe("181-183");
  expect(field(row, "full_address")).toBe("181-183 State St");
});
