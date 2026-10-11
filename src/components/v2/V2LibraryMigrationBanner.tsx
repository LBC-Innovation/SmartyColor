"use client";

import { useEffect, useState } from "react";
import { CloudUpload, Loader2, X } from "lucide-react";
import { useV2Studio } from "@/components/v2/V2StudioProvider";
import { useV2Toast } from "@/components/v2/V2Toast";
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

  useEffect(() => {
    if (!cloud || !hydrated) return;
    try {
      if (sessionStorage.getItem(DISMISS_KEY) === "1") return;
    } catch {
      /* ignore */
    }
    let cancelled = false;
    summarizeLocalLibrary().then((s) => {
      if (!cancelled) setSummary(s);
    });
    return () => {
      cancelled = true;
    };
  }, [cloud, hydrated]);

  if (!cloud || dismissed || !summary || summary.photos === 0) return null;

  async function run() {
    setBusy(true);
    try {
      const result = await migrateLocalLibraryToCloud(setProgress);
      toast.success({
        title: "Photos moved to your account",
        message: `${result.photos} photo${result.photos === 1 ? "" : "s"} in ${result.projects} album${result.projects === 1 ? "" : "s"} are now saved to your account.`,
      });
      setSummary(null);
      await reload();
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

  return (
    <div className="shrink-0 border-b border-v2-primary/20 bg-v2-primary-light px-4 py-2.5 sm:px-5">
      <div className="flex items-center gap-3">
        <CloudUpload className="h-5 w-5 shrink-0 text-v2-primary" aria-hidden />
        <p className="min-w-0 flex-1 text-sm text-v2-ink">
          {busy && progress ? (
            <>
              Moving photo {Math.min(progress.done + 1, progress.total)} of {progress.total}…
            </>
          ) : (
            <>
              <span className="font-semibold">{summary.photos} photo{summary.photos === 1 ? "" : "s"}</span> on this
              device aren&apos;t in your account yet.
            </>
          )}
        </p>
        <button type="button" className="v2-btn-primary h-9 shrink-0 text-sm" disabled={busy} onClick={() => void run()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          Move to my account
        </button>
        <button
          type="button"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-v2-muted hover:bg-white/60"
          onClick={dismiss}
          disabled={busy}
          aria-label="Not now"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
