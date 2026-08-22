"use client";

import { Mic, MicOff, Send } from "lucide-react";
import { useLayoutEffect, useRef } from "react";
import { cn } from "@/lib/cn";

const MAX_LINES = 5;

type ChatComposerProps = {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onSpeak?: () => void;
  speaking?: boolean;
  busy?: boolean;
  error?: string | null;
  placeholder?: string;
};

export function ChatComposer({
  value,
  onChange,
  onSend,
  onSpeak,
  speaking = false,
  busy = false,
  error,
  placeholder = "Tell Smarty what to change...",
}: ChatComposerProps) {
  const canSend = !busy && Boolean(value.trim());
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;

    const styles = window.getComputedStyle(el);
    const lineHeight = Number.parseFloat(styles.lineHeight) || 28;
    const paddingY =
      Number.parseFloat(styles.paddingTop) +
      Number.parseFloat(styles.paddingBottom);
    const maxHeight = lineHeight * MAX_LINES + paddingY;

    el.style.height = "0px";
    const next = Math.min(el.scrollHeight, maxHeight);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [value]);

  return (
    <div>
      <div className="flex min-h-10 items-center rounded-2xl border-2 border-ink bg-paper p-1 lg:min-h-12">
        {onSpeak ? (
          <>
            <button
              type="button"
              aria-pressed={speaking}
              aria-label={speaking ? "Stop listening" : "Start speak to type"}
              onClick={onSpeak}
              disabled={busy}
              className={cn(
                "grid size-9 shrink-0 cursor-pointer place-items-center rounded-xl border-0 text-ink shadow-none transition disabled:cursor-not-allowed disabled:opacity-40 lg:size-10",
                speaking
                  ? "bg-crayon-coral/25 text-crayon-coral"
                  : "bg-transparent",
              )}
            >
              {speaking ? (
                <Mic aria-hidden className="size-4 lg:size-5" strokeWidth={2.25} />
              ) : (
                <MicOff aria-hidden className="size-4 lg:size-5" strokeWidth={2.25} />
              )}
            </button>
            <span
              aria-hidden
              className="my-1.5 w-px shrink-0 self-stretch bg-ink"
            />
          </>
        ) : null}
        <label className="sr-only" htmlFor="chat-input">
          Message to Smarty
        </label>
        <textarea
          ref={inputRef}
          id="chat-input"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          rows={1}
          disabled={busy}
          placeholder={placeholder}
          className="chat-composer-input min-h-0 min-w-0 flex-1 resize-none overflow-hidden bg-transparent px-2 py-1.5 font-body text-base leading-6 text-ink placeholder:text-ink-soft disabled:opacity-60 lg:px-3 lg:py-2 lg:text-lg lg:leading-7"
        />
        <button
          type="button"
          onClick={onSend}
          disabled={!canSend}
          aria-label={busy ? "Sending" : "Send"}
          className="ml-auto inline-flex shrink-0 cursor-pointer items-center gap-1 border-0 bg-transparent px-2 py-1.5 font-display text-xs font-semibold text-ink shadow-none disabled:cursor-not-allowed disabled:opacity-40 lg:gap-1.5 lg:px-3 lg:py-2 lg:text-sm"
        >
          <Send aria-hidden className="size-3.5 shrink-0 lg:size-4" strokeWidth={2.5} />
          {busy ? "sending" : "Send"}
        </button>
      </div>
      {error ? (
        <p className="mt-3 font-display text-sm text-crayon-coral" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
