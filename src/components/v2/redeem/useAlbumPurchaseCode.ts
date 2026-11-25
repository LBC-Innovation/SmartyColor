"use client";

import { useCallback, useEffect, useState } from "react";
import { isError } from "@/lib/api/client";
import { fetchAlbumPurchaseCode } from "@/lib/purchaseCodes/client";
import type { AlbumPurchaseCode } from "@/lib/purchaseCodes/types";

/**
 * The open album's purchase code, if it has one, kept fresh after each action it may have paid for.
 * `albumId` null (guest, or no album) means none.
 */
export function useAlbumPurchaseCode(albumId: string | null): {
  code: AlbumPurchaseCode | null;
  refresh: () => void;
  /** True once this album's code (or lack of one) has been read. */
  loaded: boolean;
} {
  const [state, setState] = useState<{ albumId: string; code: AlbumPurchaseCode | null } | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!albumId) return;
    let alive = true;
    void fetchAlbumPurchaseCode(albumId).then((r) => {
      if (alive && !isError(r)) setState({ albumId, code: r.data });
    });
    return () => {
      alive = false;
    };
  }, [albumId, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  const loaded = Boolean(albumId) && state?.albumId === albumId;
  return { code: loaded ? state!.code : null, refresh, loaded };
}
