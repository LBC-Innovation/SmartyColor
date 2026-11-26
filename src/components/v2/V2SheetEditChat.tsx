"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Coins, Loader2, MessageSquareText, Send, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { V2WorkingOverlay } from "@/components/v2/V2WorkingOverlay";
import { useModalLayer } from "@/components/v2/ui/useModalLayer";
import { EditChatPip, type EditChatPipHandle } from "@/components/v2/edit-chat/EditChatPip";
import { EditChatPageViewer, type EditChatPreviewMode } from "@/components/v2/edit-chat/EditChatPageViewer";
import { EDIT_SUGGESTIONS } from "@/content/marketing";
import { PHOTO_MAX_CORRECTION_CHARS } from "@/lib/session/photoTypes";

export type SheetEditMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  pending?: boolean;
  /** The edit this message answers went through. */
  done?: boolean;
};

/** A line under the box about what the next edit costs: free edits left, or that edits are now paid. */
export type SheetEditCostNotice = {
  tone: "info" | "cost";
  text: string;
  /**
   * When set, the send button becomes a labeled pill ("Touch up · $0.25") so a paid touch-up shows
   * its price on the button itself. `ariaLabel` is the spoken version.
   */
  buttonLabel?: string;
  /** What the pill says when the box is too narrow for `buttonLabel` (just the price, "$0.25"). */
  buttonShortLabel?: string;
  buttonAriaLabel?: string;
};

type PreviewMode = EditChatPreviewMode;

type V2SheetEditChatProps = {
  open: boolean;
  onClose: () => void;
  originalPreviewUrl: string;
  sheetImageUrl: string;
  messages: SheetEditMessage[];
  onSend: (text: string) => void;
  busy?: boolean;
  disabled?: boolean;
  costNotice?: SheetEditCostNotice | null;
};

/** Max height of the composer box before it scrolls (about five lines). */
const INPUT_MAX_PX = 128;

/**
 * iOS Safari doesn't shrink the page when the keyboard opens, it slides the view up instead, so a
 * full-screen dialog ends up half under the keyboard. Follow the visible area while it's smaller
 * than the window. Android resizes the page itself (interactive-widget=resizes-content).
 */
function useKeyboardSafeBox(active: boolean): CSSProperties | undefined {
  const [box, setBox] = useState<{ top: number; height: number } | null>(null);
  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!active || !vv) return;
    const update = () => {
      const covered = window.innerHeight - vv.height > 1;
      setBox(covered ? { top: vv.offsetTop, height: vv.height } : null);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      setBox(null);
    };
  }, [active]);
  return box ? { top: box.top, height: box.height, bottom: "auto" } : undefined;
}

/**
 * Chat to edit a coloring page. Phones get it full screen with the conversation filling everything
 * between the header and the box, and the page as a small card floating over it (drag it to any
 * corner, tap it for a full-screen view). Desktop is a dialog with the page on the left and the
 * chat in a column on the right.
 */
export function V2SheetEditChat({
  open,
  onClose,
  originalPreviewUrl,
  sheetImageUrl,
  messages,
  onSend,
  busy,
  disabled,
  costNotice,
}: V2SheetEditChatProps) {
  const [draft, setDraft] = useState("");
  const [previewMode, setPreviewMode] = useState<PreviewMode>("sheet");
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const pipRef = useRef<EditChatPipHandle>(null);
  const { zIndex: layerZ } = useModalLayer({ baseZ: 50, panelRef, onClose, active: open });
  const keyboardBox = useKeyboardSafeBox(open);

  // Phones: the full-screen page viewer, opened from the floating page. Closed again on every open.
  const [viewer, setViewer] = useState<{ origin: string } | null>(null);
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    setViewer(null);
  }

  // Phones: while typing, the keyboard leaves little room, so the examples step aside.
  const [typingOnTouch, setTypingOnTouch] = useState(false);
  const compactComposer = typingOnTouch && !busy && !disabled;

  function openViewer(from: DOMRect) {
    // Drop the keyboard: the viewer is for looking, not typing.
    inputRef.current?.blur();
    const panel = panelRef.current?.getBoundingClientRect();
    const origin = panel
      ? `${from.left + from.width / 2 - panel.left}px ${from.top + from.height / 2 - panel.top}px`
      : "50% 50%";
    setPreviewMode("sheet");
    setViewer({ origin });
  }

  useEffect(() => {
    if (!open) return;
    setPreviewMode("sheet");
    setDraft("");
    // On a phone, focusing would throw the keyboard over the page before they've looked at it.
    if (!window.matchMedia("(pointer: coarse)").matches) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, open]);

  // The box grows with what's typed, up to a few lines.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, INPUT_MAX_PX)}px`;
  }, [draft, open]);

  function submit() {
    const text = draft.trim();
    if (!text || busy || disabled) return;
    onSend(text);
    setDraft("");
  }

  /** Examples stay until an edit has gone through (a failed send keeps them); tapping one sends it. */
  const showSuggestions = !messages.some((message) => message.done);

  function pickSuggestion(text: string) {
    if (busy || disabled) return;
    onSend(text);
  }

  if (!open) return null;

  const showingSheet = previewMode === "sheet";
  const nearLimit = draft.length > PHOTO_MAX_CORRECTION_CHARS * 0.8;
  const paid = costNotice?.tone === "cost";

  return (
    <div
      className="v2-modal fixed inset-0 z-50 flex items-stretch justify-center bg-v2-plum/50 backdrop-blur-sm lg:items-center lg:p-6"
      style={{ ...keyboardBox, zIndex: layerZ }}
      role="dialog"
      aria-labelledby="v2-sheet-edit-title"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="flex h-full w-full flex-col overflow-hidden bg-white max-lg:relative focus:outline-none lg:h-[min(92dvh,880px)] lg:max-w-6xl lg:flex-row lg:rounded-[1.75rem] lg:shadow-[0_32px_80px_-16px_rgb(36_26_77/0.45)] lg:ring-1 lg:ring-v2-primary/10"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Header: phones only here; desktop puts the title at the top of the chat column. */}
        <header inert={viewer ? true : undefined} className="flex shrink-0 items-center gap-2 border-b border-gray-100 px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] lg:hidden">
          <h2 id="v2-sheet-edit-title" className="v2-brand-title min-w-0 flex-1 truncate pl-1 text-xl text-v2-ink">
            Edit coloring page
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="v2-hit inline-flex h-10 shrink-0 items-center rounded-full px-4 text-sm font-semibold text-v2-link transition hover:bg-v2-bg-subtle"
          >
            Done
          </button>
        </header>

        {/* The page, desktop only. Phones show it as the floating card over the conversation instead. */}
        <div className="relative hidden min-h-0 flex-1 basis-0 items-center justify-center bg-v2-bg-subtle p-2 lg:flex lg:basis-auto lg:p-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={showingSheet ? sheetImageUrl : originalPreviewUrl}
            alt={showingSheet ? "Coloring page preview" : "Original photo preview"}
            className="max-h-full max-w-full object-contain"
          />
          <div
            role="group"
            aria-label="Preview"
            className="absolute left-1/2 top-2 inline-flex -translate-x-1/2 rounded-full border border-gray-200 bg-white/95 p-0.5 text-xs font-semibold shadow-sm backdrop-blur lg:top-4"
          >
            {(["sheet", "original"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={previewMode === mode}
                onClick={() => setPreviewMode(mode)}
                className={cn(
                  "min-h-8 rounded-full px-3 transition",
                  previewMode === mode ? "bg-v2-primary text-white" : "text-v2-muted hover:text-v2-ink",
                )}
              >
                {mode === "sheet" ? "Coloring page" : "Photo"}
              </button>
            ))}
          </div>
          {busy ? <V2WorkingOverlay variant="edit" label="Applying your edit to the coloring page." /> : null}
        </div>

        {/* Chat */}
        <div inert={viewer ? true : undefined} className="flex min-h-0 min-w-0 flex-col border-gray-100 max-lg:relative max-lg:flex-1 lg:w-[380px] lg:shrink-0 lg:border-l">
          <div className="hidden shrink-0 items-start gap-3 border-b border-gray-100 px-5 py-4 lg:flex">
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold text-v2-ink">Edit coloring page</h2>
              <p className="mt-0.5 text-sm text-v2-muted">
                Ask for one change at a time. The rest of the page stays the same.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="v2-hit -mr-2 shrink-0 rounded-lg p-2 text-v2-muted transition hover:bg-v2-bg-subtle hover:text-v2-ink"
              aria-label="Close editor"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div
            ref={listRef}
            aria-live="polite"
            className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain px-3 py-3 lg:px-4"
          >
            {messages.length === 0 ? (
              <>
                {/* Phones: the chat column's header (with this intro) is desktop only, so say it here. It sits
                    at the bottom, where the conversation will start, clear of the card in the top corner. */}
                <div className="mx-auto mt-auto flex max-w-[17rem] flex-col items-center gap-2 pb-2 pt-4 text-center lg:hidden">
                  <span
                    aria-hidden
                    className="mb-1 inline-flex h-11 w-11 items-center justify-center rounded-full bg-v2-primary-light text-v2-primary"
                  >
                    <MessageSquareText className="h-5 w-5" />
                  </span>
                  <p className="text-base font-semibold text-v2-ink">Tell us what to change</p>
                  <p className="text-sm leading-relaxed text-v2-muted">
                    Ask for one change at a time. The rest of the page stays the same.
                  </p>
                  <p className="text-sm leading-relaxed text-v2-muted">
                    Try &ldquo;Make the lines thicker&rdquo; or &ldquo;Remove the people in the background.&rdquo;
                  </p>
                </div>
                <p className="m-auto hidden max-w-[18rem] text-center text-sm leading-relaxed text-v2-muted lg:block">
                  Try &ldquo;Add clearer outlines around the dog&apos;s ears&rdquo; or &ldquo;Remove the extra lines in
                  the sky.&rdquo;
                </p>
              </>
            ) : (
              messages.map((message, index) => (
                <div
                  key={message.id}
                  className={cn(
                    "flex",
                    message.role === "user" ? "justify-end" : "justify-start",
                    // Phones: the conversation sits at the bottom, by the box, and away from the card.
                    index === 0 && "max-lg:mt-auto",
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-snug",
                      message.role === "user"
                        ? "rounded-br-md bg-v2-primary text-white"
                        : "rounded-bl-md border border-gray-200 bg-v2-bg-subtle text-v2-navy",
                      message.pending && "flex items-center gap-2",
                    )}
                  >
                    {message.pending ? (
                      <>
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-v2-primary" aria-hidden />
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

          <EditChatPip
            ref={pipRef}
            src={sheetImageUrl}
            busy={busy}
            boundsRef={listRef}
            onOpen={openViewer}
          />

          <form
            className="shrink-0 border-t border-gray-100 bg-v2-bg-subtle px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            {showSuggestions ? (
              <p
                id="v2-sheet-edit-examples"
                className={cn(
                  "mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wider text-v2-muted",
                  compactComposer && "max-lg:hidden",
                )}
              >
                Examples
              </p>
            ) : null}
            {showSuggestions ? (
              <div
                role="group"
                aria-labelledby="v2-sheet-edit-examples"
                className={cn(
                  "-mx-3 mb-2.5 flex gap-2 overflow-x-auto px-3 [scrollbar-width:none] lg:flex-wrap lg:overflow-visible [&::-webkit-scrollbar]:hidden",
                  compactComposer && "max-lg:hidden",
                )}
              >
                {EDIT_SUGGESTIONS.map((text) => (
                  <button
                    key={text}
                    type="button"
                    disabled={busy || disabled}
                    onClick={() => pickSuggestion(text)}
                    className="inline-flex min-h-10 shrink-0 items-center whitespace-nowrap rounded-full border border-v2-primary/30 bg-white px-3.5 text-sm font-semibold text-v2-link transition hover:bg-v2-primary-light focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-primary disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {text}
                  </button>
                ))}
              </div>
            ) : null}
            <label className="sr-only" htmlFor="v2-sheet-edit-input">
              Describe a change to the coloring page
            </label>
            {/* A container, so a paid pill can shorten to its price when the box is narrow
                (small phones, large system text) instead of pushing past the edge. */}
            <div className="@container flex items-end gap-2 rounded-3xl border border-gray-200 bg-white py-1 pl-4 pr-1 shadow-sm transition focus-within:border-v2-primary/45 focus-within:ring-2 focus-within:ring-v2-primary/15">
              <textarea
                id="v2-sheet-edit-input"
                ref={inputRef}
                rows={1}
                maxLength={PHOTO_MAX_CORRECTION_CHARS}
                value={draft}
                disabled={busy || disabled}
                placeholder="What should we change?"
                enterKeyHint="send"
                aria-describedby={costNotice ? "v2-sheet-edit-cost" : undefined}
                className="chat-composer-input block min-h-10 min-w-0 flex-1 resize-none border-0 bg-transparent px-0 py-2 text-base leading-6 text-v2-ink placeholder:text-v2-muted focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:opacity-60 lg:text-sm"
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    submit();
                  }
                }}
                onChange={(event) => setDraft(event.target.value)}
                onFocus={() => setTypingOnTouch(window.matchMedia("(pointer: coarse)").matches || keyboardBox !== undefined)}
                onBlur={() => setTypingOnTouch(false)}
              />
              <button
                type="submit"
                disabled={!draft.trim() || busy || disabled}
                className={cn(
                  "inline-flex shrink-0 items-center justify-center bg-v2-primary text-white transition hover:bg-v2-primary-dark disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-v2-muted",
                  costNotice?.buttonLabel
                    ? "min-h-10 gap-1.5 rounded-full px-4 text-sm font-semibold"
                    : "v2-hit h-10 w-10 rounded-full",
                )}
                aria-label={costNotice?.buttonAriaLabel ?? costNotice?.buttonLabel ?? "Send"}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
                {costNotice?.buttonLabel && !busy ? (
                  costNotice.buttonShortLabel ? (
                    <>
                      <span className="hidden whitespace-nowrap @[20rem]:inline">{costNotice.buttonLabel}</span>
                      <span className="whitespace-nowrap @[20rem]:hidden">{costNotice.buttonShortLabel}</span>
                    </>
                  ) : (
                    <span className="whitespace-nowrap">{costNotice.buttonLabel}</span>
                  )
                ) : null}
              </button>
            </div>
            {nearLimit ? (
              <p className="mt-1 px-2 text-right text-xs text-v2-muted">
                {draft.length}/{PHOTO_MAX_CORRECTION_CHARS}
              </p>
            ) : null}
            {costNotice ? (
              <p
                id="v2-sheet-edit-cost"
                className={cn(
                  "mt-2 flex items-start gap-1.5 text-xs leading-snug",
                  paid
                    ? "rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 font-medium text-amber-900"
                    : "px-2 text-v2-muted",
                )}
              >
                {paid ? (
                  <Coins className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
                ) : (
                  <Sparkles className="mt-px h-3.5 w-3.5 shrink-0 text-v2-primary" aria-hidden />
                )}
                <span>{costNotice.text}</span>
              </p>
            ) : null}
          </form>
        </div>

        {viewer ? (
          <EditChatPageViewer
            sheetImageUrl={sheetImageUrl}
            originalPreviewUrl={originalPreviewUrl}
            previewMode={previewMode}
            onPreviewModeChange={setPreviewMode}
            busy={busy}
            transformOrigin={viewer.origin}
            onClose={() => setViewer(null)}
            onClosed={() => pipRef.current?.focus()}
          />
        ) : null}
      </div>
    </div>
  );
}
