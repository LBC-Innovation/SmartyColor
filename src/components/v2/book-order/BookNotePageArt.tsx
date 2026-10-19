import { NOTE_PAGE, PRINT_MARGIN_IN, BOOK_TRIM_WIDTH_IN } from "@/lib/print/pageLayout";

/** The gift note page as it prints: centred serif italic text, sized to the page it sits on. */
export function BookNotePageArt({ text }: { text: string }) {
  const printableWidthIn = BOOK_TRIM_WIDTH_IN - PRINT_MARGIN_IN * 2;
  // Font size as a share of the page width, so a thumbnail and a full preview look alike.
  const fontCqw = (NOTE_PAGE.fontSizePt / 72 / BOOK_TRIM_WIDTH_IN) * 100;
  const columnCqw = ((printableWidthIn * NOTE_PAGE.columnShare) / BOOK_TRIM_WIDTH_IN) * 100;
  return (
    <div className="flex h-full w-full items-center justify-center [container-type:size]">
      <p
        className="whitespace-pre-line break-words text-center font-serif italic text-gray-900"
        style={{ fontSize: `${fontCqw}cqw`, lineHeight: NOTE_PAGE.lineHeight, width: `${columnCqw}cqw` }}
      >
        {text}
      </p>
    </div>
  );
}
