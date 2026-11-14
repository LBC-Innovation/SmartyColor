"use client";

import { useEffect, useRef, useState } from "react";

export type PdfState =
  | { status: "loading" }
  | { status: "ready"; url: string }
  | { status: "error"; message: string };

const DEFAULT_FILE_NAME = "colorful-memories-coloring-page.pdf";

/** Phones and tablets can't print a PDF from a hidden frame; they open it instead. */
function prefersOpeningPdf() {
  return window.matchMedia("(pointer: coarse)").matches;
}

/**
 * Builds a page's print-ready PDF as soon as it mounts, so Print and Download respond at once.
 * Print uses the browser's own print dialog (any printer the device knows); phones open the PDF,
 * which has its own print and share buttons.
 */
export function usePrintablePdf(makePdf: () => Promise<Blob>, fileName = DEFAULT_FILE_NAME) {
  const [pdf, setPdf] = useState<PdfState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [printing, setPrinting] = useState(false);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  // Callers remount per page, so the first makePdf is the right one.
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
        setPdf({ status: "error", message: err instanceof Error ? err.message : "Could not make a PDF." });
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

  function retry() {
    setPdf({ status: "loading" });
    setAttempt((n) => n + 1);
  }

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
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;";
    const url = pdf.url;
    frame.onload = () => {
      try {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
      } catch {
        window.open(url, "_blank", "noopener");
      } finally {
        setPrinting(false);
      }
    };
    frame.src = url;
    document.body.appendChild(frame);
    frameRef.current = frame;
  }

  function download() {
    if (pdf.status !== "ready") return;
    const link = document.createElement("a");
    link.href = pdf.url;
    link.download = fileName;
    link.click();
  }

  return { pdf, ready: pdf.status === "ready", printing, print, download, retry };
}
