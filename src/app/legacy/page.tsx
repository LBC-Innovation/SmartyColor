"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { AppHeader } from "@/components/AppHeader";
import { createBlankSession, saveLocalSession } from "@/lib/session/local";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    const session = createBlankSession();
    saveLocalSession(session);
    router.replace(`/legacy/create/${session.id}`);
  }, [router]);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[1120px] flex-col px-6 py-6 sm:px-8 sm:py-8">
      <AppHeader />
      <p className="mt-16 text-center font-display text-xl text-ink-soft">
        Opening a new idea…
      </p>
    </div>
  );
}
