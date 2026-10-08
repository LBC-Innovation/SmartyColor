"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, MessageSquare, Send, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { PHOTO_MAX_CORRECTION_CHARS } from "@/lib/session/photoTypes";

export type SheetEditMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  pending?: boolean;
};

type V2SheetEditChatProps = {
  open: boolean;
  onClose: () => void;
  messages: SheetEditMessage[];
  onSend: (text: string) => void;
  busy?: boolean;
  disabled?: boolean;
};

export function V2SheetEditChat({
  open,
  onClose,
  messages,
  onSend,
  busy,
  disabled,
}: V2SheetEditChatProps) {
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    } else {
      setDraft("");
    }
  }, [open]);

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

  if (!open) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 flex justify-start px-4 sm:px-6 lg:bottom-6 lg:left-8 lg:max-w-none lg:px-0 xl:left-10"
      role="dialog"
      aria-labelledby="v2-sheet-edit-chat-title"
      aria-modal="false"
    >
      <div className="pointer-events-auto flex w-full max-w-md flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-xl shadow-slate-900/10 ring-1 ring-slate-900/5">
        <header className="flex items-start justify-between gap-3 border-b border-slate-100 bg-gradient-to-r from-indigo-50/80 to-violet-50/50 px-4 py-3">
          <div className="flex min-w-0 items-start gap-2">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-v2-primary shadow-sm">
              <MessageSquare className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <h2
                id="v2-sheet-edit-chat-title"
                className="text-sm font-semibold text-slate-900"
              >
                Edit coloring sheet
              </h2>
              <p className="mt-0.5 text-xs leading-snug text-v2-muted">
                Describe one change at a time. We refine the current sheet — we
                don&apos;t redraw it from scratch.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 text-slate-500 transition hover:bg-white/80 hover:text-slate-800"
            aria-label="Close edit chat"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div
          ref={listRef}
          className="flex max-h-[min(240px,38vh)] min-h-[120px] flex-col gap-3 overflow-y-auto px-4 py-3"
        >
          {messages.length === 0 ? (
            <p className="text-center text-xs leading-relaxed text-v2-muted">
              Example: &ldquo;Add clearer outlines around the dog&apos;s
              ears&rdquo; or &ldquo;Remove the extra lines in the sky.&rdquo;
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
                    "max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-snug",
                    message.role === "user"
                      ? "rounded-br-md bg-v2-primary text-white"
                      : "rounded-bl-md border border-slate-200 bg-slate-50 text-slate-700",
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
          className="border-t border-slate-100 bg-slate-50/80 p-3"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <div className="flex items-end gap-2">
            <label className="sr-only" htmlFor="v2-sheet-edit-input">
              Describe a change to the coloring sheet
            </label>
            <textarea
              id="v2-sheet-edit-input"
              ref={inputRef}
              rows={2}
              maxLength={PHOTO_MAX_CORRECTION_CHARS}
              value={draft}
              disabled={busy || disabled}
              placeholder="What should we adjust?"
              className="min-h-[2.75rem] flex-1 resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-v2-primary disabled:cursor-not-allowed disabled:opacity-60"
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  submit();
                }
              }}
              onChange={(event) => setDraft(event.target.value)}
            />
            <button
              type="submit"
              disabled={!draft.trim() || busy || disabled}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-v2-primary text-white transition hover:bg-v2-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Send edit request"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Send className="h-4 w-4" aria-hidden />
              )}
            </button>
          </div>
          <p className="mt-1.5 text-[10px] text-slate-400">
            {draft.length}/{PHOTO_MAX_CORRECTION_CHARS} characters · Enter to
            send
          </p>
        </form>
      </div>
    </div>
  );
}
