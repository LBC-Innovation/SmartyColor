function canvasToJpegBlob(
  canvas: HTMLCanvasElement,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Could not convert that HEIC photo."));
      },
      "image/jpeg",
      quality,
    );
  });
}

/** Safari / WebKit can decode many HEIC files via createImageBitmap. */
async function convertHeicViaNativeDecode(file: File): Promise<Blob | null> {
  if (typeof createImageBitmap !== "function") return null;
  try {
    const bitmap = await createImageBitmap(file);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0);
      return await canvasToJpegBlob(canvas, 0.92);
    } finally {
      bitmap.close?.();
    }
  } catch {
    return null;
  }
}

async function convertHeicViaHeicTo(
  file: File,
  quality: number,
): Promise<Blob | null> {
  try {
    const { heicTo } = await import("heic-to");
    const result: unknown = await heicTo({
      blob: file,
      type: "image/jpeg",
      quality,
    });
    if (result instanceof Blob) return result;
    if (Array.isArray(result) && result[0] instanceof Blob) return result[0];
    return null;
  } catch {
    return null;
  }
}

async function convertHeicViaHeic2Any(
  file: File,
  quality: number,
): Promise<Blob | null> {
  try {
    const heic2any = (await import("heic2any")).default;
    const result = await heic2any({
      blob: file,
      toType: "image/jpeg",
      quality,
    });
    const blobs = Array.isArray(result) ? result : [result];
    const jpeg = blobs.find((item): item is Blob => item instanceof Blob);
    return jpeg ?? null;
  } catch {
    return null;
  }
}

/**
 * Decode HEIC/HEIF to JPEG in the browser (newer iOS formats need libheif 1.18+).
 */
export async function convertHeicFileToJpegBlob(file: File): Promise<Blob> {
  const native = await convertHeicViaNativeDecode(file);
  if (native) return native;

  const qualities = [0.92, 0.84, 0.76];
  for (const quality of qualities) {
    const modern = await convertHeicViaHeicTo(file, quality);
    if (modern) return modern;
  }

  for (const quality of qualities) {
    const legacy = await convertHeicViaHeic2Any(file, quality);
    if (legacy) return legacy;
  }

  throw new Error(
    "Could not convert this HEIC in your browser (common with newer iPhone photos).",
  );
}
