import { describe, expect, it } from "vitest";
import { applyPatch, currentDataForChat, type FieldPath } from "./chat";
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
});
