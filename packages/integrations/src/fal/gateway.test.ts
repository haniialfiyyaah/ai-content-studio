import { describe, expect, it } from "vitest";
import { executeFalRender } from "./gateway";

describe("executeFalRender", () => {
  it("returns fixture when fixtureMode is true", async () => {
    const result = await executeFalRender(
      { prompt: "a teal product shot" },
      { fixtureMode: true, apiKey: "should-not-be-used" },
    );

    expect(result.fixture).toBe(true);
    expect(result.status).toBe("completed");
    expect(result.providerRequestId).toMatch(/^fal-fixture-/);
  });

  it("auto-fixtures when no API key is configured", async () => {
    const prev = process.env.ACS_FAL_FIXTURE_MODE;
    delete process.env.ACS_FAL_FIXTURE_MODE;

    const result = await executeFalRender(
      { prompt: "no key path" },
      { fixtureMode: false, apiKey: null },
    );

    expect(result.fixture).toBe(true);

    if (prev === undefined) delete process.env.ACS_FAL_FIXTURE_MODE;
    else process.env.ACS_FAL_FIXTURE_MODE = prev;
  });
});
