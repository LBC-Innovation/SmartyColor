"use client";

import { useCallback, useRef, useState, type DragEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";

function dragHasFiles(event: DragEvent) {
  return Array.from(event.dataTransfer.types).includes("Files");
}

type V2UploadDropzoneProps = {
  onFiles: (files: FileList | File[]) => void;
  className?: string;
  children: ReactNode;
};

export function V2UploadDropzone({
  onFiles,
  className,
  children,
}: V2UploadDropzoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const dragDepthRef = useRef(0);

  const resetDrag = useCallback(() => {
    dragDepthRef.current = 0;
    setIsDragOver(false);
  }, []);

  const onDragEnter = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!dragHasFiles(event)) return;
    dragDepthRef.current += 1;
    if (dragDepthRef.current === 1) setIsDragOver(true);
  }, []);

  const onDragLeave = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      if (dragDepthRef.current === 0) return;
      dragDepthRef.current -= 1;
      if (dragDepthRef.current <= 0) resetDrag();
    },
    [resetDrag],
  );

  const onDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (dragHasFiles(event)) {
      event.dataTransfer.dropEffect = "copy";
    }
  }, []);

  const onDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      resetDrag();
      const { files } = event.dataTransfer;
      if (files?.length) onFiles(files);
    },
    [onFiles, resetDrag],
  );

  return (
    <div
      className={cn(
        "relative min-w-0 flex-1 overflow-hidden rounded-2xl border-2 border-dashed transition-[border-color,background-color,transform,box-shadow] duration-200 ease-out",
        isDragOver
          ? "v2-dropzone-active scale-[1.01] border-v2-primary bg-gradient-to-br from-v2-primary-light via-white to-v2-primary-light shadow-lg shadow-v2-primary/25"
          : "border-v2-primary/30 bg-v2-primary-light/60",
        className,
      )}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div
        className={cn(
          "pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-v2-primary/10 px-6 transition-opacity duration-200",
          isDragOver ? "opacity-100" : "opacity-0",
        )}
        aria-hidden={!isDragOver}
      >
        <span className="v2-dropzone-icon flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-v2-primary shadow-md">
          <svg
            viewBox="0 0 24 24"
            className="h-9 w-9"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 16V8m0 0l-3 3m3-3l3 3M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1"
            />
          </svg>
        </span>
        <p className="text-center text-base font-semibold text-v2-ink">
          Drop photos to upload
        </p>
        <p className="text-center text-sm text-v2-muted">
          Release to add them to your library
        </p>
      </div>

      <div
        className={cn(
          "relative px-4 py-5 transition-opacity duration-200 sm:px-6",
          isDragOver ? "opacity-25" : "opacity-100",
        )}
      >
        {children}
      </div>

      <p className="sr-only" aria-live="polite">
        {isDragOver ? "Drop zone active. Release files to upload photos." : ""}
      </p>
    </div>
  );
}
