/**
 * Remembers, for this browser tab, that someone already answered "theme or no theme" for an album
 * (in the wizard's Theme step or on the empty album), so the empty album doesn't ask again.
 * A saved theme answers it on its own; this is for "No theme".
 */
const KEY = "cm:theme-decided:";

export function markThemeDecided(albumId: string) {
  try {
    sessionStorage.setItem(KEY + albumId, "1");
  } catch {
    /* ignore */
  }
}

export function isThemeDecided(albumId: string): boolean {
  try {
    return sessionStorage.getItem(KEY + albumId) === "1";
  } catch {
    return false;
  }
}
