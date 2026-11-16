import "server-only";
import { authenticateBearer } from "@/lib/auth/authenticate";
import { withVisionGuest, withVisionUser, type VisionGuest } from "@/lib/visionCost/context";
import { clientIp, limitKeyForIp } from "@/server/guestUsageGuard";

function header(request: Request, name: string): string | null {
  const raw = request.headers.get(name)?.trim();
  if (!raw) return null;
  try {
    // Vercel URL-encodes the city ("S%C3%A3o%20Paulo").
    return decodeURIComponent(raw).slice(0, 120);
  } catch {
    return raw.slice(0, 120);
  }
}

function coordinate(request: Request, name: string, limit: number): number | null {
  const n = Number.parseFloat(request.headers.get(name) ?? "");
  return Number.isFinite(n) && Math.abs(n) <= limit ? Math.round(n * 1e5) / 1e5 : null;
}

/**
 * The visitor's address (as the guest limits key it) and the approximate location Vercel derives
 * from it. No outside lookup: off Vercel (local dev) the location is simply empty.
 */
export function visionGuestFromRequest(request: Request): VisionGuest {
  return {
    ip: limitKeyForIp(clientIp(request)).slice(0, 64),
    country: header(request, "x-vercel-ip-country"),
    region: header(request, "x-vercel-ip-country-region"),
    city: header(request, "x-vercel-ip-city"),
    postal: header(request, "x-vercel-ip-postal-code"),
    latitude: coordinate(request, "x-vercel-ip-latitude", 90),
    longitude: coordinate(request, "x-vercel-ip-longitude", 180),
  };
}

/**
 * Runs `fn` with AI costs attributed to whoever sent the request: the signed-in account when the
 * request carries a valid session, otherwise the guest's address. A nested withVisionUser (the
 * library modes) still wins.
 */
export async function withVisionRequest<T>(request: Request, fn: () => Promise<T>): Promise<T> {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const session = await authenticateBearer(authHeader);
    if (!("error" in session)) return withVisionUser(session.user.id, fn);
  }
  return withVisionGuest(visionGuestFromRequest(request), fn);
}
