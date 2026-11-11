import { BOOK_BINDINGS, type BookBindingSpec } from "@/lib/print/bookBindings";

/** The printed format that needs the fewest coloring pages, from the binding config. */
export function smallestPrintedBinding(): BookBindingSpec {
  return Object.values(BOOK_BINDINGS).reduce((a, b) => (b.minPages < a.minPages ? b : a));
}
