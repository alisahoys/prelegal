import { describe, expect, it } from "vitest";
import { markdownForDownload, renderMarkdown } from "./render-markdown";
import { formatTemplateMarkdown } from "./template-markdown";

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
