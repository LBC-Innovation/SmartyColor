"use client";

import { useId, useRef, useState } from "react";
import { DESIGN_THEMES } from "@/content/marketing";
import { THEME_NOT_ALLOWED_CODE, THEME_TOO_LONG_CODE, DESIGN_THEME_MAX_CHARS } from "@/lib/designTheme";
import { isError } from "@/lib/api/client";
import { updateProject } from "@/lib/library/client";
import { track } from "@/lib/track";
import { cn } from "@/lib/cn";
import type { ThemeStarterId } from "@/lib/marketing/events";

export type ThemeSaveResult = { ok: true; theme: string | null } | { ok: false };

/**
 * The theme field shared by the wizard's Theme step and the album's Theme settings: a text box,
 * starter chips that fill it (they never submit), and the save call. The buttons are the caller's,
 * so each place keeps its own layout; it gets `save()` and the box's current state.
 */
export function useThemeEditor(input: { albumId: string; initial: string | null; where: "wizard" | "settings" }) {
  const [text, setText] = useState(input.initial ?? "");
  // Which starter the box was last filled from, so analytics can say "starter" or "starter_edited".
  const [starter, setStarter] = useState<{ id: ThemeStarterId; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function pick(s: { id: ThemeStarterId; text: string }) {
    setText(s.text);
    setStarter(s);
    setError(null);
    const el = textareaRef.current;
    if (el) {
      el.focus();
      const end = s.text.length;
      requestAnimationFrame(() => el.setSelectionRange(end, end));
    }
  }

  async function save(value: string | null): Promise<ThemeSaveResult> {
    setSaving(true);
    setError(null);
    const trimmed = value?.trim() ? value.trim() : null;
    const res = await updateProject(input.albumId, { designTheme: trimmed });
    setSaving(false);
    if (isError(res)) {
      const code = res.error.code;
      if (code === THEME_NOT_ALLOWED_CODE) {
        setError(DESIGN_THEMES.notAllowed);
        track("theme_rejected", { where: input.where });
        textareaRef.current?.focus();
      } else if (code === THEME_TOO_LONG_CODE) {
        setError(DESIGN_THEMES.tooLong);
        textareaRef.current?.focus();
      } else {
        setError(DESIGN_THEMES.saveFailed);
      }
      return { ok: false };
    }
    if (trimmed) {
      const source = starter ? (starter.text === trimmed ? "starter" : "starter_edited") : "typed";
      // Only fixed ids and enums: never the theme text.
      track("theme_set", {
        where: input.where,
        source,
        ...(source !== "typed" && starter ? { starter_id: starter.id } : {}),
      });
    }
    return { ok: true, theme: res.data.designTheme ?? null };
  }

  return [{ text, setText, pick, saving, error, setError, save, starter }, textareaRef] as const;
}

export function ThemeField({
  editor,
  textareaRef,
}: {
  editor: ReturnType<typeof useThemeEditor>[0];
  textareaRef: ReturnType<typeof useThemeEditor>[1];
}) {
  const id = useId();
  const count = editor.text.length;
  const showCount = count >= 160;
  return (
    <div>
      <label htmlFor={id} className="text-sm font-semibold text-v2-ink">
        {DESIGN_THEMES.label}
      </label>
      <textarea
        id={id}
        ref={textareaRef}
        value={editor.text}
        onChange={(e) => {
          editor.setText(e.target.value);
          editor.setError(null);
        }}
        rows={3}
        maxLength={DESIGN_THEME_MAX_CHARS}
        placeholder={DESIGN_THEMES.placeholder}
        aria-describedby={`${id}-help${showCount ? ` ${id}-count` : ""}${editor.error ? ` ${id}-error` : ""}`}
        aria-invalid={editor.error ? true : undefined}
        className="v2-input mt-1.5 w-full resize-none text-base"
      />
      <div className="mt-1 flex items-start justify-between gap-3">
        <p id={`${id}-help`} className="text-xs text-v2-muted">
          {DESIGN_THEMES.help}
        </p>
        {showCount ? (
          <p id={`${id}-count`} className="shrink-0 text-xs tabular-nums text-v2-muted" aria-live="polite">
            {count}/{DESIGN_THEME_MAX_CHARS}
          </p>
        ) : null}
      </div>
      {editor.error ? (
        <p
          id={`${id}-error`}
          role="alert"
          className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
        >
          {editor.error}
        </p>
      ) : null}
      <p className="mt-4 text-sm font-semibold text-v2-ink">{DESIGN_THEMES.ideas}</p>
      <div role="group" aria-label={DESIGN_THEMES.ideasLabel} className="mt-2 flex flex-wrap gap-2">
        {DESIGN_THEMES.starters.map((s) => {
          const selected = editor.text.trim() === s.text;
          return (
            <button
              key={s.id}
              type="button"
              aria-pressed={selected}
              onClick={() => editor.pick(s)}
              className={cn(
                "min-h-11 rounded-full border px-4 text-sm font-semibold text-v2-link transition",
                selected
                  ? "border-v2-primary bg-v2-primary-light"
                  : "border-v2-primary/25 bg-white hover:bg-v2-primary-light/60",
              )}
            >
              {s.text}
            </button>
          );
        })}
      </div>
    </div>
  );
}
