import { describe, expect, it } from "vitest";
import { markdownForDownload, renderMarkdown } from "./render-markdown";
import { extractTemplateFields, fillTemplateMarkdown, formatTemplateMarkdown } from "./template-markdown";

describe("legal template Markdown", () => {
  it("formats trusted headings, clauses, nested lettered clauses and terms", () => {
    const result = formatTemplateMarkdown(`# Agreement\n\n1. <span class="header_2">Cooperation</span>\n    1. <span class="header_3">Duties.</span> Each party meets <span class="keyterms_link">Obligations</span>.\n        a. Nested clause.\n            i. Roman clause.`);
    const html = renderMarkdown(result);

    expect(result).toContain("## 1. Cooperation");
    expect(result).toContain("a. Nested clause.");
    expect(html).toContain("<h2>1. Cooperation</h2>");
    expect(html).toContain("<strong>Duties.</strong>");
    expect(html).toContain("<mark>Obligations</mark>");
    expect(html).toContain("<ol>");
    expect(html).not.toContain("<pre>");
  });

  it("keeps plain numbered Definitions headings separate from their clauses", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const source = readFileSync(resolve(process.cwd(), "../templates/Software-License-Agreement.md"), "utf8");
    const html = renderMarkdown(formatTemplateMarkdown(source));
    expect(html).toMatch(/<h2>11\. Definitions<\/h2>\s*<ol>/);
    expect(html).toContain('<li><strong>"Affiliate"</strong> means');
    expect(html).toContain('<li><strong>"Variable"</strong> means');
  });

  it("removes invisible directional marks from rendered agreement text", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const source = readFileSync(resolve(process.cwd(), "../templates/DPA.md"), "utf8");
    const html = renderMarkdown(formatTemplateMarkdown(source));
    expect(html).toContain("Section 18 of the UK Addendum");
    expect(html).not.toContain("Section  18");
  });

  it("keeps the edited value inside a highlighted term", () => {
    expect(renderMarkdown("The term is ==Edited Customer==.")).toContain("<mark>Edited Customer</mark>");
  });

  it("extracts unique linked terms in source order from all catalog templates", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const catalog = JSON.parse(readFileSync(resolve(process.cwd(), "../catalog.json"), "utf8")) as { filename: string }[];
    for (const { filename } of catalog) {
      const source = readFileSync(resolve(process.cwd(), "..", filename), "utf8");
      const fields = extractTemplateFields(source);
      expect(new Set(fields).size, filename).toBe(fields.length);
      expect(fields, filename).toEqual(fields.filter((field, index) => fields.indexOf(field) === index));
    }
    const partnership = readFileSync(resolve(process.cwd(), "../templates/Partnership-Agreement.md"), "utf8");
    expect(extractTemplateFields(partnership).slice(0, 3)).toEqual(["Obligations", "Payment Process", "Payment Schedule"]);
  });

  it("fills every matching term while preserving blank highlights and escaping user text", () => {
    const source = '<span class="keyterms_link">Customer</span> and <span class="keyterms_link">Customer</span>; <span class="businessterms_link">Region</span>.';
    const filled = fillTemplateMarkdown(source, { Customer: "Acme [click](javascript:alert(1)) <img> ==x==", Region: "" });
    const html = renderMarkdown(filled);
    expect((html.match(/<mark>/g) ?? [])).toHaveLength(3);
    expect(html).toContain("Acme");
    expect(html).toContain("[click](javascript:alert(1))");
    expect(html).not.toContain("&amp;#91;");
    expect(html).not.toContain("<a href=");
    expect(html).not.toContain("<img>");
    expect(html).toContain("Region");
    expect(filled).toContain("==Region==");
  });

  it("renders backslashes, script tags, and Markdown emphasis as literal field text", () => {
    const source = '<span class="keyterms_link">Value</span>';
    const cases = [
      { value: "\\", text: "\\" },
      { value: "<script>alert(1)</script>", text: "&lt;script&gt;alert(1)&lt;/script&gt;" },
      { value: "**bold**", text: "**bold**" },
    ];

    for (const { value, text } of cases) {
      const html = renderMarkdown(fillTemplateMarkdown(source, { Value: value }));
      expect(html).toContain(`<mark>${text}</mark>`);
      expect(html).not.toMatch(/<(?:script|strong|a|img)\b/i);
    }
  });

  it("exports highlighted terms as standard Markdown emphasis", () => {
    expect(markdownForDownload("The term is ==Customer==.")).toBe("The term is **Customer**.");
  });

  it("escapes raw user HTML and removes unsafe links", () => {
    const html = renderMarkdown('<span class="header_2">User heading</span>\n\n<img src=x onerror=alert(1)>\n\n[unsafe](javascript:alert(1))');
    expect(html).not.toContain("<span");
    expect(html).not.toContain("<img");
    expect(html).not.toContain('<a href="javascript:');
    expect(html).toContain("&lt;span class=");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("preserves checked and unchecked task markers in readable text", () => {
    const source = "- [x] Selected term.\n- [ ] Unselected term.";
    const html = renderMarkdown(source);
    expect(html).toContain("☒ Selected term.");
    expect(html).toContain("☐ Unselected term.");
    expect(html).not.toContain("<input");
  });

  it("renders standard Markdown emphasis and nested ordered lists", () => {
    const formatted = formatTemplateMarkdown("    1. Parent\n        a. Child\n            i. Grandchild");
    const html = renderMarkdown("**Bold text**\n\n" + formatted);
    expect(html).toContain("<strong>Bold text</strong>");
    expect(html).toContain("<ol>");
    expect(html.match(/<ol>/g)).toHaveLength(3);
    expect(html).toContain("<li>Grandchild</li>");
  });

  it("normalizes every manually edited catalog template before rendering", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const catalog = JSON.parse(readFileSync(resolve(process.cwd(), "../catalog.json"), "utf8")) as { editor: string; filename: string }[];
    for (const template of catalog.filter(({ editor }) => editor === "markdown")) {
      const source = readFileSync(resolve(process.cwd(), "..", template.filename), "utf8");
      const html = renderMarkdown(formatTemplateMarkdown(source));
      expect(html, template.filename).not.toContain("&lt;span");
      expect(html, template.filename).not.toContain("&lt;label");
      expect(html, template.filename).not.toContain("**");
      expect(html, template.filename).not.toContain("==");
      expect(html, template.filename).not.toContain("<pre>");
      expect(html, template.filename).toContain("<h2>");
    }
  });

  it("does not trust unsupported source span classes", () => {
    const html = renderMarkdown(formatTemplateMarkdown('<span class="unknown">Visible text</span>'));
    expect(html).not.toContain("<span");
    expect(html).toContain("&lt;span class=");
  });
});
