import { getSupabaseAdmin, getSupabaseAuth } from "@/lib/supabase/service";

export type AuthUser = {
  id: string;
  email: string;
  role: string;
  permissions: string[];
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
  const supabaseAuth = getSupabaseAuth();
  const {
    data: { user },
    error,
  } = await supabaseAuth.auth.getUser(token);

  if (error || !user) {
    log("warn", "Auth failed: invalid token", {});
    return { error: { status: 401, message: "Invalid or expired token" } };
  }

  let amr: string[] | null = null;
  try {
    const [, payload] = token.split(".");
    const claims = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf-8"),
    ) as { amr?: string[] };
    amr = claims.amr ?? null;
  } catch {
    amr = null;
  }

  const supabaseAdmin = getSupabaseAdmin();
  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("status")
    .eq("id", user.id)
    .single();

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
      role: (user.app_metadata?.role as string | undefined) ?? "user",
      permissions: (user.app_metadata?.permissions as string[] | undefined) ?? [],
      amr,
    },
  };
}
