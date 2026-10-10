"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

const supabaseEnabled = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);

export function AuthStatus() {
  const pathname = usePathname();
  const [email, setEmail] = useState<string | null>(null);
  const [ready, setReady] = useState(!supabaseEnabled);

  useEffect(() => {
    if (!supabaseEnabled) return;
    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      setReady(true);
      return;
    }

    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null);
      setReady(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user?.email ?? null);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  if (!supabaseEnabled || !ready) return null;

  const buttonClass =
    "inline-flex min-h-11 items-center rounded-full border-2 border-ink px-4 font-display text-sm font-semibold";

  if (email) {
    return (
      <div className="flex items-center gap-2">
        {pathname !== "/legacy/library" ? (
          <Link
            href="/legacy/library"
            className={`${buttonClass} bg-sky text-ink hover:bg-smarty`}
          >
            My pictures
          </Link>
        ) : null}
        <form action="/auth/sign-out" method="post">
          <button type="submit" className={`${buttonClass} bg-paper text-ink`}>
            Sign out
          </button>
        </form>
      </div>
    );
  }

  if (pathname === "/sign-in") return null;

  return (
    <Link href="/sign-in" className={`${buttonClass} bg-crayon-teal text-white`}>
      Save my pictures
    </Link>
  );
}
