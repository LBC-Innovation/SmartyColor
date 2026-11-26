"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { Check, Copy, Gift, Loader2, Mail, MessageCircle, Send, Share2 } from "lucide-react";
import { V2StudioFrame } from "@/components/v2/V2Chrome";
import { useV2Toast } from "@/components/v2/V2Toast";
import { useAuth } from "@/context/AuthContext";
import * as api from "@/lib/api/client";
import type { ReferralSummary } from "@/lib/credits/types";
import { formatUsd } from "@/lib/marketing/copy";
import { FRIEND_VIA_PARAM, type FriendLinkVia } from "@/lib/marketing/friendLink";
import { track } from "@/lib/track";

/** The share link, tagged with how it was sent, so reports can tell a scan from a text. */
function linkVia(url: string, via: FriendLinkVia): string {
  const u = new URL(url);
  if (via === "link") u.searchParams.delete(FRIEND_VIA_PARAM);
  else u.searchParams.set(FRIEND_VIA_PARAM, via);
  return u.toString();
}

/** iOS wants `sms:&body=`, Android `sms:?body=`; `sms:?&body=` works on both. */
function smsHref(body: string): string {
  return `sms:?&body=${encodeURIComponent(body)}`;
}

function headline(s: ReferralSummary): string {
  const { friendCreditCents: friend, sharerCreditCents: sharer } = s;
  if (friend > 0 && sharer > 0) return `Give ${formatUsd(friend)}, get ${formatUsd(sharer)}`;
  if (friend > 0) return `Give a friend ${formatUsd(friend)}`;
  if (sharer > 0) return `Get ${formatUsd(sharer)} for every friend`;
  return "Share with a friend";
}

function subline(s: ReferralSummary): string {
  const { friendCreditCents: friend, sharerCreditCents: sharer } = s;
  if (friend > 0 && sharer > 0) {
    return friend === sharer
      ? `When a friend signs up with your link, you each get ${formatUsd(friend)} added to your wallet.`
      : `When a friend signs up with your link, they get ${formatUsd(friend)} and you get ${formatUsd(sharer)}.`;
  }
  if (friend > 0) return `When a friend signs up with your link, they get ${formatUsd(friend)} added to their wallet.`;
  if (sharer > 0) return `When a friend signs up with your link, you get ${formatUsd(sharer)} added to your wallet.`;
  return "Show a friend how to turn their photos into coloring pages.";
}

function textMessage(s: ReferralSummary): string {
  const url = linkVia(s.url, "sms");
  return s.friendCreditCents > 0
    ? `I've been turning our photos into coloring pages with Colorful Memories. Here's ${formatUsd(s.friendCreditCents)} to try it: ${url}`
    : `I've been turning our photos into coloring pages with Colorful Memories. Try it: ${url}`;
}

function useQrSvg(url: string | null): string | null {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    if (!url) return;
    let alive = true;
    void QRCode.toString(url, {
      type: "svg",
      errorCorrectionLevel: "M",
      margin: 0,
      color: { dark: "#0a101aff", light: "#ffffffff" },
    }).then((s) => {
      if (alive) setSvg(s);
    });
    return () => {
      alive = false;
    };
  }, [url]);
  return url ? svg : null;
}

/** Share with a friend: a big QR code to scan, and text, email or any app to send the link. */
export function V2ShareWithFriendStudio() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const toast = useV2Toast();
  const [summary, setSummary] = useState<ReferralSummary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const userId = user?.id ?? null;
  const qr = useQrSvg(summary?.qrUrl ?? null);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/sign-in?next=/share");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void api.fetchReferral().then((res) => {
      if (cancelled) return;
      if (api.isError(res)) setLoadError(res.error.message);
      else setSummary(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  async function copy(s: ReferralSummary) {
    try {
      await navigator.clipboard.writeText(linkVia(s.url, "link"));
      track("share", { method: "copy", content_type: "referral" });
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Copy the link from the box instead.", "Couldn't copy");
    }
  }

  async function nativeShare(s: ReferralSummary) {
    try {
      await navigator.share({ title: "Colorful Memories", text: textMessage(s) });
      track("share", { method: "native", content_type: "referral" });
    } catch {
      /* dismissed */
    }
  }

  async function onEmail(e: FormEvent) {
    e.preventDefault();
    const address = email.trim();
    if (!address || sending) return;
    setSending(true);
    setEmailError(null);
    const res = await api.emailFriendInvite(address, note);
    setSending(false);
    if (api.isError(res)) {
      setEmailError(res.error.message);
      return;
    }
    track("share", { method: "email", content_type: "referral" });
    toast.success({ title: "Invitation sent", message: `We emailed ${address}.` });
    setEmail("");
    setNote("");
    setEmailOpen(false);
  }

  return (
    <V2StudioFrame>
      <main className="flex-1 lg:min-h-0 lg:overflow-y-auto lg:overscroll-y-contain pb-[calc(3.5rem+env(safe-area-inset-bottom))] lg:pb-8">
        <div className="mx-auto w-full max-w-md px-5 py-8 sm:py-10">
          {loadError ? (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
              {loadError}
            </p>
          ) : !summary ? (
            <div className="flex justify-center py-24 text-v2-muted">
              <Loader2 className="h-6 w-6 animate-spin" aria-label="Loading" />
            </div>
          ) : (
            <div className="text-center">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-v2-primary-light text-v2-primary">
                <Gift className="h-6 w-6" aria-hidden />
              </span>
              <h1 className="v2-brand-title mt-4 text-3xl tracking-tight text-v2-ink sm:text-4xl">{headline(summary)}</h1>
              <p className="mx-auto mt-2 max-w-sm text-base leading-relaxed text-v2-muted">{subline(summary)}</p>

              <figure className="mx-auto mt-8 w-full max-w-[18rem]">
                <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-[0_12px_32px_rgb(10_16_26/0.08)]">
                  {qr ? (
                    <div
                      role="img"
                      aria-label="QR code for your share link"
                      className="aspect-square w-full [&>svg]:h-full [&>svg]:w-full"
                      dangerouslySetInnerHTML={{ __html: qr }}
                    />
                  ) : (
                    <div className="flex aspect-square w-full items-center justify-center text-v2-muted">
                      <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
                    </div>
                  )}
                </div>
                <figcaption className="mt-3 text-sm text-v2-muted">Have a friend scan this with their phone camera.</figcaption>
              </figure>

              <div className="mt-8 grid grid-cols-3 gap-2">
                <a
                  href={smsHref(textMessage(summary))}
                  onClick={() => track("share", { method: "sms", content_type: "referral" })}
                  className="v2-btn-outline min-h-14 flex-col gap-1 px-2 py-2 text-sm"
                >
                  <MessageCircle className="h-5 w-5" aria-hidden />
                  Text
                </a>
                <button
                  type="button"
                  aria-expanded={emailOpen}
                  aria-controls="friend-email-form"
                  onClick={() => setEmailOpen((v) => !v)}
                  className="v2-btn-outline min-h-14 flex-col gap-1 px-2 py-2 text-sm"
                >
                  <Mail className="h-5 w-5" aria-hidden />
                  Email
                </button>
                {canNativeShare ? (
                  <button
                    type="button"
                    onClick={() => void nativeShare(summary)}
                    className="v2-btn-outline min-h-14 flex-col gap-1 px-2 py-2 text-sm"
                  >
                    <Share2 className="h-5 w-5" aria-hidden />
                    More
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void copy(summary)}
                    className="v2-btn-outline min-h-14 flex-col gap-1 px-2 py-2 text-sm"
                  >
                    {copied ? <Check className="h-5 w-5" aria-hidden /> : <Copy className="h-5 w-5" aria-hidden />}
                    {copied ? "Copied" : "Copy link"}
                  </button>
                )}
              </div>

              {emailOpen ? (
                <form id="friend-email-form" onSubmit={onEmail} className="mt-4 space-y-2 text-left">
                  <label className="v2-label" htmlFor="friend-email">
                    Friend&apos;s email
                  </label>
                  <input
                    id="friend-email"
                    type="email"
                    inputMode="email"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    autoComplete="off"
                    required
                    autoFocus
                    placeholder="name@example.com"
                    className="v2-input w-full"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setEmailError(null);
                    }}
                  />
                  <textarea
                    aria-label="Add a note (optional)"
                    placeholder="Add a note (optional)"
                    maxLength={500}
                    rows={2}
                    className="v2-input w-full resize-none"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                  {emailError ? (
                    <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
                      {emailError}
                    </p>
                  ) : null}
                  <button type="submit" disabled={sending || !email.trim()} className="v2-btn-primary min-h-11 w-full py-3">
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
                    Send invitation
                  </button>
                </form>
              ) : null}

              {canNativeShare ? (
                <button
                  type="button"
                  onClick={() => void copy(summary)}
                  className="mt-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-v2-link hover:underline"
                >
                  {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
                  {copied ? "Link copied" : "Copy link"}
                </button>
              ) : null}

              {summary.referredCount > 0 ? (
                <p className="mt-8 rounded-2xl bg-v2-bg-subtle px-4 py-3 text-sm text-v2-ink">
                  {summary.referredCount === 1 ? "1 friend has" : `${summary.referredCount} friends have`} joined
                  {summary.earnedCents > 0 ? ` · you've earned ${formatUsd(summary.earnedCents)}` : ""}
                </p>
              ) : null}

              {summary.friendCreditCents > 0 || summary.sharerCreditCents > 0 ? (
                <p className="mx-auto mt-6 max-w-xs text-xs leading-relaxed text-v2-muted">
                  For new accounts only. Wallet rewards are added once your friend confirms their email.
                </p>
              ) : null}
            </div>
          )}
        </div>
      </main>
    </V2StudioFrame>
  );
}
