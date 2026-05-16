import { expect, test } from "@playwright/test";

const NON_PACKAGE_CATEGORIES = [
  "Trademarks",
  "Domains",
  "Social",
  "App stores",
  "Code",
] as const;

async function selectPackagesOnly(page: import("@playwright/test").Page): Promise<void> {
  for (const label of NON_PACKAGE_CATEGORIES) {
    await page.getByRole("button", { name: label, exact: true }).click();
  }
}

test.describe("/check page", () => {
  test("nonsense name is LIKELY AVAILABLE across package registries", async ({ page }) => {
    await page.goto("/check");
    await selectPackagesOnly(page);
    await page.getByTestId("check-input").fill("nonexistentnamezzqxy123");
    await page.getByTestId("check-submit").click();

    const verdict = page.getByTestId("verdict-badge");
    await expect(verdict).toBeVisible({ timeout: 60_000 });
    await expect(verdict).toHaveText(/LIKELY AVAILABLE/, { timeout: 60_000 });
  });

  test("'react' is LIKELY TAKEN — npm has it", async ({ page }) => {
    await page.goto("/check");
    await selectPackagesOnly(page);
    await page.getByTestId("check-input").fill("react");
    await page.getByTestId("check-submit").click();

    const verdict = page.getByTestId("verdict-badge");
    await expect(verdict).toBeVisible({ timeout: 60_000 });
    await expect(verdict).toHaveText(/LIKELY TAKEN/, { timeout: 60_000 });
  });
});
