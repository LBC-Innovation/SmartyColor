"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CloudUpload } from "lucide-react";
import { SAVE_PROMPT } from "@/content/marketing";
import { fillCopy, formatFreeSheets } from "@/lib/marketing/copy";
import { useMarketingNumbers } from "@/lib/marketing/useMarketingNumbers";
import {
  readSavePromptStage,
  requestMigrationAfterSignup,
  savePromptDue,
  snoozeSavePrompt,
} from "@/lib/marketing/savePrompt";

/**
 * Inline card (not a modal) under a guest's coloring page: save it to a free account. Shown after
 * the first page and, after one "Not now", once more after the third. While it is not due,
 * `fallback` (the studio's "Turn this into a book" card) takes its place, so only one shows.
 */
export function V2SavePromptCard({ pageCount, fallback = null }: { pageCount: number; fallback?: ReactNode }) {
  const router = useRouter();
  const [stage, setStage] = useState<ReturnType<typeof readSavePromptStage> | null>(null);

  useEffect(() => {
    // The stage lives in localStorage, readable only after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStage(readSavePromptStage());
  }, []);

  const due = stage != null && savePromptDue(stage, pageCount);
  const freeSheets = useMarketingNumbers(due)?.welcomeFreeSheets ?? null;

  // Until the saved stage is read, show nothing, so neither card flashes in and swaps.
  if (stage == null) return null;
  if (!due) return <>{fallback}</>;

  const title =
    (freeSheets != null ? fillCopy(SAVE_PROMPT.title, { freeSheets: formatFreeSheets(freeSheets) }) : null) ??
    SAVE_PROMPT.titleNoCredit;

  return (
    <aside className="flex shrink-0 flex-col gap-3 rounded-2xl border border-v2-primary/25 bg-v2-primary-light px-4 py-3.5 sm:flex-row sm:items-center">
      <CloudUpload className="hidden h-6 w-6 shrink-0 text-v2-primary sm:block" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-v2-ink">{title}</p>
        <p className="mt-0.5 text-xs leading-snug text-v2-navy">{SAVE_PROMPT.body}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          className="v2-btn-primary min-h-11 px-5 text-sm"
          onClick={() => {
            requestMigrationAfterSignup();
            router.push("/sign-up");
          }}
        >
          {SAVE_PROMPT.save}
        </button>
        <button
          type="button"
          className="inline-flex min-h-11 items-center px-3 text-sm font-semibold text-v2-link hover:underline"
          onClick={() => setStage(snoozeSavePrompt(stage))}
        >
          {SAVE_PROMPT.dismiss}
        </button>
      </div>
    </aside>
  );
}
