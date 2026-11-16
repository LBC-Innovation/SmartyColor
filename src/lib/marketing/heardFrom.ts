/**
 * "How did you hear about us?" Answers are fixed ids (checked by the database, migration 0036),
 * so they can be counted; "other" and "friend_family" take an optional short detail.
 */
export const HEARD_FROM_OPTIONS = [
  { id: "friend_family", label: "A friend or family member", detail: "Who? (optional)" },
  { id: "facebook_instagram", label: "Facebook or Instagram" },
  { id: "tiktok", label: "TikTok" },
  { id: "pinterest", label: "Pinterest" },
  { id: "youtube", label: "YouTube" },
  { id: "google_search", label: "Google search" },
  { id: "school_group", label: "School, church or parent group" },
  { id: "podcast_blog", label: "A podcast, blog or creator" },
  { id: "gift", label: "I got a book as a gift" },
  { id: "ad_other", label: "An ad somewhere else" },
  { id: "other", label: "Something else", detail: "Where? (optional)" },
] as const;

export type HeardFromAnswer = (typeof HEARD_FROM_OPTIONS)[number]["id"] | "skipped";

export const HEARD_FROM_IDS: readonly string[] = [...HEARD_FROM_OPTIONS.map((o) => o.id), "skipped"];

export const HEARD_FROM_LABELS: Record<string, string> = {
  ...Object.fromEntries(HEARD_FROM_OPTIONS.map((o) => [o.id, o.label])),
  skipped: "Skipped",
};

export const HEARD_FROM_DETAIL_MAX = 200;
