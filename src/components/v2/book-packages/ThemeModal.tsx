"use client";

import { Loader2, Palette } from "lucide-react";
import { V2Modal } from "@/components/v2/ui/V2Modal";
import { useV2Toast } from "@/components/v2/V2Toast";
import { ThemeField, useThemeEditor } from "@/components/v2/book-packages/ThemeEditor";
import { ThemeExamples } from "@/components/v2/book-packages/ThemeExamples";
import { DESIGN_THEMES } from "@/content/marketing";
import { track } from "@/lib/track";

/** The album's theme settings: opened from the album menu and from the package landing. */
export function ThemeModal({
  albumId,
  albumName,
  theme,
  onSaved,
  onClose,
}: {
  albumId: string;
  albumName: string;
  theme: string | null;
  /** Called with the new theme (null = removed) once the server has it. */
  onSaved: (theme: string | null) => void;
  onClose: () => void;
}) {
  const toast = useV2Toast();
  const [editor, textareaRef] = useThemeEditor({ albumId, initial: theme, where: "settings" });
  const hasText = editor.text.trim().length > 0;

  async function onSave() {
    const result = await editor.save(editor.text);
    if (!result.ok) return;
    onSaved(result.theme);
    toast.success({ message: result.theme ? DESIGN_THEMES.savedSettings : DESIGN_THEMES.removed });
    onClose();
  }

  async function onRemove() {
    const result = await editor.save(null);
    if (!result.ok) return;
    track("theme_removed", { where: "settings" });
    onSaved(null);
    toast.success({ message: DESIGN_THEMES.removed });
    onClose();
  }

  return (
    <V2Modal
      onClose={onClose}
      maxWidthClass="max-w-2xl"
      icon={<Palette />}
      eyebrow={DESIGN_THEMES.modalEyebrow}
      title={albumName}
      description={DESIGN_THEMES.modalDescription}
    >
      <div className="space-y-4 px-5 pb-6 pt-1 sm:px-7">
        <ThemeExamples />
        <ThemeField editor={editor} textareaRef={textareaRef} />
        <p className="text-xs text-v2-muted">{DESIGN_THEMES.modalNote}</p>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => void onSave()}
            disabled={editor.saving || !hasText}
            className="v2-btn-primary min-h-11 w-full"
          >
            {editor.saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {editor.saving ? DESIGN_THEMES.saving : DESIGN_THEMES.modalSave}
          </button>
          {theme ? (
            <button
              type="button"
              onClick={() => void onRemove()}
              disabled={editor.saving}
              className="inline-flex min-h-11 items-center justify-center px-3 text-sm font-semibold text-v2-link hover:underline"
            >
              {DESIGN_THEMES.modalRemove}
            </button>
          ) : null}
        </div>
      </div>
    </V2Modal>
  );
}
