"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { SIGNED_IN_HOME } from "@/components/v2/nav-config";
import { V2AuthShell } from "@/components/v2/auth/V2AuthShell";
import { V2PasswordField } from "@/components/v2/auth/V2PasswordField";
import { SIGN_IN, PASSWORD_RESET } from "@/content/marketing";
import { friendlySignInError } from "@/lib/auth/friendlyAuthError";
import { safeNextPath, withNextParam } from "@/lib/auth/nextPath";

export function V2SignInStudio() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next");
  const sessionExpired = searchParams.get("reason") === "expired";
  const passwordWasReset = searchParams.get("reset") === "1";
  const emailConfirmed = searchParams.get("confirmed") === "1";
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // A confirmation link may arrive with a session in the address (#access_token=…). It is never read,
  // stored or used: signing in always takes the password. Just remove it from the address bar, keeping
  // the router's history state.
  useEffect(() => {
    if (/(^|[#&])(access_token|refresh_token|error)=/.test(window.location.hash)) {
      window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
    }
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const err = await signIn(email.trim(), password);
      if (err) {
        setMessage(friendlySignInError(err));
        return;
      }
      router.push(safeNextPath(next) ?? SIGNED_IN_HOME);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <V2AuthShell>
      <form onSubmit={onSubmit} className="v2-auth-card w-full max-w-md p-6 sm:p-8">
        {sessionExpired ? (
          <div
            role="status"
            className="mb-5 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5 text-sm leading-relaxed text-sky-900"
          >
            <p className="font-semibold">You’ve been signed out</p>
            <p>
              Your session timed out after a while away. Sign in again to pick up where you left
              off.
            </p>
          </div>
        ) : null}
        {emailConfirmed ? (
          <p
            role="status"
            className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm leading-relaxed text-emerald-900"
          >
            {SIGN_IN.emailConfirmed}
          </p>
        ) : null}
        {passwordWasReset ? (
          <p
            role="status"
            className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm leading-relaxed text-emerald-900"
          >
            {PASSWORD_RESET.success}
          </p>
        ) : null}
        <h1 className="v2-brand-title text-2xl text-v2-ink">{SIGN_IN.title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-v2-muted">{SIGN_IN.subtitle}</p>

        <div className="mt-6 space-y-4">
          <div>
            <label className="v2-label" htmlFor="email">
              Email
            </label>
            <input
              name="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="next"
              id="email"
              type="email"
              required
              autoComplete="email"
              aria-invalid={message ? true : undefined}
              aria-describedby={message ? "signin-error" : undefined}
              className="v2-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <V2PasswordField
            id="password"
            label="Password"
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
            enterKeyHint="go"
            minLength={6}
            invalid={Boolean(message)}
            errorId="signin-error"
            labelAside={
              <Link
                href="/forgot-password"
                className="inline-flex min-h-11 items-center text-sm font-semibold text-v2-link hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-primary"
              >
                {SIGN_IN.forgot}
              </Link>
            }
          />
        </div>

        <div role="alert">
          {message ? (
            <p id="signin-error" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {message}
            </p>
          ) : null}
        </div>

        <button type="submit" disabled={busy} className="v2-btn-primary mt-6 min-h-11 w-full py-3">
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Signing in…
            </>
          ) : (
            SIGN_IN.submit
          )}
        </button>

        <p className="mt-6 text-center text-sm text-v2-muted">
          {SIGN_IN.newHere}{" "}
          <Link
            href={withNextParam("/sign-up", next)}
            className="inline-flex min-h-11 items-center font-semibold text-v2-link hover:underline"
          >
            {SIGN_IN.createAccount}
          </Link>
        </p>
      </form>
    </V2AuthShell>
  );
}
