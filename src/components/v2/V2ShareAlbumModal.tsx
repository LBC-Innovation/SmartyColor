"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { Loader2, Mail, Send, Trash2, Users } from "lucide-react";
import { V2Modal } from "@/components/v2/ui/V2Modal";
import { useV2Toast } from "@/components/v2/V2Toast";
import * as library from "@/lib/library/client";
import type { AlbumShare } from "@/lib/library/types";

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

  async function onResend(share: AlbumShare) {
    setBusyShareId(share.id);
    const res = await library.resendShare(projectId, share.id);
    setBusyShareId(null);
    if (res.error) toast.error(res.error.message);
    else toast.success({ title: "Invitation sent", message: `We emailed ${share.email} again.` });
  }

  async function onRemove(share: AlbumShare) {
    setBusyShareId(share.id);
    const res = await library.removeShare(projectId, share.id);
    setBusyShareId(null);
    if (res.error) {
      toast.error(res.error.message);
      return;
    }
    applyShares((shares ?? []).filter((s) => s.id !== share.id));
    toast.success({ message: `${share.email} no longer has access. Photos they added stay in the album.` });
  }

  return (
    <V2Modal
      onClose={onClose}
      maxWidthClass="max-w-lg"
      title={
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-v2-muted">Share album</p>
          <h2 className="truncate text-lg font-semibold text-v2-ink" title={projectName}>
            {projectName}
          </h2>
        </div>
      }
    >
      <div className="space-y-6 p-5 sm:p-6">
        <div>
          <p className="text-sm leading-relaxed text-v2-muted">
            Invite someone to add their own photos to this album. They&apos;ll see everything in
            it, can make coloring pages, and can arrange their own books. Only you can rename,
            delete or share it.
          </p>

          <form onSubmit={onInvite} className="mt-4">
            <label className="v2-label" htmlFor={inputId}>
              Email address
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
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
                    <th scope="col" className="px-3 py-2">Email</th>
                    <th scope="col" className="hidden w-28 px-3 py-2 sm:table-cell">Invited</th>
                    <th scope="col" className="w-[7.5rem] px-3 py-2 text-right">
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
                          <span className="block truncate font-medium text-v2-ink" title={share.email}>
                            {share.email}
                          </span>
                          <span className="block text-xs text-v2-muted sm:hidden">
                            {formatInvitedAt(share.invitedAt)}
                          </span>
                        </td>
                        <td className="hidden px-3 py-2.5 text-v2-muted sm:table-cell">
                          {formatInvitedAt(share.invitedAt)}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void onResend(share)}
                              className="rounded-lg px-2 py-1.5 text-xs font-semibold text-v2-link transition hover:bg-v2-primary-light disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Resend
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void onRemove(share)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-v2-muted transition hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                              aria-label={`Stop sharing with ${share.email}`}
                              title="Stop sharing"
                            >
                              {busy ? (
                                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
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
