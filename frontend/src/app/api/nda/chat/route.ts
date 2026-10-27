import { NextResponse } from "next/server";

const backendUrl = process.env.BACKEND_URL ?? "http://localhost:8000";
const messages = [
  "The free AI models are temporarily rate-limited. Your draft is unchanged; try again or continue editing manually.",
  "The AI took too long to respond. Please try again.",
  "The AI service could not complete this request. Your draft is unchanged; please try again.",
  "AI chat is not configured. Add the OpenRouter settings to the backend environment.",
];

export async function POST(request: Request) {
  const token = request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith("prelegal_session="))?.slice("prelegal_session=".length);
  if (!token) return NextResponse.json({ detail: "Authentication required." }, { status: 401 });
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 90_000);
  try {
    const response = await fetch(`${backendUrl}/api/nda/chat`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: await request.text(),
      signal: abort.signal,
      cache: "no-store",
    });
    if (response.ok) {
      return NextResponse.json(await response.json(), { status: response.status });
    }
    const text = messages[response.status === 429 ? 0 : response.status === 504 ? 1 : response.status === 503 ? 3 : 2];
    return NextResponse.json({ detail: text }, { status: response.status });
  } catch (error) {
    if (abort.signal.aborted) {
      return NextResponse.json({ detail: messages[1] }, { status: 504 });
    }
    console.error("Chat API proxy request failed:", error instanceof Error ? error.message : String(error));
    return NextResponse.json(
      { detail: "The AI service could not be reached. Your draft is unchanged; please try again." },
      { status: 502 },
    );
  } finally {
    clearTimeout(timeout);
  }
}
