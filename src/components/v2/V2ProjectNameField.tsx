"use client";

import { useEffect, useRef, useState } from "react";
import { Pencil } from "lucide-react";
import { useV2Studio } from "@/components/v2/V2StudioProvider";
import { cn } from "@/lib/cn";

type V2ProjectNameFieldProps = {
  className?: string;
  /** Larger title styling for workspace headers */
  variant?: "default" | "workspace";
};

export function V2ProjectNameField({
  className,
  variant = "default",
}: V2ProjectNameFieldProps) {
  const { activeProject, renameActiveProject } = useV2Studio();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(activeProject?.name ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) {
      setDraft(activeProject?.name ?? "");
    }
  }, [activeProject?.name, editing]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  if (!activeProject) return null;

  function commit() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== activeProject?.name) {
      renameActiveProject(trimmed);
    } else {
      setDraft(activeProject?.name ?? "");
    }
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          }
          if (event.key === "Escape") {
            setDraft(activeProject.name);
            setEditing(false);
          }
        }}
        className={cn(
          "min-w-0 rounded-lg border border-v2-primary/40 bg-white px-2 py-1 font-semibold text-v2-ink outline-none ring-v2-primary/30 focus:ring-2",
          variant === "workspace" ? "text-lg sm:text-xl" : "text-sm",
          className,
        )}
        aria-label="Project name"
        maxLength={80}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className={cn(
        "group inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-lg px-1 py-0.5 text-left transition hover:bg-v2-bg-subtle",
        variant === "workspace"
          ? "text-lg font-semibold tracking-tight text-v2-ink sm:text-xl"
          : "text-sm font-semibold text-v2-ink",
        className,
      )}
      title="Rename project"
    >
      <span className="truncate">{activeProject.name}</span>
      <Pencil
        className="h-3.5 w-3.5 shrink-0 text-v2-muted opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100"
        aria-hidden
      />
    </button>
  );
}
