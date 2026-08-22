"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AuthStatus } from "@/components/AuthStatus";
import { PrintSettings } from "@/components/PrintSettings";
import type { PrintPrefs } from "@/lib/print/settings";

type AppHeaderProps = {
  printPrefs?: PrintPrefs;
  onPrintPrefsChange?: (next: PrintPrefs) => void;
};

export function AppHeader({
  printPrefs,
  onPrintPrefsChange,
}: AppHeaderProps) {
  const pathname = usePathname();
  const showNewIdea = pathname !== "/";

  return (
    <header className="flex flex-wrap items-center gap-2 lg:gap-3">
      <Link href="/" className="flex shrink-0 items-center gap-2 rounded-2xl lg:gap-2.5">
        <span
          className="grid size-8 place-items-center rounded-xl border-[3px] border-ink bg-crayon-coral font-display text-base font-bold text-white lg:size-10 lg:rounded-2xl lg:text-lg"
          aria-hidden
        >
          S
        </span>
        <span className="font-brand text-xl tracking-wide text-ink lg:text-[1.75rem]">
          SmartyColor
        </span>
      </Link>

      <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5 lg:gap-2">
        {showNewIdea ? (
          <Link
            href="/"
            className="inline-flex min-h-9 items-center rounded-full border-2 border-ink bg-paper px-3 font-display text-xs font-semibold text-ink hover:bg-sky lg:min-h-11 lg:px-4 lg:text-sm"
          >
            New idea
          </Link>
        ) : null}
        {printPrefs && onPrintPrefsChange ? (
          <PrintSettings
            value={printPrefs}
            onChange={onPrintPrefsChange}
            variant="header"
          />
        ) : null}
        <AuthStatus />
      </div>
    </header>
  );
}
