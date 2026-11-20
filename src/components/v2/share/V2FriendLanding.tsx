"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Gift } from "lucide-react";
import { captureAttribution } from "@/lib/marketing/attribution";
import { friendTagsFor } from "@/lib/marketing/friendLink";
import { V2AuthHeading, V2AuthShell } from "@/components/v2/auth/V2AuthShell";
import { useAuth } from "@/context/AuthContext";
import type { FriendInvite } from "@/lib/credits/types";
import { formatUsd } from "@/lib/marketing/copy";

const AFTER_SIGN_UP = "/studio";

/**
 * Where a Share with a friend link or QR code lands. The sharer's ?ref= and campaign tags are kept
 * in the attribution cookie on arrival, so the sign-up that follows carries them and the
 * database credits both people once the new email is confirmed.
 */
export function V2FriendLanding({ code, invite }: { code: string; invite: FriendInvite | null }) {
  const { user } = useAuth();

  // Shared links are short (/friend/CODE?v=qr) so the QR code stays easy to scan. Put the full tags
  // on the address before the visit is recorded, so the sign-up that follows earns the credit.
  // (This runs before the layout's own capture, which then sees the same tags.)
  useEffect(() => {
    const url = new URL(window.location.href);
    const tags = friendTagsFor(code, url.searchParams);
    if (!tags) return;
    for (const [k, v] of Object.entries(tags)) url.searchParams.set(k, v);
    window.history.replaceState(window.history.state, "", url.toString());
    captureAttribution();
  }, [code]);

  const credit = invite && invite.friendCreditCents > 0 ? formatUsd(invite.friendCreditCents) : null;
  const sharer = invite?.sharerName ?? "A friend";
  const signUp = `/sign-up?next=${encodeURIComponent(AFTER_SIGN_UP)}`;

  return (
    <V2AuthShell>
      <div className="v2-auth-card w-full max-w-md p-6 text-center sm:p-8">
        <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-v2-primary-light text-v2-primary">
          <Gift className="h-6 w-6" aria-hidden />
        </span>
        <V2AuthHeading className="v2-brand-title text-2xl text-v2-ink sm:text-3xl">
          {credit ? `${sharer} sent you ${credit}` : `${sharer} invited you`}
        </V2AuthHeading>
        <p className="mt-3 text-base leading-relaxed text-v2-muted">
          Colorful Memories turns your family photos into coloring pages and printed coloring books.
        </p>

        {user ? (
          <>
            <p className="mt-5 rounded-xl bg-v2-bg-subtle px-4 py-3 text-sm text-v2-ink">
              You&apos;re already signed in, so this gift is for someone new. Pass it on!
            </p>
            <Link href="/studio" className="v2-btn-primary mt-5 min-h-11 w-full py-3">
              Go to my studio
            </Link>
          </>
        ) : (
          <>
            {credit ? (
              <p className="mt-5 text-sm font-semibold text-v2-success-text">
                Create a free account and {credit} of credit is yours.
              </p>
            ) : null}
            <Link href={signUp} className="v2-btn-primary mt-5 min-h-11 w-full py-3">
              {credit ? `Claim my ${credit}` : "Create a free account"}
            </Link>
            <Link
              href={`/sign-in?next=${encodeURIComponent(AFTER_SIGN_UP)}`}
              className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-v2-link hover:underline"
            >
              I already have an account
            </Link>
          </>
        )}
      </div>
    </V2AuthShell>
  );
}
