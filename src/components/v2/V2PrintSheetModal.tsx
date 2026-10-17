"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Download, Loader2, Printer, RotateCw } from "lucide-react";
import { V2Modal } from "@/components/v2/ui/V2Modal";
import type { PrintPrefs } from "@/lib/print/settings";
import { cn } from "@/lib/cn";

type V2PrintSheetModalProps = {
  /** The coloring sheet to preview. */
  sheetSrc: string;
  printPrefs: PrintPrefs;
  /** Builds the print-ready PDF for this page (same file as the download). */
  makePdf: () => Promise<Blob>;
  onClose: () => void;
};

type PdfState =
  | { status: "loading" }
  | { status: "ready"; url: string }
  | { status: "error"; message: string };

const FILE_NAME = "colorful-memories-coloring-sheet.pdf";

/** Phones and tablets can't print a PDF from a hidden frame; they open it instead. */
function prefersOpeningPdf() {
  return window.matchMedia("(pointer: coarse)").matches;
}

/**
 * Preview one coloring sheet on its paper, then print it or save it as a PDF.
 * The PDF is made as soon as the dialog opens so both buttons respond at once.
 */
export function V2PrintSheetModal({
  sheetSrc,
  printPrefs,
  makePdf,
  onClose,
}: V2PrintSheetModalProps) {
  const [pdf, setPdf] = useState<PdfState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [printing, setPrinting] = useState(false);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  // The parent remounts the dialog per sheet, so the first makePdf is the right one.
  const [makeThisPdf] = useState(() => makePdf);

  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    makeThisPdf()
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setPdf({ status: "ready", url });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setPdf({
          status: "error",
          message: err instanceof Error ? err.message : "Could not make a PDF.",
        });
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [attempt, makeThisPdf]);

  useEffect(
    () => () => {
      frameRef.current?.remove();
    },
    [],
  );

  function print() {
    if (pdf.status !== "ready") return;
    if (prefersOpeningPdf()) {
      window.open(pdf.url, "_blank", "noopener");
      return;
    }
    setPrinting(true);
    frameRef.current?.remove();
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.tabIndex = -1;
    frame.style.cssText =
      "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;";
    frame.onload = () => {
      try {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
      } catch {
        window.open(pdf.url, "_blank", "noopener");
      } finally {
        setPrinting(false);
      }
    };
    frame.src = pdf.url;
    document.body.appendChild(frame);
    frameRef.current = frame;
  }

  function download() {
    if (pdf.status !== "ready") return;
    const link = document.createElement("a");
    link.href = pdf.url;
    link.download = FILE_NAME;
    link.click();
  }

  const landscape = printPrefs.orientation === "landscape";
  const [shortSide, longSide] = printPrefs.paper === "a4" ? [210, 297] : [8.5, 11];
  const [paperW, paperH] = landscape ? [longSide, shortSide] : [shortSide, longSide];
  const paperLabel = printPrefs.paper === "a4" ? "A4" : "US Letter";
  const ready = pdf.status === "ready";

  return (
    <V2Modal
      onClose={onClose}
      maxWidthClass="max-w-3xl"
      fill
      title={
        <div>
          <h2 className="text-lg font-semibold text-v2-ink">Print this page</h2>
          <p className="mt-0.5 text-sm text-v2-muted">
            {paperLabel}, {printPrefs.orientation}
          </p>
        </div>
      }
    >
      <div className="flex min-h-0 flex-1 bg-v2-bg-subtle p-4 sm:p-6">
        {/* A size container, so the sheet of paper keeps its shape at any window size. */}
        <div className="flex min-h-0 flex-1 items-center justify-center [container-type:size]">
          <div
            className="relative bg-white p-[4%] shadow-[0_8px_28px_rgb(10_16_26/0.16)] ring-1 ring-gray-200"
            style={{
              aspectRatio: `${paperW} / ${paperH}`,
              width: `min(100cqw, 100cqh * ${paperW / paperH})`,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- data URLs and signed URLs */}
            <img
              src={sheetSrc}
              alt="Coloring sheet print preview"
              className="h-full w-full object-contain"
            />
          </div>
        </div>
      </div>

      <div className="flex shrink-0 flex-col gap-3 border-t border-gray-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p
          className={cn(
            "flex min-h-5 items-center gap-2 text-sm",
            pdf.status === "error" ? "text-rose-600" : "text-v2-muted",
          )}
          role="status"
          aria-live="polite"
        >
          {pdf.status === "loading" ? (
            <>
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
              Getting your page ready…
            </>
          ) : pdf.status === "error" ? (
            <>
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
              {pdf.message}
              <button
                type="button"
                onClick={() => {
                  setPdf({ status: "loading" });
                  setAttempt((n) => n + 1);
                }}
                className="inline-flex items-center gap-1 font-semibold text-v2-primary hover:underline"
              >
                <RotateCw className="h-3.5 w-3.5" aria-hidden />
                Try again
              </button>
            </>
          ) : (
            "Ready to print."
          )}
        </p>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <button
            type="button"
            disabled={!ready}
            onClick={download}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-v2-navy transition hover:bg-v2-bg-subtle disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="h-4 w-4 shrink-0" aria-hidden />
            <span>
              Download<span className="hidden sm:inline"> PDF</span>
            </span>
          </button>
          <button
            type="button"
            disabled={!ready || printing}
            onClick={print}
            autoFocus
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-v2-primary px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-v2-primary/20 transition hover:bg-v2-primary-dark disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-primary"
          >
            {printing ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
            ) : (
              <Printer className="h-4 w-4 shrink-0" aria-hidden />
            )}
            Print
          </button>
        </div>
      </div>
    </V2Modal>
  );
}
