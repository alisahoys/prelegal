import type { NdaData } from "@/lib/nda";

export type DocumentState = { templateId: string; ndaData: NdaData | null; fields: Record<string, string> };
export type SavedDocument = { id: string; title: string; templateId: string; state: DocumentState; createdAt: string; updatedAt: string };
export type DocumentSummary = Omit<SavedDocument, "state">;

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "content-type": "application/json", ...init?.headers }, cache: "no-store" });
  const result = response.status === 204 ? null : await response.json();
  if (!response.ok) throw new Error(result?.detail ?? "The request could not be completed.");
  return result as T;
}

export function listDocuments() {
  return request<{ items: DocumentSummary[] }>("/api/documents");
}

export function getDocument(id: string) {
  return request<SavedDocument>(`/api/documents/${encodeURIComponent(id)}`);
}

export function saveDocument(payload: { id?: string; title: string; state: DocumentState }) {
  return request<SavedDocument>(payload.id ? `/api/documents/${encodeURIComponent(payload.id)}` : "/api/documents", {
    method: payload.id ? "PUT" : "POST",
    body: JSON.stringify({ title: payload.title, state: payload.state }),
  });
}
