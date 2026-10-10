"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { CrayonRippleDots } from "@/components/CrayonRippleDots";
import { KidButton } from "@/components/KidButton";
import { prepareSheetDataUrlForApi } from "@/lib/photo/compressImageDataUrl";
import { isAllowedPhotoFile } from "@/lib/photo/heicFile";
import { inferPhotoLayout } from "@/lib/photo/orientation";
import { readBlobImageSize } from "@/lib/photo/readImageSize";
import { preparePhotoFileForApi } from "@/lib/photo/preparePhotoUpload";
import {
  formatPhotoSizeLimit,
  PHOTO_UPLOAD_MAX_BYTES,
} from "@/lib/photo/payloadBudget";
import {
  PHOTO_MAX_CORRECTIONS,
  PHOTO_MAX_CORRECTION_CHARS,
} from "@/lib/session/photoTypes";
import {
  defaultPrintPrefs,
  type PrintPrefs,
} from "@/lib/print/settings";
import type { GeneratedSheet } from "@/lib/session/types";

type Phase = "pick" | "processing" | "result" | "correcting";

export function PhotoColoringStudio() {
  const [printPrefs, setPrintPrefs] = useState<PrintPrefs>(defaultPrintPrefs);
  const [phase, setPhase] = useState<Phase>("pick");
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [sheet, setSheet] = useState<GeneratedSheet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [corrections, setCorrections] = useState<string[]>(["", "", ""]);
  const [downloading, setDownloading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const objectUrlRef = useRef<string | null>(null);

  const revokePreview = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  useEffect(() => () => revokePreview(), [revokePreview]);

  function resetForNewPhoto() {
    revokePreview();
    setPhotoPreview(null);
    setPhotoDataUrl(null);
    setSheet(null);
    setCorrections(["", "", ""]);
    setError(null);
    setPhase("pick");
    if (fileRef.current) fileRef.current.value = "";
  }

  async function onPickFile(file: File) {
    setError(null);
    if (!isAllowedPhotoFile(file)) {
      setError("Please choose a photo (JPG, PNG, WebP, or HEIC).");
      return;
    }
    if (file.size > PHOTO_UPLOAD_MAX_BYTES) {
      setError(
        `That photo is a bit too big. Try one under ${formatPhotoSizeLimit(PHOTO_UPLOAD_MAX_BYTES)}.`,
      );
      return;
    }

    revokePreview();
    setPhase("processing");

    let dataUrl: string;
    let prefsForRequest = printPrefs;
    try {
      const prepared = await preparePhotoFileForApi(file, 2);
      dataUrl = prepared.photoDataUrl;
      const objectUrl = URL.createObjectURL(prepared.previewBlob);
      objectUrlRef.current = objectUrl;
      setPhotoPreview(objectUrl);

      const size = await readBlobImageSize(prepared.previewBlob);
      const layout = inferPhotoLayout(size.width, size.height);
      prefsForRequest = {
        ...printPrefs,
        orientation: layout.orientation,
      };
      setPrintPrefs(prefsForRequest);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read that photo.");
      setPhase("pick");
      return;
    }

    setPhotoDataUrl(dataUrl);
    setSheet(null);
    setCorrections(["", "", ""]);

    try {
      const response = await fetch("/api/photo-coloring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "generate",
          photoDataUrl: dataUrl,
          printPrefs: prefsForRequest,
        }),
      });
      const payload = (await response.json()) as {
        sheet?: GeneratedSheet;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not make a coloring sheet.");
      }
      if (!payload.sheet) {
        throw new Error("No coloring sheet came back.");
      }
      setSheet(payload.sheet);
      setPhase("result");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setPhase("pick");
    }
  }

  async function applyCorrections() {
    if (!photoDataUrl || !sheet) return;
    const notes = corrections
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, PHOTO_MAX_CORRECTIONS);
    if (notes.length === 0) {
      setError("Write at least one short note about what to fix.");
      return;
    }

    setError(null);
    setPhase("correcting");

    try {
      const sheetDataUrl = await prepareSheetDataUrlForApi(
        sheet.imageDataUrl,
        2,
      );
      const response = await fetch("/api/photo-coloring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "correct",
          photoDataUrl,
          sheetDataUrl,
          corrections: notes,
          printPrefs,
        }),
      });
      const payload = (await response.json()) as {
        sheet?: GeneratedSheet;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not apply those fixes.");
      }
      if (!payload.sheet) {
        throw new Error("No updated sheet came back.");
      }
      setSheet(payload.sheet);
      setCorrections(["", "", ""]);
      setPhase("result");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setPhase("result");
    }
  }

  async function downloadPdf() {
    if (!sheet) return;
    setDownloading(true);
    try {
      const response = await fetch("/api/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageDataUrl: sheet.imageDataUrl,
          printPrefs,
        }),
      });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? "Could not make a PDF.");
      }
      const blob = await response.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "photo-coloring-sheet.pdf";
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (err) {
      setError(err instanceof Error ? err.message : "PDF failed.");
    } finally {
      setDownloading(false);
    }
  }

  const busy = phase === "processing" || phase === "correcting";

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[1120px] flex-col px-6 py-6 sm:px-8 sm:py-8">
      <AppHeader printPrefs={printPrefs} onPrintPrefsChange={setPrintPrefs} />

      <div className="mt-8 rounded-[var(--radius-card)] border-[3px] border-ink bg-paper p-6 shadow-crayon sm:p-8">
        <h1 className="font-display text-3xl font-bold text-ink sm:text-4xl">
          Turn a photo into a coloring sheet
        </h1>
        <p className="mt-3 max-w-2xl font-body text-lg text-ink-soft">
          Pick a photo from your device. We send it to the drawing helper right
          away, show your photo next to the coloring sheet, and never save the
          photo on our servers.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <KidButton
            variant="secondary"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            {photoPreview ? "Choose a different photo" : "Upload a photo"}
          </KidButton>
          {photoPreview ? (
            <KidButton variant="ghost" disabled={busy} onClick={resetForNewPhoto}>
              Clear
            </KidButton>
          ) : null}
          <input
            ref={fileRef}
            type="file"
            accept="image/*,.heic,.heif"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void onPickFile(file);
            }}
          />
        </div>

        {error ? (
          <p className="mt-4 rounded-2xl border-2 border-crayon-coral bg-cream px-4 py-3 font-body text-lg text-ink">
            {error}
          </p>
        ) : null}

        {busy ? (
          <div className="mt-10 flex flex-col items-center gap-4 py-8">
            <CrayonRippleDots
              label={
                phase === "correcting"
                  ? "Fixing your coloring sheet"
                  : "Making your coloring sheet from the photo"
              }
            />
            <p className="font-display text-xl text-ink">
              {phase === "correcting"
                ? "Applying your fix notes…"
                : "Tracing your photo into line art…"}
            </p>
          </div>
        ) : null}

        {photoPreview && !busy ? (
          <div className="mt-10 grid gap-6 lg:grid-cols-2">
            <figure className="overflow-hidden rounded-2xl border-[3px] border-ink bg-cream">
              <figcaption className="border-b-2 border-ink bg-sky px-4 py-2 font-display text-sm font-semibold uppercase tracking-wide text-ink">
                Your photo
              </figcaption>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photoPreview}
                alt="Uploaded reference"
                className="max-h-[min(520px,60vh)] w-full object-contain"
              />
            </figure>

            <figure className="overflow-hidden rounded-2xl border-[3px] border-ink bg-white">
              <figcaption className="border-b-2 border-ink bg-mint px-4 py-2 font-display text-sm font-semibold uppercase tracking-wide text-ink">
                Coloring sheet
              </figcaption>
              {sheet ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={sheet.imageDataUrl}
                  alt="Generated coloring sheet"
                  className="max-h-[min(520px,60vh)] w-full object-contain"
                />
              ) : (
                <p className="p-8 font-body text-lg text-ink-soft">
                  Upload a photo to see the coloring sheet here.
                </p>
              )}
            </figure>
          </div>
        ) : null}

        {sheet && phase === "result" ? (
          <section className="mt-10 rounded-2xl border-2 border-ink bg-cream p-5 sm:p-6">
            <h2 className="font-display text-2xl font-semibold text-ink">
              Something look wrong?
            </h2>
            <p className="mt-2 font-body text-lg text-ink-soft">
              Add up to {PHOTO_MAX_CORRECTIONS} short notes (one idea each). We
              send the photo, the current sheet, and only those notes — no long
              back-and-forth chat.
            </p>
            <ul className="mt-4 space-y-3">
              {corrections.map((value, index) => (
                <li key={index}>
                  <label className="sr-only" htmlFor={`fix-${index}`}>
                    Fix note {index + 1}
                  </label>
                  <input
                    id={`fix-${index}`}
                    type="text"
                    maxLength={PHOTO_MAX_CORRECTION_CHARS}
                    value={value}
                    placeholder={
                      index === 0
                        ? "e.g. The dog’s ears should be floppy, not pointy"
                        : "Optional fix note"
                    }
                    className="w-full rounded-2xl border-2 border-ink bg-paper px-4 py-3 font-body text-lg text-ink"
                    onChange={(event) => {
                      const next = [...corrections];
                      next[index] = event.target.value;
                      setCorrections(next);
                    }}
                  />
                </li>
              ))}
            </ul>
            <div className="mt-5 flex flex-wrap gap-3">
              <KidButton onClick={() => void applyCorrections()}>
                Fix these spots
              </KidButton>
              <KidButton
                variant="secondary"
                disabled={downloading}
                onClick={() => void downloadPdf()}
              >
                {downloading ? "Making PDF…" : "Download PDF"}
              </KidButton>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
