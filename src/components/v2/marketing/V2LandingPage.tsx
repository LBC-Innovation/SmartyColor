"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  ImageIcon,
  Palette,
  Sparkles,
  Wand2,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { markGuestTryFree, STUDIO_PATH } from "@/lib/v2/guestSession";
import { V2MarketingHeader } from "@/components/v2/marketing/V2MarketingHeader";

const FEATURES = [
  {
    icon: ImageIcon,
    title: "Start from your photos",
    body: "Upload family pictures and turn them into printable coloring sheets in minutes.",
  },
  {
    icon: Wand2,
    title: "Refine with AI",
    body: "Adjust line weight, fix details, and regenerate until the sheet feels just right.",
  },
  {
    icon: BookOpen,
    title: "Storybook albums",
    body: "Order photos into a trip narrative and export a story your kids can color and keep.",
  },
  {
    icon: Palette,
    title: "Print-ready exports",
    body: "Download PDFs sized for home printers — no design skills required.",
  },
] as const;

export function V2LandingPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && user) {
      router.replace(STUDIO_PATH);
    }
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

  if (user) {
    return null;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-v2-bg text-v2-ink">
      <V2MarketingHeader />

      <main className="flex-1">
        <section className="v2-gutter-x mx-auto w-full max-w-6xl px-0 py-12 sm:py-16 lg:py-20">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-center lg:gap-14">
            <div>
              <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-v2-primary-light px-3 py-1 text-xs font-bold uppercase tracking-wide text-v2-link">
                <Sparkles className="h-3.5 w-3.5" aria-hidden />
                Family coloring, reimagined
              </p>
              <h1 className="v2-brand-title text-4xl leading-tight text-v2-ink sm:text-5xl lg:text-[3.25rem]">
                Turn memories into coloring adventures
              </h1>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-v2-muted sm:text-lg">
                ColorfulMoments helps you transform real photos into custom coloring pages
                and storybooks — perfect for rainy days, gifts, and creative time together.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                <button type="button" onClick={tryForFree} className="v2-btn-primary px-6 py-3 text-base">
                  Try it for free
                </button>
                <Link href="/sign-up" className="v2-btn-primary px-6 py-3 text-center text-base">
                  Sign up
                </Link>
                <Link href="/sign-in" className="v2-btn-outline px-6 py-3 text-center text-base">
                  Sign in
                </Link>
              </div>
              <p className="mt-4 text-sm text-v2-muted">
                No account needed to try the studio. Create an account to save projects in the
                cloud and order print books later.
              </p>
            </div>

            <div className="v2-panel relative overflow-hidden p-6 sm:p-8">
              <div
                className="pointer-events-none absolute -right-8 -top-8 h-40 w-40 rounded-full bg-v2-primary/15 blur-2xl"
                aria-hidden
              />
              <div
                className="pointer-events-none absolute -bottom-10 -left-6 h-36 w-36 rounded-full bg-emerald-200/40 blur-2xl"
                aria-hidden
              />
              <h2 className="text-sm font-bold uppercase tracking-wide text-v2-muted">
                How it works
              </h2>
              <ol className="mt-4 space-y-4">
                {["Upload photos", "Generate coloring sheets", "Build your story", "Print or share"].map(
                  (step, i) => (
                    <li key={step} className="flex items-start gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-v2-primary text-sm font-bold text-white">
                        {i + 1}
                      </span>
                      <span className="pt-1 text-base font-semibold text-v2-navy">{step}</span>
                    </li>
                  ),
                )}
              </ol>
            </div>
          </div>
        </section>

        <section className="border-t border-gray-200 bg-white py-12 sm:py-16">
          <div className="v2-gutter-x mx-auto w-full max-w-6xl">
            <h2 className="v2-brand-title text-center text-2xl text-v2-ink sm:text-3xl">
              Built for busy families
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-center text-sm text-v2-muted sm:text-base">
              Everything runs in your browser — upload, edit, and export without installing
              another app.
            </p>
            <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {FEATURES.map(({ icon: Icon, title, body }) => (
                <li key={title} className="v2-panel p-5">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-v2-primary-light text-v2-primary">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <h3 className="mt-3 text-base font-bold text-v2-ink">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-v2-muted">{body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="v2-gutter-x mx-auto w-full max-w-6xl py-12 sm:py-16">
          <div className="v2-panel flex flex-col items-center gap-6 px-6 py-10 text-center sm:px-10">
            <h2 className="v2-brand-title text-2xl text-v2-ink sm:text-3xl">
              Ready to color your first memory?
            </h2>
            <p className="max-w-lg text-sm text-v2-muted sm:text-base">
              Jump into the studio with one click, or sign up to keep projects synced across
              devices.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <button type="button" onClick={tryForFree} className="v2-btn-primary px-8 py-3">
                Try it for free
              </button>
              <Link href="/sign-up" className="v2-btn-outline px-8 py-3">
                Create free account
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-gray-200 py-6 text-center text-xs text-v2-muted">
        © {new Date().getFullYear()} ColorfulMoments · LBC Innovation
      </footer>
    </div>
  );
}
