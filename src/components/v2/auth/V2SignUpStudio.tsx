"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2, Users } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { hasSessionToken } from "@/lib/api/client";
import { getInvitePreview } from "@/lib/library/client";
import type { AlbumInvitePreview } from "@/lib/library/types";
import { STUDIO_PATH } from "@/lib/v2/guestSession";
import { V2MarketingHeader } from "@/components/v2/marketing/V2MarketingHeader";
import { cn } from "@/lib/cn";
import { track } from "@/lib/track";

const STEPS = ["Welcome", "Your account", "Done"] as const;

export function V2SignUpStudio() {
  const router = useRouter();
  const inviteId = useSearchParams().get("invite");
  const { signUp } = useAuth();
  const [invite, setInvite] = useState<AlbumInvitePreview | null>(null);
  const [step, setStep] = useState(0);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [needsEmailConfirm, setNeedsEmailConfirm] = useState(false);

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

  const studioPath = invite ? `${STUDIO_PATH}?album=${encodeURIComponent(invite.albumId)}` : STUDIO_PATH;
  const signInHref = invite ? `/sign-in?next=${encodeURIComponent(studioPath)}` : "/sign-in";
  const invitedEmailMismatch =
    invite != null && email.trim() !== "" && email.trim().toLowerCase() !== invite.email;

  async function onCreateAccount(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (password !== confirm) {
      setMessage("Passwords do not match.");
      return;
    }
    if (password.length < 6) {
      setMessage("Password must be at least 6 characters.");
      return;
    }
    setBusy(true);
    const err = await signUp(email.trim(), password);
    setBusy(false);
    if (err) {
      setMessage(err);
      return;
    }
    track("sign_up", { method: "email" });
    setStep(2);
    setNeedsEmailConfirm(!hasSessionToken());
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-v2-bg">
      <V2MarketingHeader />

      <main className="flex flex-1 flex-col items-center px-5 py-8 sm:py-12">
        <div className="mb-8 flex w-full max-w-md items-center justify-center gap-2">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              <span
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold",
                  i <= step
                    ? "bg-v2-primary text-white"
                    : "bg-v2-bg-subtle text-v2-muted",
                )}
              >
                {i + 1}
              </span>
              <span
                className={cn(
                  "hidden text-xs font-semibold sm:inline",
                  i === step ? "text-v2-ink" : "text-v2-muted",
                )}
              >
                {label}
              </span>
              {i < STEPS.length - 1 ? (
                <span className="mx-1 hidden h-px w-6 bg-gray-200 sm:block" aria-hidden />
              ) : null}
            </div>
          ))}
        </div>

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

        <div className="v2-auth-card w-full max-w-md p-6 sm:p-8">
          {step === 0 && (
            <>
              <h1 className="v2-brand-title text-2xl text-v2-ink">Create your account</h1>
              <p className="mt-2 text-sm leading-relaxed text-v2-muted">
                Save projects in the cloud, sync across devices, and unlock admin tools when
                invited. You can still try the studio without an account anytime.
              </p>
              <ul className="mt-6 space-y-2 text-sm text-v2-navy">
                <li className="flex gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-v2-primary" aria-hidden />
                  Cloud-backed projects and photos
                </li>
                <li className="flex gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-v2-primary" aria-hidden />
                  Storybook albums and print exports
                </li>
                <li className="flex gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-v2-primary" aria-hidden />
                  Free tier to get started
                </li>
              </ul>
              <button
                type="button"
                className="v2-btn-primary mt-8 w-full py-3"
                onClick={() => setStep(1)}
              >
                Continue
              </button>
            </>
          )}

          {step === 1 && (
            <>
              <h1 className="v2-brand-title text-2xl text-v2-ink">Your account</h1>
              <p className="mt-2 text-sm text-v2-muted">Enter your email and choose a password.</p>
              <form onSubmit={onCreateAccount} className="mt-6 space-y-4">
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
                <div>
                  <label className="v2-label" htmlFor="signup-password">
                    Password
                  </label>
                  <input
                    name="password"
                    enterKeyHint="next"
                    id="signup-password"
                    type="password"
                    required
                    minLength={6}
                    autoComplete="new-password"
                    className="v2-input"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <div>
                  <label className="v2-label" htmlFor="signup-confirm">
                    Confirm password
                  </label>
                  <input
                    name="confirmPassword"
                    enterKeyHint="go"
                    id="signup-confirm"
                    type="password"
                    required
                    minLength={6}
                    autoComplete="new-password"
                    className="v2-input"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                  />
                </div>
                {message ? (
                  <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                    {message}
                  </p>
                ) : null}
                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    className="v2-btn-outline flex-1"
                    onClick={() => setStep(0)}
                  >
                    Back
                  </button>
                  <button type="submit" disabled={busy} className="v2-btn-primary flex-1 py-3">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create account"}
                  </button>
                </div>
              </form>
            </>
          )}

          {step === 2 && (
            <>
              <div className="flex flex-col items-center text-center">
                <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-v2-success-bg text-v2-success-text">
                  <CheckCircle2 className="h-8 w-8" aria-hidden />
                </span>
                <h1 className="v2-brand-title text-2xl text-v2-ink">You&apos;re all set</h1>
                {needsEmailConfirm ? (
                  <p className="mt-3 text-sm leading-relaxed text-v2-muted">
                    We sent a confirmation link to <strong className="text-v2-ink">{email}</strong>.
                    Confirm your email, then sign in to open {invite ? `“${invite.albumName}”` : "the studio"}.
                  </p>
                ) : (
                  <p className="mt-3 text-sm text-v2-muted">
                    {invite
                      ? `Your account is ready. “${invite.albumName}” is waiting in the studio.`
                      : "Your account is ready. Head to the studio to start coloring."}
                  </p>
                )}
              </div>
              <div className="mt-8 flex flex-col gap-2">
                {needsEmailConfirm ? (
                  <Link href={signInHref} className="v2-btn-primary w-full py-3 text-center">
                    Go to sign in
                  </Link>
                ) : (
                  <button
                    type="button"
                    className="v2-btn-primary w-full py-3"
                    onClick={() => router.push(studioPath)}
                  >
                    {invite ? "Open the album" : "Open studio"}
                  </button>
                )}
                <Link href="/" className="v2-btn-outline w-full py-3 text-center">
                  Back to home
                </Link>
              </div>
            </>
          )}

          {step < 2 ? (
            <p className="mt-6 text-center text-sm text-v2-muted">
              Already have an account?{" "}
              <Link href={signInHref} className="font-semibold text-v2-link hover:underline">
                Sign in
              </Link>
            </p>
          ) : null}
        </div>
      </main>
    </div>
  );
}
