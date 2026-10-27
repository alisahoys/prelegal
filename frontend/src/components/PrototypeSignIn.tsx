"use client";

import { useState } from "react";
import LegalDisclaimer from "@/components/LegalDisclaimer";

export type User = { id: number; email: string };

export default function PrototypeSignIn({ onSignIn }: { onSignIn: (user: User) => void }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail ?? "Unable to sign in.");
      onSignIn(result.user);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to sign in. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-5 py-12">
      <form className="w-full space-y-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-7 shadow-sm" onSubmit={submit}>
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-[var(--primary)]">Prelegal</p>
          <h1 className="mt-2 text-2xl font-semibold">{mode === "signin" ? "Welcome back" : "Create your account"}</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">Sign in to draft, save, and revisit your agreements.</p>
        </div>
        <label className="block space-y-1 text-sm font-medium">
          <span>Email</span>
          <input className="form-input" name="email" type="email" autoComplete="email" required />
        </label>
        <label className="block space-y-1 text-sm font-medium">
          <span>Password</span>
          <input className="form-input" name="password" type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} minLength={12} maxLength={128} required />
          {mode === "signup" && <span className="block text-xs text-[var(--muted)]">Use at least 12 characters.</span>}
        </label>
        {error && <p role="alert" className="text-sm text-[var(--error)]">{error}</p>}
        <button className="button-primary w-full" type="submit" disabled={pending}>{pending ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}</button>
        <p className="text-center text-sm text-[var(--muted)]">
          {mode === "signin" ? "New to Prelegal?" : "Already have an account?"}{" "}
          <button className="font-semibold text-[var(--primary)] underline" type="button" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(""); }}>{mode === "signin" ? "Create an account" : "Sign in"}</button>
        </p>
      </form>
      <LegalDisclaimer />
    </main>
  );
}
