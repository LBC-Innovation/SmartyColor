"use client";

import type { ComponentType, ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  BookOpen,
  ChevronDown,
  Search,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { V2ProgressStepper } from "@/components/v2/V2ProgressStepper";
import { V2ProjectsPanel } from "@/components/v2/V2ProjectsPanel";
import {
  isV2NavItemActive,
  v2BottomNav,
  v2TopNav,
} from "@/components/v2/nav-config";

function BrandBlock({ compact }: { compact?: boolean }) {
  return (
    <div className={cn("flex items-start gap-2.5", compact && "min-w-0 flex-1")}>
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-v2-primary-light text-v2-primary">
        <BookOpen className="h-5 w-5" aria-hidden strokeWidth={2.25} />
      </span>
      <div className="min-w-0">
        <p className="v2-brand-title truncate text-lg text-v2-ink sm:text-xl">
          ColorfulMoments
        </p>
        <p className="text-xs leading-snug text-v2-muted sm:text-sm">
          Turn your family photos into coloring memories
        </p>
      </div>
    </div>
  );
}

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

function UserAvatar() {
  return (
    <button
      type="button"
      className="flex items-center gap-1.5 rounded-full p-0.5 transition hover:bg-v2-bg-subtle"
      aria-label="Account menu (coming soon)"
    >
      <span className="relative h-9 w-9 overflow-hidden rounded-full bg-gradient-to-br from-v2-primary-light to-v2-primary/30 ring-2 ring-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 80'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop stop-color='%23c4b5fd'/%3E%3Cstop offset='1' stop-color='%2399f6e4'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect fill='url(%23g)' width='80' height='80'/%3E%3Ccircle cx='40' cy='32' r='14' fill='%23fff' fill-opacity='.85'/%3E%3Cellipse cx='40' cy='68' rx='22' ry='16' fill='%23fff' fill-opacity='.85'/%3E%3C/svg%3E"
          alt=""
          className="h-full w-full object-cover"
        />
      </span>
      <ChevronDown className="hidden h-4 w-4 text-v2-muted sm:block" aria-hidden />
    </button>
  );
}

export function V2TopBar() {
  const pathname = usePathname();

  return (
    <header className="shrink-0 border-b border-gray-200 bg-white">
      <div className="v2-gutter-x flex w-full items-center justify-between gap-4 py-3.5">
        <Link href="/" className="min-w-0 rounded-lg outline-offset-2">
          <BrandBlock />
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
          <button
            type="button"
            className="hidden rounded-full p-2 text-v2-muted hover:bg-v2-bg-subtle hover:text-v2-ink sm:inline-flex"
            aria-label="Search (coming soon)"
          >
            <Search className="h-5 w-5" />
          </button>
          <button
            type="button"
            className="relative hidden rounded-full p-2 text-v2-muted hover:bg-v2-bg-subtle hover:text-v2-ink sm:inline-flex"
            aria-label="Notifications (coming soon)"
          >
            <Bell className="h-5 w-5" />
            <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-v2-primary ring-2 ring-white" />
          </button>
          <UserAvatar />
        </div>
      </div>
    </header>
  );
}

type V2SidebarProps = {
  photosCount?: number;
  hasSheet?: boolean;
  onDownloadPrint?: () => void;
  downloadPrintDisabled?: boolean;
  downloadingPrint?: boolean;
  showProgress?: boolean;
  /** Replace default coloring projects panel (e.g. story albums). */
  projectsPanel?: ReactNode;
};

export function V2Sidebar({
  photosCount = 0,
  hasSheet = false,
  onDownloadPrint,
  downloadPrintDisabled,
  downloadingPrint,
  showProgress = true,
  projectsPanel,
}: V2SidebarProps) {
  return (
    <aside className="hidden h-full min-h-0 w-52 shrink-0 flex-col border-r border-gray-200 bg-white lg:flex xl:w-56">
      <nav
        className="v2-gutter-pl flex min-h-0 flex-1 flex-col overflow-hidden py-3 pr-3"
        aria-label="Projects"
      >
        {projectsPanel ?? <V2ProjectsPanel />}
      </nav>

      {showProgress && onDownloadPrint ? (
        <div
          className="v2-gutter-pl shrink-0 border-t border-gray-200 bg-v2-bg-subtle py-3 pr-3"
          aria-label="Progress"
        >
          <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-wider text-v2-muted">
            Your progress
          </p>
          <V2ProgressStepper
            compact
            photosCount={photosCount}
            hasSheet={hasSheet}
            onDownloadPrint={onDownloadPrint}
            downloadPrintDisabled={downloadPrintDisabled}
            downloadingPrint={downloadingPrint}
          />
        </div>
      ) : null}
    </aside>
  );
}

export function V2BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden"
      aria-label="Mobile"
    >
      <ul className="grid grid-cols-5">
        {v2BottomNav.map((item) => {
          const active = isV2NavItemActive(pathname, item);
          const className = cn(
            "flex w-full flex-col items-center gap-0.5 px-1 py-2 text-[10px] font-medium",
            active ? "text-v2-link" : "text-v2-muted",
          );
          return (
            <li key={item.id}>
              {item.href ? (
                <Link
                  href={item.href}
                  className={className}
                  aria-current={active ? "page" : undefined}
                >
                  <item.icon className="h-5 w-5" aria-hidden />
                  <span className="truncate">{item.label}</span>
                  {active ? (
                    <span className="mt-0.5 h-0.5 w-8 rounded-full bg-v2-link" />
                  ) : (
                    <span className="mt-0.5 h-0.5 w-8" />
                  )}
                </Link>
              ) : (
                <button type="button" className={className} disabled title="Coming soon">
                  <item.icon className="h-5 w-5" aria-hidden />
                  <span className="truncate">{item.label}</span>
                  <span className="mt-0.5 h-0.5 w-8" />
                </button>
              )}
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
};

export function V2StudioFrame({ sidebar, children }: V2StudioFrameProps) {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <V2TopBar />
      <div className="flex min-h-0 w-full flex-1 overflow-hidden">
        {sidebar}
        {children}
      </div>
      <V2BottomNav />
    </div>
  );
}
