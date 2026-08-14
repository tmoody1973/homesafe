// A pinned map from coordinates we already store — Boston's SAM data carries
// lat/lon for every address, so no geocoder, no API key, no map library.
// OpenStreetMap's embed iframe does the rendering; the surrounding page stays
// dependency-free.

type Props = {
  readonly lat: number;
  readonly lon: number;
  readonly label: string;
};

const SPAN_DEGREES = 0.004;

function embedUrl(lat: number, lon: number): string {
  const bbox = [
    lon - SPAN_DEGREES,
    lat - SPAN_DEGREES,
    lon + SPAN_DEGREES,
    lat + SPAN_DEGREES,
  ].join(",");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lon}`;
}

export function AddressMap({ lat, lon, label }: Props) {
  return (
    <figure className="flex flex-col gap-1">
      <iframe
        className="h-56 w-full rounded-xl border-0"
        loading="lazy"
        src={embedUrl(lat, lon)}
        title={`Map showing ${label}`}
      />
      <figcaption className="text-xs text-muted">
        {label} — map ©{" "}
        <a
          className="underline"
          href="https://www.openstreetmap.org/copyright"
          rel="noopener noreferrer"
          target="_blank"
        >
          OpenStreetMap
        </a>
      </figcaption>
    </figure>
  );
}
