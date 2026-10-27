import { backendRequest, rejectCrossOrigin } from "@/lib/server-api";

export async function GET() {
  return backendRequest("/api/documents", { method: "GET" }, true);
}

export async function POST(request: Request) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  return backendRequest("/api/documents", { method: "POST", body: await request.text() }, true);
}
