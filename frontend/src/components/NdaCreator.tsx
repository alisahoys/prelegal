"use client";

import { useEffect, useMemo, useState } from "react";
import { marked } from "marked";
import { buildDocument, defaultNdaData, type NdaData, type Party } from "@/lib/nda";

const input =
  "w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm text-black focus:border-blue-500 focus:outline-none";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{label}</span>
      {hint && <span className="block text-xs text-zinc-500">{hint}</span>}
      {children}
    </label>
  );
}

function PartyFields({ title, party, onChange }: { title: string; party: Party; onChange: (p: Party) => void }) {
  const set = (k: keyof Party) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...party, [k]: e.target.value });
  return (
    <fieldset className="space-y-3 rounded border border-zinc-300 p-4">
      <legend className="px-1 text-sm font-semibold">{title}</legend>
      <Field label="Print name">
        <input className={input} value={party.name} onChange={set("name")} />
      </Field>
      <Field label="Title">
        <input className={input} value={party.title} onChange={set("title")} />
      </Field>
      <Field label="Company">
        <input className={input} value={party.company} onChange={set("company")} />
      </Field>
      <Field label="Notice address" hint="Email or postal address">
        <input className={input} value={party.noticeAddress} onChange={set("noticeAddress")} />
      </Field>
    </fieldset>
  );
}

export default function NdaCreator({ template }: { template: string }) {
  const [data, setData] = useState<NdaData>(defaultNdaData);
  // Today's date is only known in the browser; setting it here keeps the page prerenderable.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setData((d) => (d.effectiveDate ? d : { ...d, effectiveDate: new Date().toISOString().slice(0, 10) }));
  }, []);
  const markdown = useMemo(() => buildDocument(template, data), [template, data]);
  const html = useMemo(() => marked.parse(markdown, { async: false }), [markdown]);

  const update = <K extends keyof NdaData>(key: K, value: NdaData[K]) => setData((d) => ({ ...d, [key]: value }));
  const text =
    (key: "purpose" | "effectiveDate" | "governingLaw" | "jurisdiction" | "modifications") =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      update(key, e.target.value);
  const years = (key: "mndaTermYears" | "confidentialityYears") => (e: React.ChangeEvent<HTMLInputElement>) =>
    update(key, Math.max(1, Math.floor(Number(e.target.value)) || 1));

  function downloadMarkdown() {
    const url = URL.createObjectURL(new Blob([markdown], { type: "text/markdown" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "Mutual-NDA.md";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function downloadPdf() {
    const { default: html2pdf } = await import("html2pdf.js");
    const el = document.getElementById("nda-preview");
    if (!el) return;
    // html2canvas cannot parse the lab()/oklch() colors Tailwind emits, so render the clone with only the preview's own rules.
    const previewRules = Array.from(document.styleSheets)
      .flatMap((sheet) => Array.from(sheet.cssRules))
      .filter((rule) => rule instanceof CSSStyleRule && rule.selectorText.startsWith(".nda-preview"))
      .map((rule) => rule.cssText)
      .join("\n");
    await html2pdf()
      .set({
        margin: 15,
        filename: "Mutual-NDA.pdf",
        html2canvas: {
          onclone: (doc: Document) => {
            doc.querySelectorAll('style, link[rel="stylesheet"]').forEach((n) => n.remove());
            const style = doc.createElement("style");
            style.textContent = previewRules;
            doc.head.appendChild(style);
          },
        },
      })
      .from(el)
      .save();
  }

  return (
    <div className="mx-auto grid w-full max-w-7xl gap-8 p-6 lg:grid-cols-[minmax(0,420px)_1fr]">
      <form className="space-y-5" onSubmit={(e) => e.preventDefault()}>
        <h1 className="text-2xl font-semibold">Mutual NDA Creator</h1>
        <Field label="Purpose" hint="How Confidential Information may be used">
          <textarea className={input} rows={3} value={data.purpose} onChange={text("purpose")} />
        </Field>
        <Field label="Effective date">
          <input className={input} type="date" value={data.effectiveDate} onChange={text("effectiveDate")} />
        </Field>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">MNDA term</legend>
          <div className="flex items-center gap-2 text-sm">
            <input type="radio" id="term-expires" checked={data.mndaTermType === "expires"} onChange={() => update("mndaTermType", "expires")} />
            <label htmlFor="term-expires">Expires</label>
            <input className={`${input} !w-20`} type="number" min={1} aria-label="MNDA term years" value={data.mndaTermYears} onChange={years("mndaTermYears")} />
            <span>year(s) from Effective Date</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <input type="radio" id="term-continues" checked={data.mndaTermType === "continues"} onChange={() => update("mndaTermType", "continues")} />
            <label htmlFor="term-continues">Continues until terminated</label>
          </div>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Term of confidentiality</legend>
          <div className="flex items-center gap-2 text-sm">
            <input type="radio" id="conf-years" checked={data.confidentialityType === "years"} onChange={() => update("confidentialityType", "years")} />
            <input className={`${input} !w-20`} type="number" min={1} aria-label="Confidentiality years" value={data.confidentialityYears} onChange={years("confidentialityYears")} />
            <label htmlFor="conf-years">year(s) from Effective Date (trade secrets protected while they remain trade secrets)</label>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <input type="radio" id="conf-perpetuity" checked={data.confidentialityType === "perpetuity"} onChange={() => update("confidentialityType", "perpetuity")} />
            <label htmlFor="conf-perpetuity">In perpetuity</label>
          </div>
        </fieldset>

        <Field label="Governing law" hint="State, e.g. Delaware">
          <input className={input} value={data.governingLaw} onChange={text("governingLaw")} />
        </Field>
        <Field label="Jurisdiction" hint="City or county and state, e.g. courts located in New Castle, DE">
          <input className={input} value={data.jurisdiction} onChange={text("jurisdiction")} />
        </Field>
        <Field label="MNDA modifications" hint="Optional">
          <textarea className={input} rows={3} value={data.modifications} onChange={text("modifications")} />
        </Field>

        <PartyFields title="Party 1" party={data.party1} onChange={(p) => update("party1", p)} />
        <PartyFields title="Party 2" party={data.party2} onChange={(p) => update("party2", p)} />

        <div className="flex gap-3">
          <button type="button" onClick={downloadPdf} className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            Download PDF
          </button>
          <button type="button" onClick={downloadMarkdown} className="rounded border border-blue-600 px-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50">
            Download Markdown
          </button>
        </div>
      </form>

      <article
        id="nda-preview"
        className="nda-preview rounded border border-zinc-300 bg-white p-8 text-black"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
