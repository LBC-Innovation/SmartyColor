"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { KidButton } from "@/components/KidButton";
import { loadLocalSession, saveLocalSession } from "@/lib/session/local";
import type { ColoringSession, GeneratedSheet } from "@/lib/session/types";

export function MakeStudio({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const session = loadLocalSession(sessionId);
    if (!session) {
      setError("missing");
      return;
    }

    let cancelled = false;

    async function run(current: ColoringSession) {
      try {
        const response = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session: current }),
        });
        const payload = (await response.json()) as {
          sheet?: GeneratedSheet;
          error?: string;
        };
        if (!response.ok || !payload.sheet) {
          throw new Error(payload.error || "The crayons jammed.");
        }
        if (cancelled) return;
        saveLocalSession({
          ...current,
          status: "done",
          sheet: payload.sheet,
        });
        router.replace(`/create/${sessionId}/sheet`);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "The crayons jammed.");
      }
    }

    run(session);
    return () => {
      cancelled = true;
    };
  }, [router, sessionId]);

  if (error === "missing") {
    return (
      <div className="mx-auto max-w-lg px-6 py-16 text-center">
        <AppHeader />
        <p className="mt-10 font-display text-2xl">We lost that idea.</p>
        <KidButton className="mt-6" onClick={() => router.push("/")}>
          Start over
        </KidButton>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col items-center bg-lilac px-6 py-8">
      <div className="w-full max-w-3xl">
        <AppHeader />
      </div>
      <div className="mt-16 flex flex-col items-center gap-6 text-center">
        <div className="flex gap-4">
          {["bg-crayon-coral", "bg-crayon-yellow", "bg-crayon-teal", "bg-crayon-purple"].map(
            (color) => (
              <span
                key={color}
                className={`size-7 rounded-full border-[3px] border-ink ${color} voice-pulse`}
              />
            ),
          )}
        </div>
        <h1 className="font-display text-4xl font-bold text-balance">
          Making your coloring sheet...
        </h1>
        <p className="max-w-xl font-body text-xl text-ink-soft">
          Sharpening crayons. Drawing big shapes. Saving the tiny details for
          last.
        </p>
        {error ? (
          <div className="flex flex-col items-center gap-4">
            <p className="font-display text-lg text-crayon-coral">{error}</p>
            <KidButton onClick={() => router.push(`/create/${sessionId}`)}>
              Back to the plan
            </KidButton>
          </div>
        ) : null}
      </div>
    </div>
  );
}
