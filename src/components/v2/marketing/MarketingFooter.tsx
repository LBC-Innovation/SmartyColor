import Link from "next/link";
import { cn } from "@/lib/cn";
import { CONTACT_EMAIL, FOOTER, LANDING_PAGES } from "@/content/marketing";
import { STORY_MODE_PUBLIC } from "@/lib/auth/features";
import { AdOptOutButton } from "@/components/marketing/AdOptOutButton";

const FOOTER_LINK =
  "inline-flex min-h-11 min-w-11 items-center justify-center px-1 font-semibold text-v2-muted hover:text-v2-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-primary";

/** `stickyCta`: the page has a phone-only sticky button, so leave room for it below the links. */
export function MarketingFooter({ stickyCta = false }: { stickyCta?: boolean }) {
  return (
    <footer className={cn("border-t border-gray-200 bg-white py-6", stickyCta && "pb-28 lg:pb-6")}>
      <div className="v2-gutter-x mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 text-xs text-v2-muted lg:flex-row">
        <span>
          © {new Date().getFullYear()} {FOOTER.copyright}
        </span>
        {/* Two short rows so nothing wraps awkwardly at 375px: where to go, then the small print. */}
        <nav aria-label="Footer" className="flex flex-col items-center gap-0">
          <div className="flex flex-wrap items-center justify-center gap-x-3">
            {FOOTER.links
              .filter((link) => (!("feature" in link) || STORY_MODE_PUBLIC) && LANDING_PAGES[link.intent].ready)
              .map(({ href, label }) => (
                <Link key={href} href={href} className={FOOTER_LINK}>
                  {label}
                </Link>
              ))}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-3">
            {FOOTER.legal.map(({ href, label }) => (
              <Link key={href} href={href} className={FOOTER_LINK}>
                {label}
              </Link>
            ))}
            <a href={`mailto:${CONTACT_EMAIL}`} className={FOOTER_LINK}>
              {FOOTER.contact}
            </a>
            <Link href="/sign-in" className="inline-flex min-h-11 items-center px-1 font-semibold text-v2-link">
              {FOOTER.signIn}
            </Link>
          </div>
          <div className="flex justify-center">
            <AdOptOutButton className="inline-flex min-h-11 items-center text-center text-xs text-v2-muted hover:text-v2-ink" />
          </div>
        </nav>
      </div>
    </footer>
  );
}
