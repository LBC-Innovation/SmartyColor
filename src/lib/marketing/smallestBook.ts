import { BLANK_BACKS_DEFAULT, BOOK_BINDINGS, withBlankBacks, type BookBindingSpec } from "@/lib/print/bookBindings";

/** The printed format that needs the fewest coloring pages, from the binding config, as checkout starts out (blank backs on). */
export function smallestPrintedBinding(): BookBindingSpec {
  return Object.values(BOOK_BINDINGS)
    .map((b) => withBlankBacks(b, BLANK_BACKS_DEFAULT))
    .reduce((a, b) => (b.minPages < a.minPages ? b : a));
}
