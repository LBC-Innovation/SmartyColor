"use client";

import { useRef, useState } from "react";
import { Download, FileText, Images, Loader2 } from "lucide-react";
import { activePageVersion } from "@/components/v2/studio/order/galleryBookPages";
import {
  fetchOriginal,
  mergePdfs,
  originalFileName,
  runPool,
  saveBlob,
  slugify,
  zipFiles,
} from "@/components/v2/studio/bulkDownload";
import { V2Modal } from "@/components/v2/ui/V2Modal";
import { useV2Toast } from "@/components/v2/V2Toast";
import type { V2PhotoEntry } from "@/lib/v2/studioTypes";

type Props = {
  /** The selected photos, in gallery order. */
  photos: V2PhotoEntry[];
  albumName: string;
  /** Builds one printable PDF for a photo's current coloring page. */
  makePagePdf: (photo: V2PhotoEntry) => Promise<Blob>;
  onClose: () => void;
};

type Progress = { kind: "pdf" | "photos"; done: number; total: number };

/** What "Download" offers for the selected photos: one PDF of their pages, or the originals. */
export function DownloadSelectedDialog({ photos, albumName, makePagePdf, onClose }: Props) {
  const toast = useV2Toast();
  const [progress, setProgress] = useState<Progress | null>(null);
  const cancelRef = useRef(false);

  const withPage = photos.filter((p) => activePageVersion(p) && !p.generating);
  const noPage = photos.length - withPage.length;
  // Phones with a share sheet can save straight to the photo library; elsewhere it's a zip.
  const canSharePhotos =
    typeof navigator !== "undefined" &&
    typeof navigator.canShare === "function" &&
    window.matchMedia("(pointer: coarse)").matches &&
    navigator.canShare({ files: [new File([""], "x.jpg", { type: "image/jpeg" })] });
  const album = slugify(albumName, "album");

  function cancel() {
    cancelRef.current = true;
  }

  async function downloadPdf() {
    if (withPage.length === 0) return;
    cancelRef.current = false;
    const total = withPage.length;
    setProgress({ kind: "pdf", done: 0, total });
    const parts: (Blob | null)[] = new Array(total).fill(null);
    let done = 0;
    let failed = 0;
    try {
      await runPool(withPage, 3, () => cancelRef.current, async (photo, i) => {
        try {
          parts[i] = await makePagePdf(photo);
        } catch {
          failed += 1;
        }
        done += 1;
        setProgress({ kind: "pdf", done, total });
      });
      if (cancelRef.current) {
        setProgress(null);
        return;
      }
      const ok = parts.filter((p): p is Blob => p != null);
      if (ok.length === 0) throw new Error("Could not make the PDF. Please try again.");
      saveBlob(await mergePdfs(ok), `${album}-coloring-pages.pdf`);
      if (failed > 0) toast.info(`${failed} ${failed === 1 ? "page was" : "pages were"} skipped because it couldn't be made.`);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not make the PDF.");
      setProgress(null);
    }
  }

  async function downloadOriginals() {
    cancelRef.current = false;
    const total = photos.length;
    setProgress({ kind: "photos", done: 0, total });
    const blobs: (Blob | null)[] = new Array(total).fill(null);
    let done = 0;
    let failed = 0;
    try {
      await runPool(photos, 3, () => cancelRef.current, async (photo, i) => {
        try {
          blobs[i] = await fetchOriginal(photo);
        } catch {
          failed += 1;
        }
        done += 1;
        setProgress({ kind: "photos", done, total });
      });
      if (cancelRef.current) {
        setProgress(null);
        return;
      }
      const used = new Set<string>();
      const files = photos.flatMap((photo, i) => {
        const blob = blobs[i];
        if (!blob) return [];
        const name = originalFileName(photo, blob, i, used);
        return [{ name, blob, file: new File([blob], name, { type: blob.type || "image/jpeg" }) }];
      });
      if (files.length === 0) throw new Error("Could not read those photos. Please try again.");
      let shared = false;
      if (canSharePhotos && navigator.canShare({ files: files.map((f) => f.file) })) {
        try {
          await navigator.share({ files: files.map((f) => f.file) });
          shared = true;
        } catch (e) {
          if (e instanceof DOMException && e.name === "AbortError") {
            setProgress(null);
            return;
          }
        }
      }
      if (!shared) saveBlob(await zipFiles(files), `${album}-photos.zip`);
      if (failed > 0) toast.info(`${failed} ${failed === 1 ? "photo was" : "photos were"} skipped because it couldn't be read.`);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not prepare the photos.");
      setProgress(null);
    }
  }

  const row =
    "flex min-h-14 w-full items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2 text-left transition hover:bg-v2-bg-subtle disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <V2Modal
      onClose={() => (progress ? cancel() : onClose())}
      maxWidthClass="max-w-md"
      icon={<Download />} title={`Download ${photos.length} ${photos.length === 1 ? "photo" : "photos"}`}
    >
      <div className="space-y-3 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-1 sm:px-7">
        {progress ? (
          <div className="space-y-4 py-2" role="status" aria-live="polite">
            <p className="flex items-center gap-2 text-sm font-semibold text-v2-ink">
              <Loader2 className="h-4 w-4 animate-spin text-v2-primary motion-reduce:animate-none" aria-hidden />
              Preparing {Math.min(progress.done + 1, progress.total)} of {progress.total}…
            </p>
            <div className="h-2 overflow-hidden rounded-full bg-gray-100" aria-hidden>
              <div className="h-full rounded-full bg-v2-primary transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
            </div>
            <button type="button" onClick={cancel} className="v2-btn-outline min-h-11 w-full">
              Cancel
            </button>
          </div>
        ) : (
          <>
            <button type="button" className={row} disabled={withPage.length === 0} onClick={() => void downloadPdf()}>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-v2-primary-light text-v2-primary" aria-hidden>
                <FileText className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-v2-ink">Coloring pages (PDF)</span>
                <span className="block text-xs text-v2-muted">
                  {withPage.length} {withPage.length === 1 ? "page" : "pages"}, ready to print
                </span>
                {noPage > 0 ? (
                  <span className="block text-xs text-amber-700">
                    {noPage} {noPage === 1 ? "photo has" : "photos have"} no page yet and will be skipped
                  </span>
                ) : null}
              </span>
            </button>
            <button type="button" className={row} onClick={() => void downloadOriginals()}>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-v2-primary-light text-v2-primary" aria-hidden>
                <Images className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-v2-ink">
                  {canSharePhotos ? "Save to Photos" : "Original photos"}
                </span>
                <span className="block text-xs text-v2-muted">
                  {canSharePhotos ? "Add the originals to your photo library" : "Saved together as a .zip file"}
                </span>
              </span>
            </button>
            <button type="button" onClick={onClose} className="v2-btn-outline min-h-11 w-full sm:hidden">
              Cancel
            </button>
          </>
        )}
      </div>
    </V2Modal>
  );
}
