/**
 * A browser event that says an album's book package changed (for example it was canceled from the
 * album menu), so the studio re-reads the album's allowance without a reload.
 */
export const PACKAGE_CHANGED_EVENT = "cm:package-changed";

export function notifyPackageChanged(albumId: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PACKAGE_CHANGED_EVENT, { detail: { albumId } }));
}
