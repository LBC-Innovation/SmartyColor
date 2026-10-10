"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isV2NavItemActive, v2AdminNav } from "@/components/v2/nav-config";
import { cn } from "@/lib/cn";

/** Shared page-content container so the toolbar and admin content line up. */
export const ADMIN_CONTENT_CLASS = "mx-auto w-full max-w-5xl px-5 sm:px-8";

/**
 * Full-width toolbar for admin pages. The bar spans the viewport; its tabs
 * sit in the same container as the page content below.
 */
export function V2AdminToolbar({ className }: { className?: string }) {
  const pathname = usePathname();

  return (
    <div className={cn("v2-studio-toolbar shrink-0", className)}>
      <nav
        className={cn(ADMIN_CONTENT_CLASS, "flex items-center gap-1 overflow-x-auto py-1.5")}
        aria-label="Admin"
      >
        {v2AdminNav.map((item) => {
          const active = isV2NavItemActive(pathname, item);
          return (
            <Link
              key={item.id}
              href={item.href ?? "#"}
              className={cn(
                "relative inline-flex h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-semibold transition-colors",
                active
                  ? "bg-v2-primary-light text-v2-primary"
                  : "text-v2-navy hover:bg-v2-primary/[0.06] hover:text-v2-ink",
              )}
              aria-current={active ? "page" : undefined}
            >
              <item.icon className="h-4 w-4 shrink-0" aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
