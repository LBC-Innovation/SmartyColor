/** Fills {tokens} in marketing copy (src/content/marketing.ts). */

export type CopyValues = Partial<Record<"price" | "credit" | "date" | "count" | "min" | "format", string | null>>;

/** The template with its tokens filled, or null if any token has no value (so the line is hidden). */
export function fillCopy(template: string, values: CopyValues): string | null {
  let missing = false;
  const out = template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const v = values[key as keyof CopyValues];
    if (v == null || v === "") {
      missing = true;
      return "";
    }
    return v;
  });
  return missing ? null : out;
}

/** "$5" for whole dollars, "$14.37" otherwise. */
export function formatUsd(cents: number): string {
  const whole = cents % 100 === 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(cents / 100);
}

const INTENT_KEY = "cm_intent";

export type StoredIntent = "default" | "gift" | "story";

/** Remember which landing page a visitor came from, so later screens can match its promise. */
export function rememberIntent(intent: StoredIntent): void {
  try {
    sessionStorage.setItem(INTENT_KEY, intent);
  } catch {
    /* ignore */
  }
}

export function readIntent(): StoredIntent {
  try {
    const v = sessionStorage.getItem(INTENT_KEY);
    return v === "gift" || v === "story" ? v : "default";
  } catch {
    return "default";
  }
}
