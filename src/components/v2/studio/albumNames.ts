import { INTENT_ALBUM_NAME } from "@/content/marketing";
import { BOOK_BINDINGS } from "@/lib/print/bookBindings";

/** Names the studio gives a new album before anyone has renamed it. */
export const PLACEHOLDER_ALBUM_NAME = /^(Untitled album|My first album|(Project|Album) \d+)$/;

/** True for a name the studio made up (placeholder or landing-page name), not one a person chose. */
export function isAutomaticAlbumName(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) return true;
  if (PLACEHOLDER_ALBUM_NAME.test(trimmed)) return true;
  if (trimmed === "My coloring book") return true;
  // A book package's album starts as "My paperback" (and so on) until someone names it.
  if (Object.values(BOOK_BINDINGS).some((b) => trimmed === `My ${b.shortLabel.toLowerCase()}`)) return true;
  return Object.values(INTENT_ALBUM_NAME).some((automatic) => automatic === trimmed);
}
