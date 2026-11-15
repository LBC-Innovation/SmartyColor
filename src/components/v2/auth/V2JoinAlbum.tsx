"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Users } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { acceptInvite, getInvitePreview } from "@/lib/library/client";
import type { AlbumInvitePreview } from "@/lib/library/types";
import { STUDIO_PATH } from "@/lib/v2/guestSession";
import { V2AuthHeading, V2AuthShell } from "@/components/v2/auth/V2AuthShell";

/**
 * An album invite link. Signed in: join straight away and open the album.
 * Signed out: say whose album it is, then sign up or sign in and come back here to join.
 */
export function V2JoinAlbum({ inviteId }: { inviteId: string }) {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [preview, setPreview] = useState<AlbumInvitePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const joining = useRef(false);
  const here = `/join/${encodeURIComponent(inviteId)}`;

  useEffect(() => {
    let cancelled = false;
    void getInvitePreview(inviteId).then((res) => {
      if (cancelled) return;
      if (res.error) setError("This invite link isn't valid any more. Ask whoever sent it for a new one.");
      else setPreview(res.data!);
    });
    return () => {
      cancelled = true;
    };
  }, [inviteId]);

  useEffect(() => {
    if (loading || !user || joining.current) return;
    joining.current = true;
    void acceptInvite(inviteId).then((res) => {
      if (res.error) {
        setError(res.error.message);
        return;
      }
      router.replace(`${STUDIO_PATH}?album=${encodeURIComponent(res.data!.albumId)}`);
    });
  }, [inviteId, loading, user, router]);

  if (error) {
    return (
      <V2AuthShell>
        <div className="v2-auth-card w-full max-w-md p-6 text-center sm:p-8">
          <V2AuthHeading className="v2-brand-title text-2xl text-v2-ink">Couldn&apos;t join the album</V2AuthHeading>
          <p className="mt-3 text-sm leading-relaxed text-v2-muted">{error}</p>
          <Link href={user ? STUDIO_PATH : "/"} className="v2-btn-primary mt-6 min-h-11 w-full py-3">
            {user ? "Go to my studio" : "Go to the home page"}
          </Link>
        </div>
      </V2AuthShell>
    );
  }

  if (loading || user || !preview) {
    return (
      <V2AuthShell>
        <p className="flex items-center gap-2 text-sm text-v2-muted" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          {user ? "Joining the album…" : "Loading…"}
        </p>
      </V2AuthShell>
    );
  }

  if (preview.used) {
    return (
      <V2AuthShell>
        <div className="v2-auth-card w-full max-w-md p-6 text-center sm:p-8">
          <V2AuthHeading className="v2-brand-title text-2xl text-v2-ink">This link has been used</V2AuthHeading>
          <p className="mt-3 text-sm leading-relaxed text-v2-muted">
            Each invite link works for one person. If that was you, sign in to see “{preview.albumName}”.
            Otherwise ask {preview.inviterName} for a new link.
          </p>
          <Link
            href={`/sign-in?next=${encodeURIComponent(here)}`}
            className="v2-btn-primary mt-6 min-h-11 w-full py-3"
          >
            Sign in
          </Link>
        </div>
      </V2AuthShell>
    );
  }

  return (
    <V2AuthShell>
      <div className="v2-auth-card w-full max-w-md p-6 sm:p-8">
        <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-v2-primary-light text-v2-primary">
          <Users className="h-6 w-6" aria-hidden />
        </span>
        <V2AuthHeading className="v2-brand-title text-2xl text-v2-ink">
          {preview.inviterName} invited you to an album
        </V2AuthHeading>
        <p className="mt-2 truncate text-base font-semibold text-v2-ink" title={preview.albumName}>
          {preview.albumName}
        </p>
        <p className="mt-3 text-sm leading-relaxed text-v2-muted">
          Add your own photos, see everything in it, and turn any of them into coloring pages. Create a
          free account to join, or sign in if you already have one.
        </p>
        <Link
          href={`/sign-up?invite=${encodeURIComponent(inviteId)}`}
          className="v2-btn-primary mt-6 min-h-11 w-full py-3"
        >
          Create an account and join
        </Link>
        <Link
          href={`/sign-in?next=${encodeURIComponent(here)}`}
          className="v2-btn-outline mt-3 min-h-11 w-full py-3"
        >
          I already have an account
        </Link>
      </div>
    </V2AuthShell>
  );
}
