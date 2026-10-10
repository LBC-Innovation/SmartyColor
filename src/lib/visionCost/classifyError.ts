import { APICallError } from "ai";
import type { VisionErrorKind } from "@/lib/visionCost/types";

export type ClassifiedVisionError = {
  kind: VisionErrorKind;
  httpStatus: number | null;
  message: string;
};

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown error";
}

/** Pull the provider's own error message out of an AI SDK response body if present. */
function providerMessage(error: unknown): string | null {
  if (!APICallError.isInstance(error) || !error.responseBody) return null;
  try {
    const body = JSON.parse(error.responseBody) as {
      error?: { message?: string; status?: string };
    };
    const msg = body.error?.message;
    const status = body.error?.status;
    if (typeof msg === "string") return status ? `${status}: ${msg}` : msg;
  } catch {
    /* non-JSON body */
  }
  return null;
}

export function classifyVisionError(
  error: unknown,
  httpStatus: number | null = null,
): ClassifiedVisionError {
  const status =
    httpStatus ??
    (APICallError.isInstance(error) ? (error.statusCode ?? null) : null);
  const message = providerMessage(error) ?? messageOf(error);
  const text = message.toLowerCase();

  let kind: VisionErrorKind = "other";
  if (
    status === 402 ||
    /billing|payment|purchase|free tier|failed_precondition/.test(text)
  ) {
    kind = "billing";
  } else if (
    status === 429 ||
    /quota|resource_exhausted|rate limit|too many requests/.test(text)
  ) {
    kind = "quota";
  } else if (
    status === 401 ||
    status === 403 ||
    /api key|permission_denied|unauthenticated|not configured/.test(text)
  ) {
    kind = "auth";
  } else if (/blocked|safety|prohibited|recitation/.test(text)) {
    kind = "safety";
  }

  return { kind, httpStatus: status, message };
}
