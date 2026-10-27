"use client";

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import NdaChat from "@/components/NdaChat";
import LegalDisclaimer from "@/components/LegalDisclaimer";
import PrototypeSignIn, { type User } from "@/components/PrototypeSignIn";
import { listDocuments, saveDocument, getDocument, type DocumentState, type DocumentSummary, type SavedDocument } from "@/lib/documents";
import { applyPatch, currentDataForChat, sendChatTurn, type ChatMessage, type ChatTemplate, type FieldPath } from "@/lib/chat";
import { buildCoverPage, buildDocument, defaultNdaData, type NdaData, type Party } from "@/lib/nda";
import { fillTemplateMarkdown } from "@/lib/template-markdown";
import { markdownForDownload, renderMarkdown } from "@/lib/render-markdown";

type Conflict = { path: string; value: string | number; templateId?: string; label?: string };

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

type Template = ChatTemplate & { filename: string; markdown: string; sourceMarkdown: string };
const NDA_TEMPLATE_ID = "mutual-nda-standard-terms";
const NDA_COVER_ID = "mutual-nda-cover-page";

export default function NdaCreator({ templates }: { templates: Template[] }) {
  const [data, setData] = useState<NdaData>(defaultNdaData);
  const [selectedTemplateId, setSelectedTemplateId] = useState(NDA_TEMPLATE_ID);
  const [fieldDrafts, setFieldDrafts] = useState<Record<string, Record<string, string>>>({});
  const fieldDraftsRef = useRef(fieldDrafts);
  const dataRef = useRef(data);
  const [user, setUser] = useState<User | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [documentTitle, setDocumentTitle] = useState("Untitled agreement");
  const [documentStatus, setDocumentStatus] = useState("");
  const [documentError, setDocumentError] = useState("");
  const [documentPending, setDocumentPending] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [consent, setConsent] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const manuallyEdited = useRef(new Set<string>());
  const requestGeneration = useRef(0);
  const documentListGeneration = useRef(0);
  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId)!;
  const isNdaEditor = selectedTemplate.editor === "nda";
  const markdown = isNdaEditor
    ? selectedTemplateId === NDA_COVER_ID ? buildCoverPage(data) : buildDocument(selectedTemplate.markdown, data)
    : fillTemplateMarkdown(selectedTemplate.sourceMarkdown, fieldDrafts[selectedTemplateId] ?? {});

  useLayoutEffect(() => {
    dataRef.current = data;
    fieldDraftsRef.current = fieldDrafts;
  }, [data, fieldDrafts]);

  function commitData(next: NdaData | ((current: NdaData) => NdaData)) {
    const value = typeof next === "function" ? next(dataRef.current) : next;
    dataRef.current = value;
    setData(value);
  }

  useEffect(() => {
    commitData((current) => current.effectiveDate ? current : { ...current, effectiveDate: new Date().toISOString().slice(0, 10) });
    void fetch("/api/auth/session", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) return;
      const result = await response.json();
      setUser(result.user);
    }).finally(() => setSessionLoading(false));
  }, []);

  useEffect(() => {
    const generation = ++documentListGeneration.current;
    if (!user) return;
    void listDocuments().then((result) => {
      if (generation === documentListGeneration.current) setDocuments(result.items);
    }).catch((reason) => {
      if (generation === documentListGeneration.current) setDocumentError(reason instanceof Error ? reason.message : "Unable to load saved documents.");
    });
    return () => { documentListGeneration.current += 1; };
  }, [user]);

  const isBrowser = useSyncExternalStore(() => () => {}, () => true, () => false);
  const html = isBrowser ? renderMarkdown(markdown) : "";

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
    const template = selectedTemplate;
    const currentFields = template.editor === "nda" ? [] : template.fields.map((field) => ({ field, value: fieldDraftsRef.current[template.id]?.[field] ?? "" }));
    setPending(true);
    setError("");
    const previousMessages = messages;
    setMessages((current) => [...current, { role: "user", content: message }]);
    try {
      const result = await sendChatTurn(message, previousMessages, template, template.editor === "nda" ? currentDataForChat(dataRef.current) : null, currentFields);
      if (generation !== requestGeneration.current) return;
      if (template.editor === "nda" && result.updates) {
        const merged = applyPatch(dataRef.current, result.updates, manuallyEdited.current as Set<FieldPath>);
        commitData(merged.data);
        setConflicts((prior) => [
          ...prior.filter((conflict) => !merged.conflicts.some((next) => next.path === conflict.path)),
          ...merged.conflicts.map((conflict) => ({ ...conflict, label: conflict.path })),
        ]);
      } else if (template.editor !== "nda" && result.fieldUpdates.length) {
        const values = { ...(fieldDraftsRef.current[template.id] ?? {}) };
        const nextConflicts: Conflict[] = [];
        for (const update of result.fieldUpdates) {
          const path = `${template.id}:${update.field}`;
          if (manuallyEdited.current.has(path)) nextConflicts.push({ path: update.field, value: update.value, templateId: template.id, label: update.field });
          else values[update.field] = update.value;
        }
        const nextDrafts = { ...fieldDraftsRef.current, [template.id]: values };
        fieldDraftsRef.current = nextDrafts;
        setFieldDrafts(nextDrafts);
        setConflicts((prior) => [...prior.filter((conflict) => conflict.templateId !== template.id), ...nextConflicts]);
      }
      const suggestions = result.suggestions.filter((suggestion) => templates.some((template) => template.id === suggestion.templateId));
      const reply = result.needsMoreInformation && result.nextQuestion && !result.reply.includes(result.nextQuestion)
        ? `${result.reply}\n${result.nextQuestion}`
        : result.reply;
      setMessages((current) => [...current, { role: "assistant", content: reply, suggestions }]);
    } catch (reason) {
      if (generation === requestGeneration.current) {
        setError(reason instanceof Error ? reason.message : "The AI request failed. Your draft is unchanged; please try again.");
      }
    } finally {
      if (generation === requestGeneration.current) setPending(false);
    }
  }

  function selectTemplate(id: string) {
    if (!templates.some((template) => template.id === id) || id === selectedTemplateId) return;
    requestGeneration.current += 1;
    setPending(false);
    setMessages([]);
    setError("");
    setConflicts([]);
    setDocumentId(null);
    setDocumentTitle("Untitled agreement");
    setDocumentStatus("");
    setDocumentError("");
    setSelectedTemplateId(id);
  }

  function updateTemplateField(field: string, value: string) {
    const path = `${selectedTemplateId}:${field}`;
    manuallyEdited.current.add(path);
    setConflicts((current) => current.filter((conflict) => conflict.templateId !== selectedTemplateId || conflict.path !== field));
    const nextDrafts = { ...fieldDraftsRef.current, [selectedTemplateId]: { ...(fieldDraftsRef.current[selectedTemplateId] ?? {}), [field]: value } };
    fieldDraftsRef.current = nextDrafts;
    setFieldDrafts(nextDrafts);
  }

  function resolveConflict(conflict: Conflict, apply: boolean) {
    if (apply && conflict.templateId) {
      const nextDrafts = { ...fieldDraftsRef.current, [conflict.templateId]: { ...(fieldDraftsRef.current[conflict.templateId] ?? {}), [conflict.path]: String(conflict.value) } };
      fieldDraftsRef.current = nextDrafts;
      setFieldDrafts(nextDrafts);
    } else if (apply) {
      commitData((current) => setField(current, conflict.path as FieldPath, conflict.value));
    }
    setConflicts((current) => current.filter((item) => item.path !== conflict.path || item.templateId !== conflict.templateId));
  }

  function clearDraft() {
    requestGeneration.current += 1;
    setPending(false);
    manuallyEdited.current.clear();
    commitData({ ...defaultNdaData(), effectiveDate: new Date().toISOString().slice(0, 10) });
    setMessages([]);
    setFieldDrafts({});
    fieldDraftsRef.current = {};
    setSelectedTemplateId(NDA_TEMPLATE_ID);
    setConflicts([]);
    setConsent(false);
    setError("");
  }

  async function signOut() {
    const response = await fetch("/api/auth/signout", { method: "POST" });
    clearDraft();
    documentListGeneration.current += 1;
    setDocuments([]);
    setDocumentId(null);
    setDocumentTitle("Untitled agreement");
    setDocumentStatus("");
    setDocumentError(response.ok ? "" : "Your local session ended, but the server could not revoke it. Please retry sign out.");
    setUser(null);
  }

  async function saveCurrentDocument() {
    const generation = requestGeneration.current;
    setDocumentPending(true);
    setDocumentError("");
    setDocumentStatus("");
    const state: DocumentState = {
      templateId: selectedTemplateId,
      ndaData: isNdaEditor ? data : null,
      fields: isNdaEditor ? {} : fieldDrafts[selectedTemplateId] ?? {},
    };
    try {
      const saved = await saveDocument({ id: documentId ?? undefined, title: documentTitle, state });
      if (generation !== requestGeneration.current) return;
      setDocumentId(saved.id);
      setDocumentTitle(saved.title);
      setDocumentStatus("Saved.");
      const result = await listDocuments();
      if (generation === requestGeneration.current) setDocuments(result.items);
    } catch (reason) {
      if (generation === requestGeneration.current) setDocumentError(reason instanceof Error ? reason.message : "Unable to save document.");
    } finally {
      if (generation === requestGeneration.current) setDocumentPending(false);
    }
  }

  async function openDocument(summary: DocumentSummary) {
    let generation = requestGeneration.current;
    setDocumentPending(true);
    setDocumentError("");
    try {
      const saved: SavedDocument = await getDocument(summary.id);
      if (generation !== requestGeneration.current) return;
      clearDraft();
      generation = requestGeneration.current;
      setSelectedTemplateId(saved.templateId);
      setDocumentId(saved.id);
      setDocumentTitle(saved.title);
      if (saved.state.ndaData) commitData(saved.state.ndaData);
      else {
        const drafts = { ...fieldDraftsRef.current, [saved.templateId]: saved.state.fields };
        fieldDraftsRef.current = drafts;
        setFieldDrafts(drafts);
      }
      setDocumentStatus(`Opened “${saved.title}”.`);
    } catch (reason) {
      if (generation === requestGeneration.current) setDocumentError(reason instanceof Error ? reason.message : "Unable to open document.");
    } finally {
      if (generation === requestGeneration.current) setDocumentPending(false);
    }
  }

  function downloadMarkdown() {
    const url = URL.createObjectURL(new Blob([markdownForDownload(markdown)], { type: "text/markdown" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = selectedTemplate.filename.split("/").at(-1)!;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadPdf() {
    const originalTitle = document.title;
    document.title = selectedTemplate.name.replace(/[^A-Za-z0-9-]+/g, "-");
    window.addEventListener("afterprint", () => { document.title = originalTitle; }, { once: true });
    window.print();
  }

  if (sessionLoading) return <main className="mx-auto flex min-h-screen items-center p-6 text-[var(--muted)]">Checking your session…</main>;
  if (!user) return <PrototypeSignIn onSignIn={setUser} />;

  return (
    <main className="mx-auto w-full max-w-[1800px] p-4 sm:p-6">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-[var(--primary)]">Prelegal</p>
          <h1 className="text-2xl font-semibold">Agreement workspace</h1>
          <p className="text-sm text-[var(--muted)]">Signed in as {user.email}</p>
        </div>
        <button className="button-secondary" type="button" onClick={() => void signOut()}>Sign out</button>
      </header>
      <LegalDisclaimer />
      <section className="mb-5 grid gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:grid-cols-[minmax(180px,1fr)_auto] print:hidden" aria-label="Saved documents">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[180px] flex-1 space-y-1 text-sm font-medium"><span>Document title</span><input className={input} maxLength={200} value={documentTitle} onChange={(event) => setDocumentTitle(event.target.value)} /></label>
          <button className="button-primary" type="button" disabled={documentPending} onClick={() => void saveCurrentDocument()}>{documentPending ? "Saving…" : documentId ? "Save changes" : "Save document"}</button>
          {documentStatus && <p role="status" className="text-sm text-[var(--success)]">{documentStatus}</p>}
          {documentError && <p role="alert" className="text-sm text-[var(--error)]">{documentError}</p>}
        </div>
        <label className="space-y-1 text-sm font-medium"><span>Saved documents</span><select className={input} value="" disabled={documentPending || documents.length === 0} onChange={(event) => { const selected = documents.find((item) => item.id === event.target.value); if (selected) void openDocument(selected); }}><option value="">{documents.length ? "Open a saved document…" : "No saved documents yet"}</option>{documents.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
      </section>
      <label className="mb-5 block max-w-xl space-y-1 print:hidden">
        <span className="text-sm font-medium">Document template</span>
        <select className={input} value={selectedTemplateId} disabled={documentPending} onChange={(event) => selectTemplate(event.target.value)}>
          {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
        </select>
      </label>
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(280px,0.85fr)_minmax(340px,1fr)_minmax(400px,1.2fr)]">
        <NdaChat
          messages={messages}
          conflicts={conflicts}
          onSelectTemplate={selectTemplate}
          getTemplateName={(id) => templates.find((template) => template.id === id)?.name}
          consent={consent}
          pending={pending}
          error={error}
          onConsent={setConsent}
          onSend={sendMessage}
          onResolve={resolveConflict}
        />
        <div className="space-y-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 print:hidden">
          {isNdaEditor ? <>
          <h2 className="text-lg font-semibold">{selectedTemplateId === NDA_COVER_ID ? "Mutual NDA Cover Page details" : "Mutual NDA details"}</h2>
          <p className="text-sm text-[var(--muted)]">{selectedTemplate.description}</p>
          <p className="text-sm text-[var(--muted)]">{selectedTemplateId === NDA_COVER_ID ? "This structured editor generates the Mutual NDA cover page." : "This structured editor generates the completed Mutual NDA cover page together with these standard terms."}</p>
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
          </> : <>
            <h2 className="text-lg font-semibold">{selectedTemplate.name}</h2>
            <p className="text-sm text-[var(--muted)]">{selectedTemplate.description}</p>
            <p className="text-sm text-[var(--muted)]">Fill in the highlighted terms. Values update every matching term in the agreement.</p>
            {selectedTemplate.fields.map((field) => (
              <Field key={field} label={field}>
                <input className={input} value={fieldDrafts[selectedTemplateId]?.[field] ?? ""} onChange={(event) => updateTemplateField(field, event.target.value)} />
              </Field>
            ))}
          </>}
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={downloadPdf} className="button-primary">Print / Save PDF</button>
            <button type="button" onClick={downloadMarkdown} className="button-outline">Download Markdown</button>
          </div>
        </div>
        <article id="nda-preview" className="nda-preview rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 text-[var(--text)] sm:p-8 print:rounded-none print:border-0 print:p-0" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </main>
  );
}
