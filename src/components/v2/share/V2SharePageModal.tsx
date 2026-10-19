"use client";

import { useEffect, useState } from "react";
import { Check, Copy, EyeOff, Link2, Loader2, RefreshCw } from "lucide-react";
import { V2Modal } from "@/components/v2/ui/V2Modal";
import { useV2Toast } from "@/components/v2/V2Toast";
import * as library from "@/lib/library/client";
import type { PageShare } from "@/lib/library/types";

type Props = {
  photoId: string;
  /** The coloring page version on screen; the link shows this one. */
  revisionId: string;
  sheetSrc: string;
  onClose: () => void;
};

/**
 * Turn an unlisted link to one coloring page on or off. The link shows the page only (never
 * the photo or the album), isn't listed in search engines, and stops working when turned off.
 */
export function V2SharePageModal({ photoId, revisionId, sheetSrc, onClose }: Props) {
  const toast = useV2Toast();
  const [share, setShare] = useState<PageShare | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void library.getPageShare(photoId).then((res) => {
      if (cancelled) return;
      if (res.error) setLoadError(res.error.message);
      else setShare(res.data ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [photoId]);

  /** `quiet` for the automatic copy after creating a link, which browsers may refuse without a tap. */
  async function copy(url: string, quiet = false) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      if (!quiet) toast.error("Copy the link from the box instead.", "Couldn't copy");
    }
  }

  async function turnOn() {
    if (busy) return;
    setBusy(true);
    const res = await library.sharePage(photoId, revisionId);
    setBusy(false);
    if (res.error) {
      toast.error(res.error.message, "Couldn't share this page");
      return;
    }
    setShare(res.data!);
    void copy(res.data!.url, true);
  }

  async function turnOff() {
    if (busy) return;
    setBusy(true);
    const res = await library.stopSharingPage(photoId);
    setBusy(false);
    if (res.error) {
      toast.error(res.error.message, "Couldn't stop sharing");
      return;
    }
    setShare(null);
    toast.success({ message: "The link no longer works." });
  }

  async function nativeShare(url: string) {
    try {
      await navigator.share({ title: "A coloring page for you", url });
    } catch {
      /* dismissed */
    }
  }

  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const showsOtherVersion = Boolean(share && share.revisionId !== revisionId);

  return (
    <V2Modal
      onClose={onClose}
      maxWidthClass="max-w-md"
      title={
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-v2-muted">Share page</p>
          <h2 className="text-lg font-semibold text-v2-ink">Send this coloring page</h2>
        </div>
      }
    >
      <div className="space-y-5 p-5 sm:p-6">
        <div className="flex gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={sheetSrc}
            alt=""
            className="h-28 w-24 shrink-0 rounded-lg border border-gray-200 bg-white object-contain"
          />
          <p className="text-sm leading-relaxed text-v2-muted">
            Anyone with the link can see and print this one coloring page. Your photo, your other
            pages and your album stay private, and the link isn&apos;t listed on search engines.
          </p>
        </div>

        {loadError ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
            {loadError}
          </p>
        ) : share === undefined ? (
          <p className="flex items-center gap-2 text-sm text-v2-muted">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Loading…
          </p>
        ) : share === null ? (
          <button type="button" onClick={() => void turnOn()} disabled={busy} className="v2-btn-primary w-full">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Link2 className="h-4 w-4" aria-hidden />}
            Create a link
          </button>
        ) : (
          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                readOnly
                value={share.url}
                aria-label="Share link"
                className="v2-input min-w-0 flex-1 text-sm"
                onFocus={(e) => e.currentTarget.select()}
              />
              <button type="button" onClick={() => void copy(share.url)} className="v2-btn-outline shrink-0 px-4">
                {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            {canNativeShare ? (
              <button type="button" onClick={() => void nativeShare(share.url)} className="v2-btn-primary w-full">
                Share…
              </button>
            ) : null}
            {showsOtherVersion ? (
              <button
                type="button"
                onClick={() => void turnOn()}
                disabled={busy}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 px-3 py-2 text-sm font-medium text-v2-link hover:bg-v2-primary-light"
              >
                <RefreshCw className="h-4 w-4" aria-hidden />
                The link shows an earlier version. Show this one instead
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void turnOff()}
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <EyeOff className="h-4 w-4" aria-hidden />}
              Stop sharing
            </button>
          </div>
        )}
      </div>
    </V2Modal>
  );
}
