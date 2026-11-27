"use client";

import Link from "next/link";
import { useRef, type KeyboardEvent, type ReactNode } from "react";
import {
  AlertOctagon,
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Info,
  Loader2,
  RefreshCw,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import type { Tone } from "@/components/v2/admin/format";

// --- Page structure -----------------------------------------------------------------------------

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between lg:gap-6">
      <div className="min-w-0">
        <h1 className="v2-brand-title text-2xl text-v2-ink lg:text-[1.75rem]">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-v2-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2 lg:justify-end">{actions}</div> : null}
    </header>
  );
}

export function Section({
  title,
  description,
  action,
  children,
  id,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  id?: string;
  className?: string;
}) {
  return (
    <section id={id} className={cn("min-w-0 scroll-mt-6", className)} aria-labelledby={id ? `${id}-title` : undefined}>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <h2 id={id ? `${id}-title` : undefined} className="text-base font-semibold text-v2-ink">
            {title}
          </h2>
          {description ? <p className="mt-0.5 max-w-3xl text-sm text-v2-muted">{description}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

/** "View all →" style link for a Section action. */
export function SectionLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 text-sm font-semibold text-v2-link hover:underline">
      {children}
      <ArrowRight className="h-3.5 w-3.5" aria-hidden />
    </Link>
  );
}

export function RefreshButton({ onClick, loading, label = "Refresh" }: { onClick: () => void; loading?: boolean; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="v2-hit inline-flex h-9 items-center gap-2 rounded-full border border-gray-200 bg-white px-3 text-sm font-semibold text-v2-navy transition hover:bg-v2-bg-subtle disabled:opacity-60"
    >
      <RefreshCw className={cn("h-4 w-4", loading && "animate-spin motion-reduce:animate-none")} aria-hidden />
      {label}
    </button>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
}) {
  return (
    <input
      type="search"
      aria-label={label}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="v2-input h-9 w-full py-0 text-sm sm:w-72"
    />
  );
}

export function PageLoading({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex min-h-[30vh] items-center justify-center text-v2-muted">
      <Loader2 className="h-7 w-7 animate-spin text-v2-primary motion-reduce:animate-none" aria-label={label} />
    </div>
  );
}

export function ErrorPanel({ children }: { children: ReactNode }) {
  return (
    <p className="v2-panel p-4 text-sm text-red-700" role="alert">
      {children}
    </p>
  );
}

// --- Numbers ------------------------------------------------------------------------------------

export function Sparkline({
  values,
  tone = "default",
  width = 96,
  height = 28,
}: {
  values: number[];
  tone?: "default" | "good" | "bad";
  width?: number;
  height?: number;
}) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [
    (i / (values.length - 1)) * (width - 4) + 2,
    height - 2 - ((v - min) / span) * (height - 4),
  ]);
  const color = tone === "good" ? "#047857" : tone === "bad" ? "#b91c1c" : "#303a4d";
  const last = pts[pts.length - 1];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden className="shrink-0">
      <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r={2.25} fill={color} />
    </svg>
  );
}

export type KpiDelta = {
  /** Raw change; its sign decides the arrow. */
  value: number;
  /** The change as shown, e.g. "+$88.00" or "+3". */
  text: string;
  goodWhen: "up" | "down" | "none";
  /** Defaults to "vs. previous period". */
  suffix?: string;
};

export function KpiTile({
  label,
  value,
  delta,
  sub,
  trend,
  tone = "default",
  href,
}: {
  label: string;
  value: string;
  delta?: KpiDelta | null;
  sub?: ReactNode;
  trend?: number[];
  tone?: "default" | "bad";
  href?: string;
}) {
  const direction = delta ? Math.sign(Math.round(delta.value * 100) / 100) : 0;
  const good = delta && delta.goodWhen !== "none" && direction !== 0 ? (delta.goodWhen === "up" ? direction > 0 : direction < 0) : null;
  const Arrow = direction > 0 ? ArrowUpRight : ArrowDownRight;
  const body = (
    <>
      <p className="text-sm font-medium text-v2-muted">{label}</p>
      {/* A narrow tile (both side columns open, phones) drops the sparkline under the number instead of overflowing. */}
      <div className="mt-1 flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
        <p
          className={cn(
            "min-w-0 whitespace-nowrap text-[1.75rem] font-semibold leading-tight tabular-nums",
            tone === "bad" ? "text-red-700" : "text-v2-ink",
          )}
        >
          {value}
        </p>
        {trend ? <Sparkline values={trend} tone={good === false ? "bad" : "default"} /> : null}
      </div>
      {delta ? (
        <p className="mt-1 flex flex-wrap items-center gap-x-1 text-xs tabular-nums text-v2-muted">
          <span
            className={cn(
              "inline-flex items-center gap-0.5 whitespace-nowrap font-semibold",
              good === true && "text-emerald-700",
              good === false && "text-red-700",
            )}
          >
            {direction !== 0 ? <Arrow className="h-3.5 w-3.5" aria-hidden /> : null}
            {delta.text}
          </span>
          <span>{delta.suffix ?? "vs. previous period"}</span>
        </p>
      ) : null}
      {sub ? <p className="mt-1 text-xs text-v2-muted">{sub}</p> : null}
    </>
  );
  if (href) {
    return (
      <Link href={href} className="v2-panel block min-w-0 p-5 transition hover:border-v2-primary/40">
        {body}
      </Link>
    );
  }
  return <div className="v2-panel min-w-0 p-5">{body}</div>;
}

export function KpiGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">{children}</div>;
}

export function DefinitionList({
  items,
  className,
}: {
  items: Array<{ label: ReactNode; value: ReactNode; note?: ReactNode; tone?: "default" | "bad" | "good" }>;
  className?: string;
}) {
  return (
    <dl className={cn("divide-y divide-gray-100", className)}>
      {items.map((item, i) => (
        <div key={i} className="flex items-start justify-between gap-4 py-2.5">
          <dt className="shrink-0 text-sm text-v2-navy">
            {item.label}
            {item.note ? <span className="block text-xs text-v2-muted">{item.note}</span> : null}
          </dt>
          <dd
            className={cn(
              "min-w-0 text-right text-sm font-semibold tabular-nums [overflow-wrap:anywhere]",
              item.tone === "bad" ? "text-red-700" : item.tone === "good" ? "text-emerald-700" : "text-v2-ink",
            )}
          >
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

// --- Status -------------------------------------------------------------------------------------

const PILL: Record<Tone, string> = {
  neutral: "bg-gray-100 text-gray-700",
  info: "bg-sky-50 text-sky-800",
  progress: "bg-v2-primary-light text-v2-primary-dark",
  good: "bg-v2-success-bg text-v2-success-text",
  warn: "bg-amber-50 text-amber-800",
  bad: "bg-red-50 text-red-700",
};

export function StatusPill({ tone, children, icon: Icon, className }: { tone: Tone; children: ReactNode; icon?: LucideIcon; className?: string }) {
  return (
    <span className={cn("inline-flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-xs font-semibold", PILL[tone], className)}>
      {Icon ? <Icon className="h-3.5 w-3.5" aria-hidden /> : null}
      {children}
    </span>
  );
}

type CalloutTone = "good" | "warning" | "critical" | "info";

const CALLOUT: Record<CalloutTone, { icon: LucideIcon; box: string; iconClass: string }> = {
  good: { icon: CheckCircle2, box: "border-v2-success-border bg-v2-success-bg text-v2-success-text", iconClass: "text-v2-success-text" },
  warning: { icon: AlertTriangle, box: "border-amber-200 bg-amber-50 text-amber-900", iconClass: "text-amber-600" },
  critical: { icon: AlertOctagon, box: "border-red-200 bg-red-50 text-red-900", iconClass: "text-red-600" },
  info: { icon: Info, box: "border-sky-200 bg-sky-50 text-sky-900", iconClass: "text-sky-700" },
};

export function Callout({ tone, title, children, className }: { tone: CalloutTone; title: ReactNode; children?: ReactNode; className?: string }) {
  const t = CALLOUT[tone];
  const Icon = t.icon;
  return (
    <div className={cn("flex items-start gap-3 rounded-xl border px-4 py-3", t.box, className)} role={tone === "critical" ? "alert" : "status"}>
      <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", t.iconClass)} aria-hidden />
      <div className="min-w-0 text-sm">
        <p className="font-semibold">{title}</p>
        {children ? <div className="mt-0.5 opacity-90">{children}</div> : null}
      </div>
    </div>
  );
}

export type AttentionItemData = {
  tone: "critical" | "warning" | "info";
  title: ReactNode;
  detail?: ReactNode;
  href?: string;
  /** Instead of a link, e.g. to open a drawer on the same page. */
  onClick?: () => void;
  actionLabel?: string;
};

const ATTENTION: Record<AttentionItemData["tone"], { icon: LucideIcon; bar: string; iconClass: string; rank: number; label: string }> = {
  critical: { icon: AlertOctagon, bar: "bg-red-600", iconClass: "text-red-600", rank: 0, label: "Critical" },
  warning: { icon: AlertTriangle, bar: "bg-amber-500", iconClass: "text-amber-600", rank: 1, label: "Watch" },
  info: { icon: Info, bar: "bg-sky-600", iconClass: "text-sky-700", rank: 2, label: "Note" },
};

export function AttentionList({ items, className }: { items: AttentionItemData[]; className?: string }) {
  const sorted = [...items].sort((a, b) => ATTENTION[a.tone].rank - ATTENTION[b.tone].rank);
  return (
    <ul className={cn("v2-panel divide-y divide-gray-100 overflow-hidden", className)}>
      {sorted.map((item, i) => {
        const t = ATTENTION[item.tone];
        const Icon = t.icon;
        const action = item.actionLabel ?? "Open";
        return (
          <li key={i} className="relative flex items-start gap-3 py-3 pl-5 pr-4">
            <span className={cn("absolute inset-y-0 left-0 w-[3px]", t.bar)} aria-hidden />
            <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", t.iconClass)} aria-label={t.label} />
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-semibold text-v2-ink">{item.title}</p>
              {item.detail ? <p className="mt-0.5 text-v2-muted">{item.detail}</p> : null}
            </div>
            {item.href ? (
              <Link href={item.href} className="shrink-0 self-center text-sm font-semibold text-v2-link hover:underline">
                {action} <span aria-hidden>→</span>
              </Link>
            ) : item.onClick ? (
              <button type="button" onClick={item.onClick} className="shrink-0 self-center text-sm font-semibold text-v2-link hover:underline">
                {action} <span aria-hidden>→</span>
              </button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function EmptyState({ icon: Icon, title, children, action }: { icon?: LucideIcon; title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      {Icon ? <Icon className="h-8 w-8 text-v2-muted" aria-hidden /> : null}
      <p className="mt-2 font-semibold text-v2-ink">{title}</p>
      {children ? <div className="mt-1 max-w-sm text-sm text-v2-muted">{children}</div> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

// --- Selection controls -------------------------------------------------------------------------

/** Move focus between sibling options with the arrow keys, Home and End. */
function useRovingKeys<T extends string>(ids: T[], value: T, onChange: (id: T) => void) {
  const refs = useRef(new Map<T, HTMLButtonElement | null>());
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    const i = ids.indexOf(value);
    let next = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (i + 1) % ids.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (i - 1 + ids.length) % ids.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = ids.length - 1;
    if (next < 0) return;
    e.preventDefault();
    onChange(ids[next]);
    refs.current.get(ids[next])?.focus();
  };
  return { refs, onKeyDown };
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: Array<{ id: T; label: string }>;
  value: T | null;
  onChange: (id: T) => void;
  ariaLabel: string;
}) {
  const ids = options.map((o) => o.id);
  const { refs, onKeyDown } = useRovingKeys(ids, value ?? ids[0], onChange);
  return (
    <div role="radiogroup" aria-label={ariaLabel} onKeyDown={onKeyDown} className="inline-flex max-w-full flex-wrap gap-0.5 rounded-lg bg-v2-bg-subtle p-1">
      {options.map((o) => {
        const selected = o.id === value;
        return (
          <button
            key={o.id}
            ref={(el) => {
              refs.current.set(o.id, el);
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected || (value == null && o.id === ids[0]) ? 0 : -1}
            onClick={() => onChange(o.id)}
            className={cn(
              "h-8 whitespace-nowrap rounded-md px-3 text-sm font-semibold transition-colors",
              selected ? "bg-white text-v2-ink shadow-sm" : "text-v2-muted hover:text-v2-ink",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  ariaLabel,
  idPrefix,
}: {
  tabs: Array<{ id: T; label: string; count?: number; tone?: "default" | "bad" }>;
  value: T;
  onChange: (id: T) => void;
  ariaLabel: string;
  /** Pairs each tab with its TabPanel. */
  idPrefix: string;
}) {
  const { refs, onKeyDown } = useRovingKeys(
    tabs.map((t) => t.id),
    value,
    onChange,
  );
  return (
    <div role="tablist" aria-label={ariaLabel} onKeyDown={onKeyDown} className="flex gap-6 overflow-x-auto border-b border-gray-200">
      {tabs.map((t) => {
        const selected = t.id === value;
        return (
          <button
            key={t.id}
            ref={(el) => {
              refs.current.set(t.id, el);
            }}
            id={`${idPrefix}-tab-${t.id}`}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={`${idPrefix}-panel-${t.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(t.id)}
            className={cn(
              "-mb-px inline-flex h-10 shrink-0 items-center gap-2 border-b-2 px-1 text-sm font-semibold transition-colors",
              selected ? "border-v2-primary text-v2-ink" : "border-transparent text-v2-muted hover:text-v2-ink",
            )}
          >
            {t.label}
            {t.count != null ? (
              <span
                className={cn(
                  "min-w-5 rounded-full px-1.5 text-center text-xs font-semibold tabular-nums",
                  t.tone === "bad" && t.count > 0 ? "bg-red-600 text-white" : "bg-gray-100 text-gray-700",
                )}
              >
                {t.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({ idPrefix, id, children, className }: { idPrefix: string; id: string; children: ReactNode; className?: string }) {
  return (
    <div role="tabpanel" id={`${idPrefix}-panel-${id}`} aria-labelledby={`${idPrefix}-tab-${id}`} tabIndex={0} className={cn("focus:outline-none", className)}>
      {children}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "v2-hit relative inline-flex h-6 w-10 shrink-0 items-center rounded-full border transition-colors disabled:opacity-60",
        checked ? "border-v2-primary bg-v2-primary" : "border-gray-300 bg-gray-200",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-transform motion-reduce:transition-none",
          checked ? "translate-x-[18px]" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

/** A `$` adornment around a right-aligned money field. */
export function MoneyInput({
  id,
  value,
  onChange,
  invalid,
  className,
  ariaLabel,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-v2-muted" aria-hidden>
        $
      </span>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn("v2-input pl-7 text-right tabular-nums", invalid && "border-red-300")}
      />
    </div>
  );
}
