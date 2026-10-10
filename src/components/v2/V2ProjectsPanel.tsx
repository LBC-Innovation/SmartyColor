"use client";

import { FolderOpen, Plus } from "lucide-react";
import { useV2Studio } from "@/components/v2/V2StudioProvider";
import { cn } from "@/lib/cn";

type V2ProjectsPanelProps = {
  /** Tighter layout for mobile strip above the photo library */
  compact?: boolean;
};

export function V2ProjectsPanel({ compact }: V2ProjectsPanelProps) {
  const {
    hydrated,
    projects,
    activeProjectId,
    createProject,
    switchProject,
  } = useV2Studio();

  return (
    <div className={cn("flex flex-col", compact ? "gap-2" : "min-h-0 flex-1 gap-1")}>
      {!compact ? (
        <p className="flex items-center gap-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-v2-muted">
          <FolderOpen className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Projects
        </p>
      ) : null}

      <button
        type="button"
        onClick={createProject}
        disabled={!hydrated}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-lg border border-v2-primary/35 bg-v2-primary-light font-semibold text-v2-link transition hover:border-v2-primary/50 hover:bg-v2-primary-light/80 disabled:cursor-not-allowed disabled:opacity-50",
          compact
            ? "shrink-0 px-3 py-2 text-sm"
            : "mb-1 w-full px-2.5 py-2.5 text-xs",
        )}
      >
        <Plus className="h-4 w-4 shrink-0" aria-hidden />
        Create project
      </button>

      <div
        className={cn(
          compact
            ? "flex gap-2 overflow-x-auto pb-0.5"
            : "flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto",
        )}
        role="list"
        aria-label="Your projects"
      >
        {!hydrated ? (
          <p className="py-2 text-xs text-v2-muted">Loading projects…</p>
        ) : projects.length === 0 ? (
          <p className="py-2 text-xs text-v2-muted">
            No projects yet. Create one to start adding photos.
          </p>
        ) : (
          projects.map((project) => {
            const active = project.id === activeProjectId;
            return (
              <button
                key={project.id}
                type="button"
                role="listitem"
                title={project.name}
                onClick={() => switchProject(project.id)}
                className={cn(
                  "min-w-0 rounded-lg text-left transition-colors",
                  compact
                    ? "max-w-[12rem] min-w-[9rem] shrink-0 border px-3 py-2.5"
                    : "w-full px-2.5 py-2.5",
                  active
                    ? compact
                      ? "border-v2-primary/40 bg-v2-primary-light text-v2-link"
                      : "bg-v2-primary-light text-v2-link"
                    : compact
                      ? "border-gray-200 bg-white text-v2-navy hover:bg-v2-bg-subtle"
                      : "text-v2-navy hover:bg-v2-bg-subtle hover:text-v2-ink",
                )}
                aria-current={active ? "true" : undefined}
              >
                <span className="block min-w-0 overflow-hidden">
                  <span className="block truncate text-xs font-semibold leading-4">
                    {project.name}
                  </span>
                  <span className="mt-1 block truncate text-[10px] leading-3 text-v2-muted">
                    {project.photoCount === 1
                      ? "1 photo"
                      : `${project.photoCount} photos`}
                  </span>
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
