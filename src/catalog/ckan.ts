// Boston's published CSV filenames rotate on every dataset refresh — the
// current violations file is literally named `tmpwkewfc3d.csv`. Hard-coding one
// produces an ingest that works today and silently finds nothing next week,
// which for HomeSafe reads as "no records at this address" rather than as an
// error. So every ingest asks data.boston.gov what its current URL is.
//
// CKAN is the software behind data.boston.gov. `package_show` answers
// "what files are in this dataset right now".

const CATALOG_BASE = "https://data.boston.gov/api/3/action/package_show";
const CSV_FORMAT = "CSV";

export const BOSTON_PACKAGES = {
  sam: "live-street-address-management-sam-addresses",
  violations: "building-and-property-violations1",
  permits: "approved-building-permits",
  rentsmart: "rentsmart",
  serviceRequests: "311-service-requests",
} as const;

export type CkanResource = {
  readonly id: string;
  readonly name: string;
  readonly format: string;
  readonly url: string;
};

function describe(resources: CkanResource[]): string {
  if (resources.length === 0) return "(the catalog returned no resources)";
  return resources.map((r) => `${r.name} (${r.format})`).join(", ");
}

export function pickCsvResource(
  resources: CkanResource[],
  namePattern: RegExp,
): CkanResource {
  const match = resources.find(
    (r) => r.format.toUpperCase() === CSV_FORMAT && namePattern.test(r.name),
  );
  if (!match) {
    // Naming what WAS found turns a silent empty ingest into a fixable error.
    throw new Error(
      `no CSV resource matching ${namePattern} — available: ${describe(resources)}`,
    );
  }
  return match;
}

type CatalogResponse = { result?: { resources?: CkanResource[] } };

export async function resolveResourceUrl(
  packageId: string,
  namePattern: RegExp,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const response = await fetchImpl(`${CATALOG_BASE}?id=${packageId}`);
  if (!response.ok) {
    throw new Error(
      `catalog lookup for ${packageId} failed: ${response.status} ${response.statusText}`,
    );
  }
  const body = (await response.json()) as CatalogResponse;
  return pickCsvResource(body.result?.resources ?? [], namePattern).url;
}
