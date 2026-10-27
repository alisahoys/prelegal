import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const validOrigin = "http://localhost";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("chat API proxy", () => {
  it("rejects cross-origin requests before contacting the backend", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    const request = new Request("http://localhost/api/nda/chat", {
      method: "POST",
      headers: { cookie: "prelegal_session=test-token", origin: "https://attacker.example" },
      body: "{}",
    });

    const response = await POST(request);

    expect(response.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns a timeout message when the backend request exceeds its deadline", async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, "fetch").mockImplementation((_input, init) => new Promise((_resolve, reject) => {
      const rejectAbort = () => reject(new DOMException("The operation was aborted.", "AbortError"));
      if (init?.signal?.aborted) rejectAbort();
      else init?.signal?.addEventListener("abort", rejectAbort, { once: true });
    }));
    const request = new Request("http://localhost/api/nda/chat", { method: "POST", headers: { cookie: "prelegal_session=test-token", origin: validOrigin }, body: "{}" });

    const responsePromise = POST(request);
    await vi.advanceTimersByTimeAsync(90_000);
    const response = await responsePromise;

    expect(response.status).toBe(504);
    expect(await response.json()).toEqual({ detail: "The AI took too long to respond. Please try again." });
  });
});
