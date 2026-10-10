import { isScenePlanPoint } from "@/lib/ai/prompts";
import type { DetailLevel } from "@/lib/print/settings";
import type {
  FeedbackPoint,
  FeedbackTurn,
  LikedTrait,
} from "@/lib/session/types";

export function toScenePlanTraits(points: FeedbackPoint[]): LikedTrait[] {
  return points
    .filter((point) => point.text.trim() && isScenePlanPoint(point.text))
    .map((point) => ({
      id: point.id,
      text: point.text.trim(),
    }));
}

export function detailPlanLine(detail: DetailLevel) {
  return `Keep the page ${detail} — not too crowded`;
}

/** Seed text when the model omits drawable plan points (common on corrective replies). */
export function fallbackPlanSeedText(input: {
  kind: FeedbackTurn["kind"];
  idea: string;
  kidMessage: string;
  saferIdea?: string;
  workaroundSuggestion?: string;
}) {
  if (input.kind === "workaround") {
    return (
      input.workaroundSuggestion?.trim() ||
      input.saferIdea?.trim() ||
      input.kidMessage.trim() ||
      input.idea.trim()
    );
  }

  if (input.kind === "blocked") {
    return (
      input.saferIdea?.trim() ||
      input.kidMessage.trim() ||
      input.idea.trim()
    );
  }

  return input.idea.trim() || "A fun scene to color";
}

export function seedPlanTraits(input: {
  kind: FeedbackTurn["kind"];
  idea: string;
  kidMessage: string;
  detail: DetailLevel;
  saferIdea?: string;
  workaroundSuggestion?: string;
  newId: () => string;
}): LikedTrait[] {
  return [
    {
      id: input.newId(),
      text: fallbackPlanSeedText(input),
    },
    {
      id: input.newId(),
      text: detailPlanLine(input.detail),
    },
  ];
}

/** Ensure refine responses always include drawable plan points outside edit mode. */
export function ensureFeedbackPlanPoints(
  points: FeedbackPoint[],
  input: {
    kind: FeedbackTurn["kind"];
    idea: string;
    kidMessage: string;
    detail: DetailLevel;
    saferIdea?: string;
    workaroundSuggestion?: string;
    editingPreviousSheet: boolean;
    newId: () => string;
  },
): FeedbackPoint[] {
  if (input.editingPreviousSheet) return points;

  const next = [...points];

  if (next.length === 0) {
    next.push({
      id: input.newId(),
      text: fallbackPlanSeedText(input),
    });
  }

  if (next.length === 1) {
    next.push({
      id: input.newId(),
      text: detailPlanLine(input.detail),
    });
  }

  return next;
}

export function resolveRefineLikes(input: {
  feedback: FeedbackTurn;
  existingLikes: LikedTrait[];
  idea: string;
  detail: DetailLevel;
  isFirstIdea: boolean;
  editingPreviousSheet: boolean;
  newId: () => string;
  mergeRequirements: (existing: LikedTrait[], incoming: LikedTrait[]) => LikedTrait[];
  applyPlanEdits: (
    existing: LikedTrait[],
    incoming: LikedTrait[],
    removals: string[],
  ) => LikedTrait[];
}): LikedTrait[] {
  const extracted = toScenePlanTraits(input.feedback.points);

  if (input.isFirstIdea) {
    return extracted.length > 0 ?
        extracted
      : seedPlanTraits({
          kind: input.feedback.kind,
          idea: input.idea,
          kidMessage: input.feedback.kidMessage,
          detail: input.detail,
          saferIdea: input.feedback.saferIdea,
          workaroundSuggestion: input.feedback.workaround?.suggestion,
          newId: input.newId,
        });
  }

  if (input.editingPreviousSheet) {
    const edited = input.applyPlanEdits(
      input.existingLikes,
      extracted,
      input.feedback.removeFromPlan ?? [],
    );
    return edited.length > 0 ?
        edited
      : input.existingLikes;
  }

  const merged = input.mergeRequirements(input.existingLikes, extracted);
  if (merged.length > 0) return merged;

  return seedPlanTraits({
    kind: input.feedback.kind,
    idea: input.idea,
    kidMessage: input.feedback.kidMessage,
    detail: input.detail,
    saferIdea: input.feedback.saferIdea,
    workaroundSuggestion: input.feedback.workaround?.suggestion,
    newId: input.newId,
  });
}
