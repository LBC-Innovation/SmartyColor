import {
  ArrowRight,
  BookOpen,
  Briefcase,
  Cake,
  Camera,
  GraduationCap,
  Gift,
  Heart,
  ImageIcon,
  Mail,
  MessageSquareText,
  PawPrint,
  Printer,
  ShieldCheck,
  Sparkles,
  Truck,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { HeroPair, IconName } from "@/content/marketing";
import { marketingSrcSet } from "@/lib/marketing/images";
import { cn } from "@/lib/cn";

/** Icon for each name used in content/marketing.ts. */
export const ICONS: Record<IconName, LucideIcon> = {
  image: ImageIcon,
  sparkles: Sparkles,
  printer: Printer,
  book: BookOpen,
  message: MessageSquareText,
  truck: Truck,
  shield: ShieldCheck,
  gift: Gift,
  cake: Cake,
  paw: PawPrint,
  camera: Camera,
  users: Users,
  school: GraduationCap,
  heart: Heart,
  briefcase: Briefcase,
  mail: Mail,
};

export function SectionHeading({
  eyebrow,
  title,
  body,
  align = "center",
  id,
}: {
  eyebrow: string;
  title: string;
  body?: string;
  align?: "center" | "left";
  id?: string;
}) {
  return (
    <div className={cn(align === "center" && "text-center")}>
      <p className="text-xs font-bold uppercase tracking-wider text-v2-primary">{eyebrow}</p>
      <h2 id={id} className="v2-brand-title mt-2 text-3xl text-v2-ink sm:text-4xl">
        {title}
      </h2>
      {body ? (
        <p className={cn("mt-3 max-w-xl text-sm text-v2-muted sm:text-base", align === "center" && "mx-auto")}>
          {body}
        </p>
      ) : null}
    </div>
  );
}

const BEFORE_AFTER_SIZES = "(min-width: 640px) 170px, 40vw";

/** A real family photo beside the coloring page Colorful Memories made from it. Below the fold: lazy. */
export function BeforeAfter({ pair, className }: { pair: HeroPair; className?: string }) {
  const { photoSrc, sheetSrc, photoAlt, sheetAlt, width, height, srcSetWidths } = pair;
  const aspect = `${width}/${height}`;
  return (
    <div className={cn("grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-3", className)}>
      <figure className="rotate-[-3deg] overflow-hidden rounded-2xl border-4 border-white bg-white shadow-[0_16px_40px_rgb(10_16_26/0.16)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photoSrc}
          srcSet={marketingSrcSet(photoSrc, srcSetWidths, width)}
          sizes={BEFORE_AFTER_SIZES}
          width={width}
          height={height}
          alt={photoAlt}
          style={{ aspectRatio: aspect }}
          className="block w-full object-cover"
          loading="lazy"
          decoding="async"
        />
        <figcaption className="px-3 py-2 text-center text-xs font-semibold text-v2-muted">Your photo</figcaption>
      </figure>
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-v2-primary text-white shadow-md" aria-hidden>
        <ArrowRight className="h-4 w-4" />
      </span>
      <figure className="rotate-[3deg] overflow-hidden rounded-2xl border-4 border-white bg-white shadow-[0_16px_40px_rgb(10_16_26/0.16)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={sheetSrc}
          srcSet={marketingSrcSet(sheetSrc, srcSetWidths, width)}
          sizes={BEFORE_AFTER_SIZES}
          width={width}
          height={height}
          alt={sheetAlt}
          style={{ aspectRatio: aspect }}
          className="block w-full object-cover"
          loading="lazy"
          decoding="async"
        />
        <figcaption className="px-3 py-2 text-center text-xs font-semibold text-v2-link">Coloring page</figcaption>
      </figure>
    </div>
  );
}

/** CSS-only hardcover-style book with a real coloring page on the cover. */
/** `title` is printed on the cover; the box it sits in sets the size (it fills its parent's width). */
export function PrintedBook({ title }: { title: string }) {
  return (
    <div className="relative [perspective:1100px]" aria-hidden>
      <div className="relative mr-2 aspect-[3/4] w-[calc(100%-0.5rem)] [transform:rotateY(-20deg)_rotateX(3deg)] [transform-style:preserve-3d]">
        {/* page block */}
        <div className="absolute inset-y-[4px] left-[8px] right-[-9px] rounded-r-md bg-[repeating-linear-gradient(to_right,#ffffff_0,#ffffff_1.5px,#d9dce3_1.5px,#d9dce3_2.5px)] shadow-[inset_-2px_0_3px_rgb(0_0_0/0.15)] [transform:translateZ(-8px)]" />
        <div className="absolute inset-x-[8px] bottom-[-7px] h-[8px] rounded-b-md bg-[repeating-linear-gradient(to_bottom,#ffffff_0,#ffffff_1.5px,#d9dce3_1.5px,#d9dce3_2.5px)] [transform:translateZ(-8px)]" />
        {/* cover */}
        <div className="absolute inset-0 overflow-hidden rounded-l-[4px] rounded-r-lg bg-gradient-to-br from-brand-violet via-v2-primary to-[#4f2bc4] shadow-[0_22px_40px_rgb(10_16_26/0.3),0_2px_6px_rgb(10_16_26/0.2)]">
          <div className="absolute inset-y-0 left-0 w-4 bg-gradient-to-r from-black/30 via-black/10 to-transparent" />
          <div className="absolute inset-y-0 left-[14px] w-px bg-white/25" />
          <div className="absolute inset-x-4 top-4 bottom-[3.4rem] overflow-hidden rounded-md bg-white ring-1 ring-black/10 sm:inset-x-6 sm:top-5 sm:bottom-[3.75rem]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/marketing/boys-sheet.webp"
              srcSet={marketingSrcSet("/marketing/boys-sheet.webp", [240, 400, 800], 900)}
              sizes="(min-width: 640px) 112px, 80px"
              width={900}
              height={1200}
              alt=""
              loading="lazy"
              decoding="async"
              className="block h-full w-full object-cover object-top"
            />
          </div>
          <div className="absolute inset-x-4 bottom-2.5 sm:inset-x-6 sm:bottom-3.5">
            <p className="v2-wordmark truncate text-[12px] leading-tight text-white sm:text-[15px]">{title}</p>
            <p className="mt-0.5 truncate text-[7.5px] font-semibold uppercase tracking-[0.12em] text-white/70 sm:text-[9px]">
              Colorful Memories
            </p>
          </div>
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-white/25" />
        </div>
      </div>
    </div>
  );
}
