import {
  COVER_CREDIT,
  COVER_CREDIT_DARK,
  COVER_CREDIT_LIGHT,
  coverCreditOnDark,
} from "@/lib/print/coverCredit";
import { BOOK_TRIM_HEIGHT_IN, BOOK_TRIM_WIDTH_IN } from "@/lib/print/pageLayout";

/**
 * The stacked "Made with / ♥ / By ColorfulMemories.Net" credit, placed on a trimmed back
 * cover exactly where the print file puts it. The parent must be positioned
 * and have the back cover's 8.5 × 11 shape.
 */
export function BookCoverCredit({ backgroundColor }: { backgroundColor: string }) {
  const onDark = coverCreditOnDark(backgroundColor);
  const fill = onDark ? COVER_CREDIT_LIGHT : COVER_CREDIT_DARK;
  const { heart } = COVER_CREDIT;
  return (
    <svg
      viewBox={`0 0 ${COVER_CREDIT.width} ${COVER_CREDIT.height}`}
      className="absolute left-1/2 -translate-x-1/2"
      style={{
        width: `${(COVER_CREDIT.widthIn / BOOK_TRIM_WIDTH_IN) * 100}%`,
        bottom: `${(COVER_CREDIT.bottomIn / BOOK_TRIM_HEIGHT_IN) * 100}%`,
      }}
      role="img"
      aria-label="Made with love by ColorfulMemories.Net"
    >
      <path d={COVER_CREDIT.before.d} fill={fill} transform={`translate(${COVER_CREDIT.before.x} ${COVER_CREDIT.before.y})`} />
      <g transform={`translate(${heart.x} ${heart.y}) scale(${heart.scale})`}>
        {onDark
          ? heart.paths.map((p) => (
              <path key={`rim-${p.fill}`} d={p.d} fill="#ffffff" stroke="#ffffff" strokeWidth={heart.rim} strokeLinejoin="round" />
            ))
          : null}
        {heart.paths.map((p) => (
          <path key={p.fill} d={p.d} fill={p.fill} />
        ))}
      </g>
      <path d={COVER_CREDIT.after.d} fill={fill} transform={`translate(${COVER_CREDIT.after.x} ${COVER_CREDIT.after.y})`} />
    </svg>
  );
}
