"use client";

import { useEffect, useState, useSyncExternalStore, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, TriangleAlert } from "lucide-react";
import { V2AuthHeading, V2AuthShell } from "@/components/v2/auth/V2AuthShell";
import { V2PasswordField } from "@/components/v2/auth/V2PasswordField";
import { PASSWORD_RESET } from "@/content/marketing";
import * as api from "@/lib/api/client";
import { readRecoveryLink, stripRecoveryLinkFromUrl } from "@/lib/auth/recoveryLink";

// A new link pasted into the same tab only changes the hash.
const subscribe = (onChange: () => void) => {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
};
const serverSnapshot = () => null;

export function V2ResetPasswordStudio() {
  const router = useRouter();
  // null on the server and during hydration; then what the link carried.
  const link = useSyncExternalStore(subscribe, readRecoveryLink, serverSnapshot);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejected, setRejected] = useState(false);

  // The token lives in memory from here on. Strip it after this commit's other effects have run
  // (analytics checks the address for secrets first), so it never stays in history.
  useEffect(() => {
    if (!link) return;
    const timer = window.setTimeout(stripRecoveryLinkFromUrl, 0);
    return () => window.clearTimeout(timer);
  }, [link]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (link?.status !== "ready") return;
    setBusy(true);
    setError(null);
    const result = await api.confirmPasswordReset(link.accessToken, password);
    if (api.isError(result)) {
      setBusy(false);
      if (/invalid or expired/i.test(result.error.message)) setRejected(true);
      else setError(PASSWORD_RESET.resetFailed);
      return;
    }
    router.replace("/sign-in?reset=1");
  }

  if (!link) {
    return (
      <V2AuthShell>
        <p className="flex items-center gap-2 text-sm text-v2-muted" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Checking your link…
        </p>
      </V2AuthShell>
    );
  }

  if (link.status === "invalid" || rejected) {
    return (
      <V2AuthShell>
        <div className="v2-auth-card w-full max-w-md p-6 text-center sm:p-8">
          <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-700">
            <TriangleAlert className="h-8 w-8" aria-hidden />
          </span>
          <V2AuthHeading className="v2-brand-title text-2xl text-v2-ink">{PASSWORD_RESET.invalidTitle}</V2AuthHeading>
          <p className="mt-3 text-sm leading-relaxed text-v2-muted">{PASSWORD_RESET.invalidBody}</p>
          <Link href="/forgot-password" className="v2-btn-primary mt-6 min-h-11 w-full py-3">
            {PASSWORD_RESET.requestNew}
          </Link>
          <Link
            href="/sign-in"
            className="mt-2 inline-flex min-h-11 items-center justify-center text-sm font-semibold text-v2-link hover:underline"
          >
            {PASSWORD_RESET.backToSignIn}
          </Link>
        </div>
      </V2AuthShell>
    );
  }

  return (
    <V2AuthShell>
      <form onSubmit={onSubmit} className="v2-auth-card w-full max-w-md p-6 sm:p-8">
        <h1 className="v2-brand-title text-2xl text-v2-ink">{PASSWORD_RESET.resetTitle}</h1>

        <div className="mt-6">
          <V2PasswordField
            id="reset-password"
            label={PASSWORD_RESET.newPassword}
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            enterKeyHint="go"
            minLength={6}
            hint={PASSWORD_RESET.passwordRule}
            invalid={Boolean(error)}
            errorId="reset-error"
            autoFocus
          />
        </div>

        <div role="alert">
          {error ? (
            <p id="reset-error" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          ) : null}
        </div>

        <button type="submit" disabled={busy} className="v2-btn-primary mt-6 min-h-11 w-full py-3">
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Saving…
            </>
          ) : (
            PASSWORD_RESET.resetSubmit
          )}
        </button>
      </form>
    </V2AuthShell>
  );
}
