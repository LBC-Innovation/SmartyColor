"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

type V2ModalProps = {
  title?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  maxWidthClass?: string;
};

export function V2Modal({
  title,
  onClose,
  children,
  className,
  maxWidthClass = "max-w-2xl",
}: V2ModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        className="absolute inset-0 bg-v2-ink/40 backdrop-blur-[2px]"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <div
        className={cn(
          "relative flex max-h-[min(90dvh,720px)] w-full flex-col overflow-hidden rounded-2xl border border-gray-200 bg-v2-surface shadow-[0_24px_64px_rgb(10_16_26/0.18)]",
          maxWidthClass,
          className,
        )}
      >
        {title ? (
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-200 px-5 py-4 sm:px-6">
            <div className="min-w-0 flex-1">{title}</div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-2 text-v2-muted transition hover:bg-v2-bg-subtle hover:text-v2-ink"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
      </div>
    </div>
  );
}
