import { describe, expect, it } from "vitest";
import { AppError } from "./errors";
import {
  assertProjectTransition,
  isAutomationEligible,
} from "./project-transitions";

describe("project transitions", () => {
  it("allows draft to active", () => {
    expect(() => assertProjectTransition("draft", "active")).not.toThrow();
  });

  it("blocks archived reactivation via this helper", () => {
    expect(() => assertProjectTransition("archived", "active")).toThrow(AppError);
  });

  it("only treats active as automation-eligible", () => {
    expect(isAutomationEligible("active")).toBe(true);
    expect(isAutomationEligible("paused")).toBe(false);
    expect(isAutomationEligible("draft")).toBe(false);
  });
});
