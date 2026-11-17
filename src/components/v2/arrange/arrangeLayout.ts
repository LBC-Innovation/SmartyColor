/** Pure geometry for the Arrange sheet: fit N same-shaped tiles on one screen, no React. */

export type GridLayout = {
  cols: number;
  rows: number;
  tileW: number;
  tileH: number;
  gap: number;
  gridW: number;
  gridH: number;
  /** Even the smallest tile does not fit: the sheet scrolls vertically (rare). */
  overflows: boolean;
};

type FitInput = {
  count: number;
  width: number;
  height: number;
  /** Tile width / height. */
  aspect: number;
  minTile?: number;
  maxTile?: number;
};

const gapFor = (tileW: number) => (tileW < 80 ? 6 : 10);

function build(count: number, cols: number, tileW: number, aspect: number, overflows: boolean): GridLayout {
  const gap = gapFor(tileW);
  const rows = Math.max(1, Math.ceil(count / cols));
  const tileH = tileW / aspect;
  return {
    cols,
    rows,
    tileW,
    tileH,
    gap,
    gridW: cols * tileW + (cols - 1) * gap,
    gridH: rows * tileH + (rows - 1) * gap,
    overflows,
  };
}

export function fitGrid({ count, width, height, aspect, minTile = 44, maxTile = 132 }: FitInput): GridLayout {
  const n = Math.max(1, count);
  let best: { cols: number; tileW: number } | null = null;
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    // The gap depends on the tile size, which depends on the gap: settle it in two passes.
    let gap = 10;
    let tileW = Math.min(maxTile, (width - gap * (cols - 1)) / cols);
    if (tileW < 80) {
      gap = 6;
      tileW = Math.min(maxTile, (width - gap * (cols - 1)) / cols);
    }
    if (tileW < minTile) continue;
    // `>=` so that when several column counts reach the same (capped) tile size, the widest wins:
    // tiles fill a row first and only wrap once the row is full, instead of stacking in a column.
    if (rows * (tileW / aspect) + gap * (rows - 1) <= height && (!best || tileW >= best.tileW)) {
      best = { cols, tileW };
    }
  }
  if (best) return build(n, best.cols, best.tileW, aspect, false);

  // Nothing fits at a tappable size: fill the width at the smallest size and let the sheet scroll.
  const gap = gapFor(minTile);
  const cols = Math.max(1, Math.min(n, Math.floor((width + gap) / (minTile + gap))));
  const tileW = Math.min(maxTile, (width - gap * (cols - 1)) / cols);
  return build(n, cols, Math.max(minTile, tileW), aspect, true);
}

export function tilePosition(index: number, layout: GridLayout): { x: number; y: number } {
  const col = index % layout.cols;
  const row = Math.floor(index / layout.cols);
  return { x: col * (layout.tileW + layout.gap), y: row * (layout.tileH + layout.gap) };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Index of the cell under (or nearest) a point in grid coordinates; same meaning as arrayMove's `to`. */
export function slotFromPoint(x: number, y: number, layout: GridLayout, count: number, minIndex: number): number {
  const col = clamp(Math.floor(x / (layout.tileW + layout.gap)), 0, layout.cols - 1);
  const row = clamp(Math.floor(y / (layout.tileH + layout.gap)), 0, layout.rows - 1);
  return clamp(row * layout.cols + col, Math.min(minIndex, count - 1), Math.max(0, count - 1));
}

export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const next = items.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
