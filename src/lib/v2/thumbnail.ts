import { useEffect, useState } from "react";

/**
 * Downscaled copies of library images for list and grid tiles.
 *
 * Tiles are ~150px wide, but the images behind them are full-resolution
 * originals and sheets; showing those directly keeps one full-size decoded
 * bitmap in memory per tile, which is what gets a large album's tab evicted
 * on phones. Cloud images come with a server-resized copy, used as is; others
 * (guests, or when that copy fails) are made here once per source URL and
 * kept for the page.
 */

const THUMB_MAX_PX = 480;
const MAX_CONCURRENT = 2;

const pending = new Map<string, Promise<string>>();
const ready = new Map<string, string>();
const waiting: (() => void)[] = [];
let running = 0;

async function withSlot<T>(task: () => Promise<T>): Promise<T> {
  if (running >= MAX_CONCURRENT) await new Promise<void>((resolve) => waiting.push(resolve));
  running += 1;
  try {
    return await task();
  } finally {
    running -= 1;
    waiting.shift()?.();
  }
}

async function renderThumb(src: string): Promise<string> {
  const img = new Image();
  // Cloud images can still be signed storage URLs; without CORS the canvas couldn't be read back.
  img.crossOrigin = "anonymous";
  // load event, not decode(): decode() can stay pending while the tab is in the background.
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Image failed to load"));
    img.src = src;
  });
  const scale = Math.min(1, THUMB_MAX_PX / Math.max(img.naturalWidth, img.naturalHeight));
  if (scale === 1) return src;

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return src;
  // Sheets can be transparent PNGs; JPEG would turn that black.
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
  // Safari holds canvas backing stores until they are resized away.
  canvas.width = 0;
  canvas.height = 0;
  return blob ? URL.createObjectURL(blob) : src;
}

function thumbUrl(src: string): Promise<string> {
  let task = pending.get(src);
  if (!task) {
    task = withSlot(() => renderThumb(src))
      .catch(() => src)
      .then((url) => {
        ready.set(src, url);
        return url;
      });
    pending.set(src, task);
  }
  return task;
}

/** Server-resized URLs that failed to load (expired, transform unavailable); use the fallback. */
const failedServerThumbs = new Set<string>();

/**
 * Thumbnail URL for an image URL; undefined until it has been made (show a placeholder, not the
 * original). `serverThumb`, when given, is used straight away and `src` is only downscaled here
 * if it fails to load.
 */
export function useThumbUrl(
  src: string | null | undefined,
  serverThumb?: string | null,
): string | undefined {
  const [made, setMade] = useState<{ src: string; url: string } | null>(null);
  const [, setFailed] = useState<string | null>(null);
  const useServer = Boolean(serverThumb) && !failedServerThumbs.has(serverThumb!);

  // Tiles paint thumbnails as CSS backgrounds, which report no errors; probe to notice a dead URL.
  useEffect(() => {
    if (!useServer || !serverThumb) return;
    const probe = new Image();
    probe.onerror = () => {
      failedServerThumbs.add(serverThumb);
      setFailed(serverThumb);
    };
    probe.src = serverThumb;
    return () => {
      probe.onerror = null;
    };
  }, [useServer, serverThumb]);

  useEffect(() => {
    if (useServer || !src || ready.has(src)) return;
    let cancelled = false;
    void thumbUrl(src).then((url) => {
      if (!cancelled) setMade({ src, url });
    });
    return () => {
      cancelled = true;
    };
  }, [useServer, src]);

  if (useServer) return serverThumb!;
  if (!src) return undefined;
  return ready.get(src) ?? (made?.src === src ? made.url : undefined);
}

/** Drop every thumbnail — used with the image cache on sign-out. */
export function clearThumbnails(): void {
  for (const [src, url] of ready) if (url !== src) URL.revokeObjectURL(url);
  ready.clear();
  pending.clear();
}
