import { test, expect } from "@playwright/test";

/**
 * Smoke E2E — requires `pnpm dev` + local Supabase.
 * Marked skip unless ACS_E2E=1 so default CI does not require the stack.
 */
const enabled = process.env.ACS_E2E === "1";

test.describe("AI Content Studio smoke", () => {
  test.skip(!enabled, "Set ACS_E2E=1 with local stack running");

  test("login page renders brand", async ({ page }) => {
    await page.goto("http://localhost:3000/login");
    await expect(page.getByText("AI Content Studio")).toBeVisible();
    await expect(page.getByRole("heading", { name: /Welcome back/i })).toBeVisible();
  });
});
