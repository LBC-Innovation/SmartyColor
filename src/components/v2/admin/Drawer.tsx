"use client";

import { useId, useRef, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useModalLayer } from "@/components/v2/ui/useModalLayer";
import { cn } from "@/lib/cn";

const noopSubscribe = () => () => {};

type DrawerProps = {
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  headerActions?: ReactNode;
  /** Sticky footer, e.g. Reset / Save. */
  footer?: ReactNode;
  width?: "md" | "lg";
  children: ReactNode;
};

/**
 * Right-hand side panel for a record's details and actions. A modal dialog: focus moves in and is
 * trapped, Esc closes, focus returns to what opened it. Full screen on phones. Mount it only while
 * open.
 */
export function Drawer(props: DrawerProps) {
  const onClient = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  if (!onClient) return null;
  return createPortal(<DrawerPanel {...props} />, document.body);
}

/** The DM Sans variable is set on the studio layout, not <body>; carry its resolved font into the portal. */
function shellFontFamily(): string | undefined {
  const shell = document.querySelector(".v2-shell");
  return shell ? getComputedStyle(shell).fontFamily : undefined;
}

function DrawerPanel({ onClose, title, subtitle, headerActions, footer, width = "md", children }: DrawerProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const { zIndex: layerZ } = useModalLayer({ baseZ: 50, panelRef, initialFocusRef: bodyRef, onClose });

  return (
    <div
      className="v2-shell fixed inset-0 z-50"
      style={{ fontFamily: shellFontFamily(), zIndex: layerZ }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <button type="button" tabIndex={-1} aria-label="Close panel" className="absolute inset-0 bg-v2-ink/30" onClick={onClose} />
      <div
        ref={panelRef}
        tabIndex={-1}
        className={cn(
          "absolute inset-y-0 right-0 flex w-full flex-col bg-white shadow-2xl focus:outline-none motion-safe:animate-[v2-drawer-in_200ms_ease-out]",
          width === "lg" ? "sm:w-[720px]" : "sm:w-[560px]",
        )}
      >
        <div className="flex shrink-0 items-start gap-3 border-b border-gray-200 px-5 py-4 sm:px-6">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="truncate text-lg font-semibold text-v2-ink">
              {title}
            </h2>
            {subtitle ? <div className="mt-0.5 text-sm text-v2-muted">{subtitle}</div> : null}
          </div>
          {headerActions ? <div className="flex shrink-0 items-center gap-2">{headerActions}</div> : null}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="v2-hit -mr-2 shrink-0 rounded-full p-2 text-v2-muted transition hover:bg-v2-bg-subtle hover:text-v2-ink"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
          {children}
        </div>
        {footer ? (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-gray-200 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
