"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ImageIcon, Loader2, Palette } from "lucide-react";
import { ThemeField, useThemeEditor } from "@/components/v2/book-packages/ThemeEditor";
import { ThemeExamples } from "@/components/v2/book-packages/ThemeExamples";
import { WizardProgress } from "@/components/v2/book-packages/WizardProgress";
import { DESIGN_THEMES } from "@/content/marketing";
import { cn } from "@/lib/cn";
import { track } from "@/lib/track";

type Choice = "none" | "theme";

/**
 * Step 3 (step 2 for "Print as you go"): an optional theme for the new album. It reads as a plain choice, "No theme" (picked
 * by default) or "Add a theme", with real examples above it, so nobody thinks a theme is required.
 */
export function ThemeStep({
  albumId,
  initialTheme,
  flow = "package",
  onDone,
}: {
  albumId: string;
  initialTheme: string | null;
  /** "pages" is "Print as you go": no Pay step in the progress. */
  flow?: "package" | "pages";
  /** Leave the wizard for the album. `saved` is true when a theme was stored. */
  onDone: (saved: boolean) => void;
}) {
  const [editor, textareaRef] = useThemeEditor({ albumId, initial: initialTheme, where: "wizard" });
  const [choice, setChoice] = useState<Choice>(initialTheme ? "theme" : "none");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const hasText = editor.text.trim().length > 0;

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  function choose(next: Choice) {
    setChoice(next);
    editor.setError(null);
    if (next === "theme") requestAnimationFrame(() => textareaRef.current?.focus());
  }

  async function onPrimary() {
    if (choice === "none" || !hasText) {
      track("theme_skipped", { where: "wizard" });
      onDone(false);
      return;
    }
    const result = await editor.save(editor.text);
    if (result.ok) onDone(true);
  }

  const options: { id: Choice; title: string; sub: string; Icon: typeof Palette }[] = [
    { id: "none", title: DESIGN_THEMES.choiceNone, sub: DESIGN_THEMES.choiceNoneSub, Icon: ImageIcon },
    { id: "theme", title: DESIGN_THEMES.choiceTheme, sub: DESIGN_THEMES.choiceThemeSub, Icon: Palette },
  ];

  const primaryLabel = editor.saving
    ? DESIGN_THEMES.saving
    : choice === "theme" && hasText
      ? DESIGN_THEMES.use
      : DESIGN_THEMES.continue;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-32 pt-6 sm:px-6 sm:pb-12">
      <WizardProgress step={flow === "pages" ? 2 : 3} flow={flow} className="mb-5" />
      <div className="v2-panel p-5 sm:p-8">
        <div className="flex flex-wrap items-center gap-2">
          <h1 ref={headingRef} tabIndex={-1} className="v2-brand-title text-2xl text-v2-ink outline-none sm:text-3xl">
            {DESIGN_THEMES.title}
          </h1>
          <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-v2-muted">
            {DESIGN_THEMES.optionalBadge}
          </span>
        </div>
        <p className="mt-1 text-sm text-v2-muted">{DESIGN_THEMES.subtitle}</p>

        <ThemeExamples className="mt-5" />

        <div role="radiogroup" aria-label={DESIGN_THEMES.choiceLabel} className="mt-6 grid gap-3 sm:grid-cols-2">
          {options.map(({ id, title, sub, Icon }) => {
            const selected = choice === id;
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => choose(id)}
                className={cn(
                  "flex min-h-11 items-start gap-3 rounded-2xl border-2 p-4 text-left transition",
                  selected ? "border-v2-primary bg-v2-primary-light/50" : "border-gray-200 bg-white hover:border-v2-primary/40",
                )}
              >
                <span
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                    selected ? "bg-v2-primary text-white" : "bg-gray-100 text-v2-muted",
                  )}
                  aria-hidden
                >
                  {selected ? <Check className="h-4 w-4" strokeWidth={3} /> : <Icon className="h-4 w-4" />}
                </span>
                <span className="min-w-0">
                  <span className="block font-semibold text-v2-ink">{title}</span>
                  <span className="block text-sm text-v2-muted">{sub}</span>
                </span>
              </button>
            );
          })}
        </div>

        {choice === "theme" ? (
          <div className="mt-5">
            <ThemeField editor={editor} textareaRef={textareaRef} />
          </div>
        ) : null}

        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur sm:static sm:z-auto sm:mt-6 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
          <div className="mx-auto max-w-3xl">
            <button
              type="button"
              onClick={() => void onPrimary()}
              disabled={editor.saving}
              className="v2-btn-primary min-h-12 w-full text-base"
            >
              {editor.saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {primaryLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
