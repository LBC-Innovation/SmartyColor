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
  const { zIndex: layerZ } = useModalLayer({ baseZ: 60, panelRef, onClose: noop });

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
      className="v2-modal fixed inset-0 z-[60] flex items-center justify-center bg-v2-plum/55 p-4 backdrop-blur-sm" style={{ zIndex: layerZ }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="cm-migration-title"
      aria-describedby="cm-migration-body"
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="v2-modal-panel w-full max-w-lg overflow-hidden rounded-[1.75rem] bg-v2-surface text-center ring-1 ring-v2-primary/10 focus:outline-none"
      >
        <div className="v2-modal-strip h-1.5 w-full" aria-hidden />
        <div className="v2-modal-head px-6 pb-7 pt-7 sm:px-8 sm:pt-8">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-brand-violet to-brand-blue text-white shadow-lg shadow-brand-violet/30">
          <CloudUpload className="h-7 w-7" aria-hidden />
        </span>
        <h2 id="cm-migration-title" className="v2-brand-title mt-5 text-[1.625rem] leading-tight text-v2-ink">
          Saving your pages to your account
        </h2>
        <p id="cm-migration-body" className="mt-2 text-base leading-relaxed text-v2-navy">
          The photos and coloring pages you made before signing up are on this device only. We’re copying
          them into your account so they’re backed up and you can open them anywhere you sign in.
        </p>

        <div className="mt-6">
          <div
            className="h-3 w-full overflow-hidden rounded-full bg-v2-primary-light"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={total || 1}
            aria-valuenow={done}
            aria-label="Photos saved"
          >
            <div
              className="v2-modal-strip h-full rounded-full transition-[width] duration-500 ease-out"
              style={{ width: `${Math.max(percent, progress ? 4 : 0)}%` }}
            />
          </div>
          <p role="status" className="mt-3 text-base font-semibold text-v2-ink">
            {step}
          </p>
        </div>

        <p className="mt-6 rounded-2xl bg-v2-bg-subtle px-4 py-3 text-sm leading-relaxed text-v2-muted">
          Please keep this page open until it finishes. Nothing is removed from this device until
          everything has been copied.
        </p>
        </div>
      </div>
    </div>
  );
}
