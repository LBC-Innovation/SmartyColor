"use client";

import { useEffect, useId, useRef, useState } from "react";
import { KidButton } from "@/components/KidButton";
import { SegmentedControl } from "@/components/SegmentedControl";
import { ToggleSwitch } from "@/components/ToggleSwitch";
import { cn } from "@/lib/cn";
import type {
  DetailLevel,
  Orientation,
  PaperSize,
  PrintPrefs,
} from "@/lib/print/settings";

type PrintSettingsProps = {
  value: PrintPrefs;
  onChange: (next: PrintPrefs) => void;
  variant?: "centered" | "header";
};

export function PrintSettings({
  value,
  onChange,
  variant = "centered",
}: PrintSettingsProps) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    closeRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <>
      {variant === "header" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex min-h-9 items-center rounded-full border-2 border-ink bg-paper px-3 font-display text-xs font-semibold text-ink hover:bg-sky lg:min-h-11 lg:px-4 lg:text-sm"
        >
          Printer Settings
        </button>
      ) : (
        <div className="flex justify-center">
          <KidButton variant="secondary" onClick={() => setOpen(true)}>
            Printer Settings
          </KidButton>
        </div>
      )}

      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
          <button
            type="button"
            aria-label="Close printer settings"
            className="absolute inset-0 bg-ink/40"
            onClick={() => setOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className={cn(
              "relative z-10 flex max-h-[90vh] w-full max-w-3xl flex-col gap-5 overflow-y-auto rounded-(--radius-card) border-[3px] border-ink bg-paper p-6 shadow-crayon-lg",
            )}
          >
            <div className="flex items-start justify-between gap-4">
              <h2
                id={titleId}
                className="font-display text-xl font-semibold text-ink"
              >
                How should we print it?
              </h2>
              <KidButton
                ref={closeRef}
                variant="ghost"
                className="shrink-0 border-transparent px-3 py-1 text-lg"
                onClick={() => setOpen(false)}
              >
                Close
              </KidButton>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
              <SegmentedControl<Orientation>
                label="Orientation"
                value={value.orientation}
                onChange={(orientation) => onChange({ ...value, orientation })}
                options={[
                  { value: "portrait", label: "Portrait" },
                  { value: "landscape", label: "Landscape" },
                ]}
              />
              <SegmentedControl<PaperSize>
                label="Paper"
                value={value.paper}
                onChange={(paper) => onChange({ ...value, paper })}
                options={[
                  { value: "letter", label: "Letter" },
                  { value: "a4", label: "A4" },
                ]}
              />
              <SegmentedControl<DetailLevel>
                label="Details"
                value={value.detail}
                onChange={(detail) => onChange({ ...value, detail })}
                options={[
                  { value: "simple", label: "Simple" },
                  { value: "medium", label: "Medium" },
                  { value: "busy", label: "Busy" },
                ]}
              />
            </div>

            <div className="flex max-w-md flex-col gap-3">
              <ToggleSwitch
                label="Show a title on the page"
                checked={value.showTitle}
                onChange={(showTitle) => onChange({ ...value, showTitle })}
              />
              <ToggleSwitch
                label="Add a fun border"
                checked={value.funBorder}
                onChange={(funBorder) => onChange({ ...value, funBorder })}
              />
              <ToggleSwitch
                label="Leave room for the kid's name"
                checked={value.nameLine}
                onChange={(nameLine) => onChange({ ...value, nameLine })}
              />
            </div>

            <div className="flex justify-end">
              <KidButton variant="primary" onClick={() => setOpen(false)}>
                Done
              </KidButton>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
