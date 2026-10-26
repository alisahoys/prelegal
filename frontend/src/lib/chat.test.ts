import { describe, expect, it, vi } from "vitest";
import { applyPatch, currentDataForChat, sendChatTurn, type FieldPath } from "./chat";
import { defaultNdaData } from "./nda";

describe("chat field patching", () => {
  it("applies only returned fields and nested party fields", () => {
    const original = defaultNdaData();
    const result = applyPatch(original, { purpose: "Evaluating a partnership", party1: { company: "Example" } }, new Set());
    expect(result.data.purpose).toBe("Evaluating a partnership");
    expect(result.data.party1.company).toBe("Example");
    expect(result.data.party1.name).toBe("");
    expect(result.data.modifications).toBe("");
    expect(original.party1.company).toBe("");
  });

  it("preserves manually changed fields and returns suggestions", () => {
    const original = { ...defaultNdaData(), purpose: "My wording" };
    const result = applyPatch(original, { purpose: "Model wording", governingLaw: "Delaware" }, new Set<FieldPath>(["purpose"]));
    expect(result.data.purpose).toBe("My wording");
    expect(result.data.governingLaw).toBe("Delaware");
    expect(result.conflicts).toEqual([{ path: "purpose", value: "Model wording" }]);
  });

  it("does not send modifications to the API context", () => {
    expect(currentDataForChat(defaultNdaData())).not.toHaveProperty("modifications");
  });

  it("sends template context and never the template body", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      reply: "I can help fill in these terms.", updates: null, fieldUpdates: [], suggestions: [], needsMoreInformation: false, nextQuestion: null,
    }), { status: 200, headers: { "content-type": "application/json" } }));
    await sendChatTurn("I need a DPA", [{ role: "assistant", content: "Consider this option.", suggestions: [{ templateId: "data-processing-agreement", reason: "Relevant." }] }], {
      id: "data-processing-agreement", name: "Data Processing Agreement", description: "DPA", editor: "markdown", fields: ["Customer", "Processor"],
    }, null, [{ field: "Customer", value: "Acme" }, { field: "Processor", value: "" }]);
    const body = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
    expect(body.currentTemplateId).toBe("data-processing-agreement");
    expect(body.currentData).toBeNull();
    expect(body.currentFields).toEqual([{ field: "Customer", value: "Acme" }, { field: "Processor", value: "" }]);
    expect(body.history).toEqual([{ role: "assistant", content: "Consider this option." }]);
    expect(body).not.toHaveProperty("template");
    fetchSpy.mockRestore();
  });
});
