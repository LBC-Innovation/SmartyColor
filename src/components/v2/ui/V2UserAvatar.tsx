import { cn } from "@/lib/cn";

export function V2UserAvatar({
  name,
  src,
  size = 40,
  className,
}: {
  name?: string | null;
  src?: string | null;
  size?: number;
  className?: string;
}) {
  const initials = (name ?? "?").charAt(0).toUpperCase();
  const dim = { width: size, height: size };

  if (src?.trim()) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        style={dim}
        className={cn("shrink-0 rounded-xl object-cover ring-2 ring-white", className)}
      />
    );
  }

  return (
    <span
      style={dim}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-v2-primary-light to-v2-primary/35 text-sm font-bold text-v2-primary ring-2 ring-white",
        className,
      )}
      aria-hidden
    >
      {initials}
    </span>
  );
}
