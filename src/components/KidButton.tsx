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
    "bg-crayon-teal px-5 py-2.5 text-base text-white shadow-crayon hover:-translate-y-0.5 lg:px-7 lg:py-3.5 lg:text-xl",
  secondary:
    "bg-paper px-5 py-2.5 text-base text-ink shadow-crayon hover:-translate-y-0.5 lg:px-7 lg:py-3.5 lg:text-xl",
  makeIt:
    "bg-crayon-teal px-8 py-3.5 text-xl text-white shadow-crayon-lg hover:-translate-y-0.5 lg:px-12 lg:py-5 lg:text-2xl",
  ghost: "bg-transparent px-3 py-1.5 text-sm text-ink shadow-none lg:px-4 lg:py-2 lg:text-base",
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
