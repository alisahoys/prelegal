import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page) {
  await page.goto("/");
  await page.getByLabel("Email").fill("prototype@example.test");
  await page.getByLabel("Password").fill("unused-password");
  await page.getByRole("button", { name: "Continue" }).click();
}

const consent = "I understand and agree to send this information for AI assistance.";

test("requires consent and applies AI suggestions without overwriting manual edits", async ({ page }) => {
  await page.route("**/api/nda/chat", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ reply: "I found the purpose. What state should govern?", updates: { purpose: "Evaluating a partnership", governingLaw: "Delaware" } }),
    });
  });
  await signIn(page);
  await expect(page.getByRole("button", { name: "Send to assistant" })).toBeDisabled();
  await page.getByLabel(consent).check();
  await page.getByLabel("Governing law").fill("My law");
  await page.getByLabel("Message").fill("We are evaluating a partnership.");
  await page.getByRole("button", { name: "Send to assistant" }).click();

  await expect(page.getByLabel("Purpose")).toHaveValue("Evaluating a partnership");
  await expect(page.getByLabel("Governing law")).toHaveValue("My law");
  await expect(page.getByText("Suggestion for governingLaw: Delaware")).toBeVisible();
  await page.getByRole("button", { name: "Apply suggestion" }).click();
  await expect(page.getByLabel("Governing law")).toHaveValue("Delaware");
  await expect(page.locator("#nda-preview")).toContainText("Evaluating a partnership");
});

test("ignores a pending response after sign-out", async ({ page }) => {
  let complete!: (response: { status: number; contentType: string; body: string }) => void;
  await page.route("**/api/nda/chat", async (route) => {
    await new Promise<void>((resolve) => {
      complete = (response) => {
        void route.fulfill(response).then(resolve);
      };
    });
  });
  await signIn(page);
  await page.getByLabel(consent).check();
  await page.getByLabel("Message").fill("Please set the purpose.");
  await page.getByRole("button", { name: "Send to assistant" }).click();
  await expect(page.getByText("Thinking…")).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.getByLabel("Email").fill("another@example.test");
  await page.getByLabel("Password").fill("unused-password");
  await page.getByRole("button", { name: "Continue" }).click();
  complete({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ reply: "Late response", updates: { purpose: "Stale purpose" } }),
  });
  await expect(page.getByLabel("Purpose")).toHaveValue("Evaluating whether to enter into a business relationship with the other party.");
  await expect(page.getByText("Late response")).toHaveCount(0);
});

test("keeps the draft unchanged when free models are rate limited", async ({ page }) => {
  await page.route("**/api/nda/chat", async (route) => {
    await route.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({ detail: "The free AI models are temporarily rate-limited. Your draft is unchanged; try again or continue editing manually." }) });
  });
  await signIn(page);
  await page.getByLabel(consent).check();
  await page.getByLabel("Purpose").fill("My purpose");
  await page.getByLabel("Message").fill("Please help.");
  await page.getByRole("button", { name: "Send to assistant" }).click();
  await expect(page.getByText("The free AI models are temporarily rate-limited.")).toBeVisible();
  await expect(page.getByLabel("Purpose")).toHaveValue("My purpose");
});
