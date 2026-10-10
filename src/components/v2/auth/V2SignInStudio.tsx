"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { STUDIO_PATH } from "@/lib/v2/guestSession";
import { V2MarketingHeader } from "@/components/v2/marketing/V2MarketingHeader";

function resolveNextPath(next: string | null): string {
  if (next && next.startsWith("/") && !next.startsWith("//")) {
    return next;
  }
  return STUDIO_PATH;
}

export function V2SignInStudio() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next");
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const err = await signIn(email, password);
      if (err) {
        setMessage(err);
        return;
      }
      router.push(resolveNextPath(next));
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-v2-bg">
      <V2MarketingHeader />

      <main className="flex flex-1 flex-col items-center justify-center px-5 py-8 sm:py-12">
        <form onSubmit={onSubmit} className="v2-auth-card w-full max-w-md p-6 sm:p-8">
          <h1 className="v2-brand-title text-2xl text-v2-ink">Welcome back</h1>
          <p className="mt-2 text-sm leading-relaxed text-v2-muted">
            Sign in to open the studio and access saved projects.
          </p>

          <div className="mt-6 space-y-4">
            <div>
              <label className="v2-label" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                className="v2-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="v2-label" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                minLength={6}
                autoComplete="current-password"
                className="v2-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          {message ? (
            <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {message}
            </p>
          ) : null}

          <button type="submit" disabled={busy} className="v2-btn-primary mt-6 w-full py-3">
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Signing in…
              </>
            ) : (
              "Sign in"
            )}
          </button>

          <p className="mt-6 text-center text-sm text-v2-muted">
            New here?{" "}
            <Link href="/sign-up" className="font-semibold text-v2-link hover:underline">
              Create an account
            </Link>
          </p>
        </form>

        <Link
          href="/"
          className="mt-6 text-sm font-medium text-v2-muted hover:text-v2-link"
        >
          ← Back to home
        </Link>
      </main>
    </div>
  );
}
