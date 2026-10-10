import type { PrintPrefs } from "@/lib/print/settings";

export type ChatRole = "user" | "smarty";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
};

export type LikedTrait = {
  id: string;
  text: string;
};

export type FeedbackPoint = {
  id: string;
  text: string;
  reaction?: "yay" | "nah";
};

export type FeedbackTurn = {
  kind: "ok" | "workaround" | "blocked";
  kidMessage: string;
  points: FeedbackPoint[];
  /** Plan trait ids to drop when editing an existing sheet. */
  removeFromPlan?: string[];
  workaround?: {
    originalIntent: string;
    suggestion: string;
  };
  saferIdea?: string;
};

export type GeneratedSheet = {
  title: string;
  imageDataUrl: string;
  mimeType: string;
};

export type SheetVersion = {
  id: string;
  createdAt: string;
  sheet: GeneratedSheet;
};

export type ColoringSession = {
  id: string;
  idea: string;
  printPrefs: PrintPrefs;
  likes: LikedTrait[];
  messages: ChatMessage[];
  lastFeedback: FeedbackTurn | null;
  revisionNote: string;
  status: "describe" | "refine" | "ready" | "making" | "done";
  /** @deprecated prefer sheets; kept for older saved sessions */
  sheet?: GeneratedSheet;
  sheets: SheetVersion[];
};

export type RefineRequest = {
  session?: ColoringSession;
  idea: string;
  printPrefs: PrintPrefs;
  likes: LikedTrait[];
  revisionNote?: string;
  nahPointIds?: string[];
};

export type GenerateRequest = {
  session: ColoringSession;
};
