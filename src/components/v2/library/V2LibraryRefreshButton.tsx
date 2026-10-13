"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { useV2Studio } from "@/components/v2/V2StudioProvider";
import { useV2Toast } from "@/components/v2/V2Toast";
import { cn } from "@/lib/cn";

/** Cloud albums: pull in photos and sheets added from other devices or by other people. */
export function V2LibraryRefreshButton({ disabled }: { disabled?: boolean }) {
  const { refreshActiveProject } = useV2Studio();
  const toast = useV2Toast();
  const [refreshing, setRefreshing] = useState(false);

  async function refresh() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const result = await refreshActiveProject();
      if (result === "gone") toast.info("That album is no longer available, so we opened another one.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not refresh this album.");
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <button
      type="button"
      disabled={refreshing || disabled}
      onClick={() => void refresh()}
      title="Check for new photos"
      className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-v2-primary/30 bg-v2-primary-light px-3.5 text-sm font-semibold text-v2-link transition hover:border-v2-primary/50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} aria-hidden />
      Refresh
    </button>
  );
}
