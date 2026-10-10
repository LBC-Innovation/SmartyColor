import { getLuluAccessToken } from "@/server/lulu/auth";
import { luluApiBase } from "@/server/lulu/config";

export class LuluApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: string,
  ) {
    super(message);
    this.name = "LuluApiError";
  }
}

export async function luluFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = await getLuluAccessToken();
  const url = `${luluApiBase()}${path.startsWith("/") ? path : `/${path}`}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  const text = await response.text();
  if (!response.ok) {
    let detail = text.slice(0, 500);
    try {
      const parsed = JSON.parse(text) as {
        detail?: string;
        message?: string;
        error?: string;
        error_description?: string;
      };
      detail =
        parsed.detail ??
        parsed.message ??
        parsed.error_description ??
        parsed.error ??
        detail;
    } catch {
      /* use raw snippet */
    }
    throw new LuluApiError(
      `Lulu API ${init.method ?? "GET"} ${path} failed (${response.status}): ${detail}`,
      response.status,
      text,
    );
  }

  if (!text) return {} as T;
  return JSON.parse(text) as T;
}
