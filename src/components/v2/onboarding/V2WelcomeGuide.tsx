"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  ArrowRight,
  ChevronLeft,
  Printer,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { V2Modal } from "@/components/v2/ui/V2Modal";
import { V2BrandMark } from "@/components/v2/ui/V2BrandLogo";
import { cn } from "@/lib/cn";

type GuideContextValue = {
  /** The guide only opens when the person asks for it (account menu, "How it works"). */
  open: () => void;
};

const GuideContext = createContext<GuideContextValue | null>(null);

export function useV2WelcomeGuide() {
  const ctx = useContext(GuideContext);
  if (!ctx) throw new Error("useV2WelcomeGuide must be used within V2WelcomeGuideProvider");
  return ctx;
}

type Step = {
  icon: typeof Upload;
  title: string;
  body: ReactNode;
  visual?: ReactNode;
};

const STEPS: Step[] = [
  {
    icon: Upload,
    title: "Add a photo",
    body: (
      <p>
        Tap <strong>Choose a photo</strong> and pick one from your phone or computer. Clear,
        well-lit photos of one to three people come out best.
      </p>
    ),
  },
  {
    icon: Sparkles,
    title: "Get your coloring page",
    body: (
      <>
        <p>We turn your photo into a coloring page in about a minute.</p>
        <p className="mt-2">
          Want a change? Tap <strong>Edit page</strong> and type it, like{" "}
          <em>&ldquo;thicker lines&rdquo;</em> or <em>&ldquo;remove the car&rdquo;</em>.
        </p>
      </>
    ),
    visual: <PhotoToSheet />,
  },
  {
    icon: Printer,
    title: "Print it or make a book",
    body: (
      <>
        <p>
          Print your page at home for free. Or tap <strong>Make a book</strong> to turn a
          collection of pages into a printed book.
        </p>
      </>
    ),
  },
];

export function V2WelcomeGuideProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  const value = useMemo(() => ({ open }), [open]);

  return (
    <GuideContext.Provider value={value}>
      {children}
      {isOpen ? <WelcomeGuideModal onClose={close} /> : null}
    </GuideContext.Provider>
  );
}

function WelcomeGuideModal({ onClose }: { onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const step = STEPS[index];
  const last = index === STEPS.length - 1;
  const Icon = step.icon;

  return (
    <V2Modal onClose={onClose} maxWidthClass="max-w-lg" ariaLabel="How it works">
      <div className="v2-modal-head relative px-5 pb-5 pt-5 sm:px-7 sm:pb-7 sm:pt-6">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-2 top-2 inline-flex h-11 w-11 items-center justify-center rounded-full text-v2-muted transition hover:bg-v2-bg-subtle hover:text-v2-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-primary"
          aria-label="Close guide"
        >
          <X className="h-6 w-6" aria-hidden />
        </button>

        <div className="flex items-center gap-3">
          {index === 0 ? (
            <V2BrandMark size={48} />
          ) : (
            <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-violet to-brand-blue text-white shadow-lg shadow-brand-violet/30">
              <Icon className="h-6 w-6" aria-hidden />
            </span>
          )}
          <p className="text-sm font-bold uppercase tracking-wider text-v2-primary tabular-nums">
            Step {index + 1} of {STEPS.length}
          </p>
        </div>

        <h2 className="v2-brand-title mt-4 pr-8 text-[1.75rem] leading-tight text-v2-ink">{step.title}</h2>
        <div className="mt-3 text-base leading-relaxed text-v2-navy">{step.body}</div>
        {step.visual ? <div className="mt-4">{step.visual}</div> : null}

        <div className="mt-6 flex items-center justify-between gap-3 border-t border-gray-100 pt-4">
          <ol className="flex items-center gap-1.5" aria-label="Progress">
            {STEPS.map((s, i) => (
              <li
                key={s.title}
                className={cn(
                  "h-2 rounded-full transition-all",
                  i === index ? "v2-modal-strip w-7" : "w-2 bg-gray-300",
                )}
                aria-current={i === index ? "step" : undefined}
              />
            ))}
          </ol>
          <div className="flex items-center gap-2">
            {index > 0 ? (
              <button
                type="button"
                onClick={() => setIndex((i) => i - 1)}
                className="inline-flex h-12 items-center gap-1 rounded-full px-4 text-base font-semibold text-v2-navy hover:bg-v2-primary-light focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-primary"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden />
                Back
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-12 items-center rounded-full px-4 text-base font-semibold text-v2-muted hover:bg-v2-primary-light focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-primary"
              >
                Skip
              </button>
            )}
            <button
              type="button"
              onClick={() => (last ? onClose() : setIndex((i) => i + 1))}
              className="v2-btn-primary"
            >
              {last ? "Start creating" : "Next"}
              {last ? null : <ArrowRight className="h-4 w-4" aria-hidden />}
            </button>
          </div>
        </div>
      </div>
    </V2Modal>
  );
}

/** Real example: a photo and the coloring page made from it. */
function PhotoToSheet() {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-xl bg-v2-bg-subtle p-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/marketing/hero-photo.webp"
        width={1200}
        height={900}
        alt="A family photo"
        className="aspect-[4/3] w-full rounded-lg object-cover"
      />
      <ArrowRight className="h-5 w-5 text-v2-primary" aria-hidden />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/marketing/hero-sheet.webp"
        width={1200}
        height={900}
        alt="The same photo as a coloring page"
        className="aspect-[4/3] w-full rounded-lg border border-gray-200 bg-white object-cover"
      />
    </div>
  );
}
