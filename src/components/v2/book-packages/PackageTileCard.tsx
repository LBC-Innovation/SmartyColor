import { Check, Truck } from "lucide-react";
import { BOOK_PACKAGES } from "@/content/marketing";
import { formatCredits } from "@/lib/credits/money";
import { fillPackageCopy, packageTokens } from "@/lib/bookPackages/copy";
import type { BookPackage } from "@/lib/bookPackages/types";
import { BINDING_PHOTOS, BOOK_BINDINGS } from "@/lib/print/bookBindings";

/**
 * One book package as a card: photo, name and price, what it includes, and a button. The wizard's
 * step 1 and the landing page's "Choose your book" both render this, so they can't drift apart.
 * The caller wraps it in a list item and decides what the button does. A click anywhere on the
 * card presses the button: the button's ::after stretches over the card, so it stays one button.
 */
export function PackageTileCard({
  pkg,
  onChoose,
  headingLevel = 2,
  showShipping = true,
  lazyImage = false,
}: {
  pkg: BookPackage;
  onChoose: (pkg: BookPackage) => void;
  /** The heading's level: 2 in the wizard, 3 under a section heading on the landing page. */
  headingLevel?: 2 | 3;
  /** The "shipping is added" note under the lines. The landing says it once for all tiles instead. */
  showShipping?: boolean;
  /** Below the fold: let the photo load late. */
  lazyImage?: boolean;
}) {
  const Heading = headingLevel === 3 ? "h3" : "h2";
  const spec = BOOK_BINDINGS[pkg.bindingId];
  const photo = BINDING_PHOTOS[pkg.bindingId];
  const values = packageTokens(pkg);
  const lines = BOOK_PACKAGES.tileLines
    .filter((_, i) => i !== 1 || pkg.editsPerPhoto > 0)
    .map((l) => fillPackageCopy(l, values))
    .filter((l): l is string => Boolean(l));
  const nameId = `pkg-${pkg.bindingId}-name`;
  const detailId = `pkg-${pkg.bindingId}-detail`;
  return (
    <article aria-labelledby={nameId} className="v2-panel relative flex h-full cursor-pointer flex-col overflow-hidden transition duration-200 hover:-translate-y-0.5 hover:border-v2-primary/40 hover:shadow-lg focus-within:ring-2 focus-within:ring-v2-primary/40 has-[:disabled]:cursor-default motion-reduce:transition-none motion-reduce:hover:translate-y-0">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photo.src}
        alt=""
        width={photo.width}
        height={photo.height}
        loading={lazyImage ? "lazy" : undefined}
        decoding={lazyImage ? "async" : undefined}
        className="aspect-[16/9] w-full object-cover"
      />
      <div className="flex flex-1 flex-col p-4">
        <div id={detailId} className="flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <Heading id={nameId} className="text-lg font-bold text-v2-ink">
              {spec.shortLabel}
            </Heading>
            {/* The browser may format the amount for its own locale; the text is the same money. */}
            <p suppressHydrationWarning className="text-lg font-bold tabular-nums text-v2-ink">
              {formatCredits(pkg.priceCents)}
            </p>
          </div>
          <ul className="mt-3 space-y-1.5">
            {lines.map((line) => (
              <li key={line} className="flex items-start gap-2 text-sm text-v2-ink">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-v2-success-text" strokeWidth={2.5} aria-hidden />
                {line}
              </li>
            ))}
          </ul>
          {showShipping ? (
            <p className="mt-3 flex items-start gap-2 text-xs text-v2-muted">
              <Truck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              {BOOK_PACKAGES.tileShipping}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => onChoose(pkg)}
          aria-describedby={detailId}
          className="v2-btn-primary mt-4 min-h-11 w-full after:absolute after:inset-0 after:content-['']"
        >
          {fillPackageCopy(BOOK_PACKAGES.tileButton, values)}
        </button>
      </div>
    </article>
  );
}
