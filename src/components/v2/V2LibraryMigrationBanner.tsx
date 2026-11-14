"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen, CheckCircle2, CloudUpload, Loader2, X } from "lucide-react";
import { useV2Studio } from "@/components/v2/V2StudioProvider";
import { useV2Toast } from "@/components/v2/V2Toast";
import { V2MigrationProgressModal } from "@/components/v2/V2MigrationProgressModal";
import { takeMigrationRequest } from "@/lib/marketing/savePrompt";
import {
  migrateLocalLibraryToCloud,
  summarizeLocalLibrary,
  type LocalLibrarySummary,
  type MigrationProgress,
} from "@/lib/v2/migrateLocalLibrary";

const DISMISS_KEY = "cm_library_migration_dismissed";

/** Offers to move a guest library on this device into the signed-in account. */
export function V2LibraryMigrationBanner() {
  const { cloud, hydrated, reload } = useV2Studio();
  const toast = useV2Toast();
  const [summary, setSummary] = useState<LocalLibrarySummary | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [progress, setProgress] = useState<MigrationProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const [autoRun, setAutoRun] = useState(false);
  /** Set when the move that ran by itself after sign-up finished: offers the next step. */
  const [movedAuto, setMovedAuto] = useState<{ photos: number } | null>(null);

  useEffect(() => {
    if (!cloud || !hydrated) return;
    try {
      if (sessionStorage.getItem(DISMISS_KEY) === "1") return;
    } catch {
      /* ignore */
    }
    let cancelled = false;
    summarizeLocalLibrary().then((s) => {
      if (cancelled) return;
      setSummary(s);
      if (s.photos > 0 && takeMigrationRequest()) setAutoRun(true);
    });
    return () => {
      cancelled = true;
    };
  }, [cloud, hydrated]);

  // Signed up from the "Save this page" card: move their pages without asking again.
  useEffect(() => {
    if (!autoRun) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAutoRun(false);
    void run(true);
    // run reads only state that is current when autoRun flips.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRun]);

  if (cloud && !dismissed && movedAuto) {
    return (
      <div className="shrink-0 border-b border-v2-success-border bg-v2-success-bg px-4 py-2.5 sm:px-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <p role="status" className="flex min-w-0 flex-1 items-start gap-2 text-sm text-emerald-950">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
            <span>
              Your {movedAuto.photos === 1 ? "page is" : "pages are"} saved to your account. Ready to turn{" "}
              {movedAuto.photos === 1 ? "it" : "them"} into a book?
            </span>
          </p>
          <div className="flex items-center gap-2">
            <Link href="/studio/order" className="v2-btn-primary min-h-11 flex-1 text-sm sm:flex-none">
              <BookOpen className="h-4 w-4" aria-hidden />
              Make your book
            </Link>
            <button
              type="button"
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-v2-muted hover:bg-white/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-primary"
              onClick={() => setMovedAuto(null)}
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!cloud || dismissed || !summary || summary.photos === 0) return null;

  async function run(auto = false) {
    setBusy(true);
    try {
      const result = await migrateLocalLibraryToCloud(setProgress);
      // Open the album they were working on as a guest, not the account's starter album.
      // The progress dialog stays up ("Opening …") until it has loaded.
      await reload({ activeProjectId: result.activeProjectId });
      if (auto) setMovedAuto({ photos: result.photos });
      else {
        toast.success({
          title: "Photos moved to your account",
          message: `${result.photos} photo${result.photos === 1 ? "" : "s"} in ${result.projects} album${result.projects === 1 ? "" : "s"} are now saved to your account.`,
        });
      }
      setSummary(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not move your photos. Nothing was deleted.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  function dismiss() {
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  }

  const count = summary.photos;
  return (
    <>
    {busy ? <V2MigrationProgressModal progress={progress} /> : null}
    <div className="shrink-0 border-b border-v2-primary/20 bg-v2-primary-light px-4 py-2.5 sm:px-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <p role="status" className="flex min-w-0 flex-1 items-start gap-2 text-sm text-v2-ink">
          <CloudUpload className="mt-0.5 h-5 w-5 shrink-0 text-v2-primary" aria-hidden />
          <span>
            {busy && progress ? (
              <>
                Moving photo {Math.min(progress.done + 1, progress.total)} of {progress.total}…
              </>
            ) : (
              <>
                <span className="font-semibold">
                  {count} photo{count === 1 ? "" : "s"}
                </span>{" "}
                on this device {count === 1 ? "isn't" : "aren't"} in your account yet.
              </>
            )}
          </span>
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="v2-btn-primary min-h-11 flex-1 text-sm sm:flex-none"
            disabled={busy}
            onClick={() => void run()}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Move to my account
          </button>
          <button
            type="button"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-v2-muted hover:bg-white/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-primary"
            onClick={dismiss}
            disabled={busy}
            aria-label="Not now"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
    </div>
    </>
  );
}
