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
      body: JSON.stringify({ reply: "I found the purpose.", updates: { purpose: "Evaluating a partnership", governingLaw: "Delaware" }, fieldUpdates: [], suggestions: [], needsMoreInformation: true, nextQuestion: "What state should govern?" }),
    });
  });
  await signIn(page);
  await expect(page.getByRole("button", { name: "Send to assistant" })).toBeDisabled();
  await page.getByLabel(consent).check();
  await page.getByLabel("Governing law").fill("My law");
  await page.getByLabel("Message").fill("We are evaluating a partnership.");
  await page.getByRole("button", { name: "Send to assistant" }).click();

  await expect(page.getByLabel("Purpose")).toHaveValue("Evaluating a partnership");
  await expect(page.getByLabel("Message")).toBeFocused();
  await expect(page.getByText("What state should govern?")).toBeVisible();
  await expect(page.getByLabel("Governing law")).toHaveValue("My law");
  await expect(page.getByText("Suggestion for governingLaw: Delaware")).toBeVisible();
  await page.getByRole("button", { name: "Apply suggestion" }).click();
  await expect(page.getByLabel("Governing law")).toHaveValue("Delaware");
  await expect(page.locator("#nda-preview")).toContainText("Evaluating a partnership");
});

test("sends clean assistant history on follow-up turns", async ({ page }) => {
  const requests: { history: unknown[]; currentTemplateId: string }[] = [];
  await page.route("**/api/nda/chat", async (route) => {
    const body = route.request().postDataJSON();
    requests.push(body);
    const turn = requests.length;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        reply: turn === 1 ? "What state should govern?" : "Thanks, I have what I need.",
        updates: null,
        fieldUpdates: [],
        suggestions: turn === 1 ? [{ templateId: "data-processing-agreement", reason: "Review this alternative." }] : [],
        needsMoreInformation: turn === 1,
        nextQuestion: turn === 1 ? "What state should govern?" : null,
      }),
    });
  });
  await signIn(page);
  await page.getByLabel(consent).check();
  await page.getByLabel("Message").fill("I need help with an agreement.");
  await page.getByRole("button", { name: "Send to assistant" }).click();
  await page.getByLabel("Message").fill("Delaware.");
  await page.getByRole("button", { name: "Send to assistant" }).click();

  await expect(page.getByText("Thanks, I have what I need.")).toBeVisible();
  expect(requests).toHaveLength(2);
  expect(requests[1].history).toEqual([{ role: "user", content: "I need help with an agreement." }, { role: "assistant", content: "What state should govern?" }]);
  expect(requests[1].history[1]).not.toHaveProperty("suggestions");
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
    body: JSON.stringify({ reply: "Late response", updates: { purpose: "Stale purpose" }, fieldUpdates: [], suggestions: [], needsMoreInformation: false, nextQuestion: null }),
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
