import "server-only";

/**
 * Strip credentials / tokens from text before it can reach logs, LLM rewrites,
 * or browser-facing API responses.
 */
export function sanitizeSecretText(text: string): string {
  return text
    .replace(/(Bearer\s+)[A-Za-z0-9._\-]+/gi, "$1[redacted]")
    .replace(
      /(api[_-]?key|access[_-]?token|client[_-]?secret|secret|authorization)([\"'\s:=]+)([^\s\"'&,}]+)/gi,
      "$1$2[redacted]",
    )
    .replace(/([?&](?:key|api_key|apikey|access_token|token)=)[^&\s\"']+/gi, "$1[redacted]")
    .replace(/\bAIza[0-9A-Za-z\-_]{20,}\b/g, "[redacted]")
    .replace(/\bAQ\.[A-Za-z0-9_\-]{20,}\b/g, "[redacted]")
    .replace(
      /\beyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\b/g,
      "[redacted]",
    )
    .replace(/\bsk-[A-Za-z0-9]{20,}\b/g, "[redacted]")
    .replace(/\bxai-[A-Za-z0-9]{20,}\b/g, "[redacted]");
}

const SAFETY_MESSAGES: Array<[RegExp, string]> = [
  [
    /safety_violations=\[[^\]]*(sexual|minors|nudity)[^\]]*\]/i,
    "The image model declined this one because it thought the photo or request looked inappropriate (it sometimes does this with swimwear, bare skin, or kids at the beach or pool). Try a different photo, or crop or reword the request.",
  ],
  [
    /safety_violations=\[[^\]]*(violence|gore|self[-_]?harm)[^\]]*\]/i,
    "The image model declined this one because it thought the photo or request showed something violent. Try a different photo or reword the request.",
  ],
  [
    /safety_violations=\[[^\]]*(hate|harassment)[^\]]*\]/i,
    "The image model declined this one because it thought the request was unkind or hateful. Try rewording it.",
  ],
  [
    /safety_violations=|rejected by the safety system|content[_ ]policy|moderation_blocked|prohibited[_ ]content|blocked.*safety|safety.*blocked|image_safety|recitation/i,
    "The image model declined this photo or request for safety reasons. Try a different photo or reword the request.",
  ],
];

/**
 * If the text is a provider safety/moderation rejection, return a plain-language
 * explanation for the user, otherwise null.
 */
export function friendlySafetyMessage(raw: string): string | null {
  for (const [pattern, message] of SAFETY_MESSAGES) {
    if (pattern.test(raw)) return message;
  }
  return null;
}

/**
 * Turn unknown thrown values into a short message safe for the browser/DOM.
 */
export function toPublicErrorMessage(
  error: unknown,
  fallback: string,
): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  const sanitized = sanitizeSecretText(raw).trim();

  if (!sanitized) return fallback;

  const safety = friendlySafetyMessage(sanitized);
  if (safety) return safety;

  // Provider SDK dumps often embed request URLs / auth material even after scrubbing.
  if (
    /generativelanguage\.googleapis|googleapis\.com\/v1|api\.openai|supabase\.co\/auth|credential|private[_-]?key/i.test(
      sanitized,
    )
  ) {
    return fallback;
  }

  return sanitized.slice(0, 280);
}
