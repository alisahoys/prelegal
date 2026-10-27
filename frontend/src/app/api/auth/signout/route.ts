import { NextResponse } from "next/server";
import { backendRequest, clearSessionCookie } from "@/lib/server-api";

export async function POST() {
  const response = await backendRequest("/api/auth/signout", { method: "POST" }, true);
  if (!response.ok && response.status !== 401) return response;
  const safeResponse = new NextResponse(null, { status: 204 });
  clearSessionCookie(safeResponse);
  return safeResponse;
}
