"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { DESIGN_THEMES } from "@/content/marketing";
import {
  Check,
  ChevronLeft,
  ImageIcon,
  LogOut,
  Mail,
  MoreHorizontal,
  Palette,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserPlus,
  Users,
  X,
  FolderOpen,
} from "lucide-react";
import { useModalLayer } from "@/components/v2/ui/useModalLayer";
import { cn } from "@/lib/cn";
import type { V2ProjectMeta } from "@/lib/v2/studioTypes";

function photoCountLabel(count: number): string {
  return count === 1 ? "1 photo" : `${count} photos`;
}

/** Second line of an album row: its size, plus who it's shared with or by. */
export function albumSubline(project: V2ProjectMeta): string {
  const photos = photoCountLabel(project.photoCount);
  if (project.role === "contributor") {
    return `${photos} · Shared by ${project.ownerName?.trim() || "someone"}`;
  }
  if (project.sharedCount) return `${photos} · Shared with ${project.sharedCount}`;
  return photos;
}

const SM_QUERY = "(min-width: 640px)";
function subscribeSm(cb: () => void) {
  const mq = window.matchMedia(SM_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
/** True from the `sm` breakpoint up (popover); false on phones (bottom sheet). */
function useIsSmUp(): boolean {
  return useSyncExternalStore(
    subscribeSm,
    () => window.matchMedia(SM_QUERY).matches,
    () => false,
  );
}

/** Small rounded album picture: its first photo, else a soft tile with the initial. */
export function AlbumThumb({
  name,
  url,
  size = "md",
  shared = false,
  circle = false,
}: {
  name: string;
  url?: string | null;
  size?: "sm" | "md";
  shared?: boolean;
  /** Fully round, to sit inside a pill-shaped control. */
  circle?: boolean;
}) {
  const dims = size === "sm" ? "h-6 w-6 text-xs" : "h-10 w-10 text-base";
  const corners = circle ? "rounded-full" : size === "sm" ? "rounded-md" : "rounded-lg";
  const box = `${dims} ${corners}`;
  const initial = name.trim().charAt(0).toUpperCase();
  return (
    <span
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden bg-v2-primary-light font-semibold text-v2-primary",
        box,
      )}
      aria-hidden
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
      ) : initial ? (
        initial
      ) : size === "sm" ? (
        <FolderOpen className="h-3.5 w-3.5" />
      ) : (
        <ImageIcon className="h-5 w-5" />
      )}
      {shared && size === "md" ? (
        <span className="absolute -bottom-px -right-px flex h-4 w-4 items-center justify-center rounded-tl-md bg-white/90 text-v2-primary">
          <Users className="h-3 w-3" />
        </span>
      ) : null}
    </span>
  );
}

type View = { id: string; mode: "menu" | "rename" } | null;

export type AlbumSwitcherPanelProps = {
  triggerRef: RefObject<HTMLElement | null>;
  projects: V2ProjectMeta[];
  activeProjectId: string | null;
  cloud: boolean;
  /** Thumbnail per album id (first photo), when known. */
  coverFor: (project: V2ProjectMeta) => string | null;
  onClose: () => void;
  onCreate: () => void;
  onSwitch: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onShare: (project: V2ProjectMeta) => void;
  onSendToFamily: (project: V2ProjectMeta) => void;
  /** Opens the album's theme settings (owner, signed in). */
  onTheme: (project: V2ProjectMeta) => void;
  onDelete: (project: V2ProjectMeta) => void;
  onLeave: (project: V2ProjectMeta) => void;
};

/**
 * The album switcher's content in one of two shells: a bottom sheet on phones, an anchored
 * popover from `sm` up. Only one is mounted at a time.
 */
export function AlbumSwitcherPanel(props: AlbumSwitcherPanelProps) {
  const isSmUp = useIsSmUp();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  if (!mounted) return null;
  return isSmUp ? <Popover {...props} /> : <Sheet {...props} />;
}

function Sheet(props: AlbumSwitcherPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>(null);
  const [shown, setShown] = useState(false);
  const back = useBack(view, setView, props.onClose);
  const { zIndex: layerZ } = useModalLayer({ baseZ: 50, panelRef, onClose: back });
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="presentation" style={{ zIndex: layerZ }}>
      <button
        type="button"
        tabIndex={-1}
        aria-label="Close albums"
        onClick={props.onClose}
        className={cn(
          "absolute inset-0 bg-v2-ink/40 transition-opacity duration-200 motion-reduce:transition-none",
          shown ? "opacity-100" : "opacity-0",
        )}
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Albums"
        className={cn(
          "relative flex max-h-[85dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-b-0 border-gray-200 bg-v2-surface pb-[env(safe-area-inset-bottom)] shadow-[0_-12px_40px_rgb(10_16_26/0.18)] transition-transform duration-300 ease-out focus:outline-none motion-reduce:transition-none",
          shown ? "translate-y-0" : "translate-y-full",
        )}
      >
        <div className="flex shrink-0 justify-center pt-2" aria-hidden>
          <span className="h-1 w-10 rounded-full bg-gray-300" />
        </div>
        <PanelBody {...props} view={view} setView={setView} showClose />
      </div>
    </div>,
    document.body,
  );
}

type Flyout = { id: string; mode: "menu" | "rename"; top: number; side: "right" | "left" };
const FLYOUT_GAP = 4;

function Popover(props: AlbumSwitcherPanelProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const flyoutRef = useRef<HTMLDivElement>(null);
  const [flyout, setFlyout] = useState<Flyout | null>(null);
  const flyoutState = useRef(flyout);
  const { triggerRef, onClose, projects } = props;
  const flyoutProject = flyout ? projects.find((x) => x.id === flyout.id) : undefined;

  const closeFlyout = useCallback((restoreFocus: boolean) => {
    const cur = flyoutState.current;
    setFlyout(null);
    if (restoreFocus && cur) {
      requestAnimationFrame(() =>
        rootRef.current?.querySelector<HTMLElement>(`[data-more="${cur.id}"]`)?.focus(),
      );
    }
  }, []);
  const closeFlyoutRef = useRef(closeFlyout);
  useEffect(() => {
    flyoutState.current = flyout;
    closeFlyoutRef.current = closeFlyout;
  });

  useEffect(() => {
    const trigger = triggerRef.current;
    const first = rootRef.current?.querySelector<HTMLElement>("button, input");
    (first ?? rootRef.current)?.focus();
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || trigger?.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      const cur = flyoutState.current;
      if (cur?.mode === "rename") {
        setFlyout({ ...cur, mode: "menu" });
      } else if (cur) {
        closeFlyoutRef.current(true);
      } else {
        onClose();
        trigger?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [triggerRef, onClose]);

  // Place the flyout beside the popover, aligned with its row and kept inside the viewport.
  useLayoutEffect(() => {
    const el = flyoutRef.current;
    const root = rootRef.current;
    if (!el || !root || !flyout) return;
    const rootTop = root.getBoundingClientRect().top;
    const h = el.offsetHeight;
    const maxTop = window.innerHeight - 8 - h - rootTop;
    const minTop = 8 - rootTop;
    el.style.top = `${Math.max(minTop, Math.min(flyout.top, maxTop))}px`;
  }, [flyout]);

  // Move focus into the flyout's first item when it opens or returns to its action list.
  const menuKey = flyout?.mode === "menu" ? flyout.id : null;
  useEffect(() => {
    if (menuKey) flyoutRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [menuKey, flyout?.mode]);

  function onMore(id: string, row: HTMLElement | null) {
    if (flyout?.id === id) {
      closeFlyout(false);
      return;
    }
    const rootRect = rootRef.current?.getBoundingClientRect();
    if (!rootRect || !row) return;
    const side = rootRect.right + FLYOUT_GAP + 288 + 8 > window.innerWidth ? "left" : "right";
    setFlyout({ id, mode: "menu", top: row.getBoundingClientRect().top - rootRect.top, side });
  }

  function onFlyoutKey(e: React.KeyboardEvent) {
    if (!flyout) return;
    if (e.key === "ArrowLeft" && flyout.mode === "menu") {
      e.preventDefault();
      closeFlyout(true);
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const items = Array.from(flyoutRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    if (items.length === 0) return;
    e.preventDefault();
    const at = items.indexOf(document.activeElement as HTMLElement);
    const next = e.key === "ArrowDown" ? (at + 1) % items.length : (at - 1 + items.length) % items.length;
    items[next].focus();
  }

  const done = (fn: () => void) => () => {
    setFlyout(null);
    fn();
  };

  return (
    <div ref={rootRef} tabIndex={-1} className="absolute left-0 top-full z-30 mt-1.5 w-[22rem] max-w-[calc(100vw-2rem)] focus:outline-none">
      <div
        role="dialog"
        aria-label="Albums"
        className="flex max-h-[min(70vh,32rem)] flex-col overflow-hidden rounded-xl border border-gray-200 bg-v2-surface shadow-[0_12px_32px_rgb(10_16_26/0.14)]"
      >
        <ListView
          {...props}
          desktop
          flyoutId={flyout?.id ?? null}
          onMore={onMore}
          onListScroll={() => flyoutState.current && closeFlyout(false)}
        />
      </div>
      {flyout && flyoutProject ? (
        <div
          ref={flyoutRef}
          tabIndex={-1}
          role="menu"
          aria-label={`Options for ${flyoutProject.name}`}
          onKeyDown={onFlyoutKey}
          onBlur={(e) => {
            const next = e.relatedTarget as HTMLElement | null;
            if (next && (e.currentTarget.contains(next) || next.hasAttribute("data-more"))) return;
            if (next) closeFlyout(false);
          }}
          className={cn(
            "absolute flex max-h-[calc(100vh-1rem)] flex-col overflow-hidden rounded-xl border border-gray-200 bg-v2-surface shadow-[0_12px_32px_rgb(10_16_26/0.14)] focus:outline-none",
            flyout.mode === "rename" ? "w-72" : "w-60",
            flyout.side === "right" ? "left-full ml-1" : "right-full mr-1",
          )}
        >
          <div className="flex shrink-0 items-center gap-2 border-b border-gray-200 px-3 py-2">
            <AlbumThumb name={flyoutProject.name} url={props.coverFor(flyoutProject)} size="sm" />
            <h2 className="min-w-0 truncate text-sm font-semibold text-v2-ink" title={flyoutProject.name}>
              {flyoutProject.name}
            </h2>
          </div>
          <div className="min-h-0 overflow-y-auto p-1.5">
            {flyout.mode === "rename" ? (
              <RenameForm
                initial={flyoutProject.name}
                onCancel={() => setFlyout({ ...flyout, mode: "menu" })}
                onSave={(name) => {
                  props.onRename(flyoutProject.id, name);
                  closeFlyout(true);
                }}
              />
            ) : (
              <ActionList
                project={flyoutProject}
                activeProjectId={props.activeProjectId}
                cloud={props.cloud}
                compact
                onSwitch={done(() => props.onSwitch(flyoutProject.id))}
                onStartRename={() => setFlyout({ ...flyout, mode: "rename" })}
                onShare={done(() => props.onShare(flyoutProject))}
                onSendToFamily={done(() => props.onSendToFamily(flyoutProject))}
                onTheme={done(() => props.onTheme(flyoutProject))}
                onDelete={done(() => props.onDelete(flyoutProject))}
                onLeave={done(() => props.onLeave(flyoutProject))}
              />
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Escape / back: one level at a time, then close. */
function useBack(view: View, setView: (v: View) => void, onClose: () => void) {
  return () => {
    if (view?.mode === "rename") setView({ id: view.id, mode: "menu" });
    else if (view) setView(null);
    else onClose();
  };
}

function PanelBody({
  view,
  setView,
  showClose,
  ...p
}: AlbumSwitcherPanelProps & { view: View; setView: (v: View) => void; showClose?: boolean }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const lastView = useRef<View>(null);
  const project = view ? p.projects.find((x) => x.id === view.id) : undefined;

  // Keep keyboard focus in the panel when the content swaps under it.
  useEffect(() => {
    const prev = lastView.current;
    lastView.current = view;
    if (prev === view || (prev?.id === view?.id && prev?.mode === view?.mode)) return;
    const root = rootRef.current;
    if (!root) return;
    if (view?.mode === "rename") return; // the input autofocuses
    if (view) root.querySelector<HTMLElement>("[data-back]")?.focus();
    else if (prev) {
      (root.querySelector<HTMLElement>(`[data-more="${prev.id}"]`) ??
        root.querySelector<HTMLElement>("button"))?.focus();
    }
  }, [view]);

  // A deleted/left album leaves the actions view empty.
  useEffect(() => {
    if (view && !project) setView(null);
  }, [view, project, setView]);

  return (
    <div ref={rootRef} className="flex min-h-0 flex-1 flex-col">
      {view && project ? (
        <ActionsView
          {...p}
          project={project}
          mode={view.mode}
          onBack={() => setView(view.mode === "rename" ? { id: view.id, mode: "menu" } : null)}
          onStartRename={() => setView({ id: view.id, mode: "rename" })}
          onRenameDone={() => setView(null)}
          showClose={showClose}
        />
      ) : (
        <ListView {...p} onMore={(id) => setView({ id, mode: "menu" })} showClose={showClose} />
      )}
    </div>
  );
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="Close"
      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-v2-muted transition hover:bg-v2-bg-subtle hover:text-v2-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-primary"
    >
      <X className="h-5 w-5" aria-hidden />
    </button>
  );
}

function ListView({
  projects,
  activeProjectId,
  coverFor,
  onClose,
  onCreate,
  onSwitch,
  onMore,
  showClose,
  desktop,
  flyoutId,
  onListScroll,
}: AlbumSwitcherPanelProps & {
  onMore: (id: string, row: HTMLElement | null) => void;
  showClose?: boolean;
  /** Desktop popover: ⋯ opens a flyout menu instead of swapping the view. */
  desktop?: boolean;
  flyoutId?: string | null;
  onListScroll?: () => void;
}) {
  const [query, setQuery] = useState("");
  const listId = useId();
  const activeRef = useRef<HTMLLIElement>(null);
  const searchable = projects.length > 6;
  const q = query.trim().toLowerCase();
  const visible = searchable && q ? projects.filter((x) => x.name.toLowerCase().includes(q)) : projects;

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, []);

  return (
    <>
      <div className="flex shrink-0 items-center gap-2 px-4 pb-2 pt-2 sm:pt-3">
        <h2 className="min-w-0 flex-1 truncate text-base font-semibold text-v2-ink">Your albums</h2>
        <button
          type="button"
          onClick={onCreate}
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full bg-v2-primary px-4 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 sm:min-h-9 sm:px-3.5"
        >
          <Plus className="h-4 w-4" aria-hidden />
          New album
        </button>
        {showClose ? <CloseButton onClose={onClose} /> : null}
      </div>
      {searchable ? (
        <div className="shrink-0 px-4 pb-2">
          <label className="relative block">
            <span className="sr-only">Find an album</span>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-v2-muted"
              aria-hidden
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find an album"
              aria-controls={listId}
              className="h-11 w-full rounded-xl border border-gray-200 bg-white pl-9 pr-3 text-base text-v2-ink outline-none placeholder:text-v2-muted focus:border-v2-primary focus:ring-2 focus:ring-v2-primary/20 sm:h-10 sm:text-sm"
            />
          </label>
        </div>
      ) : null}
      {projects.length === 0 ? (
        <div className="px-4 pb-5 pt-2 text-center">
          <p className="text-sm text-v2-muted">No albums yet. Create one to start adding photos.</p>
        </div>
      ) : (
        <ul id={listId} onScroll={onListScroll} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-3">
          {visible.length === 0 ? (
            <li className="px-3 py-4 text-sm text-v2-muted">No albums match “{query.trim()}”.</li>
          ) : null}
          {visible.map((project) => {
            const selected = project.id === activeProjectId;
            const shared = project.role === "contributor";
            return (
              <li
                key={project.id}
                ref={selected ? activeRef : undefined}
                className={cn(
                  "flex min-h-14 min-w-0 items-center rounded-xl transition-colors",
                  selected
                    ? "bg-v2-primary-light"
                    : flyoutId === project.id
                      ? "bg-v2-bg-subtle"
                      : "hover:bg-v2-bg-subtle",
                )}
              >
                <button
                  type="button"
                  title={project.name}
                  aria-current={selected ? "true" : undefined}
                  onClick={() => onSwitch(project.id)}
                  className="flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-xl px-2 py-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-v2-primary"
                >
                  <AlbumThumb name={project.name} url={coverFor(project)} shared={shared} />
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block truncate text-sm font-semibold leading-5",
                        selected ? "text-v2-link" : "text-v2-ink",
                      )}
                    >
                      {project.name}
                    </span>
                    <span className="block truncate text-xs leading-4 text-v2-muted">
                      {albumSubline(project)}
                    </span>
                  </span>
                  {selected ? <Check className="h-4 w-4 shrink-0 text-v2-link" aria-hidden /> : null}
                </button>
                <button
                  type="button"
                  data-more={project.id}
                  onClick={(e) => onMore(project.id, e.currentTarget.closest("li"))}
                  aria-label={`Options for ${project.name}`}
                  aria-haspopup={desktop ? "menu" : undefined}
                  aria-expanded={desktop ? flyoutId === project.id : undefined}
                  className={cn(
                    "mr-0.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-v2-muted transition hover:bg-white hover:text-v2-ink focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-v2-primary",
                    flyoutId === project.id && "bg-white text-v2-ink shadow-sm",
                  )}
                >
                  <MoreHorizontal className="h-5 w-5" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function ActionRow({
  icon,
  label,
  hint,
  danger,
  compact,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  hint?: string;
  danger?: boolean;
  compact?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role={compact ? "menuitem" : undefined}
      onClick={onClick}
      className={cn(
        compact ? "min-h-10" : "min-h-12",
        "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-v2-primary",
        danger ? "text-red-700 hover:bg-red-50" : "text-v2-ink hover:bg-v2-bg-subtle",
      )}
    >
      <span
        className={cn(
          "flex shrink-0 items-center justify-center rounded-lg",
          compact ? "h-7 w-7" : "h-9 w-9",
          danger ? "bg-red-50 text-red-700" : "bg-v2-primary-light text-v2-primary",
        )}
        aria-hidden
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold leading-5">{label}</span>
        {hint && !compact ? <span className="block text-xs leading-4 text-v2-muted">{hint}</span> : null}
      </span>
    </button>
  );
}

function ActionsView({
  project,
  mode,
  activeProjectId,
  cloud,
  coverFor,
  onClose,
  onBack,
  onStartRename,
  onRenameDone,
  onSwitch,
  onRename,
  onShare,
  onSendToFamily,
  onTheme,
  onDelete,
  onLeave,
  showClose,
}: AlbumSwitcherPanelProps & {
  project: V2ProjectMeta;
  mode: "menu" | "rename";
  onBack: () => void;
  onStartRename: () => void;
  onRenameDone: () => void;
  showClose?: boolean;
}) {
  return (
    <>
      <div className="flex shrink-0 items-center gap-1 px-2 pb-2 pt-2 sm:pt-2.5">
        <button
          type="button"
          data-back
          onClick={onBack}
          className="inline-flex min-h-11 shrink-0 items-center gap-0.5 rounded-full pl-1 pr-3 text-sm font-semibold text-v2-link transition hover:bg-v2-primary-light focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-primary"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden />
          Back
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <AlbumThumb name={project.name} url={coverFor(project)} size="sm" />
          <h2 className="min-w-0 truncate text-base font-semibold text-v2-ink" title={project.name}>
            {project.name}
          </h2>
        </div>
        {showClose ? <CloseButton onClose={onClose} /> : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-3">
        {mode === "rename" ? (
          <RenameForm
            initial={project.name}
            onCancel={onBack}
            onSave={(name) => {
              onRename(project.id, name);
              onRenameDone();
            }}
          />
        ) : (
          <ActionList
            project={project}
            activeProjectId={activeProjectId}
            cloud={cloud}
            onSwitch={() => onSwitch(project.id)}
            onStartRename={onStartRename}
            onShare={() => onShare(project)}
            onSendToFamily={() => onSendToFamily(project)}
            onTheme={() => onTheme(project)}
            onDelete={() => onDelete(project)}
            onLeave={() => onLeave(project)}
          />
        )}
      </div>
    </>
  );
}

function ActionList({
  project,
  activeProjectId,
  cloud,
  compact,
  onSwitch,
  onStartRename,
  onShare,
  onSendToFamily,
  onTheme,
  onDelete,
  onLeave,
}: {
  project: V2ProjectMeta;
  activeProjectId: string | null;
  cloud: boolean;
  compact?: boolean;
  onSwitch: () => void;
  onStartRename: () => void;
  onShare: () => void;
  onSendToFamily: () => void;
  onTheme: () => void;
  onDelete: () => void;
  onLeave: () => void;
}) {
  const contributor = project.role === "contributor";
  const isActive = project.id === activeProjectId;
  const canSend = cloud && project.photoCount > 0;
  const ic = compact ? "h-4 w-4" : "h-[18px] w-[18px]";
  return (
    <div className="flex flex-col gap-0.5">
      {!isActive ? (
        <ActionRow compact={compact} icon={<FolderOpen className={ic} />} label="Open album" onClick={onSwitch} />
      ) : null}
      {!contributor ? (
        <ActionRow compact={compact} icon={<Pencil className={ic} />} label="Rename" onClick={onStartRename} />
      ) : null}
      {!contributor && cloud ? (
        <ActionRow
          compact={compact}
          icon={<UserPlus className={ic} />}
          label="Share with family"
          hint="Invite people to add photos"
          onClick={onShare}
        />
      ) : null}
      {!contributor && cloud ? (
        <ActionRow
          compact={compact}
          icon={<Palette className={ic} />}
          label={DESIGN_THEMES.rowLabel}
          hint={project.designTheme?.trim() || DESIGN_THEMES.rowNone}
          onClick={onTheme}
        />
      ) : null}
      {canSend ? (
        <ActionRow
          compact={compact}
          icon={<Mail className={ic} />}
          label="Send pages to family"
          hint="Email coloring pages to print"
          onClick={onSendToFamily}
        />
      ) : null}
      <div className="my-1 border-t border-gray-200" role="separator" />
      {contributor ? (
        <ActionRow
          danger
          compact={compact}
          icon={<LogOut className={ic} />}
          label="Leave album"
          hint="Removes it from your list"
          onClick={onLeave}
        />
      ) : (
        <ActionRow
          danger
          compact={compact}
          icon={<Trash2 className={ic} />}
          label="Delete album"
          hint="Removes the album and its photos"
          onClick={onDelete}
        />
      )}
    </div>
  );
}

function RenameForm({
  initial,
  onCancel,
  onSave,
}: {
  initial: string;
  onCancel: () => void;
  onSave: (name: string) => void;
}) {
  const [draft, setDraft] = useState(initial);
  const inputId = useId();
  const trimmed = draft.trim();
  const canSave = trimmed.length > 0 && trimmed !== initial;
  return (
    <form
      className="flex flex-col gap-3 px-1 pt-1"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSave) onSave(trimmed);
      }}
    >
      <label htmlFor={inputId} className="text-sm font-semibold text-v2-ink">
        Album name
      </label>
      <input
        id={inputId}
        type="text"
        value={draft}
        autoFocus
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setDraft(e.target.value)}
        maxLength={80}
        enterKeyHint="done"
        autoCapitalize="words"
        className="h-11 w-full min-w-0 rounded-xl border border-gray-200 bg-white px-3 text-base font-semibold text-v2-ink outline-none focus:border-v2-primary focus:ring-2 focus:ring-v2-primary/20"
      />
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-semibold text-v2-navy transition hover:bg-v2-bg-subtle"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!canSave}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-v2-primary px-5 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Save
        </button>
      </div>
    </form>
  );
}
