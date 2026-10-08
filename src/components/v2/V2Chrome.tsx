"use client";

import type { ComponentType } from "react";
import {
  Bell,
  ChevronDown,
  Heart,
  Search,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { V2ProgressStepper } from "@/components/v2/V2ProgressStepper";
import { v2BottomNav, v2SideNav, v2TopNav } from "@/components/v2/nav-config";

function BrandBlock({ compact }: { compact?: boolean }) {
  return (
    <div className={cn("flex items-start gap-2.5", compact && "min-w-0 flex-1")}>
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-100">
        <Heart className="h-5 w-5 fill-rose-500 text-rose-500" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="truncate text-lg font-bold tracking-tight text-slate-900 sm:text-xl">
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
  className,
}: {
  label: string;
  icon: ComponentType<{ className?: string }>;
  active?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "text-v2-primary"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
        className,
      )}
      aria-current={active ? "page" : undefined}
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
      className="flex items-center gap-1.5 rounded-full p-0.5 transition hover:bg-slate-100"
      aria-label="Account menu (coming soon)"
    >
      <span className="relative h-9 w-9 overflow-hidden rounded-full bg-gradient-to-br from-indigo-200 to-violet-300 ring-2 ring-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 80'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop stop-color='%23c4b5fd'/%3E%3Cstop offset='1' stop-color='%2399f6e4'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect fill='url(%23g)' width='80' height='80'/%3E%3Ccircle cx='40' cy='32' r='14' fill='%23fff' fill-opacity='.85'/%3E%3Cellipse cx='40' cy='68' rx='22' ry='16' fill='%23fff' fill-opacity='.85'/%3E%3C/svg%3E"
          alt=""
          className="h-full w-full object-cover"
        />
      </span>
      <ChevronDown className="hidden h-4 w-4 text-slate-500 sm:block" aria-hidden />
    </button>
  );
}

export function V2TopBar() {
  return (
    <header className="shrink-0 border-b border-slate-200/80 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <div className="flex w-full items-center justify-between gap-4 px-5 py-3.5 sm:px-8 xl:px-10 2xl:px-12">
        <BrandBlock />

        <nav
          className="hidden items-center gap-1 lg:flex"
          aria-label="Primary"
        >
          {v2TopNav.map((item) => (
            <div key={item.id} className="relative pb-1">
              <NavButton
                label={item.label}
                icon={item.icon}
                active={item.active}
              />
              {item.active ? (
                <span className="absolute inset-x-2 -bottom-0.5 h-0.5 rounded-full bg-v2-primary" />
              ) : null}
            </div>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <button
            type="button"
            className="hidden rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 sm:inline-flex"
            aria-label="Search (coming soon)"
          >
            <Search className="h-5 w-5" />
          </button>
          <button
            type="button"
            className="relative hidden rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 sm:inline-flex"
            aria-label="Notifications (coming soon)"
          >
            <Bell className="h-5 w-5" />
            <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white" />
          </button>
          <UserAvatar />
        </div>
      </div>
    </header>
  );
}

type V2SidebarProps = {
  photosCount: number;
  hasSheet: boolean;
  onDownloadPrint: () => void;
  downloadPrintDisabled?: boolean;
  downloadingPrint?: boolean;
};

export function V2Sidebar({
  photosCount,
  hasSheet,
  onDownloadPrint,
  downloadPrintDisabled,
  downloadingPrint,
}: V2SidebarProps) {
  return (
    <aside className="hidden h-full min-h-0 w-48 shrink-0 flex-col border-r border-slate-200/80 bg-white/90 lg:flex">
      <nav
        className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-3"
        aria-label="Studio"
      >
        {v2SideNav.map((item) => (
          <button
            key={item.id}
            type="button"
            className={cn(
              "flex items-center gap-2 rounded-lg px-2 py-2 text-left text-[13px] font-medium leading-snug transition-colors",
              item.active
                ? "bg-indigo-50 text-v2-primary"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
            )}
          >
            <item.icon className="h-4 w-4 shrink-0" aria-hidden />
            <span className="min-w-0 truncate">{item.label}</span>
          </button>
        ))}
      </nav>

      <div
        className="shrink-0 border-t border-slate-200/80 bg-slate-50/50 px-2 py-3"
        aria-label="Progress"
      >
        <p className="mb-2.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-v2-muted">
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
    </aside>
  );
}

export function V2BottomNav() {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden"
      aria-label="Mobile"
    >
      <ul className="grid grid-cols-5">
        {v2BottomNav.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className={cn(
                "flex w-full flex-col items-center gap-0.5 px-1 py-2 text-[10px] font-medium",
                item.active ? "text-v2-primary" : "text-slate-500",
              )}
            >
              <item.icon className="h-5 w-5" aria-hidden />
              <span className="truncate">{item.label}</span>
              {item.active ? (
                <span className="mt-0.5 h-0.5 w-8 rounded-full bg-v2-primary" />
              ) : (
                <span className="mt-0.5 h-0.5 w-8" />
              )}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
