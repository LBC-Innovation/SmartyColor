"use client";

import Link from "next/link";
import { useEffect, useId, useState, type FormEvent } from "react";
import {
  AlertCircle,
  Check,
  Copy,
  Download,
  EyeOff,
  Link2,
  Loader2,
  Mail,
  MessageSquare,
  Printer,
  RotateCw,
  Send,
  Share2,
} from "lucide-react";
import { V2Modal } from "@/components/v2/ui/V2Modal";
import { useV2Toast } from "@/components/v2/V2Toast";
import { usePrintablePdf } from "@/components/v2/usePrintablePdf";
import { withNextParam } from "@/lib/auth/nextPath";
import { cn } from "@/lib/cn";
import * as library from "@/lib/library/client";
import type { PageShare } from "@/lib/library/types";
import { requestMigrationAfterSignup } from "@/lib/marketing/savePrompt";
import { STUDIO_PATH } from "@/lib/v2/guestSession";

/** Who can send this page to someone, and how. */
export type PageShareAccess =
  /** Signed in and allowed: the link points at this coloring page version. */
  | { kind: "ready"; photoId: string; revisionId: string }
  /** A guest: pages live only on this device, so there is nothing to link to yet. */
  | { kind: "guest" }
  /** Signed in, but someone else added this photo to a shared album. */
  | { kind: "not-owner" };

type Props = {
  /** The coloring page to preview. */
  sheetSrc: string;
  /** Builds this page's print-ready PDF (same file for printing and downloading). */
  makePdf: () => Promise<Blob>;
  share: PageShareAccess;
  /** "send" shows only the sharing part (the editor has its own Print and Download). */
  mode?: "all" | "send";
  onClose: () => void;
};

type SendMode = "email" | "text";

const SHARE_MESSAGE = "I made you a coloring page. Open it to print and color:";

/** `sms:` with a prefilled message. The `?&` form opens the composer on both iOS and Android. */
function smsHref(url: string): string {
  return `sms:?&body=${encodeURIComponent(`${SHARE_MESSAGE} ${url}`)}`;
}

/**
 * Everything you can do with one finished coloring page outside the app: print it on any printer
 * the device knows (the browser's print dialog), download the PDF, or send it to someone by email
 * or text. Sending uses the page's unlisted share link, which shows only this page.
 */
export function PagePrintShareModal({ sheetSrc, makePdf, share, mode = "all", onClose }: Props) {
  const sendOnly = mode === "send";
  return (
    <V2Modal
      onClose={onClose}
      maxWidthClass="max-w-lg"
      title={<h2 className="text-lg font-semibold text-v2-ink">{sendOnly ? "Share this page" : "Print or share"}</h2>}
    >
      <div className="space-y-6 p-5 sm:p-6">
        {sendOnly ? (
          // eslint-disable-next-line @next/next/no-img-element -- data URLs and signed URLs
          <img src={sheetSrc} alt="Coloring page" className="mx-auto h-40 w-auto rounded-lg border border-gray-200 bg-white object-contain p-1 shadow-sm" />
        ) : (
          <PrintPart sheetSrc={sheetSrc} makePdf={makePdf} />
        )}

        <section className={cn(!sendOnly && "border-t border-gray-200 pt-5")} aria-labelledby="send-page-heading">
          <h3 id="send-page-heading" className="text-sm font-semibold text-v2-ink">
            Send to someone
          </h3>
          {share.kind === "guest" ? (
            <GuestSendPrompt />
          ) : share.kind === "not-owner" ? (
            <p className="mt-1 text-sm text-v2-muted">Only the person who added this photo can send its page to others.</p>
          ) : (
            <SendPage photoId={share.photoId} revisionId={share.revisionId} />
          )}
        </section>
      </div>
    </V2Modal>
  );
}

/** Preview, Print and Download; the PDF is made as soon as this shows. */
function PrintPart({ sheetSrc, makePdf }: { sheetSrc: string; makePdf: () => Promise<Blob> }) {
  const { pdf, ready, printing, print, download, retry } = usePrintablePdf(makePdf);
  return (
        <div className="flex gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- data URLs and signed URLs */}
          <img
            src={sheetSrc}
            alt="Coloring page"
            className="h-36 w-28 shrink-0 rounded-lg border border-gray-200 bg-white object-contain p-1 shadow-sm"
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-v2-ink">Print at home</p>
            <p className="mt-0.5 text-sm text-v2-muted">Letter size, on any printer. Print as many copies as you like.</p>
            <div className="mt-3 grid gap-2">
              <button
                type="button"
                className="v2-btn-primary min-h-11 w-full text-sm"
                disabled={!ready || printing}
                onClick={print}
                autoFocus
              >
                {printing || pdf.status === "loading" ? (
                  <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
                ) : (
                  <Printer className="h-4 w-4" aria-hidden />
                )}
                Print
              </button>
              <button type="button" className="v2-btn-outline min-h-11 w-full text-sm" disabled={!ready} onClick={download}>
                <Download className="h-4 w-4" aria-hidden />
                Download PDF
              </button>
            </div>
            <p
              className={cn("mt-2 flex min-h-5 items-center gap-1.5 text-xs", pdf.status === "error" ? "text-rose-600" : "text-v2-muted")}
              role="status"
              aria-live="polite"
            >
              {pdf.status === "loading" ? (
                "Getting your page ready…"
              ) : pdf.status === "error" ? (
                <>
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  {pdf.message}
                  <button type="button" onClick={retry} className="inline-flex items-center gap-1 font-semibold text-v2-primary hover:underline">
                    <RotateCw className="h-3 w-3" aria-hidden />
                    Try again
                  </button>
                </>
              ) : null}
            </p>
          </div>
        </div>

  );
}

function GuestSendPrompt() {
  return (
            <div className="mt-2 rounded-2xl border border-v2-primary/25 bg-v2-primary-light/60 p-4 text-center">
              <p className="text-sm text-v2-ink">Create a free account to email or text this page. Your pages come with you.</p>
              <Link
                href={withNextParam("/sign-up", STUDIO_PATH)}
                onClick={requestMigrationAfterSignup}
                className="v2-btn-primary mt-3 min-h-11 w-full text-sm"
              >
                Create free account
              </Link>
              <Link
                href={withNextParam("/sign-in", STUDIO_PATH)}
                onClick={requestMigrationAfterSignup}
                className="mt-1 inline-flex min-h-11 items-center justify-center px-3 text-sm font-semibold text-v2-link underline-offset-2 hover:underline"
              >
                I already have an account
              </Link>
            </div>
  );
}

function SendPage({ photoId, revisionId }: { photoId: string; revisionId: string }) {
  const toast = useV2Toast();
  const idBase = useId();
  const [mode, setMode] = useState<SendMode>("email");
  const [link, setLink] = useState<PageShare | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void library.getPageShare(photoId).then((res) => {
      if (!cancelled) setLink(res.error ? null : (res.data ?? null));
    });
    return () => {
      cancelled = true;
    };
  }, [photoId]);

  /** The live link for this exact version; turns sharing on, or points an older link here. */
  async function ensureLink(): Promise<PageShare | null> {
    if (link && link.revisionId === revisionId) return link;
    setBusy(true);
    const res = await library.sharePage(photoId, revisionId);
    setBusy(false);
    if (res.error) {
      toast.error(res.error.message, "Couldn't make a link");
      return null;
    }
    setLink(res.data!);
    return res.data!;
  }

  async function sendEmail(e: FormEvent) {
    e.preventDefault();
    if (sending) return;
    setSending(true);
    setSendError(null);
    const to = email.trim();
    const res = await library.emailPageShare(photoId, { revisionId, email: to, note: note.trim() || undefined });
    setSending(false);
    if (res.error) {
      setSendError(res.error.message);
      return;
    }
    setLink(res.data!.share);
    setSentTo(to);
    setEmail("");
    setNote("");
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Copy the link from the box instead.", "Couldn't copy");
    }
  }

  async function nativeShare(url: string) {
    try {
      await navigator.share({ title: "A coloring page for you", text: SHARE_MESSAGE, url });
    } catch {
      /* dismissed */
    }
  }

  async function stopSharing() {
    setBusy(true);
    const res = await library.stopSharingPage(photoId);
    setBusy(false);
    if (res.error) {
      toast.error(res.error.message, "Couldn't stop sharing");
      return;
    }
    setLink(null);
    setSentTo(null);
    toast.success({ message: "The link no longer works." });
  }

  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const currentLink = link && link.revisionId === revisionId ? link : null;
  const tab = (id: SendMode, label: string, Icon: typeof Mail) => (
    <button
      type="button"
      role="tab"
      id={`${idBase}-${id}-tab`}
      aria-selected={mode === id}
      aria-controls={`${idBase}-${id}-panel`}
      onClick={() => setMode(id)}
      className={cn(
        "inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg text-sm font-semibold transition",
        mode === id ? "bg-white text-v2-ink shadow-sm" : "text-v2-muted hover:text-v2-ink",
      )}
    >
      <Icon className="h-4 w-4" aria-hidden />
      {label}
    </button>
  );

  return (
    <div className="mt-3 space-y-4">
      <div className="flex gap-1 rounded-xl bg-v2-bg-subtle p-1" role="tablist" aria-label="How to send">
        {tab("email", "Email", Mail)}
        {tab("text", "Text message", MessageSquare)}
      </div>

      {mode === "email" ? (
        <div role="tabpanel" id={`${idBase}-email-panel`} aria-labelledby={`${idBase}-email-tab`}>
          {sentTo ? (
            <div className="mb-3 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900" role="status">
              <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>
                Sent to <span className="font-semibold break-all">{sentTo}</span>. They&apos;ll get a link to print it and an invitation to make
                their own.
              </span>
            </div>
          ) : null}
          <form className="space-y-3" onSubmit={(e) => void sendEmail(e)}>
            <div>
              <label htmlFor={`${idBase}-email`} className="block text-sm font-semibold text-v2-ink">
                Their email
              </label>
              <input
                id={`${idBase}-email`}
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="v2-input mt-1 w-full"
                placeholder="grandma@example.com"
              />
            </div>
            <div>
              <label htmlFor={`${idBase}-note`} className="block text-sm font-semibold text-v2-ink">
                Add a note <span className="font-normal text-v2-muted">(optional)</span>
              </label>
              <textarea
                id={`${idBase}-note`}
                rows={2}
                maxLength={500}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="v2-input mt-1 w-full resize-none"
                placeholder="We colored ours already!"
              />
            </div>
            {sendError ? (
              <p className="text-sm text-red-700" role="alert">
                {sendError}
              </p>
            ) : null}
            <button type="submit" className="v2-btn-primary min-h-11 w-full text-sm" disabled={sending || !email.trim()}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
              {sentTo ? "Send to someone else" : "Send email"}
            </button>
          </form>
        </div>
      ) : (
        <div role="tabpanel" id={`${idBase}-text-panel`} aria-labelledby={`${idBase}-text-tab`} className="space-y-3">
          {currentLink ? (
            <>
              <a href={smsHref(currentLink.url)} className="v2-btn-primary min-h-11 w-full text-sm">
                <MessageSquare className="h-4 w-4" aria-hidden />
                Open Messages
              </a>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={currentLink.url}
                  aria-label="Share link"
                  className="v2-input min-w-0 flex-1 text-sm"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <button type="button" onClick={() => void copy(currentLink.url)} className="v2-btn-outline min-h-11 shrink-0 px-4 text-sm">
                  {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              {canNativeShare ? (
                <button type="button" onClick={() => void nativeShare(currentLink.url)} className="v2-btn-outline min-h-11 w-full text-sm">
                  <Share2 className="h-4 w-4" aria-hidden />
                  More ways to share
                </button>
              ) : null}
            </>
          ) : (
            <>
              <p className="text-sm text-v2-muted">
                Make a private link to this one page, then text it. They can open it to print, and make their own.
              </p>
              <button
                type="button"
                className="v2-btn-primary min-h-11 w-full text-sm"
                disabled={busy || link === undefined}
                onClick={() => void ensureLink()}
              >
                {busy || link === undefined ? (
                  <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
                ) : (
                  <Link2 className="h-4 w-4" aria-hidden />
                )}
                Get a link to text
              </button>
            </>
          )}
        </div>
      )}

      <p className="text-xs leading-relaxed text-v2-muted">
        The link shows only this coloring page. Your photo, your other pages and your album stay private.
        {link ? (
          <>
            {" "}
            <button
              type="button"
              className="inline-flex items-center gap-1 font-semibold text-red-700 underline-offset-2 hover:underline disabled:opacity-50"
              onClick={() => void stopSharing()}
              disabled={busy}
            >
              <EyeOff className="h-3 w-3" aria-hidden />
              Stop sharing
            </button>
          </>
        ) : null}
      </p>
    </div>
  );
}
