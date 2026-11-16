import { cn } from "@/lib/cn";

/** "Saved" / "Failed" next to a control, announced to screen readers. */
export function SavedNote({ state }: { state: "ok" | "err" | undefined }) {
  return (
    <span role="status" className={cn("text-xs font-semibold", state === "ok" ? "text-v2-success-text" : "text-red-700")}>
      {state === "ok" ? "Saved" : state === "err" ? "Failed" : ""}
    </span>
  );
}
