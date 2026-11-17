/**
 * Splits `data:<mime>;base64,<payload>` into its parts, or null when it isn't one.
 * Uses indexOf, not a regex: a `(.+)` capture over a multi-megabyte photo overflowed the
 * stack inside the Next server ("Maximum call stack size exceeded") on a 4 MB PNG.
 */
export function splitBase64DataUrl(dataUrl: string): { mime: string; base64: string } | null {
  if (!dataUrl.startsWith("data:")) return null;
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return null;
  const header = dataUrl.slice(5, comma);
  if (!header.endsWith(";base64")) return null;
  const mime = header.slice(0, -";base64".length).split(";")[0].trim();
  const base64 = dataUrl.slice(comma + 1);
  if (!mime || !base64) return null;
  return { mime, base64 };
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, base64] = dataUrl.split(",");
  const mime = meta.match(/data:([^;]+)/)?.[1] ?? "image/jpeg";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Could not read image data."));
    };
    reader.onerror = () => reject(new Error("Could not read image data."));
    reader.readAsDataURL(blob);
  });
}
