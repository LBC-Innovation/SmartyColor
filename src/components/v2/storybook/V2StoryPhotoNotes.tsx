"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Crop, Loader2, Send } from "lucide-react";
import { cn } from "@/lib/cn";
import type { V2PhotoEntry } from "@/lib/v2/studioTypes";

type V2StoryPhotoNotesProps = {
  photo: V2PhotoEntry;
  index: number;
  count: number;
  onStep: (delta: -1 | 1) => void;
  onCaptionChange: (text: string) => void;
  onOpenCrop: () => void;
  onSend: (text: string) => void;
  /** A reply for this photo is on its way. */
  busy: boolean;
};

/**
 * Notes for one photo: a caption, and a conversation with the story helper
 * that turns into the page's "story note". Inline rather than a dialog, so
 * on a phone it is simply the Photo notes tab; on desktop the photo sits on
 * the left and the conversation on the right.
 */
export function V2StoryPhotoNotes({
  photo,
  index,
  count,
  onStep,
  onCaptionChange,
  onOpenCrop,
  onSend,
  busy,
}: V2StoryPhotoNotesProps) {
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const seenCountRef = useRef<number | null>(null);
  const messages = photo.chatMessages ?? [];

  // Follow the conversation as it grows, but open on the photo, not the thread's end.
  useEffect(() => {
    const seen = seenCountRef.current;
    seenCountRef.current = messages.length;
    if (seen !== null && messages.length > seen) {
      endRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [messages.length]);

  function submit() {
    const text = draft.trim();
    if (!text || busy) return;
    onSend(text);
    setDraft("");
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row lg:overflow-hidden">
      {/* Photo, caption, crop */}
      <div className="flex flex-col gap-3 lg:min-h-0 lg:w-[44%] lg:overflow-y-auto lg:overscroll-contain lg:border-r lg:border-gray-100 lg:pr-5">
        <div className="flex items-center justify-between gap-2">
          <div className="inline-flex items-center gap-0.5" role="group" aria-label="Photo navigation">
            <button
              type="button"
              disabled={index <= 0}
              onClick={() => onStep(-1)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full text-v2-navy hover:bg-v2-bg-subtle disabled:opacity-30"
              aria-label="Previous photo"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden />
            </button>
            <span className="min-w-[6.5rem] text-center text-xs font-semibold tabular-nums text-v2-muted">
              Photo {index + 1} of {count}
            </span>
            <button
              type="button"
              disabled={index >= count - 1}
              onClick={() => onStep(1)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full text-v2-navy hover:bg-v2-bg-subtle disabled:opacity-30"
              aria-label="Next photo"
            >
              <ChevronRight className="h-5 w-5" aria-hidden />
            </button>
          </div>
          <button
            type="button"
            onClick={onOpenCrop}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 text-xs font-semibold text-v2-navy transition hover:bg-v2-bg-subtle"
          >
            <Crop className="h-4 w-4" aria-hidden />
            {photo.crop ? "Edit crop" : "Crop"}
          </button>
        </div>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo.previewUrl}
          alt=""
          className="max-h-[38dvh] w-full rounded-xl bg-v2-bg-subtle object-contain lg:max-h-[46dvh]"
        />

        <label className="block">
          <span className="v2-label">Caption</span>
          <textarea
            value={photo.userCaption ?? ""}
            onChange={(e) => onCaptionChange(e.target.value)}
            rows={2}
            placeholder="Where this was, who's in it, what made it special…"
            className="v2-input resize-none"
          />
        </label>

        {photo.photoSummary ? (
          <p className="rounded-lg bg-v2-primary-light/70 px-3 py-2 text-xs leading-relaxed text-v2-navy">
            <span className="font-semibold text-v2-ink">Story note: </span>
            {photo.photoSummary}
          </p>
        ) : null}
      </div>

      {/* Conversation */}
      <div className="mt-5 flex min-h-0 flex-1 flex-col lg:mt-0 lg:pl-5">
        <div className="shrink-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-v2-muted">
            Talk about this moment
          </p>
          <p className="mt-0.5 text-xs text-v2-muted">
            Help the story helper see how this photo fits your trip.
          </p>
        </div>

        <div className="mt-3 flex-1 space-y-2.5 lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain lg:pr-1">
          {messages.length === 0 ? (
            <p className="rounded-xl border border-dashed border-gray-200 px-3 py-3 text-sm text-v2-muted">
              Share what was happening — who is in the shot, why it mattered, or a
              detail your kids still talk about.
            </p>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed text-v2-ink",
                  message.role === "user"
                    ? "ml-auto rounded-tr-md bg-v2-primary-light"
                    : "mr-auto rounded-tl-md bg-gray-100",
                )}
              >
                {message.text}
              </div>
            ))
          )}
          {busy ? (
            <p className="flex items-center gap-2 text-xs text-v2-muted">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              Thinking…
            </p>
          ) : null}
          <div ref={endRef} />
        </div>

        <div className="sticky bottom-0 -mx-3 mt-3 border-t border-gray-100 bg-white/95 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur sm:-mx-5 sm:px-5 lg:static lg:mx-0 lg:px-0 lg:pb-0 lg:backdrop-blur-0">
          <div className="flex items-end gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={2}
              placeholder="This was our first ride on…"
              enterKeyHint="send"
              className="v2-input min-h-[44px] flex-1 resize-none"
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
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-v2-primary text-white transition hover:bg-v2-primary-dark disabled:opacity-40"
              aria-label="Send"
            >
              <Send className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
