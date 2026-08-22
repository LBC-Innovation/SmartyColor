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
