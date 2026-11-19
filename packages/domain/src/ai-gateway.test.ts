import { describe, expect, it } from "vitest";
import { AppError, ErrorCodes } from "./errors";
import {
  assertAiPolicy,
  resolveOpenAiMode,
} from "./ai-gateway";

describe("resolveOpenAiMode", () => {
  it("returns preference mode and never overrides BYOK from connection", () => {
    expect(
      resolveOpenAiMode(
        { openaiMode: "byok" },
        { status: "disconnected" },
      ),
    ).toBe("byok");

    expect(
      resolveOpenAiMode(
        { openaiMode: "managed" },
        { status: "connected" },
      ),
    ).toBe("managed");
  });
});

describe("assertAiPolicy", () => {
  it("never silently falls back from byok to managed", () => {
    expect(() =>
      assertAiPolicy({
        mode: "byok",
        connectionStatus: "invalid",
        managedRemaining: 100,
      }),
    ).toThrow(AppError);

    try {
      assertAiPolicy({
        mode: "byok",
        connectionStatus: "disconnected",
        managedRemaining: 999,
      });
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe(ErrorCodes.BYOK_KEY_INVALID);
    }

    // Connected BYOK is allowed even with zero managed allowance.
    expect(
      assertAiPolicy({
        mode: "byok",
        connectionStatus: "connected",
        managedRemaining: 0,
      }),
    ).toEqual({ mode: "byok", allowed: true });
  });

  it("rejects managed mode when allowance is exhausted", () => {
    expect(() =>
      assertAiPolicy({
        mode: "managed",
        connectionStatus: null,
        managedRemaining: 0,
      }),
    ).toThrow(AppError);

    try {
      assertAiPolicy({
        mode: "managed",
        connectionStatus: null,
        managedRemaining: -1,
      });
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe(
        ErrorCodes.MANAGED_ALLOWANCE_EXHAUSTED,
      );
    }

    expect(
      assertAiPolicy({
        mode: "managed",
        connectionStatus: null,
        managedRemaining: 0.01,
      }),
    ).toEqual({ mode: "managed", allowed: true });
  });
});
