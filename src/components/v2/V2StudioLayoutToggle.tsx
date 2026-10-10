"use client";

import { Columns2, ImageIcon, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";

export type StudioLayoutMode = "photo" | "both" | "sheet";

type V2StudioLayoutToggleProps = {
  value: StudioLayoutMode;
  onChange: (mode: StudioLayoutMode) => void;
  className?: string;
  /** Light controls on the docked studio toolbar */
  variant?: "default" | "toolbar";
};

const options: {
  id: StudioLayoutMode;
  label: string;
  icon: typeof ImageIcon;
}[] = [
  { id: "photo", label: "Photo", icon: ImageIcon },
  { id: "both", label: "Side by side", icon: Columns2 },
  { id: "sheet", label: "Sheet", icon: Sparkles },
];

export function V2StudioLayoutToggle({
  value,
  onChange,
  className,
  variant = "default",
}: V2StudioLayoutToggleProps) {
  const isToolbar = variant === "toolbar";
  return (
    <div
      className={cn(
        "inline-flex rounded-lg border p-0.5",
        isToolbar
          ? "scale-[0.92] border-gray-200/90 bg-white/80 origin-right"
          : "border-gray-200 bg-v2-bg-subtle",
        className,
      )}
      role="group"
      aria-label="Studio preview layout"
    >
      {options.map((option) => {
        const active = value === option.id;
        const Icon = option.icon;
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={active}
            aria-label={option.label}
            onClick={() => onChange(option.id)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md font-semibold transition",
              isToolbar
                ? "px-2 py-1 text-[11px] sm:text-xs"
                : "px-2.5 py-1.5 text-xs sm:px-3 sm:text-sm",
              active
                ? "bg-white text-v2-primary shadow-sm"
                : "text-v2-muted hover:text-v2-ink",
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" aria-hidden />
            <span className="hidden sm:inline">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
