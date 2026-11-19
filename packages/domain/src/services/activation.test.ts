import { describe, expect, it } from "vitest";
import { targetStatusForLifecycleAction } from "./activation";

describe("targetStatusForLifecycleAction", () => {
  it("maps activate and resume to active", () => {
    expect(targetStatusForLifecycleAction("activate")).toBe("active");
    expect(targetStatusForLifecycleAction("resume")).toBe("active");
  });

  it("maps pause and stop to their target statuses", () => {
    expect(targetStatusForLifecycleAction("pause")).toBe("paused");
    expect(targetStatusForLifecycleAction("stop")).toBe("stopped");
  });
});
