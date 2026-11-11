"use client";

import { useId, useRef, type ReactNode } from "react";
import { useModalLayer } from "@/components/v2/ui/useModalLayer";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

type V2ModalProps = {
  title?: ReactNode;
  /** Accessible name when there is no visible `title`. */
  ariaLabel?: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  maxWidthClass?: string;
  /**
   * Use (nearly) the whole screen height and let the content lay itself out
   * in it, for previews that should be as large as the window allows.
   */
  fill?: boolean;
};

export function V2Modal({
  title,
  ariaLabel,
  onClose,
  children,
  className,
  maxWidthClass = "max-w-2xl",
  fill = false,
}: V2ModalProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  useModalLayer({ panelRef, initialFocusRef: bodyRef, onClose });

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
      aria-label={title ? undefined : ariaLabel}
    >
      <button
        type="button"
        tabIndex={-1}
        className="absolute inset-0 bg-v2-ink/40 backdrop-blur-[2px]"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        className={cn(
          "relative flex w-full flex-col overflow-hidden rounded-2xl focus:outline-none border border-gray-200 bg-v2-surface shadow-[0_24px_64px_rgb(10_16_26/0.18)]",
          fill
            ? "h-[calc(100dvh_-_2rem_-_env(safe-area-inset-bottom))] max-h-[1200px]"
            : "max-h-[min(calc(100dvh_-_2rem_-_env(safe-area-inset-bottom)),720px)]",
          maxWidthClass,
          className,
        )}
      >
        {title ? (
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-200 px-5 py-4 sm:px-6">
            <div id={titleId} className="min-w-0 flex-1">
              {title}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="v2-hit rounded-full p-2 text-v2-muted transition hover:bg-v2-bg-subtle hover:text-v2-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-primary"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        ) : null}
        <div
          ref={bodyRef}
          className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain", fill && "flex flex-col")}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
