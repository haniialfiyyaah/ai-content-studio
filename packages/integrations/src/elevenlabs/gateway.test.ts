import { describe, expect, it } from "vitest";
import { executeElevenLabsTts } from "./gateway";

describe("executeElevenLabsTts", () => {
  it("returns fixture when fixtureMode is true", async () => {
    const result = await executeElevenLabsTts(
      { text: "Hello from Content Studio" },
      { fixtureMode: true, apiKey: "should-not-be-used" },
    );

    expect(result.fixture).toBe(true);
    expect(result.status).toBe("completed");
    expect(result.characters).toBe("Hello from Content Studio".length);
    expect(result.providerRequestId).toMatch(/^eleven-fixture-/);
  });
});
