"use client";

import { Pencil, Trash2 } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { KidButton } from "@/components/KidButton";
import { cn } from "@/lib/cn";
import type { LikedTrait } from "@/lib/session/types";

type RequirementsListProps = {
  items: LikedTrait[];
  onChange: (id: string, text: string) => void;
  onRemove: (id: string) => void;
  /** Debug: full generate prompt that Make It would send. */
  generatePromptPreview?: string;
};

function IconButton({
  label,
  onClick,
  pressed,
  children,
}: {
  label: string;
  onClick: () => void;
  pressed?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-full border-2 border-ink bg-transparent text-ink hover:bg-sky",
        pressed && "bg-sky text-crayon-teal",
      )}
    >
      {children}
    </button>
  );
}

export function RequirementsList({
  items,
  onChange,
  onRemove,
  generatePromptPreview,
}: RequirementsListProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [promptOpen, setPromptOpen] = useState(false);
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!promptOpen) return;

    closeRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setPromptOpen(false);
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [promptOpen]);

  return (
    <>
      <aside className="flex h-full min-h-0 flex-col gap-4 overflow-hidden rounded-card border-[3px] border-ink bg-paper-sky p-6">
        <div className="shrink-0">
          <h2 className="font-display text-xl font-bold text-ink">The plan</h2>
          <p className="mt-1 font-body text-sm text-ink-soft">
            Things Smarty will draw. Edit or delete any item.
          </p>
        </div>
        <ul className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
          {items.length === 0 ? (
            <li className="py-4 font-body text-sm text-ink-soft">
              As you chat, the important pieces show up here.
            </li>
          ) : (
            items.map((item, index) => {
              const editing = editingId === item.id;
              return (
                <li key={item.id}>
                  {index > 0 ? (
                    <hr className="border-0 border-t border-ink/20" />
                  ) : null}
                  <div className="flex items-start gap-3 py-3">
                    {editing ? (
                      <>
                        <label className="sr-only" htmlFor={`req-${item.id}`}>
                          Edit plan item
                        </label>
                        <textarea
                          id={`req-${item.id}`}
                          value={item.text}
                          autoFocus
                          onChange={(event) =>
                            onChange(item.id, event.target.value)
                          }
                          onKeyDown={(event) => {
                            if (event.key === "Enter" && !event.shiftKey) {
                              event.preventDefault();
                              setEditingId(null);
                            }
                          }}
                          rows={2}
                          className="min-h-11 min-w-0 flex-1 resize-y bg-transparent py-1.5 font-body text-base font-bold leading-snug text-ink outline-none"
                        />
                      </>
                    ) : (
                      <p className="min-w-0 flex-1 py-1.5 font-body text-base font-bold leading-snug text-ink">
                        {item.text}
                      </p>
                    )}
                    <div className="flex shrink-0 gap-1.5 pt-0.5">
                      <IconButton
                        label={`Edit ${item.text}`}
                        pressed={editing}
                        onClick={() =>
                          setEditingId((current) =>
                            current === item.id ? null : item.id,
                          )
                        }
                      >
                        <Pencil
                          aria-hidden
                          className="size-4"
                          strokeWidth={2.25}
                        />
                      </IconButton>
                      <IconButton
                        label={`Delete ${item.text}`}
                        onClick={() => onRemove(item.id)}
                      >
                        <Trash2
                          aria-hidden
                          className="size-4"
                          strokeWidth={2.25}
                        />
                      </IconButton>
                    </div>
                  </div>
                </li>
              );
            })
          )}
        </ul>

        {generatePromptPreview != null ? (
          <button
            type="button"
            onClick={() => setPromptOpen(true)}
            className="shrink-0 self-start border-0 bg-transparent p-0 font-body text-xs text-ink-soft underline-offset-2 hover:underline"
          >
            Debug: view generate prompt
          </button>
        ) : null}
      </aside>

      {promptOpen && generatePromptPreview != null ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
          <button
            type="button"
            aria-label="Close generate prompt"
            className="absolute inset-0 bg-ink/40"
            onClick={() => setPromptOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="relative z-10 flex max-h-[90vh] w-full max-w-3xl flex-col gap-4 overflow-hidden rounded-(--radius-card) border-[3px] border-ink bg-paper p-5 shadow-crayon-lg sm:p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <h2
                id={titleId}
                className="font-display text-lg font-semibold text-ink"
              >
                Generate prompt (debug)
              </h2>
              <KidButton
                ref={closeRef}
                variant="ghost"
                className="shrink-0 border-transparent px-3 py-1 text-base"
                onClick={() => setPromptOpen(false)}
              >
                Close
              </KidButton>
            </div>
            <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap rounded-xl border-2 border-ink/15 bg-cream p-4 font-mono text-xs leading-relaxed text-ink">
              {generatePromptPreview || "(empty prompt)"}
            </pre>
            <div className="flex justify-end">
              <KidButton
                variant="secondary"
                onClick={() => setPromptOpen(false)}
              >
                Done
              </KidButton>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
