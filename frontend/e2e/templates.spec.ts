import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page) {
  await page.goto("/");
  await page.getByLabel("Email").fill("prototype@example.test");
  await page.getByLabel("Password").fill("unused-password");
  await page.getByRole("button", { name: "Continue" }).click();
}

const consent = "I understand and agree to send this information for AI assistance.";

test("selects templates, preserves edits, previews and downloads the current draft", async ({ page }) => {
  await signIn(page);
  const selector = page.getByLabel("Document template");
  await selector.selectOption("data-processing-agreement");
  await expect(page.getByLabel("Agreement Markdown")).toContainText("Data Processing Agreement");
  await page.getByLabel("Agreement Markdown").fill("# My DPA\n\nEdited terms.");
  await expect(page.locator("#nda-preview")).toContainText("Edited terms.");
  await selector.selectOption("service-level-agreement");
  await page.getByLabel("Agreement Markdown").fill("# My SLA");
  await selector.selectOption("data-processing-agreement");
  await expect(page.getByLabel("Agreement Markdown")).toHaveValue("# My DPA\n\nEdited terms.");

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download Markdown" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("DPA.md");
  const stream = await download.createReadStream();
  let contents = "";
  for await (const chunk of stream!) contents += chunk.toString();
  expect(contents).toBe("# My DPA\n\nEdited terms.");
});

test("sanitizes manually edited Markdown before preview", async ({ page }) => {
  await signIn(page);
  await page.getByLabel("Document template").selectOption("ai-addendum");
  await page.getByLabel("Agreement Markdown").fill('# Safe\n\n<img src="x" onerror="window.__xss = true"><script>window.__xss = true</script>[bad](javascript:window.__xss = true)');
  await expect(page.locator("#nda-preview h1")).toHaveText("Safe");
  await expect(page.locator('#nda-preview img, #nda-preview script, #nda-preview a[href^="javascript:"]')).toHaveCount(0);
  expect(await page.evaluate(() => (window as Window & { __xss?: boolean }).__xss)).toBeUndefined();
});

test("renders every catalog template with its matching editor", async ({ page }) => {
  await signIn(page);
  const selector = page.getByLabel("Document template");
  const options = await selector.locator("option").evaluateAll((elements) => elements.map((element) => ({ id: (element as HTMLOptionElement).value, name: element.textContent ?? "" })));
  expect(options).toHaveLength(12);
  for (const option of options) {
    await selector.selectOption(option.id);
    if (option.id === "mutual-nda-standard-terms") {
      await expect(page.locator("#nda-preview")).toContainText("Mutual Non-Disclosure Agreement");
      await expect(page.getByLabel("Purpose")).toBeVisible();
    } else {
      await expect(page.getByLabel("Agreement Markdown")).toBeVisible();
      await expect(page.locator("#nda-preview")).toContainText(option.name.split(" (")[0]);
    }
  }
});

test("requires explicit confirmation to switch to an AI-suggested template", async ({ page }) => {
  await page.route("**/api/nda/chat", async (route) => {
    const payload = await route.request().postDataJSON();
    expect(payload.currentTemplateId).toBe("mutual-nda-standard-terms");
    expect(payload.currentData).toBeTruthy();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        reply: "We do not have an employment agreement. A Design Partner Agreement is an alternative, not a legal equivalent.",
        updates: null,
        suggestions: [{ templateId: "design-partner-agreement", reason: "Closest available catalog option." }],
        needsMoreInformation: true,
        nextQuestion: "Would you like to review this option?",
      }),
    });
  });
  await signIn(page);
  await page.getByLabel(consent).check();
  await page.getByLabel("Message").fill("I need an employment agreement.");
  await page.getByRole("button", { name: "Send to assistant" }).click();
  await expect(page.getByText("Would you like to review this option?")).toBeVisible();
  await expect(page.getByLabel("Document template")).toHaveValue("mutual-nda-standard-terms");
  await expect(page.getByLabel("Message")).toBeFocused();
  await page.getByRole("button", { name: "Use Design Partner Agreement" }).click();
  await expect(page.getByLabel("Document template")).toHaveValue("design-partner-agreement");
  await expect(page.getByLabel("Agreement Markdown")).toContainText("Design Partner Agreement");
});
