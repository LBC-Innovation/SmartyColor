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
    <header className="flex flex-wrap items-center gap-3">
      <Link href="/" className="flex shrink-0 items-center gap-2.5 rounded-2xl">
        <span
          className="grid size-10 place-items-center rounded-2xl border-[3px] border-ink bg-crayon-coral font-display text-lg font-bold text-white"
          aria-hidden
        >
          S
        </span>
        <span className="font-brand text-2xl tracking-wide text-ink sm:text-[1.75rem]">
          SmartyColor
        </span>
      </Link>

      <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
        {showNewIdea ? (
          <Link
            href="/"
            className="inline-flex min-h-11 items-center rounded-full border-2 border-ink bg-paper px-4 font-display text-sm font-semibold text-ink hover:bg-sky"
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
