import { NextResponse } from "next/server";
import { backendRequest, rejectCrossOrigin, setSessionCookie } from "@/lib/server-api";

export async function POST(request: Request) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const response = await backendRequest("/api/auth/signup", { method: "POST", body: await request.text() });
  if (!response.ok) return response;
  const result = await response.json();
  const safeResponse = NextResponse.json({ user: result.user }, { status: response.status });
  setSessionCookie(safeResponse, result.accessToken);
  return safeResponse;
}
