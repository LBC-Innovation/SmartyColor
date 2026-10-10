"use client";

import { Pencil, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { LikedTrait } from "@/lib/session/types";

type RequirementsListProps = {
  items: LikedTrait[];
  onChange: (id: string, text: string) => void;
  onRemove: (id: string) => void;
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
}: RequirementsListProps) {
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <aside className="flex h-full min-h-0 flex-col gap-4 rounded-card border-[3px] border-ink bg-paper-sky p-6">
      <div>
        <h2 className="font-display text-xl font-bold text-ink">The plan</h2>
        <p className="mt-1 font-body text-sm text-ink-soft">
          Things Smarty will draw. Edit or delete any item.
        </p>
      </div>
      <ul className="flex min-h-0 flex-1 flex-col overflow-y-auto">
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
                        onChange={(event) => onChange(item.id, event.target.value)}
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
                      <Pencil aria-hidden className="size-4" strokeWidth={2.25} />
                    </IconButton>
                    <IconButton
                      label={`Delete ${item.text}`}
                      onClick={() => onRemove(item.id)}
                    >
                      <Trash2 aria-hidden className="size-4" strokeWidth={2.25} />
                    </IconButton>
                  </div>
                </div>
              </li>
            );
          })
        )}
      </ul>
    </aside>
  );
}
