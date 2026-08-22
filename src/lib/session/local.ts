import { defaultPrintPrefs } from "@/lib/print/settings";
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
        text: "What do you want to color today? Tell me your idea!",
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
    sheets,
    editAfterMessageCount: session.editAfterMessageCount ?? null,
    editingPreviousSheet: Boolean(session.editingPreviousSheet),
  };
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
