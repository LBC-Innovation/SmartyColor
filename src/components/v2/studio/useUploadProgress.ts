"use client";

import { useEffect, useState } from "react";

/** How long a finished run stays on screen at 100% before the bar leaves. */
const FINISH_MS = 1600;
/** Drawing a page takes far longer than uploading a photo, so it counts for more of the bar. */
const PAGE_WEIGHT = 3;
/** A page being drawn right now counts as this share of a finished one, so the bar moves on start. */
const RUNNING_SHARE = 0.4;

type Run = {
  uploadIds: string[];
  pageIds: string[];
  /** The furthest the bar has reached in this run; it never slides back. */
  peak: number;
};

export type UploadProgress = {
  phase: "uploading" | "drawing" | "done";
  /** 0 to 1. */
  fraction: number;
  uploads: { done: number; total: number };
  pages: { done: number; total: number };
};

/**
 * One progress figure for a run of adding photos and drawing their pages, from the moment the
 * first upload starts until the last page is ready. Returns null when nothing is going on.
 */
export function useUploadProgress({
  pendingUploadIds,
  livePageIds,
  runningPageIds,
  expectPages,
}: {
  pendingUploadIds: string[];
  /** Photos whose page is being drawn or waiting in the queue. */
  livePageIds: string[];
  runningPageIds: string[];
  /** Pages will be made for the photos still uploading. */
  expectPages: boolean;
}): UploadProgress | null {
  const [run, setRun] = useState<Run | null>(null);
  const [finishing, setFinishing] = useState(false);
  const active = pendingUploadIds.length > 0 || livePageIds.length > 0;

  // Track the run as it grows (React's "adjust state while rendering" pattern).
  let current = run;
  if (active) {
    const uploadIds = run?.uploadIds ?? [];
    const pageIds = run?.pageIds ?? [];
    const newUploads = pendingUploadIds.filter((id) => !uploadIds.includes(id));
    const newPages = livePageIds.filter((id) => !pageIds.includes(id));
    if (!run || newUploads.length > 0 || newPages.length > 0) {
      current = { uploadIds: [...uploadIds, ...newUploads], pageIds: [...pageIds, ...newPages], peak: run?.peak ?? 0 };
    }
    if (finishing) setFinishing(false);
  } else if (run && !finishing) {
    setFinishing(true);
  }

  let progress: UploadProgress | null = null;
  if (current) {
    const uploadsDone = current.uploadIds.filter((id) => !pendingUploadIds.includes(id)).length;
    const pagesDone = current.pageIds.filter((id) => !livePageIds.includes(id)).length;
    const running = current.pageIds.filter((id) => runningPageIds.includes(id)).length;
    // While photos are still uploading, each will want a page too (pages start once the batch is
    // in); count them now so the bar doesn't race ahead and stall.
    const pagesTotal =
      expectPages && pendingUploadIds.length > 0
        ? Math.max(current.pageIds.length, current.uploadIds.length)
        : current.pageIds.length;
    const total = current.uploadIds.length + pagesTotal * PAGE_WEIGHT;
    const done = uploadsDone + (pagesDone + running * RUNNING_SHARE) * PAGE_WEIGHT;
    const raw = !active ? 1 : total > 0 ? Math.min(0.99, done / total) : 0;
    const fraction = Math.max(current.peak, raw);
    if (fraction !== current.peak) current = { ...current, peak: fraction };
    progress = {
      phase: !active ? "done" : pendingUploadIds.length > 0 ? "uploading" : "drawing",
      fraction,
      uploads: { done: uploadsDone, total: current.uploadIds.length },
      pages: { done: pagesDone, total: pagesTotal },
    };
  }
  if (current !== run) setRun(current);

  useEffect(() => {
    if (!finishing) return;
    const timer = window.setTimeout(() => {
      setRun(null);
      setFinishing(false);
    }, FINISH_MS);
    return () => window.clearTimeout(timer);
  }, [finishing]);

  return progress;
}
