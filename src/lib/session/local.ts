import { defaultPrintPrefs } from "@/lib/print/settings";
import { buildFirstSmartyMessage, SMARTY_GREETING } from "@/lib/session/onboarding";
import type { ColoringSession, SheetVersion } from "@/lib/session/types";

const KEY = "smartycolor:session:";

export function createBlankSession(id = crypto.randomUUID()): ColoringSession {
  return {
    id,
    idea: "",
    printPrefs: defaultPrintPrefs,
    likes: [],
    messages: [
      {
        id: crypto.randomUUID(),
        role: "smarty",
        text: buildFirstSmartyMessage(),
      },
    ],
    lastFeedback: null,
    revisionNote: "",
    status: "describe",
    sheets: [],
    editAfterMessageCount: null,
    editingPreviousSheet: false,
  };
}

/** Normalize older session payloads that only had a single `sheet`. */
export function normalizeSession(session: ColoringSession): ColoringSession {
  const sheets: SheetVersion[] = Array.isArray(session.sheets)
    ? session.sheets
    : [];

  if (sheets.length === 0 && session.sheet) {
    sheets.push({
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      sheet: session.sheet,
    });
  }

  return {
    ...session,
    printPrefs: { ...defaultPrintPrefs, ...session.printPrefs },
    messages: upgradeLegacyFirstSmartyMessage(session.messages),
    sheets,
    editAfterMessageCount: session.editAfterMessageCount ?? null,
    editingPreviousSheet: Boolean(session.editingPreviousSheet),
  };
}

function upgradeLegacyFirstSmartyMessage(
  messages: ColoringSession["messages"],
): ColoringSession["messages"] {
  if (!messages.length || messages[0].role !== "smarty") return messages;
  if (messages.some((message) => message.role === "user")) return messages;
  if (!messages[0].text.startsWith(SMARTY_GREETING)) return messages;

  return [{ ...messages[0], text: buildFirstSmartyMessage() }, ...messages.slice(1)];
}

export function saveLocalSession(session: ColoringSession) {
  sessionStorage.setItem(`${KEY}${session.id}`, JSON.stringify(session));
}

export function loadLocalSession(id: string): ColoringSession | null {
  const raw = sessionStorage.getItem(`${KEY}${id}`);
  if (!raw) return null;
  try {
    return normalizeSession(JSON.parse(raw) as ColoringSession);
  } catch {
    return null;
  }
}

export function clearLocalSession(id: string) {
  sessionStorage.removeItem(`${KEY}${id}`);
}
