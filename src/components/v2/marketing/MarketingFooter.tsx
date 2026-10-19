import Link from "next/link";
import { cn } from "@/lib/cn";
import { FOOTER } from "@/content/marketing";
import { AdOptOutButton } from "@/components/marketing/AdOptOutButton";

/** `stickyCta`: the page has a phone-only sticky button, so leave room for it below the links. */
export function MarketingFooter({ stickyCta = false }: { stickyCta?: boolean }) {
  return (
    <footer className={cn("border-t border-gray-200 bg-white py-6", stickyCta && "pb-28 lg:pb-6")}>
      <div className="v2-gutter-x mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 text-xs text-v2-muted lg:flex-row">
        <span>
          © {new Date().getFullYear()} {FOOTER.copyright}
        </span>
        <nav aria-label="Footer" className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
          {FOOTER.links.map(({ href, label }) => (
            <Link key={href} href={href} className="font-semibold text-v2-muted hover:text-v2-ink">
              {label}
            </Link>
          ))}
          <AdOptOutButton className="text-xs text-v2-muted hover:text-v2-ink" />
          <Link href="/sign-in" className="font-semibold text-v2-link">
            {FOOTER.signIn}
          </Link>
        </nav>
      </div>
    </footer>
  );
}
