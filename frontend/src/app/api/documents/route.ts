import { backendRequest } from "@/lib/server-api";

export async function GET() {
  return backendRequest("/api/documents", { method: "GET" }, true);
}

export async function POST(request: Request) {
  return backendRequest("/api/documents", { method: "POST", body: await request.text() }, true);
}
