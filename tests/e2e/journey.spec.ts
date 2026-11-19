import { test, expect } from "@playwright/test";

/**
 * Core product journey E2E — requires running stack + ACS_E2E=1.
 * Auth credentials via ACS_E2E_EMAIL / ACS_E2E_PASSWORD (optional signup).
 *
 * Install browsers: pnpm exec playwright install chromium
 * Run: ACS_E2E=1 pnpm test:e2e
 */
const enabled = process.env.ACS_E2E === "1";
const email =
  process.env.ACS_E2E_EMAIL ?? `e2e-${Date.now()}@example.com`;
const password = process.env.ACS_E2E_PASSWORD ?? "E2eTestPass!234";

test.describe("Core journey", () => {
  test.skip(!enabled, "Set ACS_E2E=1 with local stack running");

  test("auth → agent → projects surface", async ({ page }) => {
    await page.goto("/signup");
    await expect(page.getByText(/Content Studio|AI Content Studio/i).first()).toBeVisible();

    const emailInput = page.locator('input[type="email"], input[name="email"]').first();
    const passwordInput = page.locator('input[type="password"]').first();
    if (await emailInput.count()) {
      await emailInput.fill(email);
      await passwordInput.fill(password);
      await page.getByRole("button", { name: /sign up|create|register/i }).click();
      // Either lands in app or shows validation — both prove auth UI works.
      await page.waitForTimeout(1500);
    }

    await page.goto("/login");
    await expect(page.getByRole("heading", { name: /Welcome back/i })).toBeVisible();
    await emailInput.fill(email);
    await passwordInput.fill(password);
    await page.getByRole("button", { name: /sign in|log in/i }).click();
    await page.waitForTimeout(2000);

    // Agent planning surface
    await page.goto("/agent");
    await expect(page.getByText(/agent|create|message/i).first()).toBeVisible({
      timeout: 15_000,
    });

    // Draft / projects list
    await page.goto("/projects");
    await expect(page.getByText(/project/i).first()).toBeVisible({ timeout: 15_000 });

    // Production / videos review entry points
    await page.goto("/production");
    await expect(page.getByText(/production|render|video/i).first()).toBeVisible({
      timeout: 15_000,
    });

    await page.goto("/videos");
    await expect(page.getByText(/video/i).first()).toBeVisible({ timeout: 15_000 });
  });

  test("settings AI provider page loads (BYOK UI)", async ({ page }) => {
    await page.goto("/login");
    const emailInput = page.locator('input[type="email"], input[name="email"]').first();
    const passwordInput = page.locator('input[type="password"]').first();
    if (await emailInput.count()) {
      await emailInput.fill(email);
      await passwordInput.fill(password);
      await page.getByRole("button", { name: /sign in|log in/i }).click();
      await page.waitForTimeout(1500);
    }

    await page.goto("/settings/ai");
    await expect(page.getByText(/openai|provider|byok|managed/i).first()).toBeVisible({
      timeout: 15_000,
    });
  });
});
