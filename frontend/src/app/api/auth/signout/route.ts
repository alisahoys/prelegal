import { NextResponse } from "next/server";
import { backendRequest, clearSessionCookie, rejectCrossOrigin } from "@/lib/server-api";

export async function POST(request: Request) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const response = await backendRequest("/api/auth/signout", { method: "POST" }, true);
  if (response.ok || response.status === 401) {
    const safeResponse = new NextResponse(null, { status: 204 });
    clearSessionCookie(safeResponse);
    return safeResponse;
  }
  const safeResponse = NextResponse.json({ detail: "The server could not revoke the session. The browser cookie was cleared." }, { status: response.status >= 400 && response.status < 600 ? response.status : 502 });
  clearSessionCookie(safeResponse);
  return safeResponse;
}
