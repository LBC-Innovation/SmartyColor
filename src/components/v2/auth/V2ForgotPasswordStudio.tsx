"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Loader2, MailCheck } from "lucide-react";
import { V2AuthHeading, V2AuthShell } from "@/components/v2/auth/V2AuthShell";
import { PASSWORD_RESET } from "@/content/marketing";
import * as api from "@/lib/api/client";

export function V2ForgotPasswordStudio() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    // No redirect is sent: the server decides where the link lands.
    const result = await api.requestPasswordReset(email.trim());
    setBusy(false);
    if (api.isError(result)) {
      const limited = /rate limit|too many|only request this after|security purposes/i.test(
        result.error.message,
      );
      setError(limited ? PASSWORD_RESET.rateLimited : PASSWORD_RESET.requestFailed);
      return;
    }
    // Same answer whether or not an account exists for the address.
    setSent(true);
  }

  if (sent) {
    return (
      <V2AuthShell>
        <div className="v2-auth-card w-full max-w-md p-6 text-center sm:p-8">
          <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-v2-primary-light text-v2-primary">
            <MailCheck className="h-8 w-8" aria-hidden />
          </span>
          <V2AuthHeading className="v2-brand-title text-2xl text-v2-ink">{PASSWORD_RESET.sentTitle}</V2AuthHeading>
          <p role="status" className="mt-3 text-sm leading-relaxed text-v2-muted">
            {PASSWORD_RESET.sentBody}
          </p>
          <Link href="/sign-in" className="v2-btn-primary mt-6 min-h-11 w-full py-3">
            {PASSWORD_RESET.backToSignIn}
          </Link>
        </div>
      </V2AuthShell>
    );
  }

  return (
    <V2AuthShell>
      <form onSubmit={onSubmit} className="v2-auth-card w-full max-w-md p-6 sm:p-8">
        <h1 className="v2-brand-title text-2xl text-v2-ink">{PASSWORD_RESET.forgotTitle}</h1>
        <p className="mt-2 text-sm leading-relaxed text-v2-muted">{PASSWORD_RESET.forgotBody}</p>

        <div className="mt-6">
          <label className="v2-label" htmlFor="forgot-email">
            Email
          </label>
          <input
            name="email"
            id="forgot-email"
            type="email"
            required
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
            autoFocus
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "forgot-error" : undefined}
            className="v2-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div role="alert">
          {error ? (
            <p id="forgot-error" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          ) : null}
        </div>

        <button type="submit" disabled={busy} className="v2-btn-primary mt-6 min-h-11 w-full py-3">
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Sending…
            </>
          ) : (
            PASSWORD_RESET.forgotSubmit
          )}
        </button>

        <p className="mt-6 text-center text-sm">
          <Link
            href="/sign-in"
            className="inline-flex min-h-11 items-center font-semibold text-v2-link hover:underline"
          >
            {PASSWORD_RESET.backToSignIn}
          </Link>
        </p>
      </form>
    </V2AuthShell>
  );
}
