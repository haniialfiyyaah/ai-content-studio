import { describe, expect, it } from "vitest";
import { evenCaptions, wordsFromAlignment } from "./fal";

describe("captions", () => {
  it("groups character alignment into words", () => {
    const chars = "Hi cat".split("");
    const words = wordsFromAlignment({
      characters: chars,
      character_start_times_seconds: chars.map((_, i) => i * 0.1),
      character_end_times_seconds: chars.map((_, i) => i * 0.1 + 0.09),
    });
    expect(words).toEqual([
      { text: "Hi", start: 0, end: expect.closeTo(0.19, 5) },
      { text: "cat", start: expect.closeTo(0.3, 5), end: expect.closeTo(0.59, 5) },
    ]);
  });

  it("times captions evenly without narration", () => {
    const words = evenCaptions("one two three");
    expect(words).toHaveLength(3);
    expect(words[1].start).toBeGreaterThan(words[0].start);
  });
});
