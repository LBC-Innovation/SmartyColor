"use client";

import { useEffect, useRef } from "react";
import { CloudUpload } from "lucide-react";
import { useModalLayer } from "@/components/v2/ui/useModalLayer";
import type { MigrationProgress } from "@/lib/v2/migrateLocalLibrary";

const noop = () => {};

/**
 * Covers the studio while a guest's photos move into their new account. It can't be closed:
 * leaving halfway would split an album between this device and the account.
 */
export function V2MigrationProgressModal({ progress }: { progress: MigrationProgress | null }) {
  const panelRef = useRef<HTMLDivElement>(null);
  useModalLayer({ panelRef, onClose: noop });

  // Closing the tab mid-move: ask the browser to confirm first.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  const total = progress?.total ?? 0;
  const done = progress?.done ?? 0;
  const finishing = total > 0 && done >= total;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;

  let step: string;
  if (!progress) step = "Getting your account ready…";
  else if (finishing) step = `Opening “${progress.album}”…`;
  else step = `Saving photo ${done + 1} of ${total} from “${progress.album}”`;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-v2-ink/50 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cm-migration-title"
      aria-describedby="cm-migration-body"
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="w-full max-w-md rounded-2xl border border-gray-200 bg-v2-surface p-6 text-center shadow-[0_24px_64px_rgb(10_16_26/0.25)] focus:outline-none sm:p-8"
      >
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-v2-primary-light text-v2-primary">
          <CloudUpload className="h-7 w-7" aria-hidden />
        </span>
        <h2 id="cm-migration-title" className="mt-4 text-xl font-bold text-v2-ink">
          Saving your pages to your account
        </h2>
        <p id="cm-migration-body" className="mt-2 text-sm leading-relaxed text-v2-navy">
          The photos and coloring pages you made before signing up are on this device only. We’re copying
          them into your account so they’re backed up and you can open them anywhere you sign in.
        </p>

        <div className="mt-6">
          <div
            className="h-2.5 w-full overflow-hidden rounded-full bg-v2-primary-light"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={total || 1}
            aria-valuenow={done}
            aria-label="Photos saved"
          >
            <div
              className="h-full rounded-full bg-v2-primary transition-[width] duration-500 ease-out"
              style={{ width: `${Math.max(percent, progress ? 4 : 0)}%` }}
            />
          </div>
          <p role="status" className="mt-3 text-sm font-semibold text-v2-ink">
            {step}
          </p>
        </div>

        <p className="mt-6 rounded-xl bg-v2-bg-subtle px-4 py-3 text-xs leading-relaxed text-v2-muted">
          Please keep this page open until it finishes. Nothing is removed from this device until
          everything has been copied.
        </p>
      </div>
    </div>
  );
}
