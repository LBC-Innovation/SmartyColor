/** "Save this page" card for guests: shown after the first page, once more after the third, then never. */
const STAGE_KEY = "cm_save_prompt";
/** Set when a guest chose "Save it", so their pages move to the account as soon as they sign in. */
export const MIGRATE_AFTER_SIGNUP_KEY = "cm_migrate_after_signup";

type Stage = "new" | "later-once" | "done";

export function readSavePromptStage(): Stage {
  try {
    const v = localStorage.getItem(STAGE_KEY);
    return v === "later-once" || v === "done" ? v : "new";
  } catch {
    return "new";
  }
}

export function savePromptDue(stage: Stage, pageCount: number): boolean {
  if (stage === "new") return pageCount >= 1;
  if (stage === "later-once") return pageCount >= 3;
  return false;
}

/** "Not now": the first time waits for the third page; the second time stops for good. */
export function snoozeSavePrompt(stage: Stage): Stage {
  const next: Stage = stage === "new" ? "later-once" : "done";
  try {
    localStorage.setItem(STAGE_KEY, next);
  } catch {
    /* ignore */
  }
  return next;
}

export function requestMigrationAfterSignup(): void {
  try {
    localStorage.setItem(MIGRATE_AFTER_SIGNUP_KEY, "1");
  } catch {
    /* ignore */
  }
}

/** True once, right after sign-up from the save card. */
export function takeMigrationRequest(): boolean {
  try {
    if (localStorage.getItem(MIGRATE_AFTER_SIGNUP_KEY) !== "1") return false;
    localStorage.removeItem(MIGRATE_AFTER_SIGNUP_KEY);
    return true;
  } catch {
    return false;
  }
}
