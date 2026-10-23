import type { NdaData } from "./nda";

export type ChatMessage = { role: "user" | "assistant"; content: string; suggestions?: TemplateSuggestion[] };
export type TemplateSuggestion = { templateId: string; reason: string };
export type ChatTemplate = { id: string; name: string; description: string; editor: "nda" | "markdown" };
export type PartyPatch = Partial<NdaData["party1"]>;
export type NdaPatch = Partial<Omit<NdaData, "modifications" | "party1" | "party2">> & {
  party1?: PartyPatch | null;
  party2?: PartyPatch | null;
};
export type ChatResponse = { reply: string; updates: NdaPatch | null; suggestions: TemplateSuggestion[]; needsMoreInformation: boolean; nextQuestion: string | null };
export type FieldPath =
  | "purpose"
  | "effectiveDate"
  | "mndaTermType"
  | "mndaTermYears"
  | "confidentialityType"
  | "confidentialityYears"
  | "governingLaw"
  | "jurisdiction"
  | `party1.${keyof NdaData["party1"] & string}`
  | `party2.${keyof NdaData["party2"] & string}`;

export function currentDataForChat(data: NdaData): Omit<NdaData, "modifications"> {
  return {
    purpose: data.purpose,
    effectiveDate: data.effectiveDate,
    mndaTermType: data.mndaTermType,
    mndaTermYears: data.mndaTermYears,
    confidentialityType: data.confidentialityType,
    confidentialityYears: data.confidentialityYears,
    governingLaw: data.governingLaw,
    jurisdiction: data.jurisdiction,
    party1: { ...data.party1 },
    party2: { ...data.party2 },
  };
}

export function applyPatch(data: NdaData, patch: NdaPatch, manuallyEdited: Set<FieldPath>) {
  const result = { ...data, party1: { ...data.party1 }, party2: { ...data.party2 } };
  const conflicts: { path: FieldPath; value: string | number }[] = [];

  for (const [key, value] of Object.entries(patch)) {
    if (key === "party1" || key === "party2") {
      if (!value) continue;
      for (const [partyKey, partyValue] of Object.entries(value)) {
        const path = `${key}.${partyKey}` as FieldPath;
        if (manuallyEdited.has(path)) conflicts.push({ path, value: partyValue as string });
        else result[key][partyKey as keyof NdaData[typeof key]] = partyValue as never;
      }
      continue;
    }

    if (value === null || value === undefined) continue;
    const path = key as FieldPath;
    if (manuallyEdited.has(path)) conflicts.push({ path, value: value as string | number });
    else result[key as keyof NdaData] = value as never;
  }

  return { data: result, conflicts };
}

export async function sendChatTurn(
  message: string,
  history: ChatMessage[],
  template: ChatTemplate,
  currentData: Omit<NdaData, "modifications"> | null,
): Promise<ChatResponse> {
  const response = await fetch("/api/nda/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message, history: history.slice(-12).map(({ role, content }) => ({ role, content })), currentTemplateId: template.id, currentData }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.detail ?? "The AI request failed. Your draft is unchanged; please try again.");
  if (
    typeof result.reply !== "string" ||
    !(result.updates === null || typeof result.updates === "object") ||
    !Array.isArray(result.suggestions) ||
    typeof result.needsMoreInformation !== "boolean" ||
    !(result.nextQuestion === null || typeof result.nextQuestion === "string") ||
    result.needsMoreInformation !== Boolean(result.nextQuestion?.trim())
  ) throw new Error("The AI response was invalid. Your draft is unchanged; please try again.");
  return result as ChatResponse;
}
