import type { SheetVersion } from "@/lib/session/types";
import type { ReframeTarget } from "@/lib/session/photoTypes";
import { pagePrintPrefs } from "@/components/v2/studio/order/galleryBookPages";
import { normalizeV2SheetRevisions, photoOrientation, type V2PhotoEntry } from "@/lib/v2/studioTypes";

/**
 * What turning a page to the other shape takes, cheapest first:
 * - `select`: a page of that shape already exists; just show it (free).
 * - `draw`: a photo of that shape exists (the upload itself, or an earlier reframe); draw a page
 *   from it (one page).
 * - `reframe`: recompose the photo to that shape, then draw a page from it (reframe + one page).
 */
export type ShapePlan =
  | { target: ReframeTarget; kind: "select"; revisionId: string }
  | { target: ReframeTarget; kind: "draw"; source: SheetVersion | null }
  | { target: ReframeTarget; kind: "reframe" };

/** The shape the page on show was drawn from (or the photo on show, before any page). */
export function currentShape(photo: V2PhotoEntry): ReframeTarget {
  return pagePrintPrefs(photo).orientation;
}

export function shapePlan(photo: V2PhotoEntry): ShapePlan {
  const target: ReframeTarget = currentShape(photo) === "portrait" ? "landscape" : "portrait";
  const revisions = normalizeV2SheetRevisions(photo);
  const pages = revisions.filter((r) => r.kind !== "photo");

  if (photoOrientation(photo) === target) {
    // The uploaded photo is already that shape: its newest page, or a new one drawn from it.
    const fromOriginal = [...pages].reverse().find((r) => !r.sourceRevisionId);
    return fromOriginal
      ? { target, kind: "select", revisionId: fromOriginal.id }
      : { target, kind: "draw", source: null };
  }

  const reframed = [...revisions].reverse().find((r) => r.kind === "photo" && r.orientation === target);
  if (reframed) {
    const fromReframed = [...pages].reverse().find((r) => r.sourceRevisionId === reframed.id);
    return fromReframed
      ? { target, kind: "select", revisionId: fromReframed.id }
      : { target, kind: "draw", source: reframed };
  }
  return { target, kind: "reframe" };
}
