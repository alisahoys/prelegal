import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

const preview = (page: Page) => page.locator("#nda-preview");

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Mutual NDA Creator" })).toBeVisible();
});

test("shows placeholders and today's date before anything is entered", async ({ page }) => {
  await expect(preview(page)).toContainText("[Governing Law]");
  await expect(preview(page)).toContainText("[Jurisdiction]");
  await expect(page.getByLabel("Effective date", { exact: true })).not.toHaveValue("");
});

test("fills the cover page and the standard terms from the form", async ({ page }) => {
  await page.getByLabel("Effective date", { exact: true }).fill("2026-10-19");
  await page.getByLabel("Governing law").fill("Delaware");
  await page.getByLabel("Jurisdiction").fill("courts located in New Castle, DE");
  await page.getByLabel("Print name").first().fill("Ada Lovelace");
  await page.getByLabel("Company").nth(1).fill("Babbage Ltd");

  const doc = preview(page);
  await expect(doc).toContainText("Governing Law: Delaware");
  await expect(doc).toContainText("October 19, 2026");
  await expect(doc.getByRole("cell", { name: "Ada Lovelace" })).toBeVisible();
  await expect(doc.getByRole("cell", { name: "Babbage Ltd" })).toBeVisible();
  await expect(doc).toContainText("the laws of the State of Delaware");
  await expect(doc).toContainText("courts located in New Castle, DE");
  await expect(doc).not.toContainText("[Governing Law]");
});

test("switches the MNDA and confidentiality terms", async ({ page }) => {
  const doc = preview(page);
  await page.getByLabel("MNDA term years").fill("3");
  await expect(doc).toContainText("3 years from the Effective Date");

  await page.getByLabel("Continues until terminated").check();
  await expect(doc).toContainText("continues until terminated in accordance with the terms of the MNDA");

  await page.getByLabel("In perpetuity").check();
  await expect(doc).toContainText("in perpetuity");
});

test("clamps year inputs to at least 1", async ({ page }) => {
  await page.getByLabel("MNDA term years").fill("0");
  await expect(page.getByLabel("MNDA term years")).toHaveValue("1");
});

test("escapes HTML and pipes typed into the form", async ({ page }) => {
  await page.getByLabel("Print name").first().fill("<b>Bold</b> | Pipe");
  const doc = preview(page);
  await expect(doc.locator("b")).toHaveCount(0);
  await expect(doc.getByRole("cell", { name: "<b>Bold</b> | Pipe" })).toBeVisible();
});

test("downloads the filled-in document as Markdown", async ({ page }) => {
  await page.getByLabel("Governing law").fill("Delaware");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download Markdown" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("Mutual-NDA.md");
  const md = readFileSync((await download.path())!, "utf8");
  expect(md).toContain("Governing Law: Delaware");
  expect(md).toContain("the laws of the State of **Delaware**");
  expect(md).not.toContain("coverpage_link");
});

test("opens the print flow and renders a valid PDF", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.evaluate(() => {
    window.print = () => document.body.setAttribute("data-print-requested", "true");
  });

  await page.getByRole("button", { name: "Print / Save PDF" }).click();
  await expect(page.locator("body")).toHaveAttribute("data-print-requested", "true");

  const pdf = await page.pdf();
  expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  expect(pdf.length).toBeGreaterThan(10_000);
  expect(errors).toEqual([]);
});
