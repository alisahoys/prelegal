export type Party = {
  name: string;
  title: string;
  company: string;
  noticeAddress: string;
};

export type NdaData = {
  purpose: string;
  effectiveDate: string;
  mndaTermType: "expires" | "continues";
  mndaTermYears: number;
  confidentialityType: "years" | "perpetuity";
  confidentialityYears: number;
  governingLaw: string;
  jurisdiction: string;
  modifications: string;
  party1: Party;
  party2: Party;
};

const emptyParty: Party = { name: "", title: "", company: "", noticeAddress: "" };

export function defaultNdaData(): NdaData {
  return {
    purpose: "Evaluating whether to enter into a business relationship with the other party.",
    effectiveDate: "",
    mndaTermType: "expires",
    mndaTermYears: 1,
    confidentialityType: "years",
    confidentialityYears: 1,
    governingLaw: "",
    jurisdiction: "",
    modifications: "",
    party1: { ...emptyParty },
    party2: { ...emptyParty },
  };
}

// User text goes into markdown that is rendered as HTML, so neutralise HTML and table syntax.
const clean = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\\/g, "\\\\").replace(/([\[\]()])/g, "\\$1").replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ").trim();

const orBlank = (s: string, placeholder: string) => clean(s) || `[${placeholder}]`;

function formatDate(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? "[Effective Date]"
    : d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

const years = (n: number) => `${n} year${n === 1 ? "" : "s"}`;

function mndaTermText(d: NdaData) {
  return d.mndaTermType === "expires"
    ? `${years(d.mndaTermYears)} from the Effective Date`
    : "continues until terminated in accordance with the terms of the MNDA";
}

function confidentialityText(d: NdaData) {
  return d.confidentialityType === "years"
    ? `${years(d.confidentialityYears)} from the Effective Date, but in the case of trade secrets until Confidential Information is no longer considered a trade secret under applicable laws`
    : "in perpetuity";
}

function coverPage(d: NdaData) {
  const row = (label: string, f: (p: Party) => string) =>
    `| ${label} | ${f(d.party1)} | ${f(d.party2)} |`;
  return `# Mutual Non-Disclosure Agreement

## Using this Mutual Non-Disclosure Agreement

This Mutual Non-Disclosure Agreement (the “MNDA”) consists of: (1) this Cover Page (“**Cover Page**”) and (2) the Common Paper Mutual NDA Standard Terms Version 1.0 (“**Standard Terms**”) identical to those posted at [commonpaper.com/standards/mutual-nda/1.0](https://commonpaper.com/standards/mutual-nda/1.0). Any modifications of the Standard Terms should be made on the Cover Page, which will control over conflicts with the Standard Terms.

### Purpose

${orBlank(d.purpose, "Purpose")}

### Effective Date

${formatDate(d.effectiveDate)}

### MNDA Term

${mndaTermText(d)}.

### Term of Confidentiality

${confidentialityText(d)}.

### Governing Law & Jurisdiction

Governing Law: ${orBlank(d.governingLaw, "Governing Law")}

Jurisdiction: ${orBlank(d.jurisdiction, "Jurisdiction")}

### MNDA Modifications

${clean(d.modifications) || "None."}

By signing this Cover Page, each party agrees to enter into this MNDA as of the Effective Date.

| | PARTY 1 | PARTY 2 |
|:--- | :----: | :----: |
| Signature | | |
${row("Print Name", (p) => clean(p.name))}
${row("Title", (p) => clean(p.title))}
${row("Company", (p) => clean(p.company))}
${row("Notice Address", (p) => clean(p.noticeAddress))}
| Date | | |
`;
}

function standardTerms(template: string, d: NdaData) {
  const values: Record<string, string> = {
    Purpose: orBlank(d.purpose.replace(/\.$/, ""), "Purpose"),
    "Effective Date": formatDate(d.effectiveDate),
    "MNDA Term": `MNDA Term (${mndaTermText(d)})`,
    "Term of Confidentiality": `Term of Confidentiality (${confidentialityText(d)})`,
    "Governing Law": orBlank(d.governingLaw, "Governing Law"),
    Jurisdiction: orBlank(d.jurisdiction, "Jurisdiction"),
  };
  return template.replace(
    /<span class="coverpage_link">([^<]*)<\/span>/g,
    (match, key: string) => (key in values ? `**${values[key]}**` : match),
  );
}

export function buildDocument(template: string, d: NdaData) {
  return `${coverPage(d)}\n---\n\n${standardTerms(template, d)}`;
}
