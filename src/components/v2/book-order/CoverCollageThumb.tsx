import { useMemo } from "react";
import type { CoverPicture } from "@/components/v2/book-order/useCoverSources";
import { COVER_FRONT_HEIGHT_IN, COVER_FRONT_WIDTH_IN, coverGridCells } from "@/lib/print/bookCover";

/**
 * The top-left corner of the photo-grid cover, about two tiles across, laid out by the
 * same tiling the printed cover uses. Plain <img>s of URLs the cover already loaded (so
 * the browser has them cached), and only the handful of tiles that show, however big
 * the album: no canvas draw and no extra downloads.
 */
export function CoverCollageThumb({ pictures }: { pictures: CoverPicture[] }) {
  const tiles = useMemo(() => {
    const cells = coverGridCells(pictures.length, COVER_FRONT_WIDTH_IN, COVER_FRONT_HEIGHT_IN);
    const first = cells[0];
    if (!first) return [];
    // A square view of roughly two tiles by two, never more than the cover itself.
    const side = Math.min(Math.max(first.width, first.height) * 2, COVER_FRONT_WIDTH_IN, COVER_FRONT_HEIGHT_IN);
    return cells.flatMap((cell, i) =>
      cell.x < side && cell.y < side
        ? [
            {
              picture: pictures[i],
              left: (cell.x / side) * 100,
              top: (cell.y / side) * 100,
              width: (cell.width / side) * 100,
              height: (cell.height / side) * 100,
            },
          ]
        : [],
    );
  }, [pictures]);

  return (
    <span className="absolute inset-0 bg-white" aria-hidden>
      {tiles.map((t) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={t.picture.pageId}
          src={t.picture.src}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          className="absolute object-cover"
          style={{ left: `${t.left}%`, top: `${t.top}%`, width: `${t.width}%`, height: `${t.height}%` }}
        />
      ))}
    </span>
  );
}
