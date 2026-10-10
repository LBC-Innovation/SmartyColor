"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowLeftRight,
  Loader2,
  Send,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { PHOTO_MAX_CORRECTION_CHARS } from "@/lib/session/photoTypes";

export type SheetEditMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  pending?: boolean;
};

type PreviewMode = "sheet" | "original";

type V2SheetEditChatProps = {
  open: boolean;
  onClose: () => void;
  originalPreviewUrl: string;
  sheetImageUrl: string;
  messages: SheetEditMessage[];
  onSend: (text: string) => void;
  busy?: boolean;
  disabled?: boolean;
};

export function V2SheetEditChat({
  open,
  onClose,
  originalPreviewUrl,
  sheetImageUrl,
  messages,
  onSend,
  busy,
  disabled,
}: V2SheetEditChatProps) {
  const [draft, setDraft] = useState("");
  const [previewMode, setPreviewMode] = useState<PreviewMode>("sheet");
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    setPreviewMode("sheet");
    setDraft("");
    inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    const el = listRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, open]);

  function submit() {
    const text = draft.trim();
    if (!text || busy || disabled) return;
    onSend(text);
    setDraft("");
  }

  function togglePreview() {
    setPreviewMode((mode) => (mode === "sheet" ? "original" : "sheet"));
  }

  if (!open) return null;

  const showingSheet = previewMode === "sheet";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-3 sm:p-6"
      role="dialog"
      aria-labelledby="v2-sheet-edit-title"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="flex h-[min(92dvh,880px)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl shadow-slate-900/20"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-100 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h2
              id="v2-sheet-edit-title"
              className="text-base font-semibold text-v2-ink sm:text-lg"
            >
              Edit coloring sheet
            </h2>
            <p className="mt-0.5 text-xs text-v2-muted sm:text-sm">
              Describe one change at a time — we refine the current sheet, not
              redraw from scratch.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-2 text-v2-muted transition hover:bg-v2-bg-subtle hover:text-v2-ink"
            aria-label="Close editor"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          {/* Preview — 3/4 width on large screens */}
          <div className="relative flex min-h-0 flex-[3] flex-col border-b border-gray-100 bg-v2-bg-subtle lg:border-b-0 lg:border-r">
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-gray-100/80 px-4 py-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-v2-muted">
                {showingSheet ? "Coloring sheet" : "Original photo"}
              </p>
              <button
                type="button"
                onClick={togglePreview}
                className="inline-flex items-center gap-1.5 rounded-lg border border-v2-primary/30 bg-white px-2.5 py-1.5 text-xs font-semibold text-v2-link transition hover:bg-v2-primary-light"
              >
                <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden />
                {showingSheet ? "Show original" : "Show coloring sheet"}
              </button>
            </div>
            <div className="relative flex min-h-[min(36dvh,320px)] flex-1 items-center justify-center p-4 lg:min-h-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={showingSheet ? sheetImageUrl : originalPreviewUrl}
                alt={
                  showingSheet
                    ? "Coloring sheet preview"
                    : "Original photo preview"
                }
                className="max-h-full max-w-full object-contain"
              />
              {busy ? (
                <div
                  className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/80 p-4 text-center backdrop-blur-[2px]"
                  aria-busy="true"
                >
                  <Loader2 className="h-10 w-10 animate-spin text-v2-primary" />
                  <span className="text-sm font-medium text-v2-navy">
                    Applying your edit…
                  </span>
                </div>
              ) : null}
            </div>
          </div>

          {/* Chat — 1/4 width */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div
              ref={listRef}
              className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3"
            >
              {messages.length === 0 ? (
                <p className="text-center text-xs leading-relaxed text-v2-muted">
                  Example: &ldquo;Add clearer outlines around the
                  dog&apos;s ears&rdquo; or &ldquo;Remove the extra lines in
                  the sky.&rdquo;
                </p>
              ) : (
                messages.map((message) => (
                  <div
                    key={message.id}
                    className={cn(
                      "flex",
                      message.role === "user" ? "justify-end" : "justify-start",
                    )}
                  >
                    <div
                      className={cn(
                        "max-w-[95%] rounded-2xl px-3 py-2 text-sm leading-snug",
                        message.role === "user"
                          ? "rounded-br-md bg-v2-primary text-white"
                          : "rounded-bl-md border border-gray-200 bg-v2-bg-subtle text-v2-navy",
                        message.pending && "flex items-center gap-2",
                      )}
                    >
                      {message.pending ? (
                        <>
                          <Loader2
                            className="h-4 w-4 shrink-0 animate-spin text-v2-primary"
                            aria-hidden
                          />
                          <span>{message.text}</span>
                        </>
                      ) : (
                        message.text
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            <form
              className="shrink-0 border-t border-gray-100 bg-v2-bg-subtle p-3"
              onSubmit={(event) => {
                event.preventDefault();
                submit();
              }}
            >
              <label className="sr-only" htmlFor="v2-sheet-edit-input">
                Describe a change to the coloring sheet
              </label>
              <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition focus-within:border-v2-primary/45 focus-within:ring-2 focus-within:ring-v2-primary/15">
                <textarea
                  id="v2-sheet-edit-input"
                  ref={inputRef}
                  rows={2}
                  maxLength={PHOTO_MAX_CORRECTION_CHARS}
                  value={draft}
                  disabled={busy || disabled}
                  placeholder="What should we adjust?"
                  className="block w-full resize-none border-0 bg-transparent px-3 py-2.5 text-sm leading-snug text-v2-ink placeholder:text-v2-muted focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:opacity-60"
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      submit();
                    }
                  }}
                  onChange={(event) => setDraft(event.target.value)}
                />
                <div className="flex items-center gap-2 border-t border-gray-100 bg-v2-bg-subtle/60 px-2 py-1.5">
                  <span className="min-w-0 flex-1 truncate text-[10px] text-v2-muted">
                    {draft.length}/{PHOTO_MAX_CORRECTION_CHARS} · Enter to
                    send
                  </span>
                  <button
                    type="submit"
                    disabled={!draft.trim() || busy || disabled}
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-v2-primary text-white transition hover:bg-v2-primary-dark disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-v2-muted"
                    aria-label="Send edit request"
                  >
                    {busy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    ) : (
                      <Send className="h-3.5 w-3.5" aria-hidden />
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
