"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Gift, Loader2, MailCheck, Users } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { hasSessionToken } from "@/lib/api/client";
import { getInvitePreview } from "@/lib/library/client";
import type { AlbumInvitePreview } from "@/lib/library/types";
import { STUDIO_PATH } from "@/lib/v2/guestSession";
import { V2AuthHeading, V2AuthShell } from "@/components/v2/auth/V2AuthShell";
import { V2PasswordField } from "@/components/v2/auth/V2PasswordField";
import { ACCOUNT_CREDIT_LINE, SIGN_UP } from "@/content/marketing";
import { friendlySignUpError, type FriendlySignUpError } from "@/lib/auth/friendlyAuthError";
import { safeNextPath } from "@/lib/auth/nextPath";
import { fillCopy, formatUsd } from "@/lib/marketing/copy";
import { track } from "@/lib/track";

export function V2SignUpStudio({ welcomeCreditCents }: { welcomeCreditCents: number | null }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteId = searchParams.get("invite");
  const next = safeNextPath(searchParams.get("next"));
  const { signUp } = useAuth();
  const [invite, setInvite] = useState<AlbumInvitePreview | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<FriendlySignUpError | null>(null);
  const [busy, setBusy] = useState(false);
  const [needsEmailConfirm, setNeedsEmailConfirm] = useState(false);
  const creditLine =
    welcomeCreditCents != null ? fillCopy(ACCOUNT_CREDIT_LINE, { credit: formatUsd(welcomeCreditCents) }) : null;

  // Arriving from a share email: say which album this is for and start on the right address.
  useEffect(() => {
    if (!inviteId) return;
    let cancelled = false;
    void getInvitePreview(inviteId).then((res) => {
      if (cancelled || res.error) return;
      setInvite(res.data!);
      setEmail((current) => current || res.data!.email);
    });
    return () => {
      cancelled = true;
    };
  }, [inviteId]);

  // Where to go once signed in: the page they came from, else a shared album, else the studio.
  const albumPath = invite ? `${STUDIO_PATH}?album=${encodeURIComponent(invite.albumId)}` : STUDIO_PATH;
  const destination = next ?? albumPath;
  const signInHref =
    invite || next ? `/sign-in?next=${encodeURIComponent(destination)}` : "/sign-in";
  const invitedEmailMismatch =
    invite != null && email.trim() !== "" && email.trim().toLowerCase() !== invite.email;

  async function onCreateAccount(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const err = await signUp(email.trim(), password);
    if (err) {
      setBusy(false);
      setError(friendlySignUpError(err));
      return;
    }
    track("sign_up", { method: "email" });
    if (!hasSessionToken()) {
      // The address has to be confirmed before there is a session.
      setBusy(false);
      setNeedsEmailConfirm(true);
      return;
    }
    router.push(destination);
    router.refresh();
  }

  if (needsEmailConfirm) {
    return (
      <V2AuthShell>
        <div className="v2-auth-card w-full max-w-md p-6 text-center sm:p-8">
          <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-v2-primary-light text-v2-primary">
            <MailCheck className="h-8 w-8" aria-hidden />
          </span>
          <V2AuthHeading className="v2-brand-title text-2xl text-v2-ink">{SIGN_UP.checkEmailTitle}</V2AuthHeading>
          <p className="mt-3 text-sm leading-relaxed text-v2-muted">
            We sent a link to <strong className="break-all text-v2-ink">{email.trim()}</strong> to
            confirm your address.{" "}
            {invite
              ? `Open it, then sign in to see “${invite.albumName}”.`
              : "Open it, then sign in to start."}
          </p>
          <Link href={signInHref} className="v2-btn-primary mt-6 min-h-11 w-full py-3">
            {SIGN_UP.goToSignIn}
          </Link>
        </div>
      </V2AuthShell>
    );
  }

  return (
    <V2AuthShell>
      {invite ? (
        <div className="mb-4 flex w-full max-w-md gap-3 rounded-2xl border border-v2-primary/25 bg-v2-primary-light px-4 py-3.5">
          <Users className="mt-0.5 h-5 w-5 shrink-0 text-v2-primary" aria-hidden />
          <p className="min-w-0 text-sm leading-relaxed text-v2-navy">
            <strong className="text-v2-ink">{invite.inviterName}</strong> invited you to add photos to
            <strong className="block truncate text-base text-v2-ink">{invite.albumName}</strong>
            Create your account with <strong className="text-v2-ink">{invite.email}</strong> and the
            album will be waiting for you.
          </p>
        </div>
      ) : null}

      <form onSubmit={onCreateAccount} className="v2-auth-card w-full max-w-md p-6 sm:p-8">
        <h1 className="v2-brand-title text-2xl text-v2-ink">{SIGN_UP.title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-v2-muted">{SIGN_UP.benefit}</p>
        {creditLine ? (
          <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-v2-primary/25 bg-v2-primary-light px-3.5 py-1.5 text-sm font-semibold text-v2-ink">
            <Gift className="h-4 w-4 shrink-0 text-v2-primary" aria-hidden />
            {creditLine}
          </p>
        ) : null}

        <div className="mt-6 space-y-4">
          <div>
            <label className="v2-label" htmlFor="signup-email">
              Email
            </label>
            <input
              name="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="next"
              id="signup-email"
              type="email"
              required
              autoComplete="email"
              aria-invalid={error?.field === "email" ? true : undefined}
              aria-describedby={error?.field === "email" ? "signup-error" : undefined}
              className="v2-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {invitedEmailMismatch ? (
              <p className="mt-1.5 text-xs leading-relaxed text-amber-800">
                The invitation was sent to {invite!.email}. The shared album only appears for
                an account that uses that address.
              </p>
            ) : null}
          </div>
          <V2PasswordField
            id="signup-password"
            label="Password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            enterKeyHint="go"
            minLength={6}
            hint={SIGN_UP.passwordRule}
            invalid={error?.field === "password"}
            errorId="signup-error"
          />
        </div>

        <div role="alert">
          {error ? (
            <p id="signup-error" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error.text}
              {error.accountExists ? (
                <>
                  {" "}
                  <Link href={signInHref} className="font-semibold underline">
                    {SIGN_UP.signIn}
                  </Link>
                </>
              ) : null}
            </p>
          ) : null}
        </div>

        <button type="submit" disabled={busy} className="v2-btn-primary mt-6 min-h-11 w-full py-3">
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Creating account…
            </>
          ) : (
            SIGN_UP.submit
          )}
        </button>

        <p className="mt-6 text-center text-sm text-v2-muted">
          {SIGN_UP.haveAccount}{" "}
          <Link
            href={signInHref}
            className="inline-flex min-h-11 items-center font-semibold text-v2-link hover:underline"
          >
            {SIGN_UP.signIn}
          </Link>
        </p>
      </form>
    </V2AuthShell>
  );
}
