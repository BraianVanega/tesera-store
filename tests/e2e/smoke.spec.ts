import { expect, test } from "@playwright/test";

test("la home levanta con título neutro", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Tésera/);
  await expect(page.locator("html")).toHaveAttribute("lang", "es-AR");
});
