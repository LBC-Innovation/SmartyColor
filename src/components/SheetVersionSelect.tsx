"use client";

import type { SheetVersion } from "@/lib/session/types";

type SheetVersionSelectProps = {
  versions: SheetVersion[];
  onSelect: (versionId: string) => void;
};

export function SheetVersionSelect({
  versions,
  onSelect,
}: SheetVersionSelectProps) {
  if (versions.length === 0) return null;

  const ordered = [...versions].reverse();

  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-display text-sm font-semibold text-ink">
        Past drawings
      </span>
      <select
        className="min-h-11 w-full rounded-xl border-2 border-ink bg-paper px-3 font-body text-base text-ink"
        defaultValue=""
        onChange={(event) => {
          const id = event.target.value;
          if (!id) return;
          onSelect(id);
          event.target.value = "";
        }}
      >
        <option value="" disabled>
          Open a previous version…
        </option>
        {ordered.map((version, index) => {
          const n = versions.length - index;
          const label =
            version.sheet.title?.trim() || `Drawing ${n}`;
          return (
            <option key={version.id} value={version.id}>
              {`Version ${n}: ${label}`}
            </option>
          );
        })}
      </select>
    </label>
  );
}
