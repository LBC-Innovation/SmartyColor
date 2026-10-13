import type { PageFit } from "@/lib/print/pageLayout";

type Props = {
  /** Book page numbers that would print soft, from `useSoftPrintPages`. */
  pageNumbers: number[];
  fit: PageFit;
  className?: string;
};

function listPages(numbers: number[]): string {
  if (numbers.length === 1) return `Page ${numbers[0]}`;
  if (numbers.length > 6) return `${numbers.length} pages`;
  return `Pages ${numbers.slice(0, -1).join(", ")} and ${numbers[numbers.length - 1]}`;
}

/** Warns, before anything is ordered, that some pages don't have enough detail to print sharply. */
export function BookPrintQualityNotice({ pageNumbers, fit, className }: Props) {
  if (pageNumbers.length === 0) return null;
  const one = pageNumbers.length === 1;
  return (
    <p
      className={`rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-snug text-amber-900 ${className ?? ""}`}
      role="alert"
    >
      <span className="font-semibold">
        {listPages(pageNumbers)} may print soft.
      </span>{" "}
      {one ? "This picture has" : "These pictures have"} to be enlarged a lot to fit the page, so{" "}
      {one ? "its" : "their"} lines won&apos;t be as crisp as they could be.{" "}
      {fit === "full"
        ? "Choosing Framed prints the whole picture smaller and sharper."
        : `Making ${one ? "a new coloring sheet for it" : "new coloring sheets for them"} in the studio will print sharper.`}
    </p>
  );
}
