import { BOOK_BINDINGS, type BookBindingId } from "@/lib/print/bookBindings";
import { BOOK_PACKAGES } from "@/content/marketing";
import { plural } from "@/lib/bookPackages/types";

type Value = string | number | null | undefined;

/**
 * Fills "{token}" in package copy. Same rules as fillCopy for marketing text: "[[ ... ]]" is
 * optional and drops out when one of its tokens is unknown, and a line with an unknown token
 * returns null so the caller hides it.
 */
export function fillPackageCopy(template: string, values: Record<string, Value>): string | null {
  const known = (key: string) => {
    const v = values[key];
    return v != null && v !== "";
  };
  const withOptionals = template.replace(/\[\[(.*?)\]\]/g, (_, inner: string) =>
    [...inner.matchAll(/\{(\w+)\}/g)].every((m) => known(m[1])) ? inner : "",
  );
  let missing = false;
  const out = withOptionals.replace(/\{(\w+)\}/g, (_, key: string) => {
    if (!known(key)) {
      missing = true;
      return "";
    }
    return String(values[key]);
  });
  return missing ? null : out;
}

/** The tokens every package screen shares, from what the package includes. */
export function packageTokens(input: {
  bindingId: BookBindingId;
  includedPhotos: number;
  editsPerPhoto: number;
}): Record<string, Value> {
  const name = BOOK_BINDINGS[input.bindingId].shortLabel;
  return {
    bindingName: name,
    // A noun for sentences ("your spiral bound book"): "Spiral bound" alone is an adjective.
    bindingNameLower: /bound$/i.test(name) ? `${name.toLowerCase()} book` : name.toLowerCase(),
    includedPhotos: input.includedPhotos,
    editsEach: input.editsPerPhoto,
    touchUps: plural(input.editsPerPhoto, "free Creative Touch-Up", "free Creative Touch-Ups"),
  };
}

/** The add-credit modal's note: the package is untouched, and what is still saved for the album. */
export function packageUntouchedNote(pkg: { bindingNameLower: string; photosLeft: number; ordered: boolean }): string | null {
  if (pkg.ordered) return null;
  return fillPackageCopy(pkg.photosLeft > 0 ? BOOK_PACKAGES.addCreditNote : BOOK_PACKAGES.addCreditNoteNoPhotos, {
    bindingNameLower: pkg.bindingNameLower,
    photosLeft: pkg.photosLeft,
  });
}
