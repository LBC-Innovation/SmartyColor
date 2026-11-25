"use client";

import { useId, useRef, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useModalLayer } from "@/components/v2/ui/useModalLayer";
import { useLayerHistory } from "@/components/v2/studio/useLayerHistory";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

/** Sets the accent strip, the icon badge and the default button colors. */
export type V2ModalTone = "brand" | "danger" | "success";

type V2ModalProps = {
  /** A string becomes the dialog's display heading; a node is rendered as given. */
  title?: ReactNode;
  /** A short label above the title ("Share album"), when the title is a name. */
  eyebrow?: ReactNode;
  /** One or two plain sentences under the title. */
  description?: ReactNode;
  /** A lucide icon (or any small node) shown in a colored badge beside the title. */
  icon?: ReactNode;
  tone?: V2ModalTone;
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
  /** Hide the header's close button (for steps that can't be cancelled). */
  hideClose?: boolean;
};

const noopSubscribe = () => () => {};

const STRIP: Record<V2ModalTone, string> = {
  brand: "v2-modal-strip",
  danger: "v2-modal-strip v2-modal-strip--danger",
  success: "v2-modal-strip v2-modal-strip--success",
};

const BADGE: Record<V2ModalTone, string> = {
  brand: "bg-gradient-to-br from-brand-violet to-brand-blue shadow-brand-violet/30",
  danger: "bg-gradient-to-br from-brand-coral to-brand-pink shadow-brand-pink/30",
  success: "bg-gradient-to-br from-emerald-500 to-teal-500 shadow-emerald-500/30",
};

/**
 * Rendered into <body>, so an ancestor with a transform, filter or backdrop-filter (the studio's
 * blurred sticky header, say) can't become the containing block for `position: fixed` and squeeze
 * or clip the dialog, and no ancestor stacking context can put it under the bottom nav.
 */
export function V2Modal(props: V2ModalProps) {
  const onClient = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  if (!onClient) return null;
  return createPortal(<V2ModalPanel {...props} />, document.body);
}

function V2ModalPanel({
  title,
  eyebrow,
  description,
  icon,
  tone = "brand",
  ariaLabel,
  onClose,
  children,
  className,
  maxWidthClass = "max-w-2xl",
  fill = false,
  hideClose = false,
}: V2ModalProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const { zIndex: layerZ } = useModalLayer({ baseZ: 50, panelRef, initialFocusRef: bodyRef, onClose });
  // The phone's Back button closes this dialog, not whatever is open underneath it (the order
  // review under add-credit, say). Dialogs that can't be cancelled keep no history entry.
  useLayerHistory(!hideClose, onClose);

  return (
    <div
      className="v2-modal fixed inset-0 z-50 flex items-end justify-center p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:items-center sm:p-4" style={{ zIndex: layerZ }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
      aria-label={title ? undefined : ariaLabel}
    >
      <button
        type="button"
        tabIndex={-1}
        className="v2-modal-backdrop absolute inset-0 bg-v2-plum/50 backdrop-blur-sm"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        className={cn(
          "v2-modal-panel relative flex w-full flex-col overflow-hidden rounded-[1.75rem] bg-v2-surface text-v2-ink ring-1 ring-v2-primary/10 focus:outline-none",
          fill
            ? "h-[calc(100dvh_-_1.5rem_-_env(safe-area-inset-bottom))] max-h-[1200px]"
            : "max-h-[min(calc(100dvh_-_1.5rem_-_env(safe-area-inset-bottom)),760px)]",
          maxWidthClass,
          className,
        )}
      >
        <div className={cn("h-1.5 w-full shrink-0", STRIP[tone])} aria-hidden />
        {title ? (
          <div className="v2-modal-head grid shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-4 px-5 pb-4 pt-5 sm:px-7 sm:pt-6">
            {icon ? (
              <span
                className={cn(
                  "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white shadow-lg [&_svg]:h-6 [&_svg]:w-6",
                  BADGE[tone],
                )}
                aria-hidden
              >
                {icon}
              </span>
            ) : null}
            <div id={titleId} className={cn("min-w-0 self-center", icon ? null : "col-span-2")}>
              {eyebrow ? (
                <p className="mb-0.5 text-sm font-bold uppercase tracking-wider text-v2-primary">{eyebrow}</p>
              ) : null}
              {typeof title === "string" ? (
                <h2 className="v2-brand-title break-words text-[1.5rem] leading-tight text-v2-ink sm:text-[1.625rem]">
                  {title}
                </h2>
              ) : (
                title
              )}
            </div>
            {hideClose ? (
              <span aria-hidden />
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="v2-hit -mr-2 -mt-1 shrink-0 rounded-full p-2 text-v2-muted transition hover:bg-v2-primary-light hover:text-v2-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-primary"
                aria-label="Close"
              >
                <X className="h-6 w-6" />
              </button>
            )}
            {description ? (
              // Phones: full width under the icon, so the sentence isn't squeezed into a narrow column.
              <div
                className={cn(
                  "col-span-3 mt-2 text-base leading-relaxed text-v2-muted",
                  icon ? "sm:col-span-1 sm:col-start-2 sm:mt-1.5" : null,
                )}
              >
                {description}
              </div>
            ) : null}
          </div>
        ) : null}
        <div
          ref={bodyRef}
          className={cn(
            "min-h-0 flex-1 overflow-y-auto overscroll-contain text-base leading-relaxed",
            fill && "flex flex-col",
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

/** The modal's button row: stacked full width on phones, right-aligned from `sm`. */
export function V2ModalActions({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-col-reverse gap-3 px-5 pb-5 pt-2 sm:flex-row sm:justify-end sm:px-7 sm:pb-7",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Body padding that lines up with the header. */
export function V2ModalBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("px-5 pb-4 sm:px-7", className)}>{children}</div>;
}
