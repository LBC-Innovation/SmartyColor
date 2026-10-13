"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import type { User } from "@/lib/api/types";
import { DEFAULT_FEATURE_ACCESS } from "@/lib/auth/features";
import * as api from "@/lib/api/client";
import { clearImageCache } from "@/lib/v2/imageCache";

export type AuthSessionState = "anonymous" | "authenticated" | "expired";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  session: AuthSessionState;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
  /** Apply a wallet balance the server just reported, without a round trip. */
  setCreditsBalance: (cents: number) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function userFromHint(hint: api.SessionHint): User {
  return {
    id: hint.id,
    email: hint.email,
    displayName: hint.email.split("@")[0] ?? "",
    createdAt: "",
    role: "user",
    permissions: [],
    planTier: "free",
    creditsBalanceCents: 0,
    features: { ...DEFAULT_FEATURE_ACCESS },
  };
}

function rememberUser(next: User): void {
  api.storeSessionHint({ id: next.id, email: next.email });
}

const SIGN_IN_PATH = "/sign-in";

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<AuthSessionState>("anonymous");
  const userRef = useRef<User | null>(null);
  userRef.current = user;

  const applyAuthenticated = (next: User): void => {
    rememberUser(next);
    setUser(next);
    setSession("authenticated");
  };

  const expireSession = (): void => {
    api.clearToken();
    setUser(null);
    setSession("expired");
  };

  const refreshUser = async (): Promise<void> => {
    if (!api.hasSessionToken()) return;
    const result = await api.fetchMe();
    if (!api.isError(result)) applyAuthenticated(result.data);
  };

  const setCreditsBalance = (cents: number): void => {
    setUser((current) => (current ? { ...current, creditsBalanceCents: cents } : current));
  };

  useEffect(() => {
    const restore = async () => {
      if (!api.hasSessionToken()) {
        setSession("anonymous");
        setLoading(false);
        return;
      }
      const result = await api.fetchMe();
      if (!api.isError(result)) applyAuthenticated(result.data);
      setLoading(false);
    };
    void restore();
  }, []);

  // The session ended and could not be silently renewed (refresh token gone, revoked, or this is
  // an old sign-in that never had one): drop the dead token and send the user to sign in again.
  useEffect(() => {
    const handleExpired = (): void => {
      setUser(null);
      setSession("expired");
      const { pathname, search } = window.location;
      if (pathname === SIGN_IN_PATH) return;
      const params = new URLSearchParams({ reason: "expired", next: `${pathname}${search}` });
      router.replace(`${SIGN_IN_PATH}?${params.toString()}`);
    };
    return api.onSessionExpired(handleExpired);
  }, [router]);

  // A tab left in the background (or a laptop that slept) comes back with a stale token. Renew it
  // the moment the user returns, so they find out about a dead session before they click anything.
  useEffect(() => {
    const check = (): void => {
      if (document.visibilityState === "visible") void api.ensureFreshSession();
    };
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    window.addEventListener("online", check);
    return () => {
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
      window.removeEventListener("online", check);
    };
  }, []);

  // Signed out (or expired) in another tab: this tab's copy of the session is dead too.
  useEffect(() => {
    const onStorage = (event: StorageEvent): void => {
      if (event.key !== "cm_access_token" || event.newValue !== null) return;
      if (userRef.current) {
        setUser(null);
        setSession("expired");
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const signIn = async (email: string, password: string): Promise<string | null> => {
    const result = await api.login(email, password);
    if (api.isError(result)) return result.error.message;
    if (!result.data.session) return "No session returned — confirm your email if required.";
    const meResult = await api.fetchMe();
    if (!api.isError(meResult)) {
      applyAuthenticated(meResult.data);
      return null;
    }
    return meResult.error.message;
  };

  const signUp = async (email: string, password: string): Promise<string | null> => {
    const result = await api.register(email, password);
    if (api.isError(result)) return result.error.message;
    const data = result.data as { session?: api.AuthSession | null };
    if (!data.session) return null;
    api.storeSession(data.session);
    const meResult = await api.fetchMe();
    if (!api.isError(meResult)) applyAuthenticated(meResult.data);
    return null;
  };

  const signOut = async (): Promise<void> => {
    await api.logout();
    // Cached library images are tied to the account; don't leave them on a shared device.
    await clearImageCache();
    expireSession();
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, session, signIn, signUp, signOut, refreshUser, setCreditsBalance }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
