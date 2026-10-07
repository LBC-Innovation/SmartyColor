import type { Orientation, PrintPrefs } from "@/lib/print/settings";

export type PhotoLayout = {
  orientation: Orientation;
  /** Gemini `imageConfig.aspectRatio` value */
  aspectRatio: "16:9" | "4:3" | "1:1" | "3:4" | "9:16";
  width: number;
  height: number;
};

export function inferPhotoLayout(width: number, height: number): PhotoLayout {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const ratio = w / h;

  if (ratio >= 1.45) {
    return { orientation: "landscape", aspectRatio: "16:9", width: w, height: h };
  }
  if (ratio >= 1.05) {
    return { orientation: "landscape", aspectRatio: "4:3", width: w, height: h };
  }
  if (ratio <= 1 / 1.45) {
    return { orientation: "portrait", aspectRatio: "9:16", width: w, height: h };
  }
  if (ratio <= 1 / 1.05) {
    return { orientation: "portrait", aspectRatio: "3:4", width: w, height: h };
  }
  return { orientation: "portrait", aspectRatio: "1:1", width: w, height: h };
}

export function printPrefsForPhoto(
  printPrefs: PrintPrefs,
  layout: PhotoLayout,
): PrintPrefs {
  return { ...printPrefs, orientation: layout.orientation };
}

export function photoLayoutPromptBlock(layout: PhotoLayout) {
  const shape =
    layout.orientation === "landscape"
      ? "LANDSCAPE (wider than tall)"
      : "PORTRAIT (taller than wide)";
  return `CANVAS LAYOUT (mandatory — overrides Printer Settings orientation):
- The reference photo is ${shape}, aspect about ${layout.aspectRatio} (${layout.width}×${layout.height} px).
- Draw the COMPLETE wide shot — every person and major object from the photo, edge to edge. Do NOT zoom in, crop, or reframe on one face.
- Output MUST stay the same orientation as the photo — never rotate a horizontal photo to vertical.
- Keep the same left-to-right composition, headroom, and ground space as the reference.
- Leave open sky/ground areas mostly empty white — do NOT fill them with random lines, hatching, or texture.
- A thick page border is drawn on the outer edge after generation — keep critical details slightly away from the very edge if possible.`;
}
