import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRef, PDFStream } from "pdf-lib";

function lookupDict(doc: PDFDocument, value: unknown): PDFDict | undefined {
  const resolved = value instanceof PDFRef ? doc.context.lookup(value) : value;
  if (resolved instanceof PDFDict) return resolved;
  if (resolved instanceof PDFStream) return resolved.dict;
  return undefined;
}

function hasFontFile(doc: PDFDocument, fontDict: PDFDict): boolean {
  const descriptor = lookupDict(doc, fontDict.get(PDFName.of("FontDescriptor")));
  if (!descriptor) return false;
  return ["FontFile", "FontFile2", "FontFile3"].some((key) => descriptor.has(PDFName.of(key)));
}

/**
 * Names of fonts in a PDF that are not embedded. Print vendors (Lulu) reject
 * files that rely on a viewer's own copy of a font. Type 3 fonts carry their
 * glyphs inline and Type 0 fonts are judged by their descendant font.
 */
export async function findUnembeddedFonts(bytes: Uint8Array): Promise<string[]> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: false });
  const missing = new Set<string>();
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFDict)) continue;
    if (obj.get(PDFName.of("Type")) !== PDFName.of("Font")) continue;
    const subtype = obj.get(PDFName.of("Subtype"));
    if (subtype === PDFName.of("Type3")) continue;
    let target: PDFDict = obj;
    if (subtype === PDFName.of("Type0")) {
      const descendants = obj.get(PDFName.of("DescendantFonts"));
      const list = descendants instanceof PDFRef ? doc.context.lookup(descendants) : descendants;
      const first = list instanceof PDFArray ? lookupDict(doc, list.get(0)) : undefined;
      if (!first) {
        missing.add(String(obj.get(PDFName.of("BaseFont")) ?? "unknown"));
        continue;
      }
      target = first;
    }
    if (!hasFontFile(doc, target)) {
      missing.add(String(obj.get(PDFName.of("BaseFont")) ?? target.get(PDFName.of("BaseFont")) ?? "unknown"));
    }
  }
  return [...missing];
}
