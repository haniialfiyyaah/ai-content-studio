import { describe, expect, it } from "vitest";
import {
  GenerationCompleteSchema,
  chosen,
  computeSlots,
  describeSchedule,
  isValidSelection,
  inferContentCount,
  readiness,
  zonedToUtc,
} from "./index";

describe("zonedToUtc", () => {
  it("converts Jakarta wall time (UTC+7)", () => {
    expect(zonedToUtc(2026, 11, 23, 10, 0, "Asia/Jakarta").toISOString()).toBe("2026-11-23T03:00:00.000Z");
  });
  it("handles a DST zone", () => {
    expect(zonedToUtc(2026, 7, 1, 9, 30, "America/New_York").toISOString()).toBe("2026-07-01T13:30:00.000Z");
  });
});

describe("computeSlots", () => {
  const schedule = { timezone: "Asia/Jakarta", days: ["mon", "thu"] as ("mon" | "thu")[], time: "10:00", startDate: "2026-11-20" };

  it("emits slots only on chosen weekdays, in order", () => {
    const slots = computeSlots(schedule, 3, new Date("2026-11-01T00:00:00Z"));
    expect(slots.map((s) => s.toISOString())).toEqual([
      "2026-11-23T03:00:00.000Z", // Mon
      "2026-11-26T03:00:00.000Z", // Thu
      "2026-11-30T03:00:00.000Z", // Mon
    ]);
  });

  it("skips slots that are already in the past", () => {
    const slots = computeSlots(schedule, 1, new Date("2026-11-23T05:00:00Z"));
    expect(slots[0].toISOString()).toBe("2026-11-26T03:00:00.000Z");
  });

  it("describes a schedule", () => {
    expect(describeSchedule(schedule)).toBe("Mon, Thu · 10:00");
    expect(describeSchedule({})).toBe("Not scheduled");
  });
});

describe("content selection", () => {
  const options = { title: ["A", "B", "C"], hook: ["h"], script: ["s"], caption: ["c"], hashtags: ["#x"] };

  it("returns the chosen option, clamped", () => {
    expect(chosen(options, { title: 1 }, "title")).toBe("B");
    expect(chosen(options, { title: 9 }, "title")).toBe("C");
    expect(chosen(options, {}, "title")).toBe("A");
  });

  it("validates indices", () => {
    expect(isValidSelection(options, "title", 2)).toBe(true);
    expect(isValidSelection(options, "title", 3)).toBe(false);
    expect(isValidSelection(options, "hook", -1)).toBe(false);
  });
});

describe("readiness", () => {
  const base = { status: "draft" as const, contentCount: 4, approvedCount: 4, hasSchedule: true, youtubeConnected: true };

  it("allows activation only when every step is done", () => {
    expect(readiness(base).canActivate).toBe(true);
    // Skipped (pending) content doesn't block activation; zero approved does.
    expect(readiness({ ...base, approvedCount: 3 }).canActivate).toBe(true);
    expect(readiness({ ...base, approvedCount: 0 }).canActivate).toBe(false);
    expect(readiness({ ...base, hasSchedule: false }).canActivate).toBe(false);
    expect(readiness({ ...base, youtubeConnected: false }).canActivate).toBe(false);
    expect(readiness({ ...base, status: "live" }).canActivate).toBe(false);
  });
});

describe("GenerationCompleteSchema", () => {
  it("accepts a well-formed payload and defaults optional fields", () => {
    const parsed = GenerationCompleteSchema.parse({
      runId: "8f0c6f8e-6a3a-4b0e-9a7e-0d1c2b3a4f5e",
      project: { title: "Cats", creativeKit: { tone: "warm" } },
      contents: [
        {
          options: { title: ["t"], hook: ["h"], script: ["s"], caption: ["c"], hashtags: ["#a"] },
          scenes: [{ heading: "Open" }],
          videoPrompt: "A cat",
        },
      ],
    });
    expect(parsed.project?.creativeKit.language).toBe("English");
    expect(parsed.contents[0].scenes[0].seconds).toBe(5);
  });

  it("rejects empty option lists", () => {
    expect(() =>
      GenerationCompleteSchema.parse({
        runId: "8f0c6f8e-6a3a-4b0e-9a7e-0d1c2b3a4f5e",
        contents: [{ options: { title: [], hook: ["h"], script: ["s"], caption: ["c"], hashtags: ["#"] }, scenes: [{ heading: "x" }], videoPrompt: "p" }],
      }),
    ).toThrow();
  });
});

describe("beats", () => {
  it("defaults old scenes to image beats and coerces unknown layouts", () => {
    const parsed = GenerationCompleteSchema.parse({
      runId: "8f0c6f8e-6a3a-4b0e-9a7e-0d1c2b3a4f5e",
      contents: [
        {
          options: { title: ["t"], hook: ["h"], script: ["s"], caption: ["c"], hashtags: ["#a"] },
          scenes: [{ heading: "Old" }, { heading: "New", layout: "code", code: "const a = 1", transition: "zoom" }, { heading: "X", layout: "weird" }],
          videoPrompt: "p",
        },
      ],
    });
    const [old, beat, weird] = parsed.contents[0].scenes;
    expect(old.layout).toBe("image");
    expect(beat.layout).toBe("code");
    expect(beat.transition).toBe("zoom");
    expect(weird.layout).toBe("image");
    expect(parsed.contents[0].format).toBe("explainer");
  });
});

describe("inferContentCount", () => {
  it("reads the number of ideas from the prompt", () => {
    expect(inferContentCount("make 1 video about cats")).toBe(1);
    expect(inferContentCount("three short ideas for coding tips")).toBe(3);
    expect(inferContentCount("buat 5 konten tentang kopi")).toBe(5);
    expect(inferContentCount("weekly cat stories for kids")).toBeNull();
  });
});
