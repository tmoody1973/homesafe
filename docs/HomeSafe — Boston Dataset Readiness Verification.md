# HomeSafe — Boston Dataset Readiness Verification

**Verification date:** August 12, 2026

## Verdict

**Yes, Boston publishes enough detail to build and convincingly demonstrate the HomeSafe hackathon MVP.** The core evidence timeline and key joins are feasible with real public data. The strongest direct join is the City’s Street Address Management (SAM) identifier: both **Building and Property Violations** and **Approved Building Permits** expose identifiers that were directly verified against the live SAM address service.

The project should nevertheless be scoped as a **resident-controlled evidence-and-coordination prototype**, not a production integration with Boston enforcement systems. There are important gaps in public data and operational access. In particular, no public source establishes a tenant’s relationship to a property, provides private case notes, grants inspection-system workflow access, or conclusively proves a condition was repaired. HomeSafe should provide these as user-consented memory and human-reviewed workflow features in its own database, and label their source clearly.

| Requirement | Status | Evidence and practical conclusion |
|---|---|---|
| Canonical Boston address, unit, coordinates, parcel, building reference | **Verified** | SAM has `SAM_ADDRESS_ID`, `FULL_ADDRESS`, unit, structured street fields, `PARCEL_ID`, `BUILDING_ID`, neighborhood, coordinates, and timestamps; CSV/GeoJSON and ArcGIS REST resources are published. |
| Direct link: building/property violations → canonical address | **Verified** | Violations contain `sam_id`; the City documents that `property_id` is equivalent to `sam_id`. A live test resolved violation `sam_id=132380` to SAM address `302 Sumner St`, parcel `0104910000`, building `130883`. |
| Direct link: building permits → canonical address | **Verified** | Permits contain `property_id`, `parcel_id`, structured address, latitude and longitude. A live test resolved published permit `property_id=130392` to SAM address `181-183 State St`, parcel `0303807000`, building `136572`. |
| Permit dates, status, category, description, and value | **Verified** | Permits provide `permitnumber`, `worktype`, `permittypedescr`, `description`, `issued_date`, `expiration_date`, `status`, `occupancytype`, `address`, `property_id`, `parcel_id`, and coordinates. |
| Violation number, status, date, type/code, description, location, and geography | **Verified** | Violations provide `case_no`, `status_dttm`, `status`, `code`, `description`, structured location fields, `sam_id`, latitude, and longitude. |
| Housing-complaint context and relevant topics such as heat, pests, utilities, maintenance | **Verified** | RentSmart contains `date`, `violation_type`, `description`, `address`, `neighborhood`, `zip_code`, `parcel`, `owner`, year/property type, and coordinates. Observed rows include `Heat - Excessive, Insufficient`, pest infestation, maintenance, electricity, and water-related records. |
| 311 case history, status, date, reason/topic, address, geography, and closure information | **Verified, with a schema-adapter requirement** | Legacy 311 has `case_enquiry_id`, open/closed dates, status, closure reason, title/reason/type, location, neighborhood, street/ZIP, latitude/longitude, and source. The new system has `case_id`, open/close dates, `case_topic`, `service_name`, department/team, status, closure reason/comments, full/structured address, ZIP, neighborhood, and coordinates. |
| 311 direct join to SAM or parcel | **Partially verified; use confidence matching** | Neither observed 311 schema exposes `sam_id`, `property_id`, or `parcel_id`. Match by normalized address + ZIP and validate with coordinates; route ranges, intersections, and low-confidence matches to a manual/neutral presentation. |
| Property context such as occupancy, unit count, age, heating type, parcel | **Verified; optional for MVP** | FY2026 Property Assessment includes `PID`, structured address, `LUC/LU_DESC`, `RES_UNITS`, `YR_BUILT`, `HEAT_TYPE`, owner/occupancy fields, and parcel-level information. It is published annually—not daily. Do not display owner data in the resident-facing MVP. |
| Case persistence, consent preferences, private notes, task status, packet history | **Not supplied by Boston data; intentionally supplied by HomeSafe** | These are the differentiated CockroachDB memory records. Boston public data should not and does not provide private resident context. |
| Automatic report filing, inspection assignment, city-staff action, or enforcement status updates | **Not publicly verified** | Treat any report or staff action in the MVP as a drafted, human-reviewed artifact inside HomeSafe. Do not claim City-system integration. |
| Proof that a problem was repaired | **Not available as a reliable public conclusion** | A permit can show work authorization/issuance; it cannot establish that a renter’s specific condition was remedied. The agent must state this caveat. |

## Detailed field verification

### 1. Live SAM Addresses — canonical entity and join hub

**Status: verified, and essential.** Boston’s live SAM Addresses dataset publishes a nightly-updated reference of Boston addresses. It contains the exact fields HomeSafe needs to establish a canonical address entity:

| Field group | Verified fields | HomeSafe use |
|---|---|---|
| Stable identifier | `SAM_ADDRESS_ID`, `BUILDING_ID` | Primary entity key for direct cross-dataset joins. |
| Address resolution | `FULL_ADDRESS`, street number/range/unit, full street name, ZIP, neighborhood | Address-entry validation and display. |
| Parcel linkage | `PARCEL_ID`, `MAP_PAR_ID` | Links property-level context and RentSmart parcel data. |
| Location | `POINT_X`, `POINT_Y`, WKT | Geospatial fallback for 311 matching. |
| Freshness | `created_date`, `last_edited_date`; dataset described as nightly updated | Allows retained snapshot freshness label. |

**Direct test #1 — violation to SAM.** A published Building and Property Violations record used `sam_id=132380`. Querying the City’s live SAM REST service for `SAM_ADDRESS_ID=132380` returned `FULL_ADDRESS=302 Sumner St`, `PARCEL_ID=0104910000`, and `BUILDING_ID=130883`.

**Direct test #2 — permit to SAM.** A published Approved Building Permit used `property_id=130392` for `181-183 State St`. Querying the SAM service for `SAM_ADDRESS_ID=130392` returned `FULL_ADDRESS=181-183 State St`, `PARCEL_ID=0303807000`, and `BUILDING_ID=136572`.

**Implementation decision:** Use `sam_address_id` as the `address_entity` primary external key. Preserve the raw address text and match method/confidence. The match model is not optional; it prevents a unit, range, or intersection record from being misleadingly attached to a precise residence.

### 2. Building and Property Violations — direct public enforcement context

**Status: verified and core to the MVP.** The dataset’s catalog notes explicitly state that `property_id` is equivalent to `sam_id`. The CSV currently exposes:

`case_no`, `ap_case_defn_key`, `status_dttm`, `status`, `code`, `value`, `description`, `violation_stno`, `violation_sthigh`, `violation_street`, `violation_suffix`, city/state/ZIP, `ward`, contact address, `sam_id`, latitude, longitude, and location.

It contains direct public evidence relevant to a factual timeline: case number, status, date, code, plain-language description, canonical address identifier, and geometry. Observed current examples include `Unsafe and Dangerous`, `Maintenance`, `Unsafe Structures`, and `Number of Exits or Exit Access`.

**Implementation decision:** Use `case_no` as the public source-record ID and join by `sam_id` with high confidence. Display status and description as public record. Never infer a current hazard merely from a historical record.

### 3. Approved Building Permits — remediation and construction context

**Status: verified and core to the MVP, with a strict caveat.** The CSV exposes:

`permitnumber`, `worktype`, `permittypedescr`, `description`, `comments`, `applicant`, declared valuation/fees, `issued_date`, `expiration_date`, `status`, `occupancytype`, square feet, address/city/state/ZIP, ward, `property_id`, `parcel_id`, and coordinates.

**Implementation decision:** Use `permitnumber` as source-record ID; join with `property_id → SAM_ADDRESS_ID`; and store `parcel_id` as corroborating linkage. Render permits as **“work/permit context”** with an automatically attached caveat: *“This public permit records authorized or issued work. It does not establish that a specific resident concern has been repaired or resolved.”*

### 4. RentSmart — high-value housing issue aggregation

**Status: verified and excellent for issue-type context.** RentSmart is expressly intended to help prospective tenants understand prior property issues, including housing and building violations, enforcement violations, housing complaints, sanitation requests, and civic maintenance requests. The published 2016–present data has these observed fields:

`date`, `violation_type`, `description`, `address`, `neighborhood`, `zip_code`, `parcel`, `owner`, `year_built`, `year_remodeled`, `property_type`, latitude, and longitude.

Observed current data includes issue descriptions for heat, utility disruption, pests, maintenance, ventilation, electrical issues, and unsatisfactory living conditions.

**Implementation decision:** Use it as a **housing-signal summary** and support `parcel` linkage to SAM `PARCEL_ID`. Do not expose owner information in the resident interface; do not create scores; and do not represent RentSmart rows as separately verified inspection outcomes unless the source says so. Since the observed CSV lacks a source case ID, do not deduplicate it against raw 311 records using a claim of exact identity—keep it as a separate source or use a transparent, low-confidence de-duplication rule.

### 5. 311 — service-request history and data transition

**Status: verified; requires a compatibility adapter.** Boston is transitioning its 311 backend and publishes two distinct schemas.

| Data version | Key verified fields | HomeSafe mapping |
|---|---|---|
| Legacy 311 | `case_enquiry_id`, `open_dt`, `sla_target_dt`, `closed_dt`, `case_status`, `closure_reason`, `case_title`, `reason`, `type`, department, location, neighborhood, street/ZIP, latitude/longitude, source | Map ID → `source_record_id`; topic/type → `issue_category`; open/closed → public-event time; location/coordinates → address candidate. |
| New 311 system | `case_id`, `open_date`, `case_topic`, `service_name`, assigned department/team, status, closure reason/comments, close/target date, `full_address`, street number/name, ZIP, neighborhood, latitude/longitude | Same canonical event fields; retain `source_system=boston_311_new`. |

**Implementation decision:** Build two ingestion adapters and one public-event schema. Join 311 to SAM with: (1) normalized full address + ZIP, (2) structured street-number/name + ZIP, then (3) coordinate proximity fallback. For intersections, ranges, and non-address locations, preserve the 311 source record but do not attach it to a residence with high confidence. In the actual hackathon demo, use curated fixture records in both schemas to show that the adapter works.

### 6. Property Assessment — optional property context

**Status: verified, but secondary.** The FY2026 assessment dataset exposes property/parcel identifiers and useful context including structured address, land-use class/description, residential unit count, construction year, remodeling year, building metrics, heating type, and owner/occupancy fields. It updates annually.

**Implementation decision:** For a weekend MVP, import a minimal subset: `PID`, `LU_DESC`, `RES_UNITS`, `YR_BUILT`, `HEAT_TYPE`, and non-sensitive property type. Avoid using or displaying owner, mailing address, property value, or owner-occupancy fields; they are neither necessary for HomeSafe’s core safety workflow nor worth the privacy/fairness distraction.

## Data-availability and access constraints

1. **Resource size:** Current published CSVs are substantial: RentSmart was observed at roughly 86 MB, property assessment at roughly 80 MB, SAM at roughly 121 MB, and permits at roughly 237 MB. The MVP should pre-ingest a filtered fixture/subset into CockroachDB. It should not fetch entire datasets synchronously for each user query.
2. **Automated retrieval:** The catalog API was accessible for package metadata, and the SAM ArcGIS REST query service returned direct matching data. Generic command-line download attempts against certain bulk CSVs and a CKAN datastore SQL endpoint encountered access controls during verification, while the published resources themselves were retrievable through the portal. Before presenting a live daily ingestion pipeline, test City-approved API/resource access from the deployed AWS environment. For the hackathon, demonstrate a dated data snapshot plus an idempotent ingestion script.
3. **Data freshness:** 311, RentSmart, violations, and SAM are described as daily/nightly; property assessment is annual. Store `retrieved_at` and surface freshness in the UI.
4. **Granularity:** Many sources are property- or address-level rather than unit-level. The system must show scope and not claim that a record applies to a specific apartment unless the source explicitly identifies it.
5. **Transition risk:** 311 is in an active migration. The canonical model and source system label are required, not optional.

## Revised, evidence-based MVP scope

### Build with real Boston data

1. **Address selection:** SAM address search, or a preloaded subset of SAM, to select a canonical address.
2. **Public timeline:** Building/property violations and permits joined directly through the verified SAM identifier.
3. **Housing context:** RentSmart records linked by parcel/address with an explicit source label.
4. **311 context:** Preloaded legacy and new-schema 311 fixture records joined only with a visible match confidence.
5. **Memory product:** Private synthetic resident notes, consent grants, task state, agent retrieval logs, and evidence-packet versions stored in CockroachDB.
6. **Provenance and explanation:** A `Why I remember this` panel containing raw source link, record identifier, update/retrieval timestamp, memory category, consent status, match confidence, and caveat.

### Do not claim or build in the MVP

1. Live City report filing or case-status updates.
2. City inspector assignment, enforcement action, landlord notification, or workflow integration.
3. Unit-specific matching from property-level records without explicit source support.
4. Owner/landlord ratings or legal/habitability determinations.
5. A public conclusion that a permit or closure proves a repair occurred.
6. A production guarantee of daily ingestion until deployed-environment access is tested.

## Final conclusion

The core HomeSafe idea is now **data-validated**, not merely plausible. Boston provides more than enough real, joinable public data for an impressive evidence timeline, and two direct identifier tests show that the address graph is technically credible. The winning build should lean into that verified advantage: violations and permits joined through SAM; RentSmart for rich housing-signal context; 311 handled carefully through a compatibility adapter; and CockroachDB responsible for the private, persistent consented memory that public datasets should never contain.

## Sources

[1] CockroachDB × AWS Hackathon: https://cockroachdb-ai.devpost.com/
[2] 311 Service Requests: https://data.boston.gov/dataset/311-service-requests
[3] Building and Property Violations catalog/API metadata: https://data.boston.gov/dataset/building-and-property-violations1
[4] Building and Property Violations CSV: https://data.boston.gov/dataset/705244a6-70a6-4ff8-ab8e-56441aff18e7/resource/800a2663-1d6a-46e7-9356-bedb70f5332c/download/tmpwkewfc3d.csv
[5] RentSmart: https://data.boston.gov/dataset/rentsmart
[6] RentSmart 2016–present CSV: https://data.boston.gov/dataset/f506e000-b08c-4500-97c7-9f36e7ac125a/resource/dc615ff7-2ff3-416a-922b-f0f334f085d0/download/tmpd2x943vy.csv
[7] Approved Building Permits: https://data.boston.gov/dataset/approved-building-permits
[8] Approved Building Permits CSV: https://data.boston.gov/dataset/cd1ec3ff-6ebf-4a65-af68-8329eceab740/resource/6ddcd912-32a0-43df-9908-63574f8c7e77/download/tmpaezr9hww.csv
[9] Live SAM Addresses: https://data.boston.gov/dataset/live-street-address-management-sam-addresses
[10] Live SAM ArcGIS service: https://gisportal.boston.gov/arcgis/rest/services/SAM/Live_SAM_Address/FeatureServer/0
[11] Property Assessment: https://data.boston.gov/dataset/property-assessment
[12] FY2026 Property Assessment CSV: https://data.boston.gov/dataset/e02c44d2-3c64-459c-8fe2-e1ce5f38a035/resource/ee73430d-96c0-423e-ad21-c4cfb54c8961/download/fy2026-property-assessment-data_rev.csv
