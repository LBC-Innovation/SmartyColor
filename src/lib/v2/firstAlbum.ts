import { BOOK_PACKAGES_ENABLED } from "@/lib/auth/features";
import * as library from "@/lib/library/client";
import { summarizeLocalLibrary } from "@/lib/v2/migrateLocalLibrary";
import { STUDIO_PATH } from "@/lib/v2/guestSession";

/**
 * A new account starts by choosing its book (/studio/new), even when it only wants "Print as you
 * go", instead of landing on an empty album's upload area. `welcome=1` tells the wizard that the
 * account's only album is the empty one the studio made for it, so the choice can use it (or
 * clear it away) instead of leaving an empty "Album 1" beside the real one.
 */
export const FIRST_ALBUM_PATH = "/studio/new?welcome=1";
export const FIRST_ALBUM_PARAM = "welcome";

/**
 * Where a just-created (or just-confirmed) account goes. Only a plain trip to the studio is
 * redirected: an invite, a page the person came from, or guest pages on this device (which move
 * into the account's first album) all keep their destination.
 */
export async function firstAlbumDestination(destination: string | null): Promise<string> {
  const fallback = destination ?? STUDIO_PATH;
  if (!BOOK_PACKAGES_ENABLED) return fallback;
  if (destination !== null && destination !== STUDIO_PATH) return fallback;
  const guest = await summarizeLocalLibrary();
  return guest.photos > 0 ? fallback : FIRST_ALBUM_PATH;
}

const WELCOME_KEY = "cm:v2:first-album";

/** Remember for this tab that the wizard is a new account's first choice (survives the Stripe return). */
export function markFirstAlbumChoice() {
  try {
    sessionStorage.setItem(WELCOME_KEY, "1");
  } catch {
    /* ignore */
  }
}

function takeFirstAlbumChoice(): boolean {
  try {
    const set = sessionStorage.getItem(WELCOME_KEY) === "1";
    sessionStorage.removeItem(WELCOME_KEY);
    return set;
  } catch {
    return false;
  }
}

/** The account's starter album, if it is still its only album: owned and with no photos. */
async function findStarter(exceptId?: string): Promise<{ id: string; name: string } | null> {
  const res = await library.listProjects();
  if (res.error) return null;
  const others = res.data!.filter((p) => p.id !== exceptId);
  if (others.length !== 1) return null;
  const only = others[0];
  return only.role === "owner" && only.photoCount === 0 ? { id: only.id, name: only.name } : null;
}

/** "Print as you go" on a new account: the empty starter album becomes the chosen album. */
export async function claimStarterAlbum(): Promise<{ id: string; name: string } | null> {
  if (!takeFirstAlbumChoice()) return null;
  return findStarter();
}

/** A book bought on a new account made its own album: remove the empty starter beside it. */
export async function dropStarterAlbum(purchasedProjectId: string): Promise<boolean> {
  if (!takeFirstAlbumChoice()) return false;
  const starter = await findStarter(purchasedProjectId);
  if (!starter) return false;
  const res = await library.deleteProject(starter.id);
  return !res.error;
}
