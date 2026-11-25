import { LANDING_BOOKS } from "@/content/marketing";
import { PackageTileCard } from "@/components/v2/book-packages/PackageTileCard";
import { SectionHeading } from "@/components/v2/marketing/landingParts";
import { fillCopy, type CopyValues, type MarketingPackage } from "@/lib/marketing/copy";

/**
 * "Choose your book": the same package cards the wizard shows (one component, one set of words),
 * with the few things that apply to every book said once underneath. The packages arrive with the
 * page, so the cards are in the server HTML. The free page is one quiet row, not a fourth card.
 */
export function LandingBookTiles({
  packages,
  values,
  showDeadline,
  onChoose,
  onFree,
}: {
  packages: MarketingPackage[];
  values: CopyValues;
  /** The gift page repeats the Christmas order-by date under the cards. */
  showDeadline: boolean;
  onChoose: (pkg: MarketingPackage) => void;
  onFree: () => void;
}) {
  const body = fillCopy(LANDING_BOOKS.body, values);
  const deadline = showDeadline ? fillCopy(LANDING_BOOKS.giftDeadline, values) : null;
  return (
    <section id="books" className="v2-gutter-x mx-auto w-full max-w-6xl scroll-mt-20 py-14 sm:py-20" aria-labelledby="books-title">
      <SectionHeading eyebrow={LANDING_BOOKS.eyebrow} title={LANDING_BOOKS.title} body={body ?? undefined} id="books-title" />
      {/* Wrapping flex, so one or two books sit centered at the same width as three. */}
      <ul className="mt-8 flex list-none flex-wrap justify-center gap-4 sm:mt-10 lg:gap-5">
        {packages.map((pkg) => (
          <li key={pkg.bindingId} className="w-full min-w-0 sm:w-[calc(50%-0.5rem)] lg:w-[calc(33.333%-0.85rem)]">
            <PackageTileCard pkg={pkg} onChoose={onChoose} headingLevel={3} showShipping={false} lazyImage />
          </li>
        ))}
      </ul>

      <div className="mx-auto mt-6 max-w-2xl space-y-1.5 text-center text-sm text-v2-muted">
        <p>{LANDING_BOOKS.blankBacks}</p>
        <p>{LANDING_BOOKS.refund}</p>
        {deadline ? <p className="font-semibold text-v2-navy">{deadline}</p> : null}
      </div>

      <div className="mx-auto mt-8 flex max-w-2xl flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="min-w-0">
          <p className="font-semibold text-v2-ink">{LANDING_BOOKS.freeTitle}</p>
          <p className="mt-0.5 text-sm text-v2-muted">{LANDING_BOOKS.freeBody}</p>
        </div>
        <button type="button" onClick={onFree} className="v2-btn-outline min-h-11 w-full shrink-0 px-5 text-center sm:w-auto">
          {LANDING_BOOKS.freeButton}
        </button>
      </div>
    </section>
  );
}
