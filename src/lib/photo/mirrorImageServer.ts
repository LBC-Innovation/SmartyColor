import sharp from "sharp";

/**
 * Flip an image left-to-right, keeping its format. EXIF rotation is baked in
 * first so the flip happens to the picture as a person sees it.
 */
export async function mirrorImageBytes(
  bytes: Buffer | Uint8Array,
  mime: string,
): Promise<{ bytes: Buffer; mime: string }> {
  const meta = await sharp(bytes).metadata();
  const upright =
    meta.orientation && meta.orientation !== 1
      ? await sharp(bytes).rotate().png().toBuffer()
      : bytes;
  const flipped = sharp(upright).flop();

  if (mime === "image/jpeg" || mime === "image/jpg") {
    return { bytes: await flipped.jpeg({ quality: 95, mozjpeg: true }).toBuffer(), mime: "image/jpeg" };
  }
  if (mime === "image/webp") {
    return { bytes: await flipped.webp({ quality: 95 }).toBuffer(), mime };
  }
  // Sheets are line art: keep them lossless. Anything else sharp can read becomes PNG too.
  return { bytes: await flipped.png().toBuffer(), mime: "image/png" };
}
