"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { User } from "@/lib/api/types";
import * as api from "@/lib/api/client";

export type AuthSessionState = "anonymous" | "authenticated" | "expired";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  session: AuthSessionState;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
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
    creditsBalance: 0,
  };
}

function rememberUser(next: User): void {
  api.storeSessionHint({ id: next.id, email: next.email });
}

export function AuthProvider({ children }: { children: ReactNode }) {
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
    else if (result.error.message.includes("Invalid or expired")) expireSession();
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
      else if (result.error.message.includes("Invalid or expired")) expireSession();
      setLoading(false);
    };
    void restore();
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
    api.storeToken(data.session.access_token);
    const meResult = await api.fetchMe();
    if (!api.isError(meResult)) applyAuthenticated(meResult.data);
    return null;
  };

  const signOut = async (): Promise<void> => {
    await api.logout();
    expireSession();
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, session, signIn, signUp, signOut, refreshUser }}
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
