import type { SheetVersion } from "@/lib/session/types";
import type { ReframeTarget } from "@/lib/session/photoTypes";
import { pagePrintPrefs } from "@/components/v2/studio/order/galleryBookPages";
import { normalizeV2SheetRevisions, photoOrientation, type V2PhotoEntry } from "@/lib/v2/studioTypes";

/**
 * What turning a page to the other shape takes, cheapest first:
 * - `select`: a page of that shape already exists; just show it (free).
 * - `draw`: a page in that shape, one generation. `source` is the photo it is drawn from: an
 *   earlier reframed photo of that shape, or null for the upload. `orientation` is set when the
 *   upload is the other shape, so the page is recomposed onto the new shape as it is drawn.
 */
export type ShapePlan =
  | { target: ReframeTarget; kind: "select"; revisionId: string }
  | { target: ReframeTarget; kind: "draw"; source: SheetVersion | null; orientation?: ReframeTarget };

/** The shape the page on show was drawn from (or the photo on show, before any page). */
export function currentShape(photo: V2PhotoEntry): ReframeTarget {
  return pagePrintPrefs(photo).orientation;
}

export function shapePlan(photo: V2PhotoEntry): ShapePlan {
  const target: ReframeTarget = currentShape(photo) === "portrait" ? "landscape" : "portrait";
  const revisions = normalizeV2SheetRevisions(photo);
  const pages = revisions.filter((r) => r.kind !== "photo");
  const shapeOf = (page: SheetVersion): ReframeTarget =>
    page.orientation ??
    revisions.find((r) => r.id === page.sourceRevisionId && r.kind === "photo")?.orientation ??
    photoOrientation(photo);

  const existing = [...pages].reverse().find((page) => shapeOf(page) === target);
  if (existing) return { target, kind: "select", revisionId: existing.id };

  if (photoOrientation(photo) === target) return { target, kind: "draw", source: null };
  const reframed = [...revisions].reverse().find((r) => r.kind === "photo" && r.orientation === target);
  if (reframed) return { target, kind: "draw", source: reframed };
  return { target, kind: "draw", source: null, orientation: target };
}
