"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { KidButton } from "@/components/KidButton";
import { loadLocalSession } from "@/lib/session/local";
import type { ColoringSession } from "@/lib/session/types";

export function SheetStudio({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [session, setSession] = useState<ColoringSession | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);

  useEffect(() => {
    queueMicrotask(() => setSession(loadLocalSession(sessionId)));
  }, [sessionId]);

  async function downloadPdf() {
    if (!session?.sheet) return;
    setPdfError(null);
    try {
      const response = await fetch("/api/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageDataUrl: session.sheet.imageDataUrl,
          printPrefs: session.printPrefs,
        }),
      });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error || "Could not make a PDF.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${session.sheet.title.replace(/\s+/g, "-")}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : "Could not make a PDF.");
    }
  }

  if (!session?.sheet) {
    return (
      <div className="mx-auto max-w-lg px-6 py-16 text-center">
        <AppHeader />
        <p className="mt-10 font-display text-2xl">No sheet yet.</p>
        <KidButton className="mt-6" onClick={() => router.push("/")}>
          Start over
        </KidButton>
      </div>
    );
  }

  const landscape = session.printPrefs.orientation === "landscape";

  return (
    <div className="min-h-full bg-mint">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-8">
        <AppHeader />
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,26rem)_1fr]">
          <div
            className={`print-sheet mx-auto w-full rounded-lg border-[3px] border-ink bg-white p-6 shadow-crayon-lg ${
              landscape ? "max-w-xl" : "max-w-sm"
            }`}
          >
            {session.printPrefs.showTitle ? (
              <h2 className="mb-4 text-center font-display text-xl font-bold">
                {session.sheet.title}
              </h2>
            ) : null}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={session.sheet.imageDataUrl}
              alt={session.sheet.title}
              className="w-full rounded-md border-2 border-ink bg-white"
            />
            {session.printPrefs.nameLine ? (
              <p className="mt-4 font-body text-sm text-ink-soft">
                Name: ____________
              </p>
            ) : null}
          </div>
          <div className="flex max-w-md flex-col items-start gap-4">
            <h1 className="font-display text-4xl font-bold">
              Your sheet is ready
            </h1>
            <p className="font-body text-xl text-ink-soft">
              Print it, or save a PDF to color later.
            </p>
            <KidButton variant="makeIt" onClick={() => window.print()}>
              Print
            </KidButton>
            <KidButton onClick={downloadPdf}>Download PDF</KidButton>
            <KidButton variant="secondary" onClick={() => router.push("/")}>
              Make another
            </KidButton>
            {pdfError ? (
              <p className="font-display text-crayon-coral">{pdfError}</p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
