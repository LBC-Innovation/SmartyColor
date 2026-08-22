"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { ChatBubble } from "@/components/ChatBubble";
import { ChatComposer } from "@/components/ChatComposer";
import { CrayonRippleDots } from "@/components/CrayonRippleDots";
import { SmartyAvatar } from "@/components/SmartyAvatar";
import { KidButton } from "@/components/KidButton";
import { MakingCurtain } from "@/components/MakingCurtain";
import { RequirementsList } from "@/components/RequirementsList";
import { SheetVersionSelect } from "@/components/SheetVersionSelect";
import { useSpeechToText } from "@/hooks/useSpeechToText";
import { resolveRefineLikes } from "@/lib/session/planPoints";
import { buildGeneratePrompt, isScenePlanPoint } from "@/lib/ai/prompts";
import {
  isInitialWelcomeOnly,
  WELCOME_RIPPLE_MS,
} from "@/lib/session/onboarding";
import { loadLocalSession, saveLocalSession } from "@/lib/session/local";
import type {
  ChatMessage,
  ColoringSession,
  FeedbackTurn,
  GeneratedSheet,
  LikedTrait,
  SheetVersion,
} from "@/lib/session/types";

type RefineStudioProps = {
  sessionId: string;
};

type CurtainState =
  | { open: false }
  | {
      open: true;
      mode: "loading" | "ready" | "error";
      sheet: GeneratedSheet | null;
      error?: string | null;
      statusTitle?: string;
      statusDetail?: string;
    };

function newId() {
  return crypto.randomUUID();
}

function seedMessages(session: ColoringSession): ChatMessage[] {
  if (session.messages?.length) return session.messages;
  const messages: ChatMessage[] = [];
  if (session.idea.trim()) {
    messages.push({ id: newId(), role: "user", text: session.idea });
  }
  if (session.lastFeedback?.kidMessage) {
    messages.push({
      id: newId(),
      role: "smarty",
      text: session.lastFeedback.kidMessage,
    });
  }
  return messages;
}

function seedRequirements(session: ColoringSession): LikedTrait[] {
  if (session.likes.length) return session.likes;
  return (session.lastFeedback?.points ?? []).map((point) => ({
    id: point.id,
    text: point.text,
  }));
}

function mergeRequirements(existing: LikedTrait[], incoming: LikedTrait[]) {
  const next = [...existing];
  for (const item of incoming) {
    const duplicate = next.some(
      (row) => row.text.trim().toLowerCase() === item.text.trim().toLowerCase(),
    );
    if (!duplicate) next.push(item);
  }
  return next;
}

function normalizePlanText(text: string) {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

function matchesPlanRemoval(itemText: string, removal: string) {
  const item = normalizePlanText(itemText);
  const target = normalizePlanText(removal);
  if (!item || !target) return false;
  return item === target || item.includes(target) || target.includes(item);
}

/** Keep prior plan items; drop removals; add/replace with edit deltas. */
function applyPlanEdits(
  existing: LikedTrait[],
  incoming: LikedTrait[],
  removals: string[] = [],
) {
  const kept = existing.filter(
    (item) =>
      !removals.some((removal) => matchesPlanRemoval(item.text, removal)),
  );
  return mergeRequirements(kept, incoming);
}

export function RefineStudio({ sessionId }: RefineStudioProps) {
  const router = useRouter();
  const [session, setSession] = useState<ColoringSession | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [making, setMaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [curtain, setCurtain] = useState<CurtainState>({ open: false });
  const [downloading, setDownloading] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const speechBaseRef = useRef("");
  const [baselineMessageIds, setBaselineMessageIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [welcomeRevealed, setWelcomeRevealed] = useState(false);
  const { listening, error: speechError, supported: speechSupported, toggle, stop: stopSpeech } =
    useSpeechToText();

  useEffect(() => {
    const loaded = loadLocalSession(sessionId);
    queueMicrotask(() => {
      if (!loaded) {
        setSession(null);
        setBaselineMessageIds(new Set());
        return;
      }
      const next = {
        ...loaded,
        messages: seedMessages(loaded),
        likes: seedRequirements(loaded),
        sheets: loaded.sheets ?? [],
      };
      setSession(next);
      saveLocalSession(next);
      setBaselineMessageIds(new Set(next.messages.map((m) => m.id)));
    });
  }, [sessionId]);

  useEffect(() => {
    if (!session) return;

    if (!isInitialWelcomeOnly(session.messages)) {
      setWelcomeRevealed(true);
      return;
    }

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reducedMotion) {
      setWelcomeRevealed(true);
      return;
    }

    setWelcomeRevealed(false);
    const timer = window.setTimeout(
      () => setWelcomeRevealed(true),
      WELCOME_RIPPLE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [session?.id, session?.messages]);

  useEffect(() => {
    const node = threadRef.current;
    if (!node || !session) return;

    const hasUserMessage = session.messages.some(
      (message) => message.role === "user",
    );

    if (!hasUserMessage && !busy) {
      node.scrollTop = 0;
      return;
    }

    node.scrollTop = node.scrollHeight;
  }, [session?.messages, session?.likes, busy, session]);

  function update(next: ColoringSession) {
    setSession(next);
    saveLocalSession(next);
  }

  async function sendMessage(text: string) {
    if (!session) return;
    const trimmed = text.trim();
    if (!trimmed || busy || making) return;

    const isFirstIdea = !session.idea.trim();
    const idea = isFirstIdea ? trimmed : session.idea;

    const userMessage: ChatMessage = {
      id: newId(),
      role: "user",
      text: trimmed,
    };
    const pending: ColoringSession = {
      ...session,
      idea,
      messages: [...session.messages, userMessage],
      revisionNote: isFirstIdea ? "" : trimmed,
    };
    update(pending);
    setDraft("");
    speechBaseRef.current = "";
    stopSpeech();
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session: {
            id: pending.id,
            lastFeedback: pending.lastFeedback,
            editingPreviousSheet: pending.editingPreviousSheet,
          },
          idea: pending.idea,
          printPrefs: pending.printPrefs,
          likes: pending.likes,
          revisionNote: isFirstIdea ? undefined : trimmed,
          editingPreviousSheet: pending.editingPreviousSheet,
        }),
      });
      const payload = (await response.json()) as {
        feedback?: FeedbackTurn;
        error?: string;
      };
      if (!response.ok || !payload.feedback) {
        throw new Error(payload.error || "Could not update the plan.");
      }

      const smartyText = [
        payload.feedback.kind === "workaround"
          ? payload.feedback.workaround?.suggestion
          : null,
        payload.feedback.kidMessage,
      ]
        .filter(Boolean)
        .join(" ");

      const nextLikes = resolveRefineLikes({
        feedback: payload.feedback,
        existingLikes: pending.likes,
        idea: pending.idea,
        detail: pending.printPrefs.detail,
        isFirstIdea,
        editingPreviousSheet: Boolean(pending.editingPreviousSheet),
        newId,
        mergeRequirements,
        applyPlanEdits,
      });

      update({
        ...pending,
        lastFeedback: payload.feedback,
        likes: nextLikes,
        messages: [
          ...pending.messages,
          { id: newId(), role: "smarty", text: smartyText },
        ],
        revisionNote: "",
        status: "refine",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wiggle.");
    } finally {
      setBusy(false);
    }
  }

  async function makeSheet() {
    if (!session || making || busy) return;

    setMaking(true);
    setError(null);
    setCurtain({
      open: true,
      mode: "loading",
      sheet: null,
      statusTitle: "Making your coloring sheet…",
      statusDetail:
        "Sharpening crayons. Drawing big shapes. Saving the tiny details for last.",
    });
    update({ ...session, status: "making" });

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session }),
      });

      if (!response.ok || !response.body) {
        let message = "The crayons jammed.";
        try {
          const payload = (await response.json()) as { error?: string };
          if (payload.error) message = payload.error;
        } catch {
          // keep default
        }
        throw new Error(message);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let sheet: GeneratedSheet | null = null;
      let streamError: string | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          const event = JSON.parse(trimmed) as
            | {
                type: "status";
                title: string;
                detail: string;
              }
            | { type: "sheet"; sheet: GeneratedSheet }
            | { type: "error"; error: string };

          if (event.type === "status") {
            setCurtain((current) =>
              current.open && current.mode === "loading"
                ? {
                    ...current,
                    statusTitle: event.title,
                    statusDetail: event.detail,
                  }
                : current,
            );
          } else if (event.type === "sheet") {
            sheet = event.sheet;
          } else if (event.type === "error") {
            streamError = event.error;
          }
        }
      }

      if (buffer.trim()) {
        const event = JSON.parse(buffer.trim()) as
          | { type: "sheet"; sheet: GeneratedSheet }
          | { type: "error"; error: string }
          | { type: "status"; title: string; detail: string };
        if (event.type === "sheet") sheet = event.sheet;
        if (event.type === "error") streamError = event.error;
        if (event.type === "status") {
          setCurtain((current) =>
            current.open && current.mode === "loading"
              ? {
                  ...current,
                  statusTitle: event.title,
                  statusDetail: event.detail,
                }
              : current,
          );
        }
      }

      if (streamError || !sheet) {
        throw new Error(streamError || "The crayons jammed.");
      }

      const version: SheetVersion = {
        id: newId(),
        createdAt: new Date().toISOString(),
        sheet,
      };

      const next: ColoringSession = {
        ...session,
        status: "done",
        sheet,
        sheets: [...session.sheets, version],
      };
      update(next);
      setCurtain({
        open: true,
        mode: "ready",
        sheet,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "The crayons jammed.";
      setCurtain({
        open: true,
        mode: "error",
        sheet: null,
        error: message,
      });
      update({ ...session, status: "refine" });
    } finally {
      setMaking(false);
    }
  }

  function continueEditing() {
    if (!session) return;

    setCurtain({ open: false });
    setError(null);
    update({
      ...session,
      status: "refine",
      editingPreviousSheet: true,
      editAfterMessageCount: session.messages.length,
    });
  }

  async function downloadSheet(sheet: GeneratedSheet) {
    if (!session) return;
    setDownloading(true);
    try {
      const response = await fetch("/api/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageDataUrl: sheet.imageDataUrl,
          printPrefs: session.printPrefs,
        }),
      });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error || "Could not make a PDF.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${sheet.title.replace(/\s+/g, "-") || "coloring-sheet"}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not make a PDF.");
    } finally {
      setDownloading(false);
    }
  }

  function openVersion(versionId: string) {
    if (!session) return;
    const version = session.sheets.find((item) => item.id === versionId);
    if (!version) return;
    setCurtain({
      open: true,
      mode: "ready",
      sheet: version.sheet,
    });
  }

  if (!session) {
    return (
      <div className="mx-auto max-w-xl px-8 py-16 text-center">
        <AppHeader />
        <p className="mt-10 font-display text-2xl">
          We lost that idea. Start a new one?
        </p>
        <div className="mt-6">
          <KidButton onClick={() => router.push("/")}>Start over</KidButton>
        </div>
      </div>
    );
  }

  const hasIdea = Boolean(session.idea.trim());
  const showWelcomeRipple =
    isInitialWelcomeOnly(session.messages) && !welcomeRevealed;
  const hasUserMessage = session.messages.some(
    (message) => message.role === "user",
  );
  const isEngagingWithChat = draft.trim().length > 0;
  const hasEngagedWithChat =
    hasUserMessage || isEngagingWithChat;
  const activeSheet =
    curtain.open && curtain.sheet ? curtain.sheet : null;

  const planTexts = session.likes
    .map((like) => like.text)
    .filter(isScenePlanPoint);
  const generateTitle = session.printPrefs.showTitle
    ? planTexts[0]?.split(",")[0] ||
      session.idea.slice(0, 42) ||
      "My coloring sheet"
    : "Coloring sheet";
  const generatePromptPreview = buildGeneratePrompt({
    idea: session.idea,
    likes: planTexts,
    printPrefs: session.printPrefs,
    title: generateTitle,
    editingPreviousSheet: Boolean(session.editingPreviousSheet),
  });

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-cream">
      <div className="mx-auto flex h-full min-h-0 w-full max-w-[1120px] flex-1 flex-col overflow-hidden px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
        <div className="shrink-0">
          <AppHeader
            printPrefs={session.printPrefs}
            onPrintPrefsChange={(printPrefs) =>
              update({ ...session, printPrefs })
            }
          />
        </div>
        <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden lg:mt-8 lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-10">
          <section
            className="flex min-h-0 flex-1 flex-col overflow-hidden"
            aria-label="Chat with Smarty"
          >
            <div
              ref={threadRef}
              className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-1 pb-2 lg:gap-5 lg:px-2"
            >
              {showWelcomeRipple ? (
                <div
                  className="flex max-w-[min(36rem,90%)] flex-col gap-1.5 self-start"
                  aria-live="polite"
                  aria-label="Smarty is getting ready"
                >
                  <div className="flex items-center gap-2">
                    <SmartyAvatar variant="chat" />
                    <p className="font-display text-sm font-semibold text-smarty-label">
                      Smarty
                    </p>
                  </div>
                  <CrayonRippleDots
                    size="sm"
                    className="px-1"
                    label="Smarty is getting ready"
                  />
                </div>
              ) : null}
              {session.messages.map((message, index) => {
                const isInitialWelcome =
                  index === 0 &&
                  message.role === "smarty" &&
                  isInitialWelcomeOnly(session.messages);
                if (isInitialWelcome && !welcomeRevealed) return null;

                const showEditDivider =
                  session.editAfterMessageCount != null &&
                  index === session.editAfterMessageCount - 1;

                return (
                  <div key={message.id} className="flex flex-col gap-4 lg:gap-5">
                    <ChatBubble
                      message={message}
                      animateEnter={
                        message.role === "smarty" &&
                        (!baselineMessageIds.has(message.id) ||
                          (isInitialWelcome && welcomeRevealed))
                      }
                    />
                    {showEditDivider ? (
                      <div
                        className="flex items-center gap-3 py-1"
                        role="separator"
                        aria-label="Editing previous drawing"
                      >
                        <div className="h-0 flex-1 border-t-2 border-dashed border-ink/35" />
                        <span className="shrink-0 font-display text-xs font-semibold tracking-wide text-ink-soft">
                          Editing previous drawing
                        </span>
                        <div className="h-0 flex-1 border-t-2 border-dashed border-ink/35" />
                      </div>
                    ) : null}
                  </div>
                );
              })}
              {busy ? (
                <div
                  className="flex max-w-[min(36rem,90%)] flex-col gap-1.5 self-start"
                  aria-live="polite"
                  aria-label="Smarty is thinking"
                >
                  <div className="flex items-center gap-2">
                    <SmartyAvatar variant="chat" />
                    <p className="font-display text-sm font-semibold text-smarty-label">
                      Smarty
                    </p>
                  </div>
                  <CrayonRippleDots
                    size="sm"
                    className="px-1"
                    label="Smarty is thinking"
                  />
                </div>
              ) : null}

              <div className="flex flex-col gap-4 pt-2 lg:hidden">
                <SheetVersionSelect
                  versions={session.sheets}
                  onSelect={openVersion}
                />
                <RequirementsList
                  layout="inline"
                  items={session.likes}
                  generatePromptPreview={generatePromptPreview}
                  showDebug={session.printPrefs.enableDebug}
                  hasEngagedWithChat={hasEngagedWithChat}
                  onMakeIt={makeSheet}
                  makeItDisabled={busy || making || session.likes.length === 0}
                  onChange={(id, text) =>
                    update({
                      ...session,
                      likes: session.likes.map((item) =>
                        item.id === id ? { ...item, text } : item,
                      ),
                    })
                  }
                  onRemove={(id) =>
                    update({
                      ...session,
                      likes: session.likes.filter((item) => item.id !== id),
                    })
                  }
                />
              </div>
            </div>
            <div className="shrink-0 border-t border-ink/10 bg-cream px-0 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:border-0 lg:pt-4 lg:pb-0">
              <ChatComposer
                value={draft}
                onChange={setDraft}
                onSend={() => sendMessage(draft)}
                speaking={speechSupported && listening}
                busy={busy || making}
                error={speechError ?? error}
                placeholder={
                  !hasIdea
                    ? "Tell Smarty your idea..."
                    : session.editingPreviousSheet
                      ? "Tell Smarty what to change on the drawing..."
                      : "Tell Smarty what to change..."
                }
                onSpeak={
                  speechSupported
                    ? () => {
                        if (listening) {
                          speechBaseRef.current = "";
                          stopSpeech();
                          return;
                        }
                        speechBaseRef.current = draft.trim();
                        toggle((text, isFinal) => {
                          const spoken = text.trim();
                          if (!spoken) return;
                          const base = speechBaseRef.current;
                          if (isFinal) {
                            const next =
                              `${base ? `${base} ` : ""}${spoken}`.trim();
                            speechBaseRef.current = next;
                            setDraft(next);
                          } else {
                            setDraft(
                              `${base ? `${base} ` : ""}${spoken}`.trim(),
                            );
                          }
                        });
                      }
                    : undefined
                }
              />
            </div>
          </section>
          <div className="hidden min-h-0 flex-col gap-4 lg:flex lg:gap-5">
            <div className="shrink-0">
              <SheetVersionSelect
                versions={session.sheets}
                onSelect={openVersion}
              />
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">
              <RequirementsList
                items={session.likes}
                generatePromptPreview={generatePromptPreview}
                showDebug={session.printPrefs.enableDebug}
                hasEngagedWithChat={hasEngagedWithChat}
                onMakeIt={makeSheet}
                makeItDisabled={busy || making || session.likes.length === 0}
                onChange={(id, text) =>
                  update({
                    ...session,
                    likes: session.likes.map((item) =>
                      item.id === id ? { ...item, text } : item,
                    ),
                  })
                }
                onRemove={(id) =>
                  update({
                    ...session,
                    likes: session.likes.filter((item) => item.id !== id),
                  })
                }
              />
            </div>
          </div>
        </div>
      </div>

      {curtain.open ? (
        <MakingCurtain
          mode={curtain.mode}
          sheet={activeSheet}
          printPrefs={session.printPrefs}
          error={curtain.error}
          statusTitle={curtain.statusTitle}
          statusDetail={curtain.statusDetail}
          downloading={downloading}
          onDownload={() => {
            if (activeSheet) void downloadSheet(activeSheet);
          }}
          onContinueEditing={() => {
            if (curtain.mode === "error") {
              setCurtain({ open: false });
              return;
            }
            continueEditing();
          }}
          onRetry={() => {
            void makeSheet();
          }}
          onDismiss={
            curtain.mode === "ready"
              ? () => setCurtain({ open: false })
              : undefined
          }
        />
      ) : null}
    </div>
  );
}
