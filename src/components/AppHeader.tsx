"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AuthStatus } from "@/components/AuthStatus";
import { PrintSettings } from "@/components/PrintSettings";
import { SmartyAvatar } from "@/components/SmartyAvatar";
import type { PrintPrefs } from "@/lib/print/settings";

type AppHeaderProps = {
  printPrefs?: PrintPrefs;
  onPrintPrefsChange?: (next: PrintPrefs) => void;
};

export function AppHeader({ printPrefs, onPrintPrefsChange }: AppHeaderProps) {
  const pathname = usePathname();
  const showNewIdea = pathname !== "/";

  return (
    <header className="flex flex-wrap items-center gap-2 lg:gap-3">
      <Link
        href="/"
        className="inline-flex shrink-0 items-center gap-2 rounded-2xl lg:gap-2.5"
      >
        <SmartyAvatar variant="header" priority />
        <span className="flex h-8 items-center font-brand text-xl leading-none tracking-wide text-ink lg:h-10 lg:text-[1.75rem]">
          SmartyColor
        </span>
      </Link>

      <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5 lg:gap-2">
        {showNewIdea ?
          <Link
            href="/"
            className="inline-flex min-h-9 items-center rounded-full border-2 border-ink bg-paper px-3 font-display text-xs font-semibold text-ink hover:bg-sky lg:min-h-11 lg:px-4 lg:text-sm"
          >
            New idea
          </Link>
        : null}
        {printPrefs && onPrintPrefsChange ?
          <PrintSettings
            value={printPrefs}
            onChange={onPrintPrefsChange}
            variant="header"
          />
        : null}
        <AuthStatus />
      </div>
    </header>
  );
}
