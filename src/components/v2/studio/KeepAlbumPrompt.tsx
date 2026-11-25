"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FolderHeart, Loader2 } from "lucide-react";
import { V2Modal, V2ModalActions } from "@/components/v2/ui/V2Modal";
import { useV2Toast } from "@/components/v2/V2Toast";
import { setLeaveAlbumGuard } from "@/components/v2/studio/leaveAlbumGuard";
import { KEEP_ALBUM } from "@/content/marketing";

const KEPT_KEY = "cm:kept-empty-albums";

function readKept(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEPT_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function writeKept(ids: string[]) {
  try {
    localStorage.setItem(KEPT_KEY, JSON.stringify(ids.slice(-50)));
  } catch {
    /* ignore */
  }
}

/** Same-site link the click would follow in this tab, or null for anything we leave alone. */
function followedHref(e: MouseEvent): string | null {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return null;
  const anchor = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
  if (!anchor || anchor.hasAttribute("download")) return null;
  if (anchor.target && anchor.target !== "_self") return null;
  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin) return null;
  // A hash on this same page isn't leaving.
  if (url.pathname === window.location.pathname && url.search === window.location.search) return null;
  return url.pathname + url.search + url.hash;
}

type Props = {
  /** The open album when it's untouched (made-up name, no photos) and could be let go; else null. */
  albumId: string | null;
  /** Deletes the album. */
  onDiscard: (id: string) => Promise<void>;
};

/**
 * Leaving a brand-new album that still has its made-up name and no photos asks "Keep this album?",
 * so empty albums don't pile up. Catches same-site links and the album switcher (`leaveAlbum`).
 * An album someone chose to keep isn't asked about again on this device.
 */
export function KeepAlbumPrompt({ albumId, onDiscard }: Props) {
  const router = useRouter();
  const toast = useV2Toast();
  // Only steers the guard, never the markup, so reading storage on the first render is safe.
  const [kept, setKept] = useState<string[]>(() => (typeof window === "undefined" ? [] : readKept()));
  const [pending, setPending] = useState<{ id: string; proceed: () => void } | null>(null);
  const [busy, setBusy] = useState(false);

  const guardedId = albumId && !kept.includes(albumId) ? albumId : null;

  const ask = useCallback(
    (proceed: () => void) => {
      if (!guardedId) return proceed();
      setPending({ id: guardedId, proceed });
    },
    [guardedId],
  );

  useEffect(() => {
    if (!guardedId) return;
    const clearGuard = setLeaveAlbumGuard(ask);
    // Capture phase on the document runs before Next's <Link> handler, so the navigation waits.
    const onClick = (e: MouseEvent) => {
      const href = followedHref(e);
      if (!href) return;
      e.preventDefault();
      e.stopPropagation();
      ask(() => router.push(href));
    };
    document.addEventListener("click", onClick, true);
    return () => {
      clearGuard();
      document.removeEventListener("click", onClick, true);
    };
  }, [guardedId, ask, router]);

  function keep() {
    if (!pending) return;
    const next = [...readKept().filter((id) => id !== pending.id), pending.id];
    writeKept(next);
    setKept(next);
    const { proceed } = pending;
    setPending(null);
    proceed();
  }

  async function discard() {
    if (!pending || busy) return;
    setBusy(true);
    try {
      await onDiscard(pending.id);
    } catch (e) {
      setBusy(false);
      toast.error(e instanceof Error ? e.message : "Please try again.", KEEP_ALBUM.discardFailed);
      return;
    }
    const { proceed } = pending;
    setBusy(false);
    setPending(null);
    proceed();
  }

  if (!pending) return null;

  return (
    <V2Modal
      onClose={() => !busy && setPending(null)}
      maxWidthClass="max-w-md"
      icon={<FolderHeart />}
      title={KEEP_ALBUM.title}
      description={KEEP_ALBUM.description}
    >
      <V2ModalActions>
        <button type="button" disabled={busy} onClick={() => void discard()} className="v2-modal-btn v2-modal-btn--secondary">
          {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : null}
          {KEEP_ALBUM.discard}
        </button>
        <button type="button" disabled={busy} onClick={keep} className="v2-modal-btn v2-modal-btn--primary">
          {KEEP_ALBUM.keep}
        </button>
      </V2ModalActions>
    </V2Modal>
  );
}
