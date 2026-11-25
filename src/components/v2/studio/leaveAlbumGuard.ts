/**
 * A hook point for "you're leaving this album": the studio sets a guard while its album is
 * untouched, and anything that takes the person elsewhere without a link (the album switcher)
 * goes through `leaveAlbum`, so the guard can ask first.
 */
type Guard = (proceed: () => void) => void;

let current: Guard | null = null;

/** Sets the guard; the returned function clears it (only if it is still this one). */
export function setLeaveAlbumGuard(guard: Guard): () => void {
  current = guard;
  return () => {
    if (current === guard) current = null;
  };
}

/** Runs `proceed` now, or after the guard has asked. */
export function leaveAlbum(proceed: () => void): void {
  if (current) current(proceed);
  else proceed();
}
