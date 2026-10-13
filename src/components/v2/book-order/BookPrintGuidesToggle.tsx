"use client";

type Props = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Printed books are trimmed; a print-at-home page only has the margin. */
  printed: boolean;
};

/** Switch for the trim and margin guides on the page previews, with a key to what they mean. */
export function BookPrintGuidesToggle({ checked, onChange, printed }: Props) {
  return (
    <div className="text-center">
      <label className="inline-flex items-center gap-2 text-xs font-semibold text-v2-navy">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        Show print guides
      </label>
      {checked ? (
        <p className="mt-1 text-[11px] leading-snug text-v2-muted">
          {printed ? (
            <>
              <span className="font-semibold text-red-600">Red dashes</span>: the printer trims here, so anything
              outside is cut off.{" "}
            </>
          ) : null}
          <span className="font-semibold text-sky-600">Blue dots</span>: the safe margin. Keep anything
          important inside it. The guides don&apos;t print.
        </p>
      ) : null}
    </div>
  );
}
