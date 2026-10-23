import { expect, test } from "@playwright/test";
test("print flow paginates long modifications", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Email").fill("prototype@example.test");
  await page.getByLabel("Password").fill("unused-password");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Agreement Creator" })).toBeVisible();
  await page.getByLabel("MNDA modifications").fill(
    Array.from({ length: 90 }, (_, index) => `Modification ${index + 1}: the parties agree to preserve all obligations and protections described in this agreement.`).join("\n\n"),
  );

  const pdf = await page.pdf();
  expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  expect(pdf.length).toBeGreaterThan(10_000);
});
