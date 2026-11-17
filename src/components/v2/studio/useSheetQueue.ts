"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GenerateOptions, GenerateOutcome } from "@/components/v2/studio/useSheetGeneration";

/** Pages drawn at the same time. More would mostly wait on the model anyway. */
export const PAGE_QUEUE_CONCURRENCY = 3;

export type QueueStatus = "queued" | "running";

export type BatchSummary = {
  ready: number;
  failed: number;
  /** Why the batch stopped early, when it did. */
  stopped: Extract<GenerateOutcome, { kind: "limit" } | { kind: "credit" }> | null;
};

type Job = { photoId: string; options?: GenerateOptions };

/** A photo's job as the queue sees it: running or waiting, what it was asked for, and how many wait ahead of it. */
export type QueueJob = { status: QueueStatus; options?: GenerateOptions; ahead: number };

type Options = {
  run: (photoId: string, options?: GenerateOptions) => Promise<GenerateOutcome>;
  /** Once per batch, when the last job of it settles. */
  onBatchEnd?: (summary: BatchSummary) => void;
};

/**
 * A small queue in front of page drawing: up to three pages at once, the rest wait their turn.
 * A guest limit or an empty wallet stops the queue and returns the waiting photos to "Make page".
 */
export function useSheetQueue({ run, onBatchEnd }: Options) {
  const runRef = useRef(run);
  const onBatchEndRef = useRef(onBatchEnd);
  useEffect(() => {
    runRef.current = run;
    onBatchEndRef.current = onBatchEnd;
  });

  const pendingRef = useRef<Job[]>([]);
  const runningRef = useRef<Set<string>>(new Set());
  const batchRef = useRef<{ ready: number; failed: number; total: number; stopped: BatchSummary["stopped"] }>({
    ready: 0,
    failed: 0,
    total: 0,
    stopped: null,
  });
  const [statuses, setStatuses] = useState<Record<string, QueueStatus>>({});
  const [jobs, setJobs] = useState<Record<string, QueueJob>>({});
  const runningOptionsRef = useRef<Map<string, GenerateOptions | undefined>>(new Map());
  const [failures, setFailures] = useState<Record<string, string>>({});
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  // The engine is plain functions over refs, made once: pump() calls itself as jobs finish.
  const engine = useMemo(() => {
    function sync() {
      const next: Record<string, QueueStatus> = {};
      const nextJobs: Record<string, QueueJob> = {};
      pendingRef.current.forEach((job, index) => {
        next[job.photoId] = "queued";
        nextJobs[job.photoId] = { status: "queued", options: job.options, ahead: index };
      });
      for (const id of runningRef.current) {
        next[id] = "running";
        nextJobs[id] = { status: "running", options: runningOptionsRef.current.get(id), ahead: 0 };
      }
      setStatuses(next);
      setJobs(nextJobs);
      const b = batchRef.current;
      setProgress({ done: b.ready + b.failed, total: b.total });
    }

    function finishBatchIfIdle() {
      if (runningRef.current.size > 0 || pendingRef.current.length > 0) return;
      const b = batchRef.current;
      if (b.total === 0) return;
      batchRef.current = { ready: 0, failed: 0, total: 0, stopped: null };
      onBatchEndRef.current?.({ ready: b.ready, failed: b.failed, stopped: b.stopped });
    }

    function settle(job: Job, outcome: GenerateOutcome) {
      runningRef.current.delete(job.photoId);
      runningOptionsRef.current.delete(job.photoId);
      const b = batchRef.current;
      if (outcome.kind === "success") {
        b.ready += 1;
      } else if (outcome.kind === "failed") {
        b.failed += 1;
        setFailures((prev) => ({ ...prev, [job.photoId]: outcome.message }));
      } else if (outcome.kind === "limit" || outcome.kind === "credit") {
        // Nothing else in this batch can succeed: hand the waiting photos back.
        b.stopped = b.stopped ?? outcome;
        b.total -= pendingRef.current.length + 1;
        pendingRef.current = [];
      } else {
        b.total -= 1;
      }
      sync();
      pump();
      finishBatchIfIdle();
    }

    function pump() {
      while (runningRef.current.size < PAGE_QUEUE_CONCURRENCY && pendingRef.current.length > 0) {
        const job = pendingRef.current.shift()!;
        runningRef.current.add(job.photoId);
        runningOptionsRef.current.set(job.photoId, job.options);
        void runRef
          .current(job.photoId, job.options)
          .catch((err: unknown): GenerateOutcome => ({
            kind: "failed",
            message: err instanceof Error ? err.message : "Something went wrong.",
          }))
          .then((outcome) => settle(job, outcome));
      }
      sync();
    }

    /** Adds photos to the queue (each at most once). Returns how many were added. */
    function enqueue(photoIds: string[], options?: GenerateOptions): number {
      let added = 0;
      for (const photoId of photoIds) {
        if (runningRef.current.has(photoId) || pendingRef.current.some((j) => j.photoId === photoId)) continue;
        pendingRef.current.push({ photoId, options });
        added += 1;
      }
      if (added === 0) return 0;
      batchRef.current.total += added;
      setFailures((prev) => {
        const next = { ...prev };
        for (const id of photoIds) delete next[id];
        return next;
      });
      pump();
      return added;
    }

    /** Takes photos out of the queue before they start. Pages already being drawn carry on. */
    function cancel(photoIds?: string[]) {
      const drop = photoIds ? new Set(photoIds) : null;
      const before = pendingRef.current.length;
      pendingRef.current = drop ? pendingRef.current.filter((j) => !drop.has(j.photoId)) : [];
      batchRef.current.total -= before - pendingRef.current.length;
      sync();
      finishBatchIfIdle();
    }

    function isLive(photoId: string) {
      return runningRef.current.has(photoId) || pendingRef.current.some((j) => j.photoId === photoId);
    }

    return { enqueue, cancel, isLive };
  }, []);
  const { enqueue, cancel, isLive } = engine;

  const markFailed = useCallback((photoId: string, message: string) => {
    setFailures((prev) => ({ ...prev, [photoId]: message }));
  }, []);

  const clearFailure = useCallback((photoId: string) => {
    setFailures((prev) => {
      if (!(photoId in prev)) return prev;
      const next = { ...prev };
      delete next[photoId];
      return next;
    });
  }, []);

  const running = Object.values(statuses).filter((s) => s === "running").length;
  const queued = Object.values(statuses).filter((s) => s === "queued").length;

  // Closing the tab mid-batch loses those pages; ask first (iOS may ignore this; see interrupted pages).
  useEffect(() => {
    if (running + queued === 0) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "Pages are still being made";
      return e.returnValue;
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [running, queued]);

  const status = useCallback((photoId: string): QueueStatus | undefined => statuses[photoId], [statuses]);
  const job = useCallback((photoId: string): QueueJob | undefined => jobs[photoId], [jobs]);
  /** Photos with a page being drawn or waiting. */
  const liveIds = useMemo(() => Object.keys(statuses), [statuses]);

  return useMemo(
    () => ({ enqueue, cancel, status, job, isLive, liveIds, running, queued, failures, markFailed, clearFailure, progress }),
    [enqueue, cancel, status, job, isLive, liveIds, running, queued, failures, markFailed, clearFailure, progress],
  );
}

export type SheetQueue = ReturnType<typeof useSheetQueue>;
