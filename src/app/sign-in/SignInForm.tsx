"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { KidButton } from "@/components/KidButton";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function SignInForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const supabase = createSupabaseBrowserClient();

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!supabase) {
      setMessage("Accounts are not connected yet.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      if (mode === "up") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMessage("Check your email, then you can save pictures.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        router.push("/library");
        router.refresh();
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-full max-w-lg flex-col gap-6 px-6 py-8">
      <AppHeader />
      <form
        onSubmit={onSubmit}
        className="flex flex-col gap-4 rounded-(--radius-card) border-[3px] border-ink bg-paper p-6 shadow-crayon"
      >
        <h1 className="font-display text-3xl font-bold">
          {mode === "in" ? "Welcome back" : "Make a save-spot"}
        </h1>
        <p className="font-body text-lg text-ink-soft">
          You can keep coloring without an account. An account lets you reopen
          pictures later.
        </p>
        <label className="flex flex-col gap-1 font-display text-sm font-semibold">
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="rounded-2xl border-2 border-ink bg-cream px-3 py-2 font-body text-lg"
          />
        </label>
        <label className="flex flex-col gap-1 font-display text-sm font-semibold">
          Password
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="rounded-2xl border-2 border-ink bg-cream px-3 py-2 font-body text-lg"
          />
        </label>
        {message ? <p className="font-body text-ink-soft">{message}</p> : null}
        <KidButton type="submit" disabled={busy}>
          {mode === "in" ? "Sign in" : "Create account"}
        </KidButton>
        <button
          type="button"
          className="font-display text-sm underline decoration-2 underline-offset-4"
          onClick={() => setMode(mode === "in" ? "up" : "in")}
        >
          {mode === "in"
            ? "Need a save-spot? Create an account"
            : "Already have one? Sign in"}
        </button>
      </form>
    </div>
  );
}
