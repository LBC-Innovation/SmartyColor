"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { hasSessionToken } from "@/lib/api/client";
import { withNextParam } from "@/lib/auth/nextPath";

/** Tags sign-ups that came from a shared page so they can be counted, and credits the sharer. */
function tags(refCode: string | null): string {
  const ref = refCode ? `&ref=${encodeURIComponent(refCode)}` : "";
  return `utm_source=share&utm_medium=page_link&utm_campaign=shared_page${ref}`;
}

function signUpHref(path: "/sign-up" | "/sign-in", refCode: string | null): string {
  return `${withNextParam(path, "/studio")}&${tags(refCode)}`;
}

const noop = () => () => {};

/**
 * The invitation under a shared coloring page. Someone who isn't signed in on this device is asked
 * to create a free account (the page they were sent is a taste of what they'd make); someone who
 * is signed in just gets a way back to their albums.
 */
export function SharedPageSignUp({ refCode = null }: { refCode?: string | null }) {
  // Server render and first paint assume a visitor; the stored session decides after hydration.
  const signedIn = useSyncExternalStore(noop, hasSessionToken, () => false);

  if (signedIn) {
    return (
      <section className="v2-panel mt-2 w-full p-5">
        <h1 className="text-lg font-semibold text-v2-ink">Make one from your own photos</h1>
        <p className="mt-1 text-sm leading-relaxed text-v2-muted">Turn a family photo into a coloring page like this one.</p>
        <Link href="/studio" className="v2-btn-primary mt-4 inline-flex">
          Open my albums
        </Link>
      </section>
    );
  }

  return (
    <section className="v2-panel mt-2 w-full p-5">
      <h1 className="text-lg font-semibold text-v2-ink">Coloring pages from your own photos</h1>
      <p className="mt-1 text-sm leading-relaxed text-v2-muted">
        This page started as a family photo. Create a free account to turn yours into pages your kids will recognize, then
        print them at home or order a book.
      </p>
      <Link href={signUpHref("/sign-up", refCode)} className="v2-btn-primary mt-4 inline-flex">
        Create a free account
      </Link>
      <p className="mt-3 text-sm text-v2-muted">
        Already have one?{" "}
        <Link href={signUpHref("/sign-in", refCode)} className="font-semibold text-v2-link underline-offset-2 hover:underline">
          Sign in
        </Link>
        <span aria-hidden> · </span>
        <Link href={`/?${tags(refCode)}`} className="font-semibold text-v2-link underline-offset-2 hover:underline">
          Try a free coloring page
        </Link>
      </p>
    </section>
  );
}
