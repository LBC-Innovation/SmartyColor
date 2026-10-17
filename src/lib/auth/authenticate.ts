import { effectiveFeatureAccess, type FeatureAccess } from "@/lib/auth/features";
import { getSupabaseAdmin, getSupabaseAuth } from "@/lib/supabase/service";

export type AuthUser = {
  id: string;
  email: string;
  emailVerified: boolean;
  permissions: string[];
  features: FeatureAccess;
  amr: string[] | null;
};

function log(level: string, message: string, ctx: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ level, message, ...ctx }));
}

export async function authenticateBearer(
  authHeader: string | null,
): Promise<{ user: AuthUser } | { error: { status: number; message: string; code?: string } }> {
  if (!authHeader?.startsWith("Bearer ")) {
    return { error: { status: 401, message: "Missing or invalid authorization header" } };
  }

  const token = authHeader.slice(7);

  let claims: { sub?: string; amr?: string[] } = {};
  try {
    const [, payload] = token.split(".");
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8")) as typeof claims;
  } catch {
    claims = {};
  }
  const amr = claims.amr ?? null;

  // Verifying the token and reading the profile are independent round trips, so run them together.
  // The profile is looked up by the token's (unverified) subject and only used once getUser confirms it.
  // Query builders are lazy until awaited; Promise.resolve sends the request now.
  const loadProfile = (userId: string) =>
    Promise.resolve(getSupabaseAdmin().from("profiles").select("status").eq("id", userId).single());
  const profileByClaim = claims.sub ? loadProfile(claims.sub) : null;
  profileByClaim?.catch(() => undefined);

  const {
    data: { user },
    error,
  } = await getSupabaseAuth().auth.getUser(token);

  if (error || !user) {
    log("warn", "Auth failed: invalid token", {});
    return { error: { status: 401, message: "Invalid or expired token" } };
  }

  const { data: profile, error: profileError } =
    profileByClaim && claims.sub === user.id ? await profileByClaim : await loadProfile(user.id);

  if (profileError) {
    log("error", "Failed to fetch profile during auth check", {
      userId: user.id,
      error: profileError.message,
    });
    return { error: { status: 500, message: "Internal server error" } };
  }

  if ((profile as { status: string } | null)?.status === "suspended") {
    return {
      error: { status: 403, message: "Account suspended", code: "SUSPENDED" },
    };
  }

  return {
    user: {
      id: user.id,
      email: user.email ?? "",
      emailVerified: Boolean(user.email_confirmed_at),
      permissions: (user.app_metadata?.permissions as string[] | undefined) ?? [],
      features: effectiveFeatureAccess(user.app_metadata?.features),
      amr,
    },
  };
}
