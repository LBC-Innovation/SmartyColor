"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, CircleCheck, FolderOpen, Pencil, Plus, Trash2, X } from "lucide-react";
import { useV2Studio } from "@/components/v2/V2StudioProvider";
import { V2DeleteProjectConfirmModal } from "@/components/v2/V2DeleteProjectConfirmModal";
import { useV2Toast } from "@/components/v2/V2Toast";
import { cn } from "@/lib/cn";
import { withViewTransition } from "@/lib/v2/viewTransition";

/**
 * Project title + switcher for the library toolbar. The name doubles as the
 * dropdown trigger; the pencil swaps it for an inline rename field of the
 * same height so the toolbar never shifts.
 */
export function V2ProjectSwitcher({
  className,
  onEditingChange,
}: {
  className?: string;
  /** Lets the host toolbar hide its other controls while the name is being edited. */
  onEditingChange?: (editing: boolean) => void;
}) {
  const {
    hydrated,
    projects,
    activeProject,
    activeProjectId,
    createProject,
    switchProject,
    renameActiveProject,
    deleteProject,
  } = useV2Studio();
  const toast = useV2Toast();
  const [open, setOpen] = useState(false);
  const [editing, setEditingState] = useState(false);
  const [draft, setDraft] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  function setEditing(next: boolean) {
    withViewTransition(() => {
      setEditingState(next);
      onEditingChange?.(next);
    });
  }

  async function confirmDeleteProject() {
    if (!activeProject) return;
    setDeleting(true);
    const name = activeProject.name;
    try {
      await deleteProject(activeProject.id);
      setConfirmDelete(false);
      setEditing(false);
      toast.success({ title: "Album deleted", message: `“${name}” and its photos were removed.` });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete the album.");
    } finally {
      setDeleting(false);
    }
  }
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function startRename() {
    if (!activeProject) return;
    setDraft(activeProject.name);
    setOpen(false);
    setEditing(true);
  }

  function commitRename() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== activeProject?.name) renameActiveProject(trimmed);
    setEditing(false);
  }

  const label = !hydrated
    ? "Loading…"
    : (activeProject?.name ?? "Select a project");

  return (
    <div
      ref={rootRef}
      className={cn("relative flex h-9 min-w-0 flex-1 items-center gap-0.5", className)}
      role="group"
      aria-label="Project"
    >
      {editing ? (
        <div className="flex w-full min-w-0 items-center gap-2">
          <div className="relative min-w-0 flex-[4]" style={{ viewTransitionName: "cm-project-name" }}>
            <input
              type="text"
              value={draft}
              autoFocus
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitRename();
                }
                if (e.key === "Escape") setEditing(false);
              }}
              maxLength={80}
              aria-label="Project name"
              className="h-9 w-full min-w-0 rounded-lg border border-v2-primary bg-white pl-3 pr-10 text-sm font-semibold text-v2-ink outline-none ring-2 ring-v2-primary/20"
            />
            <button
              type="button"
              onClick={commitRename}
              className="absolute right-1 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-v2-primary transition hover:bg-v2-primary-light"
              aria-label="Save name"
              title="Save"
            >
              <CircleCheck className="h-5 w-5" aria-hidden />
            </button>
          </div>
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="inline-flex h-9 flex-1 items-center justify-center rounded-lg border border-red-200 bg-white text-red-700 transition hover:bg-red-50"
            style={{ viewTransitionName: "cm-project-edit" }}
            aria-label="Delete album"
            title="Delete album"
          >
            <Trash2 className="h-[18px] w-[18px]" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="inline-flex h-9 flex-1 items-center justify-center rounded-lg border border-gray-200 bg-white text-v2-navy transition hover:bg-v2-bg-subtle"
            style={{ viewTransitionName: "cm-toolbar-cancel" }}
            aria-label="Cancel renaming"
            title="Cancel"
          >
            <X className="h-[18px] w-[18px]" aria-hidden />
          </button>
        </div>
      ) : (
        <>
          <button
            ref={triggerRef}
            type="button"
            disabled={!hydrated}
            onClick={() => setOpen((v) => !v)}
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-controls={open ? listId : undefined}
            className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg px-2 text-left transition hover:bg-v2-primary/[0.06] disabled:cursor-not-allowed disabled:opacity-60"
            style={{ viewTransitionName: "cm-project-name" }}
          >
            <FolderOpen className="h-4 w-4 shrink-0 text-v2-primary" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-v2-ink">
              {label}
            </span>
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 text-v2-muted transition-transform",
                open && "rotate-180",
              )}
              aria-hidden
            />
          </button>
          {activeProject ? (
            <button
              type="button"
              onClick={startRename}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-v2-muted transition hover:bg-v2-primary/[0.06] hover:text-v2-ink"
              style={{ viewTransitionName: "cm-project-edit" }}
              aria-label="Rename project"
              title="Rename project"
            >
              <Pencil className="h-4 w-4" aria-hidden />
            </button>
          ) : null}
        </>
      )}

      {open ? (
        <div className="absolute left-0 top-full z-30 mt-1 w-72 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl border border-gray-200 bg-v2-surface shadow-[0_12px_32px_rgb(10_16_26/0.14)]">
          <ul
            id={listId}
            role="listbox"
            aria-label="Your projects"
            className="max-h-64 overflow-y-auto overscroll-contain p-1"
          >
            {projects.length === 0 ? (
              <li className="px-2.5 py-2 text-xs text-v2-muted">
                No projects yet. Create one to start adding photos.
              </li>
            ) : (
              projects.map((project) => {
                const selected = project.id === activeProjectId;
                return (
                  <li key={project.id} role="option" aria-selected={selected}>
                    <button
                      type="button"
                      title={project.name}
                      onClick={() => {
                        setOpen(false);
                        switchProject(project.id);
                      }}
                      className={cn(
                        "flex w-full min-w-0 items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors",
                        selected
                          ? "bg-v2-primary-light text-v2-link"
                          : "text-v2-navy hover:bg-v2-bg-subtle hover:text-v2-ink",
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold leading-5">
                          {project.name}
                        </span>
                        <span className="block truncate text-[11px] leading-4 text-v2-muted">
                          {project.photoCount === 1
                            ? "1 photo"
                            : `${project.photoCount} photos`}
                        </span>
                      </span>
                      {selected ? (
                        <Check className="h-4 w-4 shrink-0" aria-hidden />
                      ) : null}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
          <div className="border-t border-gray-200 p-1">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                createProject();
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-semibold text-v2-link transition hover:bg-v2-primary-light"
            >
              <Plus className="h-4 w-4 shrink-0" aria-hidden />
              Create new
            </button>
          </div>
        </div>
      ) : null}

      {confirmDelete && activeProject ? (
        <V2DeleteProjectConfirmModal
          projectName={activeProject.name}
          photoCount={activeProject.photoCount}
          busy={deleting}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => void confirmDeleteProject()}
        />
      ) : null}
    </div>
  );
}
