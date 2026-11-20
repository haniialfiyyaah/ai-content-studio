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

import { sceneImagePrompt } from "./fal";

describe("sceneImagePrompt", () => {
  it("keeps overlay layouts calm with space for text, and anchors identity", () => {
    const p = sceneImagePrompt({ visual: "two puzzle pieces that both fit", layout: "code", visualStyle: "flat vector", palette: "coral, navy", recurringSubject: "a tabby kitten", fallback: "x" });
    expect(p).toContain("upper half is mostly empty");
    expect(p).toContain("a tabby kitten");
    expect(p).toContain("coral, navy");
    expect(p).toContain("No text");
  });
  it("makes hook beats bold", () => {
    expect(sceneImagePrompt({ visual: "kitten on a keyboard", layout: "hook", fallback: "x" })).toContain("Bold subject large in frame");
  });
});

import { rankVoices } from "./fal";

describe("rankVoices", () => {
  const voices = [
    { voice_id: "m1", name: "Adam", category: "premade", labels: { gender: "male", age: "middle aged", description: "deep" } },
    { voice_id: "f1", name: "Bella", category: "premade", labels: { gender: "female", age: "young", description: "warm" } },
    { voice_id: "f2", name: "Grace", category: "premade", labels: { gender: "female", age: "old", description: "calm" } },
  ];
  it("prefers gender and descriptive matches", () => {
    expect(rankVoices(voices, "warm friendly female narrator for kids")[0].voice_id).toBe("f1");
    expect(rankVoices(voices, "deep confident male voice")[0].voice_id).toBe("m1");
    expect(rankVoices(voices, "calm elderly woman storyteller")[0].voice_id).toBe("f2");
  });
});
