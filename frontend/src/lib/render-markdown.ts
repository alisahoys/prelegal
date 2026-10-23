import DOMPurify from "isomorphic-dompurify";
import { Marked, type Tokens } from "marked";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]!);
}

const parser = new Marked({
  gfm: true,
  extensions: [{
    name: "termHighlight",
    level: "inline",
    start: (source) => source.indexOf("==") >= 0 ? source.indexOf("==") : undefined,
    tokenizer(source) {
      const match = /^==([^=\n]+)==/.exec(source);
      return match ? { type: "termHighlight", raw: match[0], text: match[1] } : undefined;
    },
    renderer(token) {
      const text = (token as Tokens.Generic & { text: string }).text;
      return `<mark>${escapeHtml(text)}</mark>`;
    },
  }],
  renderer: {
    html({ text }) {
      return escapeHtml(text);
    },
  },
});

function romanValue(marker: string) {
  const values: Record<string, number> = { i: 1, v: 5, x: 10 };
  return [...marker].reduce((total, letter, index, letters) => {
    const value = values[letter];
    return total + (value < (values[letters[index + 1]] ?? 0) ? -value : value);
  }, 0);
}

function normalizeListMarkers(markdown: string) {
  return markdown
    .replace(/^( {0,16}[-*+] +)\[([ xX])\][ \t]*/gm, (_match, prefix: string, checked: string) => `${prefix}${checked.trim() ? "☒" : "☐"} `)
    .replace(/^( {0,16})([a-z]|[ivx]+)\. (?=\S)/gim, (_match, indent: string, marker: string) => {
      const lowerMarker = marker.toLowerCase();
      const isRoman = /^[ivx]+$/.test(lowerMarker) && (lowerMarker.length > 1 || indent.length >= 8);
      const number = isRoman ? romanValue(lowerMarker) : lowerMarker.charCodeAt(0) - 96;
      return `${indent}${number}. `;
    });
}

export function markdownForDownload(markdown: string) {
  return markdown.replace(/==([^=\n]+)==/g, "**$1**");
}

export function renderMarkdown(markdown: string) {
  const html = parser.parse(normalizeListMarkers(markdown), { async: false });
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ["a", "b", "blockquote", "br", "code", "dd", "del", "div", "dt", "em", "h1", "h2", "h3", "h4", "h5", "h6", "hr", "li", "mark", "ol", "p", "pre", "strong", "table", "tbody", "td", "th", "thead", "tr", "ul"],
    ALLOWED_ATTR: ["href", "title"],
    ALLOW_DATA_ATTR: false,
  });
}
