import { expect, test } from "@playwright/test";
import { expectNoA11yViolations } from "./axe";

test("home page links to the Input Glyph Creator", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { level: 1, name: "UIToolbox" }),
  ).toBeVisible();

  const link = page.getByRole("link", { name: /Input Glyph Creator/i });
  await expect(link).toBeVisible();

  await link.click();
  await expect(page).toHaveURL(/\/tools\/glyph-creator$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Input Glyph Creator" }),
  ).toBeVisible();
});

test("home page has no WCAG 2.1 AA violations", async ({ page }, testInfo) => {
  await page.goto("/");
  await expectNoA11yViolations(page, testInfo);
});

test("glyph-creator placeholder has no WCAG 2.1 AA violations", async ({
  page,
}, testInfo) => {
  await page.goto("/tools/glyph-creator");
  await expectNoA11yViolations(page, testInfo);
});
