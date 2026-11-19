import { describe, expect, it } from "vitest";
import {
  ACS_FAL_DEMO_MODEL,
  estimateElevenLabsDemoCost,
  estimateFalDemoCost,
} from "./media-defaults";

describe("estimateFalDemoCost", () => {
  it("prices ltx-video flat", () => {
    expect(estimateFalDemoCost({ model: ACS_FAL_DEMO_MODEL }).estimateUsd).toBe(
      0.02,
    );
  });

  it("prices h3-max-turbo per second", () => {
    expect(
      estimateFalDemoCost({
        model: "minimax/h3-max-turbo/text-to-video",
        durationSeconds: 5,
      }).estimateUsd,
    ).toBe(0.0938);
  });
});

describe("estimateElevenLabsDemoCost", () => {
  it("estimates flash by character count", () => {
    const result = estimateElevenLabsDemoCost({
      characters: 500,
      model: "eleven_flash_v2_5",
    });
    expect(result.estimateUsd).toBe(0.03);
  });
});
