"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { CheckSquare, EllipsisVertical, Loader2, Upload } from "lucide-react";
import { V2ProjectSwitcher } from "@/components/v2/V2ProjectSwitcher";
import { useVisibleNav } from "@/components/v2/V2Chrome";
import { v2BottomNav } from "@/components/v2/nav-config";
import { cn } from "@/lib/cn";

type Props = {
  pageCount: number;
  photoCount: number;
  uploading: boolean;
  onAddPhotos: () => void;
  onSelectPhotos: () => void;
  selectDisabled?: boolean;
};

/** One row above the gallery: album switcher, page count, Add photos and a ⋮ menu. */
export function StudioHeader({ pageCount, photoCount, uploading, onAddPhotos, onSelectPhotos, selectDisabled }: Props) {
  const [renaming, setRenaming] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  // The bottom tab bar hides on /studio once the book bar shows; the other tabs live here.
  const nav = useVisibleNav(v2BottomNav);
  const otherTabs = nav.items.filter((item) => item.href && item.href !== "/studio");

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const item = "flex min-h-11 w-full items-center gap-2.5 px-3 text-left text-sm font-semibold text-v2-ink hover:bg-v2-bg-subtle disabled:opacity-40";

  return (
    <div className="flex min-h-12 items-center gap-2">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <V2ProjectSwitcher onEditingChange={setRenaming} className="max-w-full" />
        {!renaming && photoCount > 0 ? (
          <span className="hidden shrink-0 text-sm text-v2-muted tabular-nums sm:inline">
            {pageCount} {pageCount === 1 ? "page" : "pages"}
          </span>
        ) : null}
      </div>
      {!renaming ? (
        <>
          <button
            type="button"
            onClick={onAddPhotos}
            aria-label="Add photos"
            className={cn(
              "inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 px-3 text-sm min-[360px]:px-4",
              photoCount === 0 ? "v2-btn-primary" : "v2-btn-outline",
            )}
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
            ) : (
              <Upload className="h-4 w-4" aria-hidden />
            )}
            <span className="hidden min-[360px]:inline sm:hidden">Add</span>
            <span className="hidden sm:inline">Add photos</span>
          </button>
          <div ref={menuRef} className="relative shrink-0">
            <button
              ref={triggerRef}
              type="button"
              className="inline-flex h-11 w-11 items-center justify-center rounded-full text-v2-navy hover:bg-v2-bg-subtle"
              aria-label="More"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-controls={menuOpen ? menuId : undefined}
              onClick={() => setMenuOpen((v) => !v)}
            >
              <EllipsisVertical className="h-5 w-5" aria-hidden />
            </button>
            {menuOpen ? (
              <div
                id={menuId}
                role="menu"
                className="absolute right-0 top-12 z-30 w-56 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-xl"
              >
                <button
                  type="button"
                  role="menuitem"
                  className={item}
                  disabled={selectDisabled || photoCount === 0}
                  onClick={() => {
                    setMenuOpen(false);
                    onSelectPhotos();
                  }}
                >
                  <CheckSquare className="h-4 w-4 text-v2-muted" aria-hidden />
                  Select photos
                </button>
                {otherTabs.length > 0 ? <div className="my-1 border-t border-gray-100 lg:hidden" /> : null}
                {otherTabs.map((tab) => (
                  <Link key={tab.id} href={tab.href!} role="menuitem" className={cn(item, "lg:hidden")} onClick={() => setMenuOpen(false)}>
                    <tab.icon className="h-4 w-4 text-v2-muted" aria-hidden />
                    {tab.label}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
