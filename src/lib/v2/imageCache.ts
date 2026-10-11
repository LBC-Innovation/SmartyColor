/**
 * Local cache for cloud-library image bytes.
 *
 * Storage is the source of truth; this keeps a copy of each object in
 * IndexedDB keyed by its storage path so repeat views (thumbnails, studio,
 * lightbox, book wizard) cost no network. Object URLs are memoised per path
 * for the life of the page.
 */

const DB_NAME = "colorfulmoments-image-cache";
const DB_VERSION = 1;
const STORE = "images";

const objectUrls = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB failed"));
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
  });
}

async function idbGet(key: string): Promise<Blob | undefined> {
  try {
    const db = await openDb();
    const value = await new Promise<Blob | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(key);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result as Blob | undefined);
    });
    db.close();
    return value;
  } catch {
    return undefined;
  }
}

async function idbPut(key: string, blob: Blob): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(STORE).put(blob, key);
    });
    db.close();
  } catch {
    /* cache is best-effort */
  }
}

async function idbDelete(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      const store = tx.objectStore(STORE);
      for (const k of keys) store.delete(k);
    });
    db.close();
  } catch {
    /* ignore */
  }
}

function memo(path: string, blob: Blob): string {
  const existing = objectUrls.get(path);
  if (existing) return existing;
  const url = URL.createObjectURL(blob);
  objectUrls.set(path, url);
  return url;
}

/** Put bytes we already have (e.g. the file just uploaded) so no download is needed. */
export async function primeImageCache(path: string, blob: Blob): Promise<string> {
  await idbPut(path, blob);
  return memo(path, blob);
}

/**
 * Object URL for a storage path. Memory → IndexedDB → network (signed URL).
 * The signed URL is only used on a cache miss.
 */
export function cachedImageUrl(path: string, signedUrl: string): Promise<string> {
  const hit = objectUrls.get(path);
  if (hit) return Promise.resolve(hit);
  const pending = inflight.get(path);
  if (pending) return pending;

  const task = (async () => {
    const cached = await idbGet(path);
    if (cached) return memo(path, cached);
    if (!signedUrl) throw new Error("No URL for image");
    const res = await fetch(signedUrl);
    if (!res.ok) throw new Error(`Image download failed (${res.status})`);
    const blob = await res.blob();
    await idbPut(path, blob);
    return memo(path, blob);
  })().finally(() => inflight.delete(path));

  inflight.set(path, task);
  return task;
}

/** Bytes for a path (for client-side composites). Same lookup order. */
export async function cachedImageBlob(path: string, signedUrl: string): Promise<Blob> {
  const cached = await idbGet(path);
  if (cached) return cached;
  const res = await fetch(signedUrl);
  if (!res.ok) throw new Error(`Image download failed (${res.status})`);
  const blob = await res.blob();
  await idbPut(path, blob);
  return blob;
}

export async function evictImages(paths: string[]): Promise<void> {
  for (const p of paths) {
    const url = objectUrls.get(p);
    if (url) {
      URL.revokeObjectURL(url);
      objectUrls.delete(p);
    }
  }
  await idbDelete(paths);
}

/** Drop every cached image and object URL — used on sign-out so nothing lingers on a shared device. */
export async function clearImageCache(): Promise<void> {
  for (const url of objectUrls.values()) URL.revokeObjectURL(url);
  objectUrls.clear();
  inflight.clear();
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(STORE).clear();
    });
    db.close();
  } catch {
    /* best effort */
  }
}
