const templateSpan = /<span class="(header_2|header_3|keyterms_link|businessterms_link|coverpage_link|orderform_link|sow_link)"(?: id="[A-Za-z0-9._-]+")?>([^<]*)<\/span>/g;
const variableSpan = /<span class="(keyterms_link|businessterms_link|coverpage_link|orderform_link|sow_link)"(?: id="[A-Za-z0-9._-]+")?>([^<]*)<\/span>/g;
const templateAnchor = /<span id="[A-Za-z0-9._-]+">([^<]*)<\/span>/g;
const fieldHint = /<label>([^<]*)<\/label>/g;
const sectionTitle = /^\s*## (\d+)\. (.+)$/;

function normalizeFieldLabel(label: string) {
  return label.replace(/‎/g, "").trim().replace(/\s+/g, " ");
}

export function extractTemplateFields(markdown: string) {
  const fields: string[] = [];
  for (const match of markdown.matchAll(variableSpan)) {
    const label = normalizeFieldLabel(match[2]);
    if (label && !fields.includes(label)) fields.push(label);
  }
  return fields;
}

function escapeMarkdownLiteral(value: string) {
  return Array.from(value.replace(/\s+/g, " ").trim(), (character) => /^[\p{L}\p{N} ]$/u.test(character) ? character : `\\${character}`).join("");
}

export function fillTemplateMarkdown(markdown: string, values: Record<string, string>) {
  const filled = markdown.replace(variableSpan, (_match, _kind: string, sourceLabel: string) => {
    const label = normalizeFieldLabel(sourceLabel);
    const value = values[label]?.trim();
    return `==${value ? escapeMarkdownLiteral(value) : label}==`;
  });
  return formatTemplateMarkdown(filled);
}

export function formatTemplateMarkdown(markdown: string) {
  const headings = markdown
    .replace(
      /^(\s*)(\d+)\. <span class="header_2"(?: id="[^"]+")?>([^<]*)<\/span>[ \t]*$/gm,
      (_match, indent: string, number: string, title: string) => `${indent}## ${number}. ${title}\n`,
    )
    .replace(/^(\d+)\. Definitions[ \t]*$/gm, "## $1. Definitions");

  const normalized = headings
    .replace(templateAnchor, "$1")
    .replace(fieldHint, "$1")
    .replace(templateSpan, (_match, kind: string, text: string) => kind === "header_2" ? text : kind === "header_3" ? `**${text}**` : `==${text}==`);
  const lines = normalized.replace(/‎/g, "").split("\n");
  const clauseIndents = lines.flatMap((line) => {
    const match = /^( *)(?:\d+|[a-z]|[ivx]+)\. /i.exec(line);
    return match ? [match[1].length] : [];
  });
  const baseIndent = (clauseIndents[0] ?? 0) >= 4 ? Math.min(...clauseIndents.filter((indent) => indent >= 4)) : 0;

  return lines.map((line) => {
    const title = sectionTitle.exec(line);
    if (title) return `## ${title[1]}. ${title[2]}`;
    return baseIndent > 0 ? line.replace(new RegExp(`^ {${baseIndent}}`), "") : line;
  }).join("\n");
}
