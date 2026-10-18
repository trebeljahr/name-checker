import { expect, test } from "@playwright/test";

test.describe("static client with the API on the same origin", () => {
  test("/api/* reaches the API server", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { status: string; databaseId: string };
    expect(body.status).toBe("ok");
    expect(body.databaseId).toMatch(/^[0-9a-f-]{36}$/);
  });

  test("a /check/<name> permalink loads the name from the address bar", async ({ page }) => {
    // Only the page shell is under test here; skip the provider checks.
    await page.route("**/api/check/**", (route) => route.abort());
    await page.goto("/check/nonexistentnamezzqxy123");
    await expect(page.getByTestId("check-input")).toHaveValue("nonexistentnamezzqxy123");
    await expect(page).toHaveTitle(/nonexistentnamezzqxy123 — name check/);
  });

  test("/compare?names= fills the form", async ({ page }) => {
    await page.route("**/api/check/**", (route) => route.abort());
    await page.goto("/compare?names=alpha,beta");
    await expect(page.getByTestId("compare-input")).toHaveValue(/alpha, ?beta/);
  });

  test("/account sends a signed-out visitor to sign in", async ({ page }) => {
    await page.goto("/account");
    await expect(page).toHaveURL(/\/sign-in\/?$/);
  });
});
