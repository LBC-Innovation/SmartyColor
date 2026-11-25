/**
 * "Make a book of this year" goes through the book wizard like any new album (book, pay, theme),
 * then fills the album with that year's photos. This remembers the year album for the browser tab
 * across those steps, including the round trip to Stripe, and which album it became.
 */
const KEY = "cm:year-album";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type YearAlbumIntent = { year: number; albumName: string; at: number; albumId?: string };

/** Entry param on /studio/new: the wizard keeps the intent only when it was opened for it. */
export const YEAR_ALBUM_PARAM = "for";
export const YEAR_ALBUM_PARAM_VALUE = "year";

export function writeYearAlbumIntent(input: { year: number; albumName: string }) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...input, at: Date.now() }));
  } catch {
    /* ignore */
  }
}

export function readYearAlbumIntent(): YearAlbumIntent | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<YearAlbumIntent>;
    if (
      typeof parsed.year !== "number" ||
      typeof parsed.albumName !== "string" ||
      typeof parsed.at !== "number" ||
      Date.now() - parsed.at > MAX_AGE_MS
    ) {
      sessionStorage.removeItem(KEY);
      return null;
    }
    return parsed as YearAlbumIntent;
  } catch {
    return null;
  }
}

/** The wizard made the album: tie the intent to it, so only that album offers the year's photos. */
export function attachYearAlbumIntent(albumId: string) {
  const intent = readYearAlbumIntent();
  if (!intent || intent.albumId) return;
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...intent, albumId }));
  } catch {
    /* ignore */
  }
}

/** The year and name when `albumId` is the year album still waiting for its photos. */
export function yearAlbumIntentFor(albumId: string): YearAlbumIntent | null {
  const intent = readYearAlbumIntent();
  return intent && intent.albumId === albumId ? intent : null;
}

export function clearYearAlbumIntent() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
