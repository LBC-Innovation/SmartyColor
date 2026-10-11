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
  BookOpen,
  ChevronLeft,
  LayoutPanelLeft,
  MessageSquareText,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { V2Modal } from "@/components/v2/ui/V2Modal";
import { V2BrandMark } from "@/components/v2/ui/V2BrandLogo";
import {
  readWelcomeGuideDismissed,
  writeWelcomeGuideDismissed,
} from "@/lib/v2/welcomeGuide";
import { cn } from "@/lib/cn";

type GuideContextValue = {
  open: () => void;
  /** Opens only if the user hasn't asked us not to. */
  openIfNotDismissed: () => void;
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
    icon: LayoutPanelLeft,
    title: "Welcome! Here's your workspace",
    body: (
      <>
        <p>
          <strong>Your Photos</strong> on the left is your library — every picture you add lives
          there. The <strong>Studio</strong> on the right shows the selected photo next to its
          coloring page. On a phone, tap a photo to open the studio.
        </p>
        <p className="mt-2">
          The <strong>project</strong> menu at the top of the library switches between albums or
          starts a new one.
        </p>
      </>
    ),
  },
  {
    icon: Upload,
    title: "Upload your photos",
    body: (
      <>
        <p>
          Tap <strong>Select Photos</strong> or the upload button in the library toolbar — or drag
          pictures straight in. iPhone HEIC files work fine.
        </p>
        <p className="mt-2">
          Clear, well-lit shots with one to three people come out best. Photos aren&apos;t kept on
          our servers.
        </p>
      </>
    ),
  },
  {
    icon: Sparkles,
    title: "Generate coloring sheets",
    body: (
      <>
        <p>
          Tap <strong>Generate sheet</strong> on any photo, or <strong>Generate all</strong> to do
          the whole library at once. Each one takes about a minute.
        </p>
      </>
    ),
    visual: <PhotoToSheet />,
  },
  {
    icon: MessageSquareText,
    title: "Make simple edits",
    body: (
      <>
        <p>
          Open a photo and tap <strong>Edit sheet</strong>. Type what you want changed —
          <em> “thicker lines”</em>, <em>“remove the car in the back”</em> — and it redraws.
        </p>
        <p className="mt-2">
          Every version is kept in the <strong>Revisions</strong> strip, so you can always go back.
        </p>
      </>
    ),
  },
  {
    icon: BookOpen,
    title: "Arrange and order a book",
    body: (
      <>
        <p>
          Tap <strong>Buy book</strong>. Pick which albums go in, then drag pages into order,
          rotate or remove any you don&apos;t want.
        </p>
        <p className="mt-2">
          Choose a <strong>stapled booklet</strong> or <strong>paperback</strong>, see the exact
          printing and shipping price, and place your order. Prefer to print at home?{" "}
          <strong>Print</strong> gives you a PDF.
        </p>
      </>
    ),
  },
];

export function V2WelcomeGuideProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const openIfNotDismissed = useCallback(() => {
    if (!readWelcomeGuideDismissed()) setIsOpen(true);
  }, []);

  const value = useMemo(() => ({ open, openIfNotDismissed }), [open, openIfNotDismissed]);

  return (
    <GuideContext.Provider value={value}>
      {children}
      {isOpen ? <WelcomeGuideModal onClose={() => setIsOpen(false)} /> : null}
    </GuideContext.Provider>
  );
}

function WelcomeGuideModal({ onClose }: { onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const [askingDismiss, setAskingDismiss] = useState(false);
  const step = STEPS[index];
  const last = index === STEPS.length - 1;
  const Icon = step.icon;

  function finish() {
    // Completing the tour counts as "seen" — don't nag next time.
    writeWelcomeGuideDismissed();
    onClose();
  }

  function dismissForever() {
    writeWelcomeGuideDismissed();
    onClose();
  }

  if (askingDismiss) {
    return (
      <V2Modal
        onClose={() => setAskingDismiss(false)}
        maxWidthClass="max-w-sm"
        title={<h2 className="text-lg font-semibold text-v2-ink">Show this guide next time?</h2>}
      >
        <div className="px-5 py-4 sm:px-6 sm:py-5">
          <p className="text-sm text-v2-muted">
            You can always reopen it from <strong className="text-v2-ink">Welcome guide</strong> in
            your account menu.
          </p>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button type="button" className="v2-btn-outline h-11" onClick={dismissForever}>
              No, don&apos;t show again
            </button>
            <button type="button" className="v2-btn-primary h-11" onClick={onClose}>
              Yes, remind me
            </button>
          </div>
        </div>
      </V2Modal>
    );
  }

  return (
    <V2Modal onClose={() => setAskingDismiss(true)} maxWidthClass="max-w-lg">
      <div className="relative px-5 pb-5 pt-5 sm:px-7 sm:pb-6 sm:pt-6">
        <button
          type="button"
          onClick={() => setAskingDismiss(true)}
          className="absolute right-3 top-3 rounded-full p-2 text-v2-muted transition hover:bg-v2-bg-subtle hover:text-v2-ink"
          aria-label="Close guide"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-3">
          {index === 0 ? (
            <V2BrandMark size={40} />
          ) : (
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-v2-primary-light text-v2-primary">
              <Icon className="h-5 w-5" aria-hidden />
            </span>
          )}
          <p className="text-xs font-semibold uppercase tracking-wider text-v2-muted tabular-nums">
            Step {index + 1} of {STEPS.length}
          </p>
        </div>

        <h2 className="v2-brand-title mt-4 pr-8 text-2xl text-v2-ink">{step.title}</h2>
        <div className="mt-3 text-sm leading-relaxed text-v2-navy sm:text-[15px]">{step.body}</div>
        {step.visual ? <div className="mt-4">{step.visual}</div> : null}

        <div className="mt-6 flex items-center justify-between gap-3 border-t border-gray-100 pt-4">
          <ol className="flex items-center gap-1.5" aria-label="Progress">
            {STEPS.map((s, i) => (
              <li
                key={s.title}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === index ? "w-5 bg-v2-primary" : "w-1.5 bg-gray-300",
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
                className="inline-flex h-11 items-center gap-1 rounded-full px-3 text-sm font-semibold text-v2-navy hover:bg-v2-bg-subtle"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden />
                Back
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setAskingDismiss(true)}
                className="inline-flex h-11 items-center rounded-full px-3 text-sm font-semibold text-v2-muted hover:bg-v2-bg-subtle"
              >
                Skip
              </button>
            )}
            <button
              type="button"
              onClick={() => (last ? finish() : setIndex((i) => i + 1))}
              className="v2-btn-primary h-11 px-5"
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
