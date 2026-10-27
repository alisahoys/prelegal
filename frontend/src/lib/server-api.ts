import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const backendUrl = process.env.BACKEND_URL ?? "http://localhost:8000";
const cookieName = "prelegal_session";

export async function backendRequest(path: string, init: RequestInit = {}, authenticated = false) {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("content-type", "application/json");
  if (authenticated) {
    const token = (await cookies()).get(cookieName)?.value;
    if (!token) return NextResponse.json({ detail: "Authentication required." }, { status: 401 });
    headers.set("authorization", `Bearer ${token}`);
  }
  try {
    const response = await fetch(`${backendUrl}${path}`, { ...init, headers, cache: "no-store" });
    const body = response.status === 204 ? null : await response.json();
    return NextResponse.json(body, { status: response.status });
  } catch {
    return NextResponse.json({ detail: "The service could not be reached. Please try again." }, { status: 502 });
  }
}

export function setSessionCookie(response: NextResponse, token: string) {
  response.cookies.set(cookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(cookieName, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
}

export async function authRequest(path: string, request: Request, method: string) {
  return backendRequest(path, { method, body: method === "POST" ? await request.text() : undefined });
}
