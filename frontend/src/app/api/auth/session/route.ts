import { backendRequest } from "@/lib/server-api";

export async function GET() {
  return backendRequest("/api/auth/session", { method: "GET" }, true);
}
