import { expect, test } from "@playwright/test";

async function signUp(page: import("@playwright/test").Page, email: string) {
  await page.goto("/");
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("strong-password-123");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Agreement workspace" })).toBeVisible();
}

test("accounts only see their own saved documents and can reopen them", async ({ browser }) => {
  const userA = await browser.newPage();
  await signUp(userA, `alice-${crypto.randomUUID()}@example.com`);
  await expect(userA.getByText("Have a qualified lawyer review every document before signing.")).toBeVisible();
  await userA.getByLabel("Document title").fill("Alice NDA");
  await userA.getByLabel("Purpose").fill("Alice private purpose");
  await userA.getByRole("button", { name: "Save document" }).click();
  await expect(userA.getByRole("status")).toContainText("Saved.");
  const savedOption = userA.getByLabel("Saved documents").locator("option", { hasText: "Alice NDA" });
  await expect(savedOption).toBeVisible();
  await userA.getByLabel("Governing law").fill("Delaware");
  await userA.getByRole("button", { name: "Save changes" }).click();
  await expect(userA.getByRole("status")).toContainText("Saved.");
  const cookieA = (await userA.context().cookies()).find((cookie) => cookie.name === "prelegal_session");
  expect(cookieA?.httpOnly).toBe(true);

  const userB = await browser.newPage();
  await signUp(userB, `bob-${crypto.randomUUID()}@example.com`);
  await expect(userB.getByLabel("Saved documents")).toContainText("No saved documents yet");
  const response = await userB.request.get("/api/documents");
  expect(await response.json()).toEqual({ items: [] });

  await userA.reload();
  await expect(userA.getByRole("heading", { name: "Agreement workspace" })).toBeVisible();
  await userA.getByLabel("Saved documents").selectOption({ label: "Alice NDA" });
  await expect(userA.getByLabel("Purpose")).toHaveValue("Alice private purpose");
  await expect(userA.getByLabel("Governing law")).toHaveValue("Delaware");

  await userA.getByRole("button", { name: "Sign out" }).click();
  await expect(userA.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await userA.context().close();
  await userB.context().close();
});
