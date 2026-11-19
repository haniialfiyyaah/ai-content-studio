import { describe, expect, it } from "vitest";
import {
  resolveRemotionRenderBackend,
  remotionWorkerRequirement,
} from "./render-backend";

describe("resolveRemotionRenderBackend", () => {
  it("defaults to browser", () => {
    expect(resolveRemotionRenderBackend({})).toBe("browser");
  });

  it("accepts known backends", () => {
    expect(
      resolveRemotionRenderBackend({
        ACS_REMOTION_RENDER_BACKEND: "legacy_worker",
      }),
    ).toBe("legacy_worker");
    expect(
      resolveRemotionRenderBackend({
        ACS_REMOTION_RENDER_BACKEND: "vercel_sandbox",
      }),
    ).toBe("vercel_sandbox");
  });

  it("falls back on unknown values", () => {
    expect(
      resolveRemotionRenderBackend({ ACS_REMOTION_RENDER_BACKEND: "lambda" }),
    ).toBe("browser");
  });
});

describe("remotionWorkerRequirement", () => {
  it("does not require worker for browser path", () => {
    const notice = remotionWorkerRequirement("browser");
    expect(notice.workerRequired).toBe(false);
  });

  it("requires worker only for legacy_worker", () => {
    expect(remotionWorkerRequirement("legacy_worker").workerRequired).toBe(
      true,
    );
  });
});
