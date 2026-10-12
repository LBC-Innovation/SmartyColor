"use client";

import type { ComponentType, ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { V2UserMenu } from "@/components/v2/auth/V2UserMenu";
import { useAuth } from "@/context/AuthContext";
import { formatCredits } from "@/lib/credits/money";
import { CircleDollarSign } from "lucide-react";
import { V2BrandLogo } from "@/components/v2/ui/V2BrandLogo";
import {
  isV2NavItemActive,
  STUDIO_HOME,
  v2BottomNav,
  v2TopNav,
} from "@/components/v2/nav-config";

function NavButton({
  label,
  icon: Icon,
  active,
  href,
  className,
}: {
  label: string;
  icon: ComponentType<{ className?: string }>;
  active?: boolean;
  href?: string;
  className?: string;
}) {
  const classNames = cn(
    "inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold transition-colors",
    active
      ? "text-v2-link"
      : "text-v2-navy hover:bg-v2-bg-subtle hover:text-v2-ink",
    className,
  );

  if (href) {
    return (
      <Link
        href={href}
        className={classNames}
        aria-current={active ? "page" : undefined}
      >
        <Icon className="h-4 w-4 shrink-0" aria-hidden />
        <span>{label}</span>
      </Link>
    );
  }

  return (
    <button
      type="button"
      className={classNames}
      aria-current={active ? "page" : undefined}
      disabled
      title="Coming soon"
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      <span>{label}</span>
    </button>
  );
}

function CreditsChip() {
  const { user, loading } = useAuth();
  if (loading || !user) return null;
  const label = formatCredits(user.creditsBalanceCents, { compact: true });
  return (
    <Link
      href="/account"
      className="v2-hit inline-flex max-w-[9rem] items-center gap-1.5 rounded-full border border-v2-success-border bg-v2-success-bg px-2 py-0.5 text-xs font-semibold text-v2-success-text transition hover:border-emerald-400 sm:px-2.5 sm:py-1"
      title={`Credit balance ${formatCredits(user.creditsBalanceCents)} — tap to add credit or view transactions`}
    >
      <CircleDollarSign className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="truncate tabular-nums">{label}</span>
    </Link>
  );
}

export function V2TopBar() {
  const pathname = usePathname();

  return (
    <header className="shrink-0 border-b border-gray-200 bg-white">
      <div className="v2-gutter-x flex w-full items-center justify-between gap-4 py-2.5 sm:py-3.5">
        <Link href="/studio" className="min-w-0 rounded-lg outline-offset-2">
          <V2BrandLogo />
        </Link>

        <nav
          className="hidden items-center gap-1 lg:flex"
          aria-label="Primary"
        >
          {v2TopNav.map((item) => {
            const active = isV2NavItemActive(pathname, item);
            return (
              <div key={item.id} className="relative pb-1">
                <NavButton
                  label={item.label}
                  icon={item.icon}
                  active={active}
                  href={item.href}
                />
                {active ? (
                  <span className="absolute inset-x-3 -bottom-0.5 h-0.5 rounded-full bg-v2-link" />
                ) : null}
              </div>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <CreditsChip />
          <V2UserMenu />
        </div>
      </div>
    </header>
  );
}

export function V2BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      aria-label="Mobile"
    >
      <ul className="grid grid-cols-3">
        {v2BottomNav.map((item) => {
          const active = isV2NavItemActive(pathname, item);
          return (
            <li key={item.id}>
              <Link
                href={item.href ?? STUDIO_HOME}
                className={cn(
                  "flex h-14 w-full flex-col items-center justify-center gap-1 px-1 text-[11px] font-semibold",
                  active ? "text-v2-link" : "text-v2-muted",
                )}
                aria-current={active ? "page" : undefined}
              >
                <span
                  className={cn(
                    "flex h-7 w-12 items-center justify-center rounded-full transition-colors",
                    active && "bg-v2-primary-light",
                  )}
                >
                  <item.icon className="h-5 w-5" aria-hidden />
                </span>
                <span className="truncate">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

type V2StudioFrameProps = {
  sidebar?: ReactNode;
  children: ReactNode;
  /** Focused flows (checkout) own the bottom of the screen. */
  hideBottomNav?: boolean;
};

export function V2StudioFrame({ sidebar, children, hideBottomNav }: V2StudioFrameProps) {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <V2TopBar />
      <div className="flex min-h-0 w-full flex-1 overflow-hidden">
        {sidebar}
        {children}
      </div>
      {hideBottomNav ? null : <V2BottomNav />}
    </div>
  );
}
