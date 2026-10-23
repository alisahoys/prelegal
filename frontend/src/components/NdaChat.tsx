import type { ChatMessage, FieldPath } from "@/lib/chat";

type Conflict = { path: FieldPath; value: string | number };

export default function NdaChat({
  messages,
  conflicts,
  consent,
  pending,
  error,
  onConsent,
  onSend,
  onResolve,
}: {
  messages: ChatMessage[];
  conflicts: Conflict[];
  consent: boolean;
  pending: boolean;
  error: string;
  onConsent: (checked: boolean) => void;
  onSend: (message: string) => void;
  onResolve: (conflict: Conflict, apply: boolean) => void;
}) {
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const value = new FormData(form).get("message");
    if (typeof value === "string" && value.trim()) {
      onSend(value.trim());
      form.reset();
    }
  }

  return (
    <section className="chat-panel print:hidden" aria-label="Mutual NDA assistant">
      <h2 className="text-lg font-semibold">Mutual NDA assistant</h2>
      <div className="privacy-note">
        Using chat sends your message, recent chat, and current eligible Mutual NDA fields (not MNDA modifications) to OpenRouter through our server. This prototype does not save chat; OpenRouter’s data practices may apply. Don’t send information you are not comfortable sharing.
      </div>
      <label className="mt-3 flex gap-2 text-sm text-[var(--text)]">
        <input type="checkbox" checked={consent} onChange={(event) => onConsent(event.target.checked)} />
        <span>I understand and agree to send this information for AI assistance.</span>
      </label>
      <div className="chat-messages" aria-live="polite">
        {messages.length === 0 && <p className="text-sm text-[var(--muted)]">Ask about filling in the fields for this Mutual NDA. You can skip any field and edit everything yourself.</p>}
        {messages.map((message, index) => (
          <p key={index} className={message.role === "user" ? "chat-user" : "chat-assistant"}>
            <strong>{message.role === "user" ? "You" : "Assistant"}:</strong> {message.content}
          </p>
        ))}
        {pending && <p role="status" className="text-sm text-[var(--muted)]">Thinking…</p>}
      </div>
      {conflicts.length > 0 && (
        <div className="space-y-3" aria-label="Suggestions for manually edited fields">
          {conflicts.map((conflict) => (
            <div className="suggestion" key={conflict.path}>
              <p className="text-sm">Suggestion for <strong>{conflict.path}</strong>: {conflict.value}</p>
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
        <textarea className="form-input min-h-24" id="chat-message" name="message" maxLength={2000} placeholder="Describe the deal details you want to enter…" required />
        <button className="button-primary w-full" type="submit" disabled={!consent || pending}>Send to assistant</button>
      </form>
    </section>
  );
}
