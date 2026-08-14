import { describe, expect, test } from "bun:test";
import { EMBEDDING_WIDTH, embed } from "../../src/memory/embed";

// Every assertion here runs against a real Titan call. A mocked embedding
// would only prove this file is self-consistent, which is exactly the class
// of defect that cost plan 1 four bugs.

function cosineSimilarity(left: number[], right: number[]): number {
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index]! * right[index]!;
    leftMagnitude += left[index]! ** 2;
    rightMagnitude += right[index]! ** 2;
  }
  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

describe("embed", () => {
  test("returns exactly 1024 floats", async () => {
    const vector = await embed("no heat in my apartment");
    expect(vector).toHaveLength(EMBEDDING_WIDTH);
    expect(vector.every((value) => Number.isFinite(value))).toBe(true);
  });

  test("scores related sentences closer than unrelated ones", async () => {
    const [heatAtNight, noHeat, unrelated] = await Promise.all([
      embed("heat cutting out overnight"),
      embed("no heat in my apartment"),
      embed("the bicycle rack on the corner needs repainting"),
    ]);
    const related = cosineSimilarity(heatAtNight!, noHeat!);
    const unrelatedPair = cosineSimilarity(heatAtNight!, unrelated!);
    expect(related).toBeGreaterThan(unrelatedPair);
  });

  test("throws on empty text rather than returning a zero vector", async () => {
    expect(embed("   ")).rejects.toThrow(/empty/i);
  });
});
