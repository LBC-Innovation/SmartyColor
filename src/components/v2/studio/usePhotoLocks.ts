"use client";

import { useCallback, useMemo, useRef, useState } from "react";

export type PhotoLocks = {
  /** True while any operation (drawing, editing, a quick fix, mirror, portrait) runs on this photo. */
  has: (photoId: string) => boolean;
  /** Takes the lock; false when the photo is already busy. */
  acquire: (photoId: string) => boolean;
  release: (photoId: string) => void;
  /** Busy photo ids, for rendering. */
  busy: ReadonlySet<string>;
};

/**
 * One lock per photo instead of one for the whole studio: a photo never has two operations at
 * once, but different photos can be drawn side by side.
 */
export function usePhotoLocks(): PhotoLocks {
  const ref = useRef<Set<string>>(new Set());
  const [busy, setBusy] = useState<ReadonlySet<string>>(() => new Set());

  const has = useCallback((photoId: string) => ref.current.has(photoId), []);
  const acquire = useCallback((photoId: string) => {
    if (ref.current.has(photoId)) return false;
    ref.current.add(photoId);
    setBusy(new Set(ref.current));
    return true;
  }, []);
  const release = useCallback((photoId: string) => {
    if (!ref.current.delete(photoId)) return;
    setBusy(new Set(ref.current));
  }, []);

  return useMemo(() => ({ has, acquire, release, busy }), [has, acquire, release, busy]);
}
