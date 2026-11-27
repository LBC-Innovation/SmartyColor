"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { recordPageView } from "@/lib/api/client";
import { pageViewPath } from "@/lib/activity/pageViews";

/** Records each screen a signed-in customer opens, for the admin History tab. Guests send nothing. */
export function PageViewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const last = useRef<string | null>(null);
  const userId = user?.id ?? null;
  const search = searchParams.toString();

  useEffect(() => {
    if (!userId) {
      last.current = null;
      return;
    }
    const path = pageViewPath(pathname, search);
    if (!path || path === last.current) return;
    last.current = path;
    void recordPageView(pathname, search);
  }, [userId, pathname, search]);

  return null;
}
