import { backendRequest, rejectCrossOrigin } from "@/lib/server-api";

export async function GET(_request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params;
  return backendRequest(`/api/documents/${encodeURIComponent(documentId)}`, { method: "GET" }, true);
}

export async function PUT(request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const { documentId } = await params;
  return backendRequest(`/api/documents/${encodeURIComponent(documentId)}`, { method: "PUT", body: await request.text() }, true);
}
