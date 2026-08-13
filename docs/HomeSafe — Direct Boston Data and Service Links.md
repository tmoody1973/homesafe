# HomeSafe — Direct Boston Data and Service Links

This sheet contains the Boston public datasets and service endpoints needed to build the **HomeSafe** MVP. Use the **stable dataset page** in documentation and configuration; use the listed **current direct resource** for prototype ingestion. Some City resource filenames change when a dataset refreshes, so an ingestion job should resolve current resource URLs from the catalog API instead of permanently hard-coding a `tmp*.csv` filename.

> **Core address graph:** `resident or 311 address → SAM lookup → SAM_ADDRESS_ID + PARCEL_ID → violations, permits, RentSmart, and property context`.

## 1. Required MVP data sources

| Priority | Data source | HomeSafe purpose | Stable dataset page | Current direct data/service link |
|---:|---|---|---|---|
| 1 | **Live SAM Addresses** | Canonical address, unit/range, coordinates, `SAM_ADDRESS_ID`, `PARCEL_ID`, and `BUILDING_ID`. This is the address-to-parcel crosswalk. | [Dataset page](https://data.boston.gov/dataset/live-street-address-management-sam-addresses) | [Live SAM ArcGIS feature layer](https://gisportal.boston.gov/arcgis/rest/services/SAM/Live_SAM_Address/FeatureServer/0) |
| 2 | **Building and Property Violations** | Direct, public property-safety history. Join `sam_id` to SAM `SAM_ADDRESS_ID`. | [Dataset page](https://data.boston.gov/dataset/building-and-property-violations1) | [Current CSV](https://data.boston.gov/dataset/705244a6-70a6-4ff8-ab8e-56441aff18e7/resource/800a2663-1d6a-46e7-9356-bedb70f5332c/download/tmpwkewfc3d.csv) |
| 3 | **Approved Building Permits** | Permit status, dates, type, description, and property/parcel context. Join `property_id` to SAM `SAM_ADDRESS_ID`; retain `parcel_id`. | [Dataset page](https://data.boston.gov/dataset/approved-building-permits) | [Current CSV](https://data.boston.gov/dataset/cd1ec3ff-6ebf-4a65-af68-8329eceab740/resource/6ddcd912-32a0-43df-9908-63574f8c7e77/download/tmpaezr9hww.csv) |
| 4 | **RentSmart** | Housing-signal context: dated issue type/description, address, parcel, property type, and coordinates. Link `parcel` to SAM `PARCEL_ID`, then corroborate with address/coordinates. | [Dataset page](https://data.boston.gov/dataset/rentsmart) | [Current CSV, 2016–present](https://data.boston.gov/dataset/f506e000-b08c-4500-97c7-9f36e7ac125a/resource/dc615ff7-2ff3-416a-922b-f0f334f085d0/download/tmpd2x943vy.csv) |
| 5 | **311 Service Requests — new system** | Current service history: case ID, open/close dates, topic, status, closure, full/structured address, ZIP, and coordinates. Resolve addresses through SAM. | [311 dataset page](https://data.boston.gov/dataset/311-service-requests) | [Current new-system CSV](https://data.boston.gov/dataset/8048697b-ad64-4bfc-b090-ee00169f2323/resource/254adca6-64ab-4c5c-9fc0-a6da622be185/download/tmpy83_aof3.csv) |
| 6 | **311 Service Requests — legacy system** | Historical continuity during the City’s 311 platform transition. Normalize legacy location/street/ZIP/coordinates, then resolve through SAM. | [Direct legacy 2026 resource page](https://data.boston.gov/dataset/311-service-requests/resource/1a0b420d-99f1-4887-9851-990b2a5a6e17) | Download current resource URL from the stable 311 dataset page or catalog API; do not assume a legacy resource filename is permanent. |
| 7 | **FY2026 Property Assessment** | Optional non-sensitive property context, such as property type, residential units, construction year, and heating type. Link `PID` to SAM `PARCEL_ID`. Do not expose owner fields in the resident UI. | [Dataset page](https://data.boston.gov/dataset/property-assessment) | [FY2026 CSV](https://data.boston.gov/dataset/e02c44d2-3c64-459c-8fe2-e1ce5f38a035/resource/ee73430d-96c0-423e-ad21-c4cfb54c8961/download/fy2026-property-assessment-data_rev.csv) |

## 2. SAM API: address-to-parcel lookup

Use the SAM ArcGIS query endpoint to resolve a confirmed address into canonical IDs. The example below is a verified query for `302 Sumner St`.

| Use | Direct link |
|---|---|
| SAM query endpoint | [Query endpoint](https://gisportal.boston.gov/arcgis/rest/services/SAM/Live_SAM_Address/FeatureServer/0/query) |
| Verified address-only test: `302 Sumner St` | [Open JSON response](https://gisportal.boston.gov/arcgis/rest/services/SAM/Live_SAM_Address/FeatureServer/0/query?where=FULL_ADDRESS%3D%27302%20Sumner%20St%27%26outFields=SAM_ADDRESS_ID%2CFULL_ADDRESS%2CPARCEL_ID%2CBUILDING_ID%26returnGeometry=false%26f=json) |
| Verified identifier test: `SAM_ADDRESS_ID = 132380` | [Open JSON response](https://gisportal.boston.gov/arcgis/rest/services/SAM/Live_SAM_Address/FeatureServer/0/query?where=SAM_ADDRESS_ID%3D132380%26outFields=SAM_ADDRESS_ID%2CFULL_ADDRESS%2CPARCEL_ID%2CBUILDING_ID%26returnGeometry=false%26f=json) |

The expected result for the test address is:

```json
{
  "SAM_ADDRESS_ID": 132380,
  "FULL_ADDRESS": "302 Sumner St",
  "PARCEL_ID": "0104910000",
  "BUILDING_ID": 130883
}
```

### Query pattern

```text
GET https://gisportal.boston.gov/arcgis/rest/services/SAM/Live_SAM_Address/FeatureServer/0/query
  ?where=FULL_ADDRESS%3D%27{URL_ENCODED_FULL_ADDRESS}%27
  &outFields=SAM_ADDRESS_ID,FULL_ADDRESS,PARCEL_ID,BUILDING_ID
  &returnGeometry=false
  &f=json
```

For production-quality matching, do not use only a string-equality query. Preserve raw input, normalize the address, include ZIP where available, confirm unit/range details, and compare coordinates when a 311 source record contains them.

## 3. Catalog APIs for refresh-safe ingestion

Boston’s CKAN catalog API lets the ingestion job discover the current resource link for a stable dataset rather than embedding a refreshable CSV filename in code.

| Use | Direct link |
|---|---|
| Catalog API documentation | [CKAN API guide](https://docs.ckan.org/en/latest/api/) |
| Boston package search endpoint | [Package search](https://data.boston.gov/api/3/action/package_search) |
| Building/Property Violations metadata | [Package metadata JSON](https://data.boston.gov/api/3/action/package_show?id=building-and-property-violations1) |
| Approved Building Permits metadata | [Package metadata JSON](https://data.boston.gov/api/3/action/package_show?id=approved-building-permits) |
| RentSmart metadata | [Package metadata JSON](https://data.boston.gov/api/3/action/package_show?id=rentsmart) |
| 311 metadata | [Package metadata JSON](https://data.boston.gov/api/3/action/package_show?id=311-service-requests) |
| Property Assessment metadata | [Package metadata JSON](https://data.boston.gov/api/3/action/package_show?id=property-assessment) |

## 4. Helpful validation tools

| Tool | Purpose | Direct link |
|---|---|---|
| **Boston Property Lookup** | Manual spot-check of property information while testing an address resolver. This is not required for the HomeSafe data pipeline. | [properties.boston.gov](https://properties.boston.gov/) |
| **Boston Tax Parcel Viewer** | Visual validation of parcel boundaries and parcel context during development. | [Tax Parcel Viewer](https://app01.cityofboston.gov/parcelviewer/) |
| **Analyze Boston portal** | Discovery of source metadata, resource updates, and additional datasets. | [data.boston.gov](https://data.boston.gov/) |

## 5. Build order

1. Import a scoped **SAM snapshot** first and make `sam_address_id` the canonical external address key.
2. Import **Building and Property Violations** and **Approved Building Permits** next; both have direct high-confidence linkage to SAM.
3. Add **RentSmart** through parcel matching, retaining its source label and not treating it as a direct inspection determination.
4. Add **new and legacy 311** through an address-resolution adapter that records `match_method`, `match_confidence`, `address_scope`, original source address, and source coordinates.
5. Add a small, non-sensitive **Property Assessment** subset only if it improves the demo.

> **Important:** Boston’s public records provide context. They do not prove that a particular unit is currently unsafe, that a repair happened, or that a person is responsible. HomeSafe must show source, date, match confidence, and scope for every public record.

## 6. Core fields to retain during ingestion

| Source | Minimum fields to retain |
|---|---|
| SAM | `SAM_ADDRESS_ID`, `FULL_ADDRESS`, unit/range fields, `PARCEL_ID`, `BUILDING_ID`, neighborhood, coordinates, last-edited timestamp |
| Violations | `case_no`, `status_dttm`, `status`, `code`, `description`, `sam_id`, address fields, coordinates |
| Permits | `permitnumber`, `worktype`, `permittypedescr`, `description`, `issued_date`, `expiration_date`, `status`, `property_id`, `parcel_id`, address, coordinates |
| RentSmart | `date`, `violation_type`, `description`, `address`, `parcel`, neighborhood, ZIP, property type, coordinates |
| New 311 | `case_id`, `open_date`, `case_topic`, `service_name`, assigned department/team, case status, closure reason/comments, close date, full/structured address, ZIP, coordinates |
| Legacy 311 | `case_enquiry_id`, open/close/SLA dates, title/reason/type, case status, closure reason, department, location/street/ZIP, coordinates |
| Property Assessment | `PID`, non-sensitive property type/class, `RES_UNITS`, `YR_BUILT`, `HEAT_TYPE`, coordinates; omit owner fields from the resident-facing build |

## References

[1] [Live SAM Addresses — Analyze Boston](https://data.boston.gov/dataset/live-street-address-management-sam-addresses)

[2] [Building and Property Violations — Analyze Boston](https://data.boston.gov/dataset/building-and-property-violations1)

[3] [Approved Building Permits — Analyze Boston](https://data.boston.gov/dataset/approved-building-permits)

[4] [RentSmart — Analyze Boston](https://data.boston.gov/dataset/rentsmart)

[5] [311 Service Requests — Analyze Boston](https://data.boston.gov/dataset/311-service-requests)

[6] [Property Assessment — Analyze Boston](https://data.boston.gov/dataset/property-assessment)

[7] [Live SAM Address ArcGIS Service — City of Boston](https://gisportal.boston.gov/arcgis/rest/services/SAM/Live_SAM_Address/FeatureServer/0)
