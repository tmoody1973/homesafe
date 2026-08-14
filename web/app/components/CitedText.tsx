import type { RenderedItem } from "../../../src/receipt/render";

// Spec §4: the model handles opaque refs and never sees a source link, so it
// cannot invent a plausible-looking one. The other half of that bargain is
// this file — the interface has to turn the ref back into something a person
// can use.
//
// The first version shipped the ref straight through, and a resident read
// "[obs_f32f2537-2a59-4e07-9cfe-bef5d542c8a2]" in the middle of a sentence
// about their own heating. A citation nobody can follow is not a citation.

const REF_PATTERN = /\b(?:evt|obs|mem)_[A-Za-z0-9-]{8,}/g;

type Props = {
  readonly text: string;
  readonly items: readonly RenderedItem[];
};

function numbersByRef(items: readonly RenderedItem[]): Map<string, number> {
  return new Map(items.map((item, index) => [item.ref, index + 1]));
}

// Splits the prose on ref tokens and keeps both halves, so the numbers land
// where the model put them rather than being collected at the end.
function segments(text: string): string[] {
  return text.split(new RegExp(`(${REF_PATTERN.source})`, "g"));
}

export function CitedText({ text, items }: Props) {
  const numbers = numbersByRef(items);
  return (
    <p className="leading-relaxed">
      {segments(text).map((segment, index) => {
        const number = numbers.get(segment);
        if (number === undefined) return <span key={index}>{segment}</span>;
        return (
          <sup className="mx-0.5 font-semibold" key={index} title={items[number - 1]!.headline}>
            {number}
          </sup>
        );
      })}
    </p>
  );
}
