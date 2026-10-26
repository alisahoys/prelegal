import { useEffect, useRef } from "react";
import type { ChatMessage, TemplateSuggestion } from "@/lib/chat";

type Conflict = { path: string; value: string | number; templateId?: string; label?: string };

export default function NdaChat({
  messages,
  conflicts,
  consent,
  pending,
  error,
  onConsent,
  onSend,
  onResolve,
  onSelectTemplate,
  getTemplateName,
}: {
  messages: ChatMessage[];
  conflicts: Conflict[];
  consent: boolean;
  pending: boolean;
  error: string;
  onConsent: (checked: boolean) => void;
  onSend: (message: string) => void;
  onResolve: (conflict: Conflict, apply: boolean) => void;
  onSelectTemplate: (templateId: string) => void;
  getTemplateName: (templateId: string) => string | undefined;
}) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const latestAssistant = [...messages].reverse().find((message) => message.role === "assistant");

  useEffect(() => {
    if (latestAssistant) inputRef.current?.focus();
  }, [latestAssistant]);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const value = new FormData(form).get("message");
    if (typeof value === "string" && value.trim() && consent && !pending) {
      onSend(value.trim());
      form.reset();
    }
  }

  return (
    <section className="chat-panel print:hidden" aria-label="Agreement assistant">
      <h2 className="text-lg font-semibold">Agreement assistant</h2>
      <div className="privacy-note">
        Chat sends your message and recent conversation to OpenRouter through our server, along with eligible fields from the selected template. Full agreement text and MNDA modifications are never sent. Chat is not saved by this prototype; OpenRouter’s data practices may apply. Don’t send information you are not comfortable sharing.
      </div>
      <label className="mt-3 flex gap-2 text-sm text-[var(--text)]">
        <input type="checkbox" checked={consent} onChange={(event) => onConsent(event.target.checked)} />
        <span>I understand and agree to send this information for AI assistance.</span>
      </label>
      <div className="chat-messages" aria-live="polite">
        {messages.length === 0 && <p className="text-sm text-[var(--muted)]">Ask for help choosing a template or filling in the selected agreement.</p>}
        {messages.map((message, index) => (
          <div key={index} className={message.role === "user" ? "chat-user" : "chat-assistant"}>
            <p><strong>{message.role === "user" ? "You" : "Assistant"}:</strong> {message.content}</p>
            {message.suggestions?.map((suggestion: TemplateSuggestion) => {
              const name = getTemplateName(suggestion.templateId);
              return name ? (
                <div className="mt-2" key={suggestion.templateId}>
                  <p className="text-sm">{suggestion.reason}</p>
                  <button className="button-primary mt-2" type="button" onClick={() => onSelectTemplate(suggestion.templateId)}>Use {name}</button>
                </div>
              ) : null;
            })}
          </div>
        ))}
        {pending && <p role="status" className="text-sm text-[var(--muted)]">Thinking…</p>}
      </div>
      {conflicts.length > 0 && (
        <div className="space-y-3" aria-label="Suggestions for manually edited fields">
          {conflicts.map((conflict) => (
            <div className="suggestion" key={conflict.path}>
              <p className="text-sm">Suggestion for <strong>{conflict.label ?? conflict.path}</strong>: {conflict.value}</p>
              <div className="mt-2 flex gap-2">
                <button className="button-primary" type="button" onClick={() => onResolve(conflict, true)}>Apply suggestion</button>
                <button className="button-secondary" type="button" onClick={() => onResolve(conflict, false)}>Keep my value</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {error && <p role="alert" className="mt-3 text-sm text-[var(--error)]">{error}</p>}
      <form className="mt-4 space-y-3" onSubmit={submit}>
        <label className="sr-only" htmlFor="chat-message">Message</label>
        <textarea ref={inputRef} className="form-input min-h-24" id="chat-message" name="message" maxLength={2000} placeholder="Describe the deal details you want to enter…" required />
        <button className="button-primary w-full" type="submit" disabled={!consent || pending}>Send to assistant</button>
      </form>
    </section>
  );
}
