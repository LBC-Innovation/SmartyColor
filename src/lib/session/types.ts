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
  /** Data URL for guests; for cloud revisions this is a cached object URL. */
  imageDataUrl: string;
  mimeType: string;
  /** Storage path when the sheet lives in the cloud library. */
  storagePath?: string;
  /** Cloud revisions: short-lived URL for a small resized copy, for tiles. */
  thumbUrl?: string;
};

/** One entry in a photo's version rail. */
export type SheetVersion = {
  id: string;
  createdAt: string;
  sheet: GeneratedSheet;
  /** "photo" is an AI portrait version of the photo itself; absent means a coloring sheet. */
  kind?: "sheet" | "photo";
  /** Shape of this version when it differs from the uploaded photo. */
  orientation?: "portrait" | "landscape";
  /** The photo version a sheet was drawn from; absent means the uploaded photo. */
  sourceRevisionId?: string | null;
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
