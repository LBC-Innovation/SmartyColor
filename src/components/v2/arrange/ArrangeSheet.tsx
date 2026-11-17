"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Lock, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { fitGrid, moveItem, slotFromPoint, tilePosition, type GridLayout } from "@/components/v2/arrange/arrangeLayout";

export type ArrangeSession =
  | {
      mode: "drag";
      activeId: string;
      pointerId: number;
      pointerType: string;
      x: number;
      y: number;
      originRect: DOMRect;
    }
  | { mode: "browse" };

type Props<T> = {
  items: T[];
  getId: (item: T) => string;
  /** Tile art. `size` lets callers pick a smaller thumbnail for tiles. */
  renderThumb: (item: T, size: "tile" | "loupe") => ReactNode;
  /** Tile width / height. */
  aspect: number;
  /** Leading items that can't move and can't be dropped before (a gift note). */
  lockedLeading?: number;
  /** Dimmed items, e.g. pages left out of the book. */
  isMuted?: (item: T) => boolean;
  noun?: string;
  /** null = closed. */
  session: ArrangeSession | null;
  /** Called on each successful drop with the full reordered array. */
  onCommit: (next: T[]) => void;
  onClose: (movedId: string | null) => void;
};

type Drag = {
  id: string;
  from: number;
  target: number;
  input: "pointer" | "keyboard";
  pointerId: number;
  pointerType: string;
  originRect: DOMRect | null;
  phase: "active" | "settling";
};

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function ArrangeSheet<T>(props: Props<T>) {
  if (!props.session || typeof document === "undefined") return null;
  return createPortal(<Sheet {...props} session={props.session} />, document.body);
}

function Sheet<T>({
  items,
  getId,
  renderThumb,
  aspect,
  lockedLeading = 0,
  isMuted,
  noun = "page",
  session,
  onCommit,
  onClose,
}: Omit<Props<T>, "session"> & { session: ArrangeSession }) {
  const Noun = noun.charAt(0).toUpperCase() + noun.slice(1);
  const [reduced] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [drag, setDrag] = useState<Drag | null>(() => {
    if (session.mode !== "drag") return null;
    const from = items.findIndex((it) => getId(it) === session.activeId);
    if (from < 0) return null;
    return {
      id: session.activeId,
      from,
      target: from,
      input: "pointer",
      pointerId: session.pointerId,
      pointerType: session.pointerType,
      originRect: session.originRect,
      phase: "active",
    };
  });
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [leaving, setLeaving] = useState(false);
  const [overCancel, setOverCancel] = useState(false);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [focusIdx, setFocusIdx] = useState(0);
  const [announce, setAnnounce] = useState("");

  const scrollRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const loupeRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const tileEls = useRef(new Map<string, HTMLElement>());
  const pendingFocus = useRef<string | null>(
    session.mode === "browse" && items[0] ? getId(items[0]) : null,
  );
  const ptr = useRef({ x: session.mode === "drag" ? session.x : 0, y: session.mode === "drag" ? session.y : 0 });
  const raf = useRef(0);
  const overCancelRef = useRef(false);
  const timers = useRef<number[]>([]);
  const closing = useRef(false);

  // Fit all tiles on one screen. Padding is the scroll box's own, so contentRect is the usable area.
  const layout: GridLayout = useMemo(
    () =>
      fitGrid({ count: items.length, width: Math.max(size.w, 1), height: Math.max(size.h, 1), aspect }),
    [items.length, size.w, size.h, aspect],
  );
  const ready = size.w > 0 && size.h > 0;

  const live = useRef({ drag, layout, items, getId, onCommit, session });
  useLayoutEffect(() => {
    live.current = { drag, layout, items, getId, onCommit, session };
  });

  const later = useCallback((fn: () => void, ms: number) => {
    const t = window.setTimeout(fn, ms);
    timers.current.push(t);
  }, []);
  useEffect(() => {
    const ts = timers.current;
    return () => {
      ts.forEach((t) => window.clearTimeout(t));
      cancelAnimationFrame(raf.current);
      // Reset, or a remount (Strict Mode) would think a frame is still pending and never place again.
      raf.current = 0;
    };
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setSize({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Lock page scroll while the sheet is open.
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prev = [html.style.overflow, body.style.overflow];
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    return () => {
      html.style.overflow = prev[0];
      body.style.overflow = prev[1];
    };
  }, []);

  // Focus goes into the sheet on open and back to whatever opened it on close.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    return () => {
      if (opener && opener.isConnected) opener.focus?.({ preventScroll: true });
    };
  }, []);

  const leave = useCallback(
    (movedId: string | null) => {
      if (closing.current) return;
      closing.current = true;
      setLeaving(true);
      later(() => onClose(movedId), reduced ? 0 : 140);
    },
    [later, onClose, reduced],
  );

  /* ---- Loupe ---- */
  // A little bigger than a tile, so it reads as "lifted" yet still sits inside the space the
  // neighbouring tiles open for it.
  const loupeW = Math.round(clamp(layout.tileW * 1.3, 96, 168));
  const loupeH = loupeW / aspect;
  const pointerDragId = drag?.input === "pointer" ? drag.id : null;

  /**
   * While a page is held, tiles that would sit under it slide out of its way, so the held page is
   * always centered in its own space. Runs per frame on the DOM (CSS `translate`, separate from the
   * `transform` React sets for the grid position), measured from the page itself, not its cell.
   */
  const makeRoom = useCallback(
    (clear = false) => {
      const grid = gridRef.current;
      if (!grid) return;
      const L = live.current.layout;
      const r = grid.getBoundingClientRect();
      // Where the held page is, in grid coordinates (it may be pinned at a screen edge).
      const box = loupeRef.current?.getBoundingClientRect();
      const px = (box ? box.left + box.width / 2 : ptr.current.x) - r.left;
      const py = (box ? box.top + box.height / 2 : ptr.current.y) - r.top;
      const hx = (loupeW + L.tileW) / 2 + 8;
      const hy = (loupeH + L.tileH) / 2 + 8;
      // A pushed tile carries its neighbour along the same row or column (less the gap between
      // them), so tiles move together instead of piling onto each other.
      const capX = L.tileW * 0.6;
      const capY = L.tileH * 0.6;
      const cells = new Map<number, { el: HTMLElement; dx: number; dy: number }>();
      for (const el of tileEls.current.values()) {
        if (clear || el.dataset.held) {
          el.style.translate = "";
          continue;
        }
        const vx = Number(el.dataset.cx) - px;
        const vy = Number(el.dataset.cy) - py;
        let dx = 0;
        let dy = 0;
        if (Math.abs(vx) < hx && Math.abs(vy) < hy) {
          // Overlapping: slide out along whichever axis needs the shorter move.
          const needX = hx - Math.abs(vx);
          const needY = hy - Math.abs(vy);
          if (needX / hx <= needY / hy) dx = Math.sign(vx || 1) * Math.min(needX, capX);
          else dy = Math.sign(vy || 1) * Math.min(needY, capY);
        }
        cells.set(Number(el.dataset.i), { el, dx, dy });
      }
      if (!clear) {
        const keep = L.gap * 0.5;
        const carry = (start: number, step: number, axis: "dx" | "dy", sameLine: (i: number) => boolean) => {
          let push = cells.get(start)![axis];
          for (let i = start + step; sameLine(i); i += step) {
            const next = cells.get(i);
            if (!next) break;
            const need = Math.abs(push) - (L.gap - keep);
            if (need <= 0) break;
            push = Math.sign(push) * Math.max(Math.abs(next[axis]), need);
            next[axis] = push;
          }
        };
        const firsts = [...cells.entries()].filter(([, c]) => c.dx || c.dy);
        for (const [i, c] of firsts) {
          const row = Math.floor(i / L.cols);
          if (c.dx) carry(i, Math.sign(c.dx), "dx", (j) => j >= 0 && Math.floor(j / L.cols) === row);
          if (c.dy) carry(i, Math.sign(c.dy) * L.cols, "dy", (j) => j >= 0 && j < L.cols * L.rows);
        }
        for (const { el, dx, dy } of cells.values()) {
          el.style.translate = dx || dy ? `${dx.toFixed(1)}px ${dy.toFixed(1)}px` : "";
        }
      }
    },
    [loupeW, loupeH],
  );

  const loupeBox = useCallback(
    (rotate: string) => {
      const m = 8;
      const { x, y } = ptr.current;
      // Centered on the pointer, like picking the page up: the slot under the pointer is then the
      // slot under the page, and the neighbours open space around it.
      const left = clamp(x - loupeW / 2, m, window.innerWidth - loupeW - m);
      // The badge overlaps the loupe's top edge, so keep a little more room above it.
      const top = clamp(y - loupeH / 2, m + 12, window.innerHeight - loupeH - m);
      return `translate3d(${left}px, ${top}px, 0) rotate(${rotate})`;
    },
    [loupeW, loupeH],
  );

  const placeLoupe = useCallback(() => {
    raf.current = 0;
    const el = loupeRef.current;
    if (el) el.style.transform = loupeBox(reduced ? "0deg" : "-2.5deg");
    if (live.current.drag?.phase === "active") makeRoom();
  }, [loupeBox, makeRoom, reduced]);

  const schedulePlace = useCallback(() => {
    if (!raf.current) raf.current = requestAnimationFrame(placeLoupe);
  }, [placeLoupe]);

  // After the grid reflows for a new slot, the tiles' home spots moved: make room again from there.
  const heldTarget = drag?.input === "pointer" && drag.phase === "active" ? drag.target : -1;
  useLayoutEffect(() => {
    if (heldTarget >= 0) schedulePlace();
  }, [heldTarget, layout, schedulePlace]);

  // The loupe grows out of the card it was lifted from.
  useLayoutEffect(() => {
    const el = loupeRef.current;
    const d = live.current.drag;
    if (!el || !d || d.input !== "pointer") return;
    const to = loupeBox(reduced ? "0deg" : "-2.5deg");
    el.style.transform = to;
    const o = d.originRect;
    if (o && !reduced) {
      const s = o.width / loupeW;
      const from = `translate3d(${o.left + o.width / 2 - loupeW / 2}px, ${o.top + o.height / 2 - loupeH / 2}px, 0) scale(${s})`;
      el.animate([{ transform: from }, { transform: to }], { duration: 180, easing: EASE });
    }
    // Only when a new pointer drag begins.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pointerDragId]);

  /* ---- Dropping ---- */
  const settle = useCallback(
    (kind: "drop" | "cancel") => {
      const L = live.current;
      const d = L.drag;
      if (!d || d.phase !== "active") return;
      const from = L.items.findIndex((it) => L.getId(it) === d.id);
      if (from < 0) {
        setDrag(null);
        if (L.session.mode === "drag") leave(null);
        return;
      }
      const target = kind === "cancel" ? from : d.target;
      const moved = kind === "drop" && target !== from;
      if (moved) L.onCommit(moveItem(L.items, from, target));
      setAnnounce(
        kind === "cancel"
          ? "Move cancelled."
          : moved
            ? `${Noun} ${from + 1} dropped at position ${target + 1}.`
            : `${Noun} ${from + 1} stays at position ${from + 1}.`,
      );
      setDrag({ ...d, target, phase: "settling" });
      makeRoom(true);
      setOverCancel(false);
      overCancelRef.current = false;

      // Fly the loupe into its slot, then close (drag mode) or settle in place (browse mode).
      const done = () => {
        if (L.session.mode === "drag") {
          leave(moved ? d.id : null);
        } else {
          setDrag(null);
          if (moved) {
            setFlashId(d.id);
            setFocusIdx(target);
            later(() => setFlashId(null), 700);
          }
        }
      };
      const el = loupeRef.current;
      const grid = gridRef.current;
      if (el && grid && !reduced) {
        const r = grid.getBoundingClientRect();
        const p = tilePosition(target, L.layout);
        const s = L.layout.tileW / loupeW;
        const to = `translate3d(${r.left + p.x + L.layout.tileW / 2 - loupeW / 2}px, ${r.top + p.y + L.layout.tileH / 2 - loupeH / 2}px, 0) rotate(0deg) scale(${s})`;
        const from = el.style.transform;
        el.animate([{ transform: from }, { transform: to }], { duration: 160, easing: EASE, fill: "forwards" });
        later(done, 165);
      } else {
        done();
      }
    },
    [Noun, later, leave, loupeH, loupeW, makeRoom, reduced],
  );

  /* ---- Pointer tracking while a drag is live ---- */
  const pointerActive = drag?.input === "pointer" && drag.phase === "active";
  const activePointerId = drag?.pointerId ?? -1;

  const updateTarget = useCallback(() => {
    const L = live.current;
    const grid = gridRef.current;
    if (!L.drag || L.drag.phase !== "active" || !grid) return;
    const r = grid.getBoundingClientRect();
    const to = slotFromPoint(ptr.current.x - r.left, ptr.current.y - r.top, L.layout, L.items.length, lockedLeading);
    if (to !== L.drag.target) {
      L.drag = { ...L.drag, target: to };
      setDrag((d) => (d && d.phase === "active" ? { ...d, target: to } : d));
      if (L.drag.pointerType !== "mouse") navigator.vibrate?.(4);
    }
  }, [lockedLeading]);

  useEffect(() => {
    if (!pointerActive) return;
    const checkCancel = () => {
      const b = cancelRef.current?.getBoundingClientRect();
      const over = !!b && ptr.current.x >= b.left && ptr.current.x <= b.right && ptr.current.y >= b.top && ptr.current.y <= b.bottom;
      if (over !== overCancelRef.current) {
        overCancelRef.current = over;
        setOverCancel(over);
      }
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== activePointerId) return;
      ptr.current = { x: e.clientX, y: e.clientY };
      schedulePlace();
      checkCancel();
      if (!overCancelRef.current) updateTarget();
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== activePointerId) return;
      ptr.current = { x: e.clientX, y: e.clientY };
      checkCancel();
      settle(overCancelRef.current ? "cancel" : "drop");
    };
    const onCancel = (e: PointerEvent) => {
      if (e.pointerId === activePointerId) settle("cancel");
    };
    // No page scroll or browser pointer steal while dragging.
    const block = (e: TouchEvent) => e.preventDefault();
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    document.addEventListener("touchmove", block, { passive: false });

    // Edge auto-scroll, only when the sheet itself scrolls.
    let loop = 0;
    const tick = () => {
      const sc = scrollRef.current;
      if (sc && live.current.layout.overflows && !overCancelRef.current) {
        const r = sc.getBoundingClientRect();
        const edge = 56;
        const y = ptr.current.y;
        let v = 0;
        if (y < r.top + edge) v = -((r.top + edge - y) / edge);
        else if (y > r.bottom - edge) v = (y - (r.bottom - edge)) / edge;
        if (v !== 0) {
          sc.scrollTop += clamp(v, -1.5, 1.5) * 14;
          updateTarget();
        }
      }
      loop = requestAnimationFrame(tick);
    };
    loop = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      document.removeEventListener("touchmove", block);
      cancelAnimationFrame(loop);
    };
  }, [pointerActive, activePointerId, schedulePlace, settle, updateTarget]);

  /* ---- Escape: cancel the drag, or close ---- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const d = live.current.drag;
      e.preventDefault();
      e.stopPropagation();
      if (!d) {
        leave(null);
      } else if (d.phase === "active") {
        if (d.input === "pointer") settle("cancel");
        else {
          setDrag(null);
          setAnnounce("Move cancelled.");
          setFocusIdx(d.from);
          pendingFocus.current = d.id;
        }
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [leave, settle]);

  // Roving focus: move DOM focus after the render that changed the target tile.
  useEffect(() => {
    const id = pendingFocus.current;
    if (!id) return;
    const el = tileEls.current.get(id);
    if (el) {
      pendingFocus.current = null;
      el.focus({ preventScroll: true });
    }
  });

  /* ---- Browse mode: press a tile to lift it ---- */
  function onTilePointerDown(e: ReactPointerEvent<HTMLElement>, id: string) {
    const L = live.current;
    if (L.drag || closing.current || !e.isPrimary) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const el = e.currentTarget;
    const { pointerId, pointerType } = e;
    ptr.current = { x: e.clientX, y: e.clientY };
    const begin = () => {
      const from = L.items.findIndex((it) => L.getId(it) === id);
      if (from < 0) return;
      const d: Drag = {
        id,
        from,
        target: from,
        input: "pointer",
        pointerId,
        pointerType,
        originRect: el.getBoundingClientRect(),
        phase: "active",
      };
      L.drag = d;
      setDrag(d);
      navigator.vibrate?.(pointerType === "mouse" ? 0 : 10);
    };
    if (pointerType === "mouse" || !L.layout.overflows) {
      begin();
      return;
    }
    // Scrolling sheet: a short hold lifts, moving first scrolls.
    const sx = e.clientX;
    const sy = e.clientY;
    const stop = () => {
      window.clearTimeout(t);
      window.removeEventListener("pointermove", mv);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
    const mv = (ev: PointerEvent) => {
      if (ev.pointerId === pointerId && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 8) stop();
    };
    const t = window.setTimeout(() => {
      stop();
      ptr.current = { x: sx, y: sy };
      begin();
    }, 120);
    window.addEventListener("pointermove", mv);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  }

  /* ---- Keyboard ---- */
  function onKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    const L = live.current;
    const n = L.items.length;
    if (n === 0 || e.altKey || e.metaKey || e.ctrlKey) return;
    const cols = L.layout.cols;
    const d = L.drag;
    if (d && d.input === "pointer") return;
    const cur = d ? d.target : focusIdx;
    let next = cur;
    switch (e.key) {
      case "ArrowLeft":
        next = cur - 1;
        break;
      case "ArrowRight":
        next = cur + 1;
        break;
      case "ArrowUp":
        next = cur - cols;
        break;
      case "ArrowDown":
        next = cur + cols;
        break;
      case "Home":
        next = d ? lockedLeading : 0;
        break;
      case "End":
        next = n - 1;
        break;
      case " ":
      case "Enter": {
        e.preventDefault();
        if (d) {
          if (d.phase !== "active") return;
          const from = d.from;
          const to = d.target;
          if (to !== from) L.onCommit(moveItem(L.items, from, to));
          setAnnounce(to !== from ? `${Noun} ${from + 1} dropped at position ${to + 1}.` : `${Noun} ${from + 1} stays at position ${from + 1}.`);
          setDrag(null);
          setFocusIdx(to);
          pendingFocus.current = d.id;
          if (to !== from) {
            setFlashId(d.id);
            later(() => setFlashId(null), 700);
          }
        } else {
          if (focusIdx < lockedLeading || !L.items[focusIdx]) return;
          const id = L.getId(L.items[focusIdx]);
          setDrag({
            id,
            from: focusIdx,
            target: focusIdx,
            input: "keyboard",
            pointerId: -1,
            pointerType: "keyboard",
            originRect: null,
            phase: "active",
          });
          setAnnounce(`Picked up ${noun} ${focusIdx + 1}.`);
          pendingFocus.current = id;
        }
        return;
      }
      default:
        return;
    }
    e.preventDefault();
    if (d) {
      next = clamp(next, lockedLeading, n - 1);
      if (next !== d.target) {
        setDrag({ ...d, target: next });
        setAnnounce(`${Noun} ${d.from + 1}, now at position ${next + 1}.`);
      }
    } else {
      next = clamp(next, 0, n - 1);
      setFocusIdx(next);
      pendingFocus.current = L.getId(L.items[next]);
    }
  }

  /* ---- Render ---- */
  const activeIndexById = drag ? items.findIndex((it) => getId(it) === drag.id) : -1;
  const displayIndex = (id: string, i: number) => {
    if (!drag || activeIndexById < 0) return i;
    if (id === drag.id) return drag.target;
    const r = i < activeIndexById ? i : i - 1;
    return r < drag.target ? r : r + 1;
  };

  const dragging = !!drag && drag.phase === "active" && drag.input === "pointer";
  const touchLocked = !layout.overflows || dragging;
  const activeItem = drag ? items[activeIndexById] : undefined;
  const tileTransition = reduced ? "none" : `transform 200ms ${EASE}, translate 160ms ${EASE}`;
  const from = drag ? drag.from + 1 : 0;
  const to = drag ? drag.target + 1 : 0;

  const title = drag ? `Move ${noun} ${from}` : "Arrange pages";
  const sub = drag
    ? drag.input === "keyboard"
      ? "Arrow keys to move, Space to drop"
      : to === from
        ? "Drop to leave it where it was"
        : `Drop to make it ${noun} ${to}`
    : `Drag a ${noun} to its new spot`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Arrange pages"
      className={cn(
        "fixed inset-0 z-[60] flex flex-col bg-v2-bg/95 backdrop-blur-sm",
        "pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] pt-[env(safe-area-inset-top)]",
        dragging && "cursor-grabbing",
      )}
      style={{
        touchAction: touchLocked ? "none" : undefined,
        opacity: leaving ? 0 : 1,
        transition: reduced ? "none" : "opacity 140ms ease-out",
        animation: reduced ? undefined : "cm-arrange-in 160ms ease-out backwards",
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 px-4">
        <div className="min-w-0">
          <h2 className="truncate text-base font-bold leading-tight text-v2-ink">{title}</h2>
          <p className="truncate text-xs leading-tight text-v2-muted">{sub}</p>
        </div>
        {dragging || drag?.phase === "settling" ? (
          <button
            ref={cancelRef}
            type="button"
            className={cn(
              "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-semibold text-v2-navy transition-colors",
              overCancel ? "bg-red-50 text-red-700 ring-2 ring-red-300" : "hover:bg-v2-bg-subtle",
            )}
            onClick={() => settle("cancel")}
          >
            <X className="h-4 w-4" aria-hidden />
            Cancel
          </button>
        ) : session.mode === "browse" ? (
          <button
            type="button"
            className="v2-btn-primary inline-flex min-h-11 shrink-0 items-center gap-1.5 px-5"
            onClick={() => leave(null)}
          >
            <X className="h-4 w-4" aria-hidden />
            Close
          </button>
        ) : null}
      </header>

      <div
        ref={scrollRef}
        className={cn("flex min-h-0 flex-1 p-3", layout.overflows && !dragging ? "overflow-y-auto overscroll-contain" : "overflow-hidden")}
      >
        <div
          ref={gridRef}
          role="listbox"
          aria-label="Arrange pages"
          aria-orientation="horizontal"
          className="relative m-auto shrink-0"
          style={{ width: ready ? layout.gridW : 0, height: ready ? layout.gridH : 0 }}
          onKeyDown={onKeyDown}
        >
          {ready
            ? items.map((item, i) => {
                const id = getId(item);
                const locked = i < lockedLeading;
                const isActive = drag?.id === id;
                const hidden = isActive && drag?.input === "pointer";
                const raised = isActive && drag?.input === "keyboard";
                const pos = tilePosition(displayIndex(id, i), layout);
                const small = layout.tileW < 64;
                const interactive = session.mode === "browse" && !locked && !drag;
                return (
                  <div
                    key={id}
                    ref={(el) => {
                      if (el) tileEls.current.set(id, el);
                      else tileEls.current.delete(id);
                    }}
                    role="option"
                    data-i={displayIndex(id, i)}
                    data-cx={pos.x + layout.tileW / 2}
                    data-cy={pos.y + layout.tileH / 2}
                    data-held={hidden ? "1" : undefined}
                    aria-selected={raised}
                    aria-label={`${Noun} ${(isActive ? drag.target : i) + 1}${locked ? ", fixed" : ""}`}
                    tabIndex={session.mode === "browse" && i === focusIdx ? 0 : -1}
                    className={cn(
                      "absolute left-0 top-0 select-none outline-none [-webkit-touch-callout:none] [-webkit-tap-highlight-color:transparent]",
                      "focus-visible:[&>div]:ring-2 focus-visible:[&>div]:ring-v2-primary focus-visible:[&>div]:ring-offset-2",
                      hidden && "pointer-events-none opacity-0",
                      interactive && "cursor-grab",
                      raised && "z-10",
                    )}
                    style={{
                      width: layout.tileW,
                      height: layout.tileH,
                      transform: `translate3d(${pos.x}px, ${pos.y}px, 0)`,
                      transition: tileTransition,
                      touchAction: touchLocked ? "none" : "pan-y",
                    }}
                    onPointerDown={session.mode === "browse" && !locked ? (e) => onTilePointerDown(e, id) : undefined}
                    onFocus={() => session.mode === "browse" && !drag && setFocusIdx(i)}
                  >
                    <div
                      className={cn(
                        "relative h-full w-full overflow-hidden border border-gray-200 bg-white shadow-sm transition-[box-shadow,transform] duration-150",
                        small ? "rounded-md" : "rounded-lg",
                        raised && "shadow-xl ring-2 ring-v2-primary",
                        flashId === id && "cm-arrange-flash",
                        isMuted?.(item) && "opacity-45",
                      )}
                    >
                      {renderThumb(item, "tile")}
                      {layout.tileW >= 40 ? (
                        <span className="pointer-events-none absolute bottom-1 left-1 rounded bg-slate-900/70 px-1 text-[10px] font-bold tabular-nums leading-4 text-white">
                          {displayIndex(id, i) + 1}
                        </span>
                      ) : null}
                      {locked ? (
                        <span className="pointer-events-none absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded bg-slate-900/70 text-white">
                          <Lock className="h-2.5 w-2.5" aria-hidden />
                        </span>
                      ) : null}
                    </div>
                  </div>
                );
              })
            : null}

        </div>
      </div>

      {drag?.input === "pointer" && activeItem ? (
        <div
          ref={loupeRef}
          aria-hidden
          className="pointer-events-none fixed left-0 top-0 z-10"
          style={{ width: loupeW, height: loupeH, willChange: "transform", transformOrigin: "center" }}
        >
          <div className="h-full w-full overflow-hidden rounded-xl bg-white shadow-2xl ring-2 ring-v2-primary">
            {renderThumb(activeItem, "loupe")}
          </div>
          <span className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full bg-v2-navy px-2.5 py-0.5 text-xs font-bold tabular-nums text-white shadow">
            {from} → {to}
          </span>
        </div>
      ) : null}

      <p className="sr-only" role="status" aria-live="polite">
        {announce}
      </p>
    </div>
  );
}
