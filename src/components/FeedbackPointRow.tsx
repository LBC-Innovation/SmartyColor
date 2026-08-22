import { cn } from "@/lib/cn";
import type { FeedbackPoint } from "@/lib/session/types";

type FeedbackPointRowProps = {
  point: FeedbackPoint;
  onReact: (id: string, reaction: "yay" | "nah") => void;
};

export function FeedbackPointRow({ point, onReact }: FeedbackPointRowProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-[1.125rem] border-2 border-ink bg-cream px-4 py-3">
      <p className="min-w-0 flex-1 font-body text-lg text-ink">{point.text}</p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onReact(point.id, "yay")}
          className={cn(
            "rounded-full border-2 border-ink px-3.5 py-2 font-display text-sm font-semibold",
            point.reaction === "yay" ? "bg-crayon-lime shadow-crayon" : "bg-paper",
          )}
        >
          Yay
        </button>
        <button
          type="button"
          onClick={() => onReact(point.id, "nah")}
          className={cn(
            "rounded-full border-2 border-ink px-3.5 py-2 font-display text-sm font-semibold",
            point.reaction === "nah"
              ? "bg-crayon-coral shadow-crayon"
              : "bg-paper",
          )}
        >
          Nah
        </button>
      </div>
    </div>
  );
}
