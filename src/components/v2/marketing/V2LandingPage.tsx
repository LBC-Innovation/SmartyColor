"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BookOpen,
  Check,
  Gift,
  ImageIcon,
  MessageSquareText,
  Printer,
  ShieldCheck,
  Sparkles,
  Truck,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { markGuestTryFree, STUDIO_PATH } from "@/lib/v2/guestSession";
import { V2MarketingHeader } from "@/components/v2/marketing/V2MarketingHeader";
import { cn } from "@/lib/cn";

const STEPS = [
  {
    icon: ImageIcon,
    title: "Upload a photo",
    body: "Any family picture from your phone — birthdays, the beach, the dog. HEIC works too.",
  },
  {
    icon: Sparkles,
    title: "Get a coloring page",
    body: "In about a minute it becomes clean black-and-white line art your kid can color.",
  },
  {
    icon: Printer,
    title: "Print or order a book",
    body: "Download a free PDF for your home printer, or turn your pages into a real stapled or paperback book, shipped to you.",
  },
] as const;

const PRODUCTS = [
  {
    icon: Printer,
    name: "Coloring pages",
    tagline: "Print at home",
    price: "Free to try",
    points: ["Letter-size PDF, ready to print", "Edit any page by typing a note", "No account needed"],
    cta: "Make a free page",
  },
  {
    icon: BookOpen,
    name: "Printed coloring book",
    tagline: "A real book of your family, shipped to your door",
    price: "See your price at checkout",
    points: [
      "Pages your kids recognize — their faces, their dog, their house",
      "Stapled booklet (up to 48 pages) or paperback (32+ pages)",
      "Exact price shown before you pay — no surprises",
    ],
    cta: "Start a book",
    note: "Free to build. Sign up and get a $5 credit toward it — you'll see the exact printing + shipping price before you pay.",
    featured: true,
  },
  {
    icon: MessageSquareText,
    name: "Story book",
    tagline: "Turn a trip into a story they can color",
    price: "Included with your pages",
    points: ["Turn an album into a story", "Captions you can edit", "Color it, read it, keep it"],
    cta: "Try story mode",
  },
] as const;

const USE_CASES = [
  "Grandparent gifts",
  "Birthday parties",
  "Rainy afternoons",
  "Road trips",
  "Classrooms",
  "Family reunions",
];

const FAQ = [
  {
    q: "Do I need an account?",
    a: "No. Tap Try it free and start making pages right away. Create a free account when you want to save projects across devices or order a printed book.",
  },
  {
    q: "What photos work best?",
    a: "Clear, well-lit photos with one to three people or a simple scene come out best. Busy backgrounds still work — you can ask for them to be simplified.",
  },
  {
    q: "Can I fix a drawing I don't love?",
    a: "Yes. Every page has a chat where you can type things like “make the lines thicker” or “remove the car in the back,” and it redraws the page.",
  },
  {
    q: "How much is a printed book?",
    a: "It depends on page count, binding and where it ships. You'll see the exact price — printing and shipping — before you pay.",
  },
  {
    q: "How long does a printed book take?",
    a: "Books are printed to order. Printing and shipping times are shown at checkout before you pay.",
  },
  {
    q: "What happens to my photos?",
    a: "When you're signed in, your photos and coloring pages are stored privately in your account so they're on every device you use. Delete an album or your account and they're gone. Trying it without an account? Nothing is uploaded — everything stays in your browser.",
  },
] as const;

export function V2LandingPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && user) router.replace(STUDIO_PATH);
  }, [user, loading, router]);

  function tryForFree() {
    markGuestTryFree();
    router.push(STUDIO_PATH);
  }

  if (loading) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-v2-bg text-v2-muted">
        Loading…
      </div>
    );
  }
  if (user) return null;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-v2-bg text-v2-ink">
      <V2MarketingHeader />

      <main className="flex-1 pb-24 lg:pb-0">
        {/* ---------------------------------------------------------- hero */}
        <section className="relative overflow-hidden" aria-labelledby="hero-title">
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-[36rem] bg-[radial-gradient(60%_50%_at_50%_0%,rgb(86_79_208/0.14),transparent_70%)]"
            aria-hidden
          />
          <div className="v2-gutter-x relative mx-auto grid w-full max-w-6xl gap-10 py-10 sm:py-14 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-14 lg:py-20">
            <div className="text-center lg:text-left">
              <p className="inline-flex items-center gap-2 rounded-full border border-v2-primary/20 bg-white px-3 py-1 text-xs font-bold text-v2-link shadow-sm">
                <Sparkles className="h-3.5 w-3.5" aria-hidden />
                Made from your own photos
              </p>
              <h1 id="hero-title" className="v2-brand-title mt-4 text-[2.5rem] leading-[1.05] text-v2-ink sm:text-5xl lg:text-6xl">
                Your photos.
                <br />
                <span className="bg-gradient-to-r from-v2-primary via-[#7c3aed] to-[#ec4899] bg-clip-text text-transparent">
                  Their coloring book.
                </span>
              </h1>
              <p className="mx-auto mt-5 max-w-lg text-base leading-relaxed text-v2-muted sm:text-lg lg:mx-0">
                Turn the photos already on your phone into coloring pages your kids will actually
                recognize. Print at home free, or order a real book.
              </p>

              <div className="mt-7 flex flex-col items-stretch gap-3 sm:flex-row sm:justify-center lg:justify-start">
                <button
                  type="button"
                  onClick={tryForFree}
                  className="v2-btn-primary h-13 whitespace-nowrap px-7 text-base shadow-[0_8px_24px_rgb(86_79_208/0.3)]"
                >
                  Try it free
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </button>
                <a
                  href="#how"
                  className="inline-flex h-11 items-center justify-center whitespace-nowrap text-sm font-bold text-v2-link underline-offset-4 hover:underline sm:h-13 sm:rounded-full sm:border sm:border-v2-primary/35 sm:bg-white sm:px-7 sm:text-base sm:no-underline sm:hover:bg-v2-primary-light"
                >
                  See how it works
                </a>
              </div>

              <ul className="mt-6 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-v2-muted lg:justify-start">
                {["No account to start", "First page in about a minute", "$5 credit when you sign up"].map(
                  (t) => (
                    <li key={t} className="inline-flex items-center gap-1.5">
                      <Check className="h-4 w-4 text-v2-success-text" strokeWidth={2.5} aria-hidden />
                      {t}
                    </li>
                  ),
                )}
              </ul>
            </div>

            <PhotoToPageDemo />
          </div>
        </section>

        {/* -------------------------------------------------- how it works */}
        <section id="how" className="scroll-mt-20 border-y border-gray-200 bg-white">
          <div className="v2-gutter-x mx-auto w-full max-w-6xl py-12 sm:py-16">
            <SectionHeading
              eyebrow="How it works"
              title="Three steps. No design skills."
              body="If you can send a photo, you can make a coloring book."
            />
            <ol className="mt-8 grid gap-4 sm:mt-10 md:grid-cols-3 md:gap-6">
              {STEPS.map(({ icon: Icon, title, body }, i) => (
                <li key={title} className="relative rounded-2xl border border-gray-200 bg-v2-bg p-5 sm:p-6">
                  <span className="absolute right-4 top-4 text-4xl font-bold leading-none text-v2-primary/15 tabular-nums">
                    {i + 1}
                  </span>
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-v2-primary-light text-v2-primary">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <h3 className="mt-4 text-lg font-semibold text-v2-ink">{title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-v2-muted">{body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* -------------------------------------------------- why families */}
        <section className="border-y border-gray-200 bg-white">
          <div className="v2-gutter-x mx-auto grid w-full max-w-6xl gap-10 py-12 sm:py-16 lg:grid-cols-2 lg:items-center">
            <div>
              <SectionHeading
                align="left"
                eyebrow="Why families love it"
                title="It's them on the page"
                body="Generic coloring books are fine. A page of your kid, your dog and your backyard is the one that ends up on the fridge."
              />
              <ul className="mt-7 space-y-4">
                {[
                  {
                    icon: MessageSquareText,
                    t: "Fix anything by typing",
                    b: "“Thicker lines.” “Take out the stroller.” It redraws the page.",
                  },
                  {
                    icon: Truck,
                    t: "Real books, real paper",
                    b: "Stapled booklets or paperbacks, printed in the US and shipped to you.",
                  },
                  {
                    icon: ShieldCheck,
                    t: "Your photos stay yours",
                    b: "Stored privately in your account, never shared. Delete an album and it's really gone.",
                  },
                ].map(({ icon: Icon, t, b }) => (
                  <li key={t} className="flex gap-3.5">
                    <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-v2-success-bg text-v2-success-text">
                      <Icon className="h-4.5 w-4.5" aria-hidden />
                    </span>
                    <span>
                      <span className="block font-semibold text-v2-ink">{t}</span>
                      <span className="block text-sm text-v2-muted">{b}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-v2-bg p-5 sm:p-6">
              <BeforeAfter
                className="mx-auto mb-6 max-w-sm"
                photoSrc="/marketing/boys-photo.webp"
                sheetSrc="/marketing/boys-sheet.webp"
                photoAlt="Three boys in a field, one holding a catfish they caught"
                sheetAlt="The same photo as a black-and-white coloring page"
                width={900}
                height={1200}
              />
              <p className="text-xs font-bold uppercase tracking-wider text-v2-muted">Perfect for</p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {USE_CASES.map((u) => (
                  <li
                    key={u}
                    className="rounded-full border border-gray-200 bg-white px-3.5 py-1.5 text-sm font-semibold text-v2-navy"
                  >
                    {u}
                  </li>
                ))}
              </ul>
              <div className="mt-6 rounded-xl bg-white p-4 shadow-sm">
                <p className="text-xs font-bold uppercase tracking-wider text-v2-muted">
                  Photos that come out best
                </p>
                <ul className="mt-2 space-y-1.5 text-sm text-v2-navy">
                  {[
                    "One to three people, facing the camera",
                    "Daylight or a bright room",
                    "A simple background — or ask to simplify it",
                  ].map((t) => (
                    <li key={t} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-v2-success-text" strokeWidth={2.5} aria-hidden />
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* -------------------------------------------------------- products */}
        <section className="v2-gutter-x mx-auto w-full max-w-6xl py-12 sm:py-16">
          <SectionHeading
            eyebrow="What you can make"
            title="From one page to a whole book"
            body="Start free. Pay only when you want something printed and shipped."
          />
          <div className="mt-8 grid gap-4 sm:mt-10 md:grid-cols-3 md:gap-5">
            {PRODUCTS.map(({ icon: Icon, name, tagline, price, points, cta, ...rest }) => {
              const featured = "featured" in rest && rest.featured;
              const note = "note" in rest ? rest.note : null;
              return (
                <article
                  key={name}
                  className={cn(
                    "relative flex flex-col rounded-2xl border bg-white p-5 sm:p-6",
                    featured
                      ? "border-v2-primary shadow-[0_12px_40px_rgb(86_79_208/0.18)] md:-my-2"
                      : "border-gray-200 shadow-sm",
                  )}
                >
                  {featured ? (
                    <span className="absolute -top-3 left-5 rounded-full bg-v2-primary px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
                      Best for gifts
                    </span>
                  ) : null}
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-v2-primary-light text-v2-primary">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <h3 className="mt-4 text-xl font-semibold text-v2-ink">{name}</h3>
                  <p className="text-sm text-v2-muted">{tagline}</p>
                  <p className="mt-3 text-sm font-semibold text-v2-link">{price}</p>
                  <ul className="mt-4 space-y-2 text-sm text-v2-navy">
                    {points.map((p) => (
                      <li key={p} className="flex items-start gap-2">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-v2-success-text" strokeWidth={2.5} aria-hidden />
                        {p}
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={tryForFree}
                    className={cn("mt-6 h-11 w-full", featured ? "v2-btn-primary" : "v2-btn-outline")}
                  >
                    {cta}
                  </button>
                  {note ? (
                    <p className="mt-2.5 text-center text-xs leading-snug text-v2-muted">{note}</p>
                  ) : null}
                </article>
              );
            })}
          </div>

          <ul className="mt-6 grid gap-2 rounded-2xl border border-gray-200 bg-white p-4 text-sm text-v2-navy sm:mt-8 sm:grid-cols-3 sm:gap-4 sm:p-5">
            {[
              { icon: ShieldCheck, t: "Exact price shown before you pay" },
              { icon: Truck, t: "Printed in the US and shipped to you" },
              { icon: ImageIcon, t: "Photos stay private to your account" },
            ].map(({ icon: Icon, t }) => (
              <li key={t} className="flex items-center gap-2.5">
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-v2-success-bg text-v2-success-text">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <span className="font-semibold">{t}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* ------------------------------------------------------------- faq */}
        <section className="v2-gutter-x mx-auto w-full max-w-3xl py-12 sm:py-16">
          <SectionHeading eyebrow="Questions" title="Good to know" />
          <div className="mt-8 divide-y divide-gray-200 rounded-2xl border border-gray-200 bg-white">
            {FAQ.map(({ q, a }) => (
              <details key={q} className="group px-5 py-4 open:bg-v2-bg/60">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-semibold text-v2-ink [&::-webkit-details-marker]:hidden">
                  {q}
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-v2-bg-subtle text-v2-muted transition group-open:rotate-45"
                    aria-hidden
                  >
                    +
                  </span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-v2-muted">{a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* ------------------------------------------------------- final cta */}
        <section className="v2-gutter-x mx-auto w-full max-w-6xl pb-12 sm:pb-16">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-v2-primary to-[#3f3aa6] px-6 py-10 text-center text-white sm:px-10 sm:py-14">
            <div className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-white/10 blur-2xl" aria-hidden />
            <h2 className="v2-brand-title text-3xl sm:text-4xl">Make your first page right now</h2>
            <p className="mx-auto mt-3 max-w-md text-sm text-white/80 sm:text-base">
              Pick a photo from your camera roll. You&apos;ll have a coloring page before the kettle boils.
            </p>
            <p className="mx-auto mt-3 inline-flex items-center gap-2 rounded-full bg-white/15 px-3.5 py-1.5 text-sm font-semibold text-white">
              <Gift className="h-4 w-4" aria-hidden />
              Sign up free and get a $5 credit toward your first book
            </p>
            <div className="mt-7 flex flex-col items-center gap-3">
              <button
                type="button"
                onClick={tryForFree}
                className="inline-flex h-13 items-center justify-center gap-2 rounded-full bg-white px-8 text-base font-bold text-v2-primary shadow-lg transition hover:bg-v2-primary-light"
              >
                Try it free
                <ArrowRight className="h-4 w-4" aria-hidden />
              </button>
              <Link href="/sign-in" className="text-sm font-semibold text-white/85 underline-offset-4 hover:underline">
                Already have an account? Sign in
              </Link>
            </div>
          </div>
        </section>
      </main>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: FAQ.map(({ q, a }) => ({
              "@type": "Question",
              name: q,
              acceptedAnswer: { "@type": "Answer", text: a },
            })),
          }),
        }}
      />

      <footer className="border-t border-gray-200 bg-white py-6">
        <div className="v2-gutter-x mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-2 text-xs text-v2-muted sm:flex-row">
          <span>© {new Date().getFullYear()} ColorfulMemories · LBC Innovation</span>
          <span className="flex items-center gap-4">
            <Link href="/terms" className="font-semibold text-v2-muted hover:text-v2-ink">
              Terms &amp; privacy
            </Link>
            <Link href="/sign-in" className="font-semibold text-v2-link">
              Already have an account? Sign in
            </Link>
          </span>
        </div>
      </footer>

      {/* Phone-only sticky CTA */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur lg:hidden">
        <button type="button" onClick={tryForFree} className="v2-btn-primary h-12 w-full text-base">
          Try it free — no account
          <ArrowRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  body,
  align = "center",
}: {
  eyebrow: string;
  title: string;
  body?: string;
  align?: "center" | "left";
}) {
  return (
    <div className={cn(align === "center" && "text-center")}>
      <p className="text-xs font-bold uppercase tracking-wider text-v2-primary">{eyebrow}</p>
      <h2 className="v2-brand-title mt-2 text-3xl text-v2-ink sm:text-4xl">{title}</h2>
      {body ? (
        <p className={cn("mt-3 max-w-xl text-sm text-v2-muted sm:text-base", align === "center" && "mx-auto")}>
          {body}
        </p>
      ) : null}
    </div>
  );
}

type BeforeAfterProps = {
  photoSrc: string;
  sheetSrc: string;
  photoAlt: string;
  sheetAlt: string;
  /** Intrinsic size of both images (same aspect). */
  width: number;
  height: number;
  eager?: boolean;
  className?: string;
};

/** A real family photo beside the coloring page ColorfulMemories made from it. */
function BeforeAfter({ photoSrc, sheetSrc, photoAlt, sheetAlt, width, height, eager, className }: BeforeAfterProps) {
  const aspect = `${width}/${height}`;
  return (
    <div className={cn("grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-3", className)}>
      <figure className="rotate-[-3deg] overflow-hidden rounded-2xl border-4 border-white bg-white shadow-[0_16px_40px_rgb(10_16_26/0.16)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photoSrc}
          width={width}
          height={height}
          alt={photoAlt}
          style={{ aspectRatio: aspect }}
          className="block w-full object-cover"
          loading={eager ? "eager" : "lazy"}
          fetchPriority={eager ? "high" : "auto"}
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
          width={width}
          height={height}
          alt={sheetAlt}
          style={{ aspectRatio: aspect }}
          className="block w-full object-cover"
          loading={eager ? "eager" : "lazy"}
          fetchPriority={eager ? "high" : "auto"}
        />
        <figcaption className="px-3 py-2 text-center text-xs font-semibold text-v2-link">Coloring page</figcaption>
      </figure>
    </div>
  );
}

/** Hero showcase: photo → coloring page (stacked) → a printed book. */
function PhotoToPageDemo() {
  return (
    <div className="relative mx-auto w-full max-w-md lg:max-w-none">
      <div className="flex items-center justify-center">
        {/* photo with the coloring page laid over it — the hero of the hero */}
        <figure className="relative z-0 w-[15rem] shrink-0 sm:w-[23rem] lg:w-[27rem]">
          <div className="relative aspect-[5/4] w-full">
          <div className="absolute left-0 top-0 aspect-[4/3] w-[76%] rotate-[-5deg] overflow-hidden rounded-xl border-4 border-white bg-white shadow-[0_12px_30px_rgb(10_16_26/0.18)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/marketing/hero-photo.webp"
              width={1200}
              height={900}
              alt="A family of four smiling on a balcony above the beach"
              className="block h-full w-full object-cover"
              fetchPriority="high"
            />
          </div>
          <div className="absolute bottom-0 right-0 aspect-[4/3] w-[76%] rotate-[4deg] overflow-hidden rounded-xl border-4 border-white bg-white shadow-[0_16px_36px_rgb(10_16_26/0.22)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/marketing/hero-sheet.webp"
              width={1200}
              height={900}
              alt="The same photo as a black-and-white coloring page"
              className="block h-full w-full object-cover"
              fetchPriority="high"
            />
          </div>
          </div>
          <figcaption className="mt-3 text-center text-xs font-semibold text-v2-muted">
            Photo → coloring page
          </figcaption>
        </figure>

        <span className="relative z-20 -mr-4 -ml-6 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-v2-primary text-white shadow-md ring-4 ring-v2-bg sm:-mx-5 sm:h-10 sm:w-10" aria-hidden>
          <ArrowRight className="h-4 w-4" />
        </span>

        {/* the printed book — tucks under the stack's edge */}
        <figure className="relative z-10 -ml-7 shrink-0 sm:-ml-3">
          <PrintedBook />
          <figcaption className="mt-3 text-center text-xs font-semibold text-v2-link">
            Your printed book
          </figcaption>
        </figure>
      </div>
      <p className="mt-5 text-center text-xs text-v2-muted">
        Real pages made in the studio. Type a note like{" "}
        <span className="font-semibold text-v2-ink">“thicker lines”</span> and it redraws.
      </p>
    </div>
  );
}

/** CSS-only hardcover-style book with a real coloring page on the cover. */
function PrintedBook() {
  return (
    <div className="relative [perspective:1100px]" aria-hidden>
      <div className="relative mr-2 aspect-[3/4] w-[7rem] [transform:rotateY(-20deg)_rotateX(3deg)] [transform-style:preserve-3d] sm:w-[10rem]">
        {/* page block */}
        <div className="absolute inset-y-[4px] left-[8px] right-[-9px] rounded-r-md bg-[repeating-linear-gradient(to_right,#ffffff_0,#ffffff_1.5px,#d9dce3_1.5px,#d9dce3_2.5px)] shadow-[inset_-2px_0_3px_rgb(0_0_0/0.15)] [transform:translateZ(-8px)]" />
        <div className="absolute inset-x-[8px] bottom-[-7px] h-[8px] rounded-b-md bg-[repeating-linear-gradient(to_bottom,#ffffff_0,#ffffff_1.5px,#d9dce3_1.5px,#d9dce3_2.5px)] [transform:translateZ(-8px)]" />
        {/* cover */}
        <div className="absolute inset-0 overflow-hidden rounded-l-[4px] rounded-r-lg bg-gradient-to-br from-[#6d66f0] via-v2-primary to-[#3f3aa6] shadow-[0_22px_40px_rgb(10_16_26/0.3),0_2px_6px_rgb(10_16_26/0.2)]">
          <div className="absolute inset-y-0 left-0 w-4 bg-gradient-to-r from-black/30 via-black/10 to-transparent" />
          <div className="absolute inset-y-0 left-[14px] w-px bg-white/25" />
          <div className="absolute inset-x-4 top-4 bottom-[3.4rem] overflow-hidden rounded-md bg-white ring-1 ring-black/10 sm:inset-x-6 sm:top-5 sm:bottom-[3.75rem]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/marketing/boys-sheet.webp"
              width={900}
              height={1200}
              alt=""
              className="block h-full w-full object-cover object-top"
              fetchPriority="high"
            />
          </div>
          <div className="absolute inset-x-4 bottom-2.5 sm:inset-x-6 sm:bottom-3.5">
            <p className="v2-wordmark truncate text-[12px] leading-tight text-white sm:text-[15px]">
              Beach Days
            </p>
            <p className="mt-0.5 truncate text-[7.5px] font-semibold uppercase tracking-[0.12em] text-white/70 sm:text-[9px]">
              ColorfulMemories
            </p>
          </div>
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-white/25" />
        </div>
      </div>
    </div>
  );
}
