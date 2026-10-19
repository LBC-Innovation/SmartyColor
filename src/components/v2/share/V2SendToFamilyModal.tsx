"use client";

import { useId, useState, type FormEvent } from "react";
import { Loader2, Mail, Send } from "lucide-react";
import { V2Modal } from "@/components/v2/ui/V2Modal";
import { useV2Toast } from "@/components/v2/V2Toast";
import * as library from "@/lib/library/client";

type Props = {
  projectId: string;
  projectName: string;
  onClose: () => void;
};

/** Email an album's coloring pages, as one printable PDF, to someone like a grandparent. */
export function V2SendToFamilyModal({ projectId, projectName, onClose }: Props) {
  const toast = useV2Toast();
  const emailId = useId();
  const noteId = useId();
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function onSend(event: FormEvent) {
    event.preventDefault();
    const address = email.trim();
    if (!address || sending) return;
    setSending(true);
    setFormError(null);
    const res = await library.sendAlbumToFamily(projectId, address, note);
    setSending(false);
    if (res.error) {
      setFormError(res.error.message);
      return;
    }
    const pages = res.data!.pageCount === 1 ? "1 coloring page" : `${res.data!.pageCount} coloring pages`;
    toast.success({ title: "Pages sent", message: `We emailed ${pages} to ${address}.` });
    onClose();
  }

  return (
    <V2Modal
      onClose={() => !sending && onClose()}
      maxWidthClass="max-w-lg"
      title={
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-v2-muted">Send pages to family</p>
          <h2 className="truncate text-lg font-semibold text-v2-ink" title={projectName}>
            {projectName}
          </h2>
        </div>
      }
    >
      <form onSubmit={onSend} className="space-y-4 p-5 sm:p-6">
        <p className="text-sm leading-relaxed text-v2-muted">
          We&apos;ll email this album&apos;s coloring pages as one PDF they can print at home. Only the
          coloring pages are sent, never your photos. Up to 40 pages.
        </p>
        <div>
          <label className="v2-label" htmlFor={emailId}>
            Their email address
          </label>
          <input
            id={emailId}
            type="email"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoComplete="off"
            required
            placeholder="grandma@example.com"
            className="v2-input w-full"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setFormError(null);
            }}
          />
        </div>
        <div>
          <label className="v2-label" htmlFor={noteId}>
            Add a note (optional)
          </label>
          <textarea
            id={noteId}
            rows={3}
            maxLength={500}
            placeholder="Thought you'd enjoy coloring these with the kids this weekend!"
            className="v2-input w-full resize-none"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        {formError ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
            {formError}
          </p>
        ) : (
          <p className="flex gap-1.5 text-xs leading-relaxed text-v2-muted">
            <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            They don&apos;t need an account. The email shows your name so they know who it&apos;s from.
          </p>
        )}
        <div className="flex justify-end">
          <button type="submit" disabled={sending || !email.trim()} className="v2-btn-primary">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
            {sending ? "Preparing pages…" : "Send pages"}
          </button>
        </div>
      </form>
    </V2Modal>
  );
}
