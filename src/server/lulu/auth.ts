import { luluApiBase, luluBasicAuthHeader } from "@/server/lulu/config";

type TokenCache = {
  accessToken: string;
  expiresAtMs: number;
};

let cache: TokenCache | null = null;

export async function getLuluAccessToken(): Promise<string> {
  if (cache && cache.expiresAtMs > Date.now() + 30_000) {
    return cache.accessToken;
  }

  const url = `${luluApiBase()}/auth/realms/glasstree/protocol/openid-connect/token`;
  const body = new URLSearchParams({ grant_type: "client_credentials" });
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: luluBasicAuthHeader(),
    },
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Lulu token request failed (${response.status}): ${text.slice(0, 200)}`);
  }

  const json = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!json.access_token) {
    throw new Error("Lulu token response missing access_token");
  }

  const expiresInSec = json.expires_in ?? 3600;
  cache = {
    accessToken: json.access_token,
    expiresAtMs: Date.now() + expiresInSec * 1000,
  };
  return cache.accessToken;
}
