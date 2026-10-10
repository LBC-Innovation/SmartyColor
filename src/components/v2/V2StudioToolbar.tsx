"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type V2StudioToolbarProps = {
  library: ReactNode;
  studio: ReactNode;
  className?: string;
};

export function V2StudioToolbar({
  library,
  studio,
  className,
}: V2StudioToolbarProps) {
  return (
    <div
      className={cn("v2-studio-toolbar shrink-0", className)}
      role="toolbar"
      aria-label="Studio actions"
    >
      <div className="v2-studio-toolbar-grid">
        <div
          className="v2-studio-toolbar-zone v2-studio-toolbar-zone--library"
          aria-label="Photo library actions"
        >
          {library}
        </div>
        <div
          className="v2-studio-toolbar-zone v2-studio-toolbar-zone--studio"
          aria-label="Studio preview actions"
        >
          {studio}
        </div>
      </div>
    </div>
  );
}
