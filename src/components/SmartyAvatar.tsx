import Image from "next/image";
import { cn } from "@/lib/cn";

type SmartyAvatarProps = {
  variant?: "header" | "chat";
  className?: string;
  priority?: boolean;
};

const variantStyles = {
  header: "h-8 w-8 lg:h-10 lg:w-10",
  chat: "size-7 rounded-full border-2 border-user-label bg-white",
};

export function SmartyAvatar({
  variant = "chat",
  className,
  priority = false,
}: SmartyAvatarProps) {
  return (
    <span
      className={cn(
        "relative block shrink-0 overflow-hidden",
        variantStyles[variant],
        className,
      )}
      aria-hidden
    >
      <Image
        src="/smarty.png"
        alt=""
        fill
        priority={priority}
        className={cn(
          "object-center",
          variant === "header" ? "object-contain" : "object-cover",
        )}
        sizes={variant === "header" ? "40px" : "28px"}
      />
    </span>
  );
}
