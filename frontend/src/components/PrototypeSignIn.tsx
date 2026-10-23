export default function PrototypeSignIn({ onSignIn }: { onSignIn: () => void }) {
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.currentTarget.reset();
    onSignIn();
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-5 py-12">
      <form className="w-full space-y-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-7 shadow-sm" onSubmit={submit}>
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-[var(--primary)]">Prelegal prototype</p>
          <h1 className="mt-2 text-2xl font-semibold">Sign in to continue</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">This is a demonstration screen only. It does not authenticate you or save your credentials.</p>
        </div>
        <label className="block space-y-1 text-sm font-medium">
          <span>Email</span>
          <input className="form-input" type="email" autoComplete="email" required />
        </label>
        <label className="block space-y-1 text-sm font-medium">
          <span>Password</span>
          <input className="form-input" type="password" autoComplete="current-password" required />
        </label>
        <button className="button-primary w-full" type="submit">Continue</button>
      </form>
    </main>
  );
}
