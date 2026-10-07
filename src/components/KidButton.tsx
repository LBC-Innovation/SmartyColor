import { cn } from "@/lib/cn";
import {
  forwardRef,
  type ButtonHTMLAttributes,
} from "react";

type KidButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "makeIt" | "ghost";
};

const variants = {
  primary:
    "bg-crayon-teal px-7 py-3.5 text-xl text-white shadow-crayon hover:-translate-y-0.5",
  secondary:
    "bg-paper px-7 py-3.5 text-xl text-ink shadow-crayon hover:-translate-y-0.5",
  makeIt:
    "bg-crayon-teal px-12 py-5 text-2xl text-white shadow-crayon-lg hover:-translate-y-0.5",
  ghost: "bg-transparent px-4 py-2 text-base text-ink shadow-none",
};

export const KidButton = forwardRef<HTMLButtonElement, KidButtonProps>(
  function KidButton(
    { className, variant = "primary", type = "button", ...props },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          "inline-flex items-center justify-center rounded-full border-[3px] border-ink font-display font-semibold transition enabled:cursor-pointer disabled:cursor-not-allowed disabled:opacity-50",
          variants[variant],
          className,
        )}
        {...props}
      />
    );
  },
);
