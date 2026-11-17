"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { Check, Copy, Link2, Loader2, Mail, MessageCircle, Send, Share2, Trash2, Users } from "lucide-react";
import { V2Modal } from "@/components/v2/ui/V2Modal";
import { useV2Toast } from "@/components/v2/V2Toast";
import * as library from "@/lib/library/client";
import type { AlbumShare } from "@/lib/library/types";
import { track } from "@/lib/track";

type Props = {
  projectId: string;
  projectName: string;
  onClose: () => void;
  /** Reports the number of invites whenever it changes, for the album list's hint. */
  onCountChange?: (count: number) => void;
};

function formatInvitedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** What the list shows for a share: their address, or a label for a link nobody has used yet. */
function shareLabel(share: AlbumShare): string {
  if (share.email) return share.email;
  return share.joined ? "Joined with a link" : "Invite link";
}

function inviteMessage(inviterName: string, albumName: string, url: string): string {
  return `${inviterName} invited you to add photos to “${albumName}” on Colorful Memories: ${url}`;
}

/** iOS wants `sms:&body=`, Android `sms:?body=`; `sms:?&body=` works on both. */
function smsHref(body: string): string {
  return `sms:?&body=${encodeURIComponent(body)}`;
}

type CreatedLink = { shareId: string; url: string; message: string };

/** Invite people to add photos to an album, and manage who it's shared with. */
export function V2ShareAlbumModal({ projectId, projectName, onClose, onCountChange }: Props) {
  const toast = useV2Toast();
  const inputId = useId();
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [shares, setShares] = useState<AlbumShare[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyShareId, setBusyShareId] = useState<string | null>(null);
  // Removing access is immediate, so the first tap only arms the button.
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [linkBusy, setLinkBusy] = useState<"sms" | "share" | null>(null);
  // The link just made, kept on screen in case the text or share sheet didn't open.
  const [created, setCreated] = useState<CreatedLink | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  useEffect(() => {
    let cancelled = false;
    void library.listShares(projectId).then((res) => {
      if (cancelled) return;
      if (res.error) setLoadError(res.error.message);
      else setShares(res.data!);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  function applyShares(next: AlbumShare[]) {
    setShares(next);
    onCountChange?.(next.length);
  }

  async function onInvite(event: FormEvent) {
    event.preventDefault();
    const address = email.trim();
    if (!address || sending) return;
    setSending(true);
    setFormError(null);
    const res = await library.inviteToAlbum(projectId, address);
    setSending(false);
    if (res.error) {
      setFormError(res.error.message);
      return;
    }
    applyShares([...(shares ?? []), res.data!.share]);
    setEmail("");
    if (res.data!.emailSent) {
      toast.success({ title: "Invitation sent", message: `We emailed ${res.data!.share.email}.` });
    } else {
      toast.error(
        `${res.data!.share.email} was added, but the email could not be sent. Use “Resend” to try again.`,
        "Email not sent",
      );
    }
  }

  /**
   * Each link is single-use, so every tap makes a fresh one. The text or share sheet opens right
   * after; if the browser won't open it without a fresh tap, the link stays on screen to send by hand.
   */
  async function onInviteByLink(how: "sms" | "share") {
    if (linkBusy) return;
    setLinkBusy(how);
    setFormError(null);
    const res = await library.createInviteLink(projectId);
    setLinkBusy(null);
    if (res.error) {
      setFormError(res.error.message);
      return;
    }
    const { share, url, inviterName, albumName } = res.data!;
    applyShares([...(shares ?? []), share]);
    const message = inviteMessage(inviterName, albumName, url);
    setCreated({ shareId: share.id, url, message });

    if (how === "sms") {
      track("share", { method: "sms", content_type: "album" });
      window.location.href = smsHref(message);
      return;
    }
    if (canNativeShare) {
      try {
        await navigator.share({ title: `Join “${albumName}”`, text: message });
        track("share", { method: "native", content_type: "album" });
      } catch {
        // Dismissed, or the browser wanted a fresh tap: the Share button under the link works on its own.
      }
      return;
    }
    void copyLink(share.id, url, true);
  }

  async function copyLink(shareId: string, url: string, quiet = false) {
    try {
      await navigator.clipboard.writeText(url);
      track("share", { method: "copy", content_type: "album" });
      setCopiedId(shareId);
      setTimeout(() => setCopiedId((current) => (current === shareId ? null : current)), 2000);
      if (quiet) toast.success({ title: "Link copied", message: "Paste it into any app to send it." });
    } catch {
      if (!quiet) toast.error("Copy the link from the box instead.", "Couldn't copy");
    }
  }

  async function shareAgain(link: CreatedLink) {
    try {
      await navigator.share({ text: link.message });
    } catch {
      /* dismissed */
    }
  }

  async function onResend(share: AlbumShare) {
    setConfirmRemoveId(null);
    setBusyShareId(share.id);
    const res = await library.resendShare(projectId, share.id);
    setBusyShareId(null);
    if (res.error) toast.error(res.error.message);
    else toast.success({ title: "Invitation sent", message: `We emailed ${share.email} again.` });
  }

  async function onRemove(share: AlbumShare) {
    setConfirmRemoveId(null);
    setBusyShareId(share.id);
    const res = await library.removeShare(projectId, share.id);
    setBusyShareId(null);
    if (res.error) {
      toast.error(res.error.message);
      return;
    }
    applyShares((shares ?? []).filter((s) => s.id !== share.id));
    if (created?.shareId === share.id) setCreated(null);
    toast.success({
      message:
        share.email || share.joined
          ? `${share.email ?? "They"} no longer ${share.email ? "has" : "have"} access. Photos they added stay in the album.`
          : "That invite link no longer works.",
    });
  }

  return (
    <V2Modal
      onClose={onClose}
      maxWidthClass="max-w-lg"
      icon={<Users />}
      eyebrow="Share album"
      title={projectName}
    >
      <div className="space-y-6 px-5 pb-6 pt-1 sm:px-7 sm:pb-7">
        <p className="text-sm leading-relaxed text-v2-muted">
          Invite someone to add their own photos to this album. They&apos;ll see everything in it,
          can make coloring pages, and can arrange their own books. Only you can rename, delete or
          share it.
        </p>

        <section aria-labelledby={`${inputId}-link`}>
          <h3 id={`${inputId}-link`} className="v2-label">
            Send an invite link
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={linkBusy !== null}
              onClick={() => void onInviteByLink("sms")}
              className="v2-btn-outline min-h-11 px-3 py-2.5"
            >
              {linkBusy === "sms" ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <MessageCircle className="h-4 w-4" aria-hidden />
              )}
              Text message
            </button>
            <button
              type="button"
              disabled={linkBusy !== null}
              onClick={() => void onInviteByLink("share")}
              className="v2-btn-outline min-h-11 px-3 py-2.5"
            >
              {linkBusy === "share" ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : canNativeShare ? (
                <Share2 className="h-4 w-4" aria-hidden />
              ) : (
                <Link2 className="h-4 w-4" aria-hidden />
              )}
              {canNativeShare ? "Other apps" : "Copy a link"}
            </button>
          </div>

          {created ? (
            <div className="mt-3 rounded-xl border border-v2-primary/25 bg-v2-primary-light p-3">
              <p className="text-xs font-semibold text-v2-ink">Your invite link</p>
              <div className="mt-2 flex gap-2">
                <input
                  readOnly
                  value={created.url}
                  aria-label="Invite link"
                  onFocus={(e) => e.currentTarget.select()}
                  className="v2-input min-w-0 flex-1 bg-white text-sm"
                />
                <button
                  type="button"
                  onClick={() => void copyLink(created.shareId, created.url)}
                  className="v2-btn-primary shrink-0 px-3 py-2"
                  aria-label="Copy invite link"
                >
                  {copiedId === created.shareId ? (
                    <Check className="h-4 w-4" aria-hidden />
                  ) : (
                    <Copy className="h-4 w-4" aria-hidden />
                  )}
                  <span className="hidden min-[400px]:inline">
                    {copiedId === created.shareId ? "Copied" : "Copy"}
                  </span>
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                <a
                  href={smsHref(created.message)}
                  className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-v2-link hover:underline sm:min-h-0"
                >
                  <MessageCircle className="h-4 w-4" aria-hidden />
                  Open Messages
                </a>
                {canNativeShare ? (
                  <button
                    type="button"
                    onClick={() => void shareAgain(created)}
                    className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-v2-link hover:underline sm:min-h-0"
                  >
                    <Share2 className="h-4 w-4" aria-hidden />
                    Share
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
          <p className="mt-2 flex gap-1.5 text-xs leading-relaxed text-v2-muted">
            <Link2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            Each link works for one person. They&apos;ll make a free account (or sign in) to join.
          </p>
        </section>

        <div>
          <form onSubmit={onInvite}>
            <label className="v2-label" htmlFor={inputId}>
              Or invite by email
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                inputMode="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="send"
                id={inputId}
                type="email"
                required
                autoComplete="off"
                placeholder="name@example.com"
                className="v2-input min-w-0 flex-1"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setFormError(null);
                }}
              />
              <button
                type="submit"
                disabled={sending || !email.trim()}
                className="v2-btn-primary shrink-0 px-5 py-2.5"
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Send className="h-4 w-4" aria-hidden />
                )}
                Invite
              </button>
            </div>
            {formError ? (
              <p className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
                {formError}
              </p>
            ) : (
              <p className="mt-2 flex gap-1.5 text-xs leading-relaxed text-v2-muted">
                <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                If they already have an account, they&apos;ll get a request to join this album.
                Otherwise they&apos;ll get an invitation to sign up.
              </p>
            )}
          </form>
        </div>

        <section aria-label="People this album is shared with">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-v2-ink">
            <Users className="h-4 w-4 text-v2-primary" aria-hidden />
            Shared with
            {shares && shares.length > 0 ? (
              <span className="font-medium text-v2-muted tabular-nums">{shares.length}</span>
            ) : null}
          </h3>

          {loadError ? (
            <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {loadError}
            </p>
          ) : shares === null ? (
            <p className="mt-3 flex items-center gap-2 text-sm text-v2-muted">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Loading…
            </p>
          ) : shares.length === 0 ? (
            <p className="mt-3 rounded-xl border border-dashed border-gray-200 px-3 py-4 text-center text-sm text-v2-muted">
              You haven&apos;t shared this album with anyone yet.
            </p>
          ) : (
            <div className="mt-3 overflow-hidden rounded-xl border border-gray-200">
              <table className="w-full table-fixed text-left text-sm">
                <thead className="bg-v2-bg-subtle text-xs font-semibold uppercase tracking-wide text-v2-muted">
                  <tr>
                    <th scope="col" className="px-3 py-2">Person</th>
                    <th scope="col" className="hidden w-28 px-3 py-2 sm:table-cell">Invited</th>
                    <th scope="col" className="w-[9.5rem] px-3 py-2 text-right sm:w-[8.5rem]">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {shares.map((share) => {
                    const busy = busyShareId === share.id;
                    return (
                      <tr key={share.id}>
                        <td className="px-3 py-2.5">
                          <span
                            className={
                              share.email
                                ? "block truncate font-medium text-v2-ink"
                                : "flex items-center gap-1.5 truncate font-medium text-v2-ink"
                            }
                            title={shareLabel(share)}
                          >
                            {share.email ? null : <Link2 className="h-3.5 w-3.5 shrink-0 text-v2-muted" aria-hidden />}
                            {shareLabel(share)}
                          </span>
                          <span className="block text-xs text-v2-muted">
                            {share.via === "link" && !share.joined ? "Waiting for them to join" : null}
                            {share.via === "link" && !share.joined ? <span className="sm:hidden"> · </span> : null}
                            <span className="sm:hidden">{formatInvitedAt(share.invitedAt)}</span>
                          </span>
                        </td>
                        <td className="hidden px-3 py-2.5 text-v2-muted sm:table-cell">
                          {formatInvitedAt(share.invitedAt)}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center justify-end gap-1">
                            {share.via === "email" ? (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void onResend(share)}
                                className="min-h-11 rounded-lg px-2 py-1.5 text-xs font-semibold text-v2-link transition hover:bg-v2-primary-light disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0"
                              >
                                Resend
                              </button>
                            ) : !share.joined ? (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void copyLink(share.id, `${window.location.origin}/join/${share.id}`)}
                                className="min-h-11 rounded-lg px-2 py-1.5 text-xs font-semibold text-v2-link transition hover:bg-v2-primary-light disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0"
                              >
                                {copiedId === share.id ? "Copied" : "Copy link"}
                              </button>
                            ) : null}
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                confirmRemoveId === share.id
                                  ? void onRemove(share)
                                  : setConfirmRemoveId(share.id)
                              }
                              onBlur={() => setConfirmRemoveId(null)}
                              className={
                                confirmRemoveId === share.id
                                  ? "inline-flex h-11 items-center justify-center rounded-lg bg-red-50 px-2 text-xs font-semibold text-red-700 sm:h-8"
                                  : "inline-flex h-11 w-11 items-center justify-center rounded-lg text-v2-muted transition hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50 sm:h-8 sm:w-8"
                              }
                              aria-label={
                                confirmRemoveId === share.id
                                  ? `Confirm: stop sharing with ${shareLabel(share)}`
                                  : `Stop sharing with ${shareLabel(share)}`
                              }
                              title="Stop sharing"
                            >
                              {busy ? (
                                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                              ) : confirmRemoveId === share.id ? (
                                "Remove?"
                              ) : (
                                <Trash2 className="h-4 w-4" aria-hidden />
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </V2Modal>
  );
}
