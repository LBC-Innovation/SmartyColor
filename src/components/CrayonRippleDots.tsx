import { cn } from "@/lib/cn";

const DOT_COLORS = [
  "bg-crayon-coral",
  "bg-crayon-yellow",
  "bg-crayon-teal",
  "bg-crayon-purple",
] as const;

type CrayonRippleDotsProps = {
  className?: string;
  size?: "sm" | "md";
  label?: string;
};

export function CrayonRippleDots({
  className,
  size = "md",
  label = "Loading",
}: CrayonRippleDotsProps) {
  return (
    <div
      className={cn(
        "flex items-center overflow-visible",
        size === "sm" ? "gap-2 px-1 py-1" : "gap-3 px-2 py-2",
        className,
      )}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      {DOT_COLORS.map((color, index) => (
        <span
          key={color}
          className={cn(
            "shrink-0 rounded-full border-[3px] border-ink crayon-ripple-dot",
            size === "sm" ? "size-4" : "size-7",
            color,
          )}
          style={{ animationDelay: `${index * 140}ms` }}
          aria-hidden
        />
      ))}
      <span className="sr-only">{label}</span>
    </div>
  );
}
