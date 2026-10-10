"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { ChatBubble } from "@/components/ChatBubble";
import { ChatComposer } from "@/components/ChatComposer";
import { CrayonRippleDots } from "@/components/CrayonRippleDots";
import { KidButton } from "@/components/KidButton";
import { MakingCurtain } from "@/components/MakingCurtain";
import { RequirementsList } from "@/components/RequirementsList";
import { SheetVersionSelect } from "@/components/SheetVersionSelect";
import { useSpeechToText } from "@/hooks/useSpeechToText";
import { isScenePlanPoint } from "@/lib/ai/prompts";
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
    };

const CONTINUE_EDITING_NOTE =
  "The kid just saw the coloring sheet we made and did not like it. They are about to propose changes. Do not show a long apology. Ask one short, friendly question about what they want different on the page.";

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
  const { listening, toggle } = useSpeechToText();

  useEffect(() => {
    const loaded = loadLocalSession(sessionId);
    if (!loaded) {
      setSession(null);
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
  }, [sessionId]);

  useEffect(() => {
    const node = threadRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [session?.messages, busy]);

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
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session: pending,
          idea: pending.idea,
          printPrefs: pending.printPrefs,
          likes: pending.likes,
          revisionNote: isFirstIdea ? undefined : trimmed,
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

      const extracted = payload.feedback.points
        .filter((point) => isScenePlanPoint(point.text))
        .map((point) => ({
          id: point.id,
          text: point.text,
        }));

      update({
        ...pending,
        lastFeedback: payload.feedback,
        likes: isFirstIdea
          ? extracted
          : mergeRequirements(pending.likes, extracted),
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
    });
    update({ ...session, status: "making" });

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session }),
      });
      const payload = (await response.json()) as {
        sheet?: GeneratedSheet;
        error?: string;
      };
      if (!response.ok || !payload.sheet) {
        throw new Error(payload.error || "The crayons jammed.");
      }

      const version: SheetVersion = {
        id: newId(),
        createdAt: new Date().toISOString(),
        sheet: payload.sheet,
      };

      const next: ColoringSession = {
        ...session,
        status: "done",
        sheet: payload.sheet,
        sheets: [...session.sheets, version],
      };
      update(next);
      setCurtain({
        open: true,
        mode: "ready",
        sheet: payload.sheet,
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

  async function continueEditing() {
    if (!session) return;

    setCurtain({ open: false });
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session,
          idea: session.idea,
          printPrefs: session.printPrefs,
          likes: session.likes,
          revisionNote: CONTINUE_EDITING_NOTE,
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

      update({
        ...session,
        lastFeedback: payload.feedback,
        messages: [
          ...session.messages,
          { id: newId(), role: "smarty", text: smartyText },
        ],
        revisionNote: "",
        status: "refine",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wiggle.");
      update({ ...session, status: "refine" });
    } finally {
      setBusy(false);
    }
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
          <KidButton onClick={() => router.push("/legacy")}>Start over</KidButton>
        </div>
      </div>
    );
  }

  const blocked = session.lastFeedback?.kind === "blocked";
  const hasIdea = Boolean(session.idea.trim());
  const activeSheet =
    curtain.open && curtain.sheet ? curtain.sheet : null;

  return (
    <div className="flex min-h-dvh flex-col bg-cream">
      <div className="mx-auto flex min-h-dvh w-full max-w-[1120px] flex-1 flex-col px-6 py-6 sm:px-8 sm:py-8">
        <AppHeader
          printPrefs={session.printPrefs}
          onPrintPrefsChange={(printPrefs) =>
            update({ ...session, printPrefs })
          }
        />
        <div className="mt-8 grid min-h-0 flex-1 gap-8 pb-2 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-10">
          <section
            className="flex min-h-0 flex-col"
            aria-label="Chat with Smarty"
          >
            <div
              ref={threadRef}
              className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-2"
            >
              {session.messages.map((message) => (
                <ChatBubble key={message.id} message={message} />
              ))}
              {busy ? (
                <CrayonRippleDots
                  size="sm"
                  className="self-start"
                  label="Smarty is thinking"
                />
              ) : null}
            </div>
            <div className="pt-5">
              <ChatComposer
                value={draft}
                onChange={setDraft}
                onSend={() => sendMessage(draft)}
                speaking={listening}
                busy={busy || making}
                error={error}
                placeholder={
                  hasIdea
                    ? "Tell Smarty what to change..."
                    : "Tell Smarty your idea..."
                }
                onSpeak={() =>
                  toggle((text, isFinal) => {
                    if (isFinal) {
                      setDraft((current) =>
                        `${current ? `${current.trim()} ` : ""}${text.trim()}`.trim(),
                      );
                    }
                  })
                }
              />
            </div>
          </section>
          <div className="flex min-h-0 flex-col gap-5">
            <SheetVersionSelect
              versions={session.sheets}
              onSelect={openVersion}
            />
            <RequirementsList
              items={session.likes}
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
            <KidButton
              variant="makeIt"
              className="w-full"
              disabled={
                busy || making || blocked || session.likes.length === 0
              }
              onClick={makeSheet}
            >
              Make It!
            </KidButton>
          </div>
        </div>
      </div>

      {curtain.open ? (
        <MakingCurtain
          mode={curtain.mode}
          sheet={activeSheet}
          printPrefs={session.printPrefs}
          error={curtain.error}
          downloading={downloading}
          onDownload={() => {
            if (activeSheet) void downloadSheet(activeSheet);
          }}
          onContinueEditing={() => {
            if (curtain.mode === "error") {
              setCurtain({ open: false });
              return;
            }
            void continueEditing();
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
