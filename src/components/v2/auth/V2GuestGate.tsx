"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Gift } from "lucide-react";
import { fillCopy, formatUsd } from "@/lib/marketing/copy";
import { useMarketingNumbers } from "@/lib/marketing/useMarketingNumbers";

type V2GuestGateProps = {
  icon: LucideIcon;
  title: string;
  body: string;
  /** Template with "{credit}"; hidden until the sign-up credit is known. */
  creditLine?: string;
  /** Template with "{price}" (the reference book price); hidden until it is known. */
  priceLine?: string;
  primary: { label: string; href: string; onClick?: () => void };
  secondary: { label: string; href: string; onClick?: () => void };
  /** Heading level for the title; the page already has its own h1. */
  headingAs?: "h2" | "h3";
};

/**
 * What a guest sees on a page that needs an account: why, what they get, and two ways forward.
 * Both links carry the `next` path the caller put in their hrefs.
 */
export function V2GuestGate({
  icon: Icon,
  title,
  body,
  creditLine,
  priceLine,
  primary,
  secondary,
  headingAs: Heading = "h2",
}: V2GuestGateProps) {
  const numbers = useMarketingNumbers(Boolean(creditLine || priceLine));
  const credit =
    creditLine && numbers?.welcomeCreditCents != null
      ? fillCopy(creditLine, { credit: formatUsd(numbers.welcomeCreditCents) })
      : null;
  const price =
    priceLine && numbers?.referencePriceCents != null
      ? fillCopy(priceLine, { price: formatUsd(numbers.referencePriceCents) })
      : null;

  return (
    <div className="v2-panel mx-auto flex max-w-md flex-col items-center gap-3 p-6 text-center sm:p-8">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-v2-primary-light text-v2-primary">
        <Icon className="h-6 w-6" aria-hidden />
      </span>
      <Heading className="v2-brand-title text-xl text-v2-ink">{title}</Heading>
      <p className="text-sm leading-relaxed text-v2-muted">{body}</p>
      {credit ? (
        <p className="inline-flex items-center gap-2 rounded-full border border-v2-primary/25 bg-v2-primary-light px-3.5 py-1.5 text-sm font-semibold text-v2-ink">
          <Gift className="h-4 w-4 shrink-0 text-v2-primary" aria-hidden />
          {credit}
        </p>
      ) : null}
      {price ? <p className="text-sm text-v2-muted">{price}</p> : null}
      <Link
        href={primary.href}
        onClick={primary.onClick}
        className="v2-btn-primary mt-2 min-h-11 w-full text-base"
      >
        {primary.label}
      </Link>
      <Link
        href={secondary.href}
        onClick={secondary.onClick}
        className="inline-flex min-h-11 items-center justify-center px-3 text-sm font-semibold text-v2-link underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-primary"
      >
        {secondary.label}
      </Link>
    </div>
  );
}
