"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { AdminUser } from "@/lib/api/types";
import type { Tone } from "@/components/v2/admin/format";

export function customerName(user: AdminUser): string {
  return user.displayName || user.email || "Unnamed account";
}

export function isStaff(user: AdminUser): boolean {
  return user.permissions.length > 0;
}

/** Status shown in the list and drawer header. */
export function customerStatus(user: AdminUser): { tone: Tone; label: string } {
  if (user.status === "suspended") return { tone: "bad", label: "Suspended" };
  if (!user.emailConfirmed) return { tone: "warn", label: "Unverified" };
  return { tone: "good", label: "Active" };
}

export type ActionState = "ok" | "err";

/**
 * Runs one async action at a time per key and keeps a short-lived "Saved"/"Failed" flag for it,
 * so each control can show its own result next to itself.
 */
export function useActions() {
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<Record<string, ActionState>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const timers = useRef(new Map<string, number>());

  useEffect(() => {
    const map = timers.current;
    return () => map.forEach((t) => window.clearTimeout(t));
  }, []);

  const run = useCallback(async (key: string, fn: () => Promise<{ ok: true } | { ok: false; message?: string }>) => {
    setBusy(key);
    setErrors((e) => {
      const next = { ...e };
      delete next[key];
      return next;
    });
    const result = await fn();
    setBusy(null);
    setFlash((f) => ({ ...f, [key]: result.ok ? "ok" : "err" }));
    if (!result.ok) setErrors((e) => ({ ...e, [key]: result.message ?? "That didn't work. Try again." }));
    const old = timers.current.get(key);
    if (old) window.clearTimeout(old);
    timers.current.set(
      key,
      window.setTimeout(() => {
        setFlash((f) => {
          const next = { ...f };
          delete next[key];
          return next;
        });
      }, 2500),
    );
    return result.ok;
  }, []);

  return { busy, flash, errors, run };
}

/** Sets several query params in one navigation, so opening a customer and resetting the tab can't race. */
export function useSetUrlParams() {
  const router = useRouter();
  const pathname = usePathname();
  return useCallback(
    (changes: Record<string, string | null>) => {
      const sp = new URLSearchParams(window.location.search);
      for (const [k, v] of Object.entries(changes)) {
        if (v == null || v === "") sp.delete(k);
        else sp.set(k, v);
      }
      const qs = sp.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}${window.location.hash}`, { scroll: false });
    },
    [router, pathname],
  );
}
