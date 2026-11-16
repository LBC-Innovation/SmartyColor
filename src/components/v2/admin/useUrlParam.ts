"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * One query-string value as state (`?order=ID`, `?tab=products`), so drawers and tabs survive a
 * reload and can be linked to. Uses replace, so opening a drawer doesn't add history entries.
 */
export function useUrlParam(name: string): [string | null, (value: string | null) => void] {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const value = params.get(name);
  const set = useCallback(
    (next: string | null) => {
      const sp = new URLSearchParams(window.location.search);
      if (next == null || next === "") sp.delete(name);
      else sp.set(name, next);
      const qs = sp.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}${window.location.hash}`, { scroll: false });
    },
    [name, pathname, router],
  );
  return [value, set];
}
