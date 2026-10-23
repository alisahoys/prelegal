import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildDocument, defaultNdaData, type NdaData } from "./nda";

const template = readFileSync(resolve(__dirname, "../../../templates/Mutual-NDA.md"), "utf8");

const filled = (over: Partial<NdaData> = {}): NdaData => ({
  ...defaultNdaData(),
  effectiveDate: "2026-10-19",
  governingLaw: "Delaware",
  jurisdiction: "courts located in New Castle, DE",
  ...over,
});

describe("defaultNdaData", () => {
  it("returns independent party objects on each call", () => {
    const a = defaultNdaData();
    a.party1.name = "Ada";
    expect(defaultNdaData().party1.name).toBe("");
    expect(a.party1).not.toBe(a.party2);
  });
});

describe("buildDocument", () => {
  it("uses placeholders for blank fields", () => {
    const doc = buildDocument(template, defaultNdaData());
    expect(doc).toContain("Governing Law: [Governing Law]");
    expect(doc).toContain("Jurisdiction: [Jurisdiction]");
    expect(doc).toContain("[Effective Date]");
  });

  it("formats the effective date", () => {
    expect(buildDocument(template, filled())).toContain("October 19, 2026");
  });

  it("replaces every coverpage_link span in the standard terms", () => {
    const doc = buildDocument(template, filled());
    expect(template).toContain("coverpage_link");
    expect(doc).not.toContain("coverpage_link");
    expect(doc).toContain("the laws of the State of **Delaware**");
  });

  it("pluralises years correctly", () => {
    expect(buildDocument(template, filled({ mndaTermYears: 1 }))).toContain("1 year from the Effective Date");
    expect(buildDocument(template, filled({ mndaTermYears: 3 }))).toContain("3 years from the Effective Date");
  });

  it("renders the 'continues' MNDA term and perpetual confidentiality", () => {
    const doc = buildDocument(template, filled({ mndaTermType: "continues", confidentialityType: "perpetuity" }));
    expect(doc).toContain("continues until terminated in accordance with the terms of the MNDA");
    expect(doc).toContain("in perpetuity");
    expect(doc).not.toContain("trade secrets until");
  });

  it("includes the trade secret carve-out for fixed-year confidentiality", () => {
    expect(buildDocument(template, filled({ confidentialityYears: 2 }))).toContain(
      "2 years from the Effective Date, but in the case of trade secrets",
    );
  });

  it("strips a trailing period from the purpose in the terms but keeps it on the cover page", () => {
    const doc = buildDocument(template, filled({ purpose: "Testing." }));
    expect(doc).toContain("### Purpose\n\nTesting.\n");
    expect(doc).toContain("**Testing**");
  });

  it("defaults modifications to None and shows provided ones", () => {
    expect(buildDocument(template, filled())).toContain("### MNDA Modifications\n\nNone.");
    expect(buildDocument(template, filled({ modifications: "Section 5 is deleted." }))).toContain(
      "### MNDA Modifications\n\nSection 5 is deleted.",
    );
  });

  it("escapes HTML, pipes and newlines in user text", () => {
    const doc = buildDocument(
      template,
      filled({ party1: { name: "<b>A</b> | B", title: "x\ny", company: "A & B", noticeAddress: "" } }),
    );
    expect(doc).toContain("| Print Name | &lt;b&gt;A&lt;/b&gt; \\| B |");
    expect(doc).toContain("| Title | x y |");
    expect(doc).toContain("| Company | A &amp; B |");
  });

  it("escapes Markdown links and image syntax in user text", () => {
    const doc = buildDocument(template, filled({ purpose: "[open](javascript:alert(1)) ![image](https://example.test/x)" }));
    expect(doc).toContain("\\[open\\]\\(javascript:alert\\(1\\)\\)");
    expect(doc).toContain("\\!\\[image\\]\\(https://example.test/x\\)");
  });

  it("puts each party's details in its own column", () => {
    const doc = buildDocument(
      template,
      filled({
        party1: { name: "Ada", title: "CEO", company: "One", noticeAddress: "a@one.com" },
        party2: { name: "Bob", title: "CTO", company: "Two", noticeAddress: "b@two.com" },
      }),
    );
    expect(doc).toContain("| Print Name | Ada | Bob |");
    expect(doc).toContain("| Notice Address | a@one.com | b@two.com |");
  });
});
