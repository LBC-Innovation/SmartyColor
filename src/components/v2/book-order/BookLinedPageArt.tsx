import {
  BOOK_TRIM_HEIGHT_IN,
  BOOK_TRIM_WIDTH_IN,
  POINTS_PER_INCH,
  linedPageRules,
} from "@/lib/print/pageLayout";

const PAGE_W_PT = BOOK_TRIM_WIDTH_IN * POINTS_PER_INCH;
const PAGE_H_PT = BOOK_TRIM_HEIGHT_IN * POINTS_PER_INCH;

/** A ruled writing page, drawn from the same rules the book PDF uses. */
export function BookLinedPageArt({ className }: { className?: string }) {
  const { x1, x2, ys } = linedPageRules(PAGE_W_PT, PAGE_H_PT);
  return (
    <svg
      viewBox={`0 0 ${PAGE_W_PT} ${PAGE_H_PT}`}
      className={className ?? "h-full w-full bg-white"}
      role="img"
      aria-label="Lined page"
      preserveAspectRatio="xMidYMid meet"
    >
      {ys.map((y) => (
        <line key={y} x1={x1} x2={x2} y1={y} y2={y} stroke="#9ca3af" strokeWidth={1.2} />
      ))}
    </svg>
  );
}
