"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { marked } from "marked";
import NdaChat from "@/components/NdaChat";
import PrototypeSignIn from "@/components/PrototypeSignIn";
import { applyPatch, currentDataForChat, sendChatTurn, type ChatMessage, type FieldPath } from "@/lib/chat";
import { buildDocument, defaultNdaData, type NdaData, type Party } from "@/lib/nda";

type Conflict = { path: FieldPath; value: string | number };

const input = "form-input";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{label}</span>
      {hint && <span className="block text-xs text-[var(--muted)]">{hint}</span>}
      {children}
    </label>
  );
}

function PartyFields({
  title,
  party,
  onChange,
}: {
  title: string;
  party: Party;
  onChange: (key: keyof Party, value: string) => void;
}) {
  return (
    <fieldset className="space-y-3 rounded-xl border border-[var(--border)] p-4">
      <legend className="px-1 text-sm font-semibold">{title}</legend>
      <Field label="Print name"><input className={input} value={party.name} onChange={(event) => onChange("name", event.target.value)} /></Field>
      <Field label="Title"><input className={input} value={party.title} onChange={(event) => onChange("title", event.target.value)} /></Field>
      <Field label="Company"><input className={input} value={party.company} onChange={(event) => onChange("company", event.target.value)} /></Field>
      <Field label="Notice address" hint="Email or postal address"><input className={input} value={party.noticeAddress} onChange={(event) => onChange("noticeAddress", event.target.value)} /></Field>
    </fieldset>
  );
}

function setField(data: NdaData, path: FieldPath, value: string | number): NdaData {
  const [parent, child] = path.split(".");
  if (parent === "party1" || parent === "party2") {
    return { ...data, [parent]: { ...data[parent], [child]: value } } as NdaData;
  }
  return { ...data, [path]: value } as NdaData;
}

export default function NdaCreator({ template }: { template: string }) {
  const [data, setData] = useState<NdaData>(defaultNdaData);
  const dataRef = useRef(data);
  const [signedIn, setSignedIn] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [consent, setConsent] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const manuallyEdited = useRef(new Set<FieldPath>());
  const requestGeneration = useRef(0);

  useLayoutEffect(() => {
    dataRef.current = data;
  }, [data]);

  function commitData(next: NdaData | ((current: NdaData) => NdaData)) {
    const value = typeof next === "function" ? next(dataRef.current) : next;
    dataRef.current = value;
    setData(value);
  }

  useEffect(() => {
    // Today's date is only known in the browser; setting it here keeps the page prerenderable.
    commitData((current) => current.effectiveDate ? current : { ...current, effectiveDate: new Date().toISOString().slice(0, 10) });
  }, []);

  const markdown = useMemo(() => buildDocument(template, data), [template, data]);
  const html = useMemo(() => marked.parse(markdown, { async: false }), [markdown]);

  function update<K extends keyof NdaData>(key: K, value: NdaData[K]) {
    commitData((current) => ({ ...current, [key]: value }));
  }

  function editField<K extends Exclude<keyof NdaData, "party1" | "party2">>(key: K, value: NdaData[K]) {
    manuallyEdited.current.add(key as FieldPath);
    setConflicts((current) => current.filter((conflict) => conflict.path !== key));
    update(key, value);
  }

  function editParty(partyKey: "party1" | "party2", field: keyof Party, value: string) {
    const path = `${partyKey}.${field}` as FieldPath;
    manuallyEdited.current.add(path);
    setConflicts((current) => current.filter((conflict) => conflict.path !== path));
    commitData((current) => ({ ...current, [partyKey]: { ...current[partyKey], [field]: value } }));
  }

  async function sendMessage(message: string) {
    const generation = requestGeneration.current;
    setPending(true);
    setError("");
    const previousMessages = messages;
    setMessages((current) => [...current, { role: "user", content: message }]);
    try {
      const result = await sendChatTurn(message, previousMessages, currentDataForChat(dataRef.current));
      if (generation !== requestGeneration.current) return;
      const merged = applyPatch(dataRef.current, result.updates, manuallyEdited.current);
      commitData(merged.data);
      setConflicts((prior) => [
        ...prior.filter((conflict) => !merged.conflicts.some((next) => next.path === conflict.path)),
        ...merged.conflicts,
      ]);
      setMessages((current) => [...current, { role: "assistant", content: result.reply }]);
    } catch (reason) {
      if (generation === requestGeneration.current) {
        setError(reason instanceof Error ? reason.message : "The AI request failed. Your draft is unchanged; please try again.");
      }
    } finally {
      if (generation === requestGeneration.current) setPending(false);
    }
  }

  function resolveConflict(conflict: Conflict, apply: boolean) {
    if (apply) commitData((current) => setField(current, conflict.path, conflict.value));
    setConflicts((current) => current.filter((item) => item.path !== conflict.path));
  }

  function signOut() {
    requestGeneration.current += 1;
    setPending(false);
    manuallyEdited.current.clear();
    commitData({ ...defaultNdaData(), effectiveDate: new Date().toISOString().slice(0, 10) });
    setMessages([]);
    setConflicts([]);
    setConsent(false);
    setError("");
    setSignedIn(false);
  }

  function downloadMarkdown() {
    const url = URL.createObjectURL(new Blob([markdown], { type: "text/markdown" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "Mutual-NDA.md";
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadPdf() {
    const originalTitle = document.title;
    document.title = "Mutual-NDA";
    window.addEventListener("afterprint", () => { document.title = originalTitle; }, { once: true });
    window.print();
  }

  if (!signedIn) return <PrototypeSignIn onSignIn={() => setSignedIn(true)} />;

  return (
    <main className="mx-auto w-full max-w-[1800px] p-4 sm:p-6">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-[var(--primary)]">Prelegal prototype</p>
          <h1 className="text-2xl font-semibold">Mutual NDA Creator</h1>
        </div>
        <button className="button-secondary" type="button" onClick={signOut}>Sign out</button>
      </header>
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(280px,0.85fr)_minmax(340px,1fr)_minmax(400px,1.2fr)]">
        <NdaChat
          messages={messages}
          conflicts={conflicts}
          consent={consent}
          pending={pending}
          error={error}
          onConsent={setConsent}
          onSend={sendMessage}
          onResolve={resolveConflict}
        />
        <form className="space-y-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 print:hidden" onSubmit={(event) => event.preventDefault()}>
          <h2 className="text-lg font-semibold">Agreement details</h2>
          <Field label="Purpose" hint="How Confidential Information may be used"><textarea className={input} rows={3} value={data.purpose} onChange={(event) => editField("purpose", event.target.value)} /></Field>
          <Field label="Effective date"><input className={input} type="date" value={data.effectiveDate} onChange={(event) => editField("effectiveDate", event.target.value)} /></Field>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">MNDA term</legend>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <input type="radio" id="term-expires" checked={data.mndaTermType === "expires"} onChange={() => editField("mndaTermType", "expires")} />
              <label htmlFor="term-expires">Expires</label>
              <input className="form-input !w-20" type="number" min={1} aria-label="MNDA term years" value={data.mndaTermYears} max={100} onChange={(event) => editField("mndaTermYears", Math.min(100, Math.max(1, Math.floor(Number(event.target.value)) || 1)))} />
              <span>year(s) from Effective Date</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <input type="radio" id="term-continues" checked={data.mndaTermType === "continues"} onChange={() => editField("mndaTermType", "continues")} />
              <label htmlFor="term-continues">Continues until terminated</label>
            </div>
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Term of confidentiality</legend>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <input type="radio" id="conf-years" checked={data.confidentialityType === "years"} onChange={() => editField("confidentialityType", "years")} />
              <input className="form-input !w-20" type="number" min={1} aria-label="Confidentiality years" value={data.confidentialityYears} max={100} onChange={(event) => editField("confidentialityYears", Math.min(100, Math.max(1, Math.floor(Number(event.target.value)) || 1)))} />
              <label htmlFor="conf-years">year(s) from Effective Date (trade secrets protected while they remain trade secrets)</label>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <input type="radio" id="conf-perpetuity" checked={data.confidentialityType === "perpetuity"} onChange={() => editField("confidentialityType", "perpetuity")} />
              <label htmlFor="conf-perpetuity">In perpetuity</label>
            </div>
          </fieldset>
          <Field label="Governing law" hint="State, e.g. Delaware"><input className={input} value={data.governingLaw} onChange={(event) => editField("governingLaw", event.target.value)} /></Field>
          <Field label="Jurisdiction" hint="City or county and state, e.g. courts located in New Castle, DE"><input className={input} value={data.jurisdiction} onChange={(event) => editField("jurisdiction", event.target.value)} /></Field>
          <Field label="MNDA modifications" hint="Optional; this field is not sent to chat"><textarea className={input} rows={3} value={data.modifications} onChange={(event) => update("modifications", event.target.value)} /></Field>
          <PartyFields title="Party 1" party={data.party1} onChange={(field, value) => editParty("party1", field, value)} />
          <PartyFields title="Party 2" party={data.party2} onChange={(field, value) => editParty("party2", field, value)} />
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={downloadPdf} className="button-primary">Print / Save PDF</button>
            <button type="button" onClick={downloadMarkdown} className="button-outline">Download Markdown</button>
          </div>
        </form>
        <article id="nda-preview" className="nda-preview rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 text-[var(--text)] sm:p-8 print:rounded-none print:border-0 print:p-0" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </main>
  );
}
