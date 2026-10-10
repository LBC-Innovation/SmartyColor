"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Send, X } from "lucide-react";
import type { StoryChatMessage } from "@/lib/v2/storybookTypes";

type V2StoryPhotoChatProps = {
  open: boolean;
  previewUrl: string;
  messages: StoryChatMessage[];
  onClose: () => void;
  onSend: (text: string) => void;
  busy?: boolean;
};

export function V2StoryPhotoChat({
  open,
  previewUrl,
  messages,
  onClose,
  onSend,
  busy,
}: V2StoryPhotoChatProps) {
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
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
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, open]);

  if (!open) return null;

  function submit() {
    const text = draft.trim();
    if (!text || busy) return;
    onSend(text);
    setDraft("");
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-3 sm:p-6"
      role="dialog"
      aria-labelledby="story-photo-chat-title"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="flex h-[min(92dvh,820px)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
          <div>
            <h2
              id="story-photo-chat-title"
              className="text-base font-semibold text-v2-ink"
            >
              Talk about this moment
            </h2>
            <p className="text-xs text-v2-muted">
              Help the story helper see how this photo fits your trip.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-v2-muted hover:bg-v2-bg-subtle"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          <div className="flex shrink-0 items-center justify-center border-b border-gray-100 bg-v2-bg-subtle p-4 sm:w-[42%] sm:border-b-0 sm:border-r">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt=""
              className="max-h-[220px] max-w-full rounded-lg object-contain shadow-sm sm:max-h-[min(60dvh,520px)]"
            />
          </div>

          <div className="flex min-h-0 flex-1 flex-col">
            <div
              ref={listRef}
              className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4"
            >
              {messages.length === 0 ? (
                <p className="text-sm text-v2-muted">
                  Share what was happening — who is in the shot, why it mattered,
                  or a detail your kids still talk about.
                </p>
              ) : (
                messages.map((message) => (
                  <div
                    key={message.id}
                    className={
                      message.role === "user"
                        ? "ml-8 rounded-2xl rounded-tr-md bg-v2-primary-light px-3 py-2 text-sm text-v2-ink"
                        : "mr-8 rounded-2xl rounded-tl-md bg-gray-100 px-3 py-2 text-sm text-v2-ink"
                    }
                  >
                    {message.text}
                  </div>
                ))
              )}
              {busy ? (
                <p className="flex items-center gap-2 text-xs text-v2-muted">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Thinking…
                </p>
              ) : null}
            </div>

            <div className="border-t border-gray-100 p-3">
              <div className="flex gap-2">
                <textarea
                  ref={inputRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={2}
                  placeholder="This was our first ride on…"
                  className="min-h-[44px] flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none ring-v2-primary focus:ring-2"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      submit();
                    }
                  }}
                  disabled={busy}
                />
                <button
                  type="button"
                  onClick={submit}
                  disabled={busy || !draft.trim()}
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-v2-primary text-white disabled:opacity-40"
                  aria-label="Send"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
