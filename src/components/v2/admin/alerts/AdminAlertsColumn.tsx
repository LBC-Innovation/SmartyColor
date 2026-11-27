"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { AlertOctagon, AlertTriangle, Bell, Check, CheckCircle2, PanelLeftClose, PanelLeftOpen, RefreshCw } from "lucide-react";
import { useAdminAlerts, useAdminPaneCollapsed } from "@/components/v2/admin/AdminShell";
import { relativeTime } from "@/components/v2/admin/format";
import { SOURCE_LABEL, type AdminAlert } from "@/components/v2/admin/alerts/adminAlerts";
import { cn } from "@/lib/cn";

export function alertHref(key: string): string {
  return `/admin/alerts?alert=${encodeURIComponent(key)}`;
}

export const ALERT_TONE = {
  critical: { icon: AlertOctagon, bar: "bg-red-600", iconClass: "text-red-600", label: "Critical" },
  warning: { icon: AlertTriangle, bar: "bg-amber-500", iconClass: "text-amber-600", label: "Watch" },
} as const;

function AlertRow({ alert, selected, onRead }: { alert: AdminAlert; selected: boolean; onRead: () => void }) {
  const t = ALERT_TONE[alert.tone];
  const Icon = t.icon;
  return (
    <li className="group relative">
      <Link
        href={alertHref(alert.key)}
        aria-current={selected ? "page" : undefined}
        className={cn(
          "relative flex gap-3 rounded-lg py-3 pl-4 pr-10 transition-colors",
          selected ? "bg-v2-primary-light" : "hover:bg-white",
        )}
      >
        <span className={cn("absolute inset-y-2 left-0 w-[3px] rounded-full", t.bar)} aria-hidden />
        <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", t.iconClass)} aria-label={t.label} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-xs text-v2-muted">
            <span className="font-semibold">{SOURCE_LABEL[alert.source]}</span>
            {alert.at ? (
              <>
                <span aria-hidden>·</span>
                <time dateTime={alert.at}>{relativeTime(alert.at)}</time>
              </>
            ) : null}
          </span>
          <span className={cn("mt-0.5 line-clamp-2 block text-sm font-semibold", selected ? "text-v2-primary" : "text-v2-ink")}>
            {alert.title}
          </span>
          <span className="mt-0.5 line-clamp-2 block text-xs text-v2-muted">{alert.summary}</span>
        </span>
      </Link>
      <button
        type="button"
        onClick={onRead}
        className="absolute right-2 top-2.5 inline-flex h-7 w-7 items-center justify-center rounded-md text-v2-muted opacity-60 transition hover:bg-v2-bg-subtle hover:text-v2-ink hover:opacity-100 focus-visible:opacity-100 group-hover:opacity-100"
        aria-label={`Mark read: ${alert.title}`}
        title="Mark as read"
      >
        <Check className="h-4 w-4" aria-hidden />
      </button>
    </li>
  );
}

function ColumnBody({ onCollapse }: { onCollapse: () => void }) {
  const { unread, alerts, loading, errors, markRead, refreshAlerts } = useAdminAlerts();
  const pathname = usePathname();
  const params = useSearchParams();
  const selectedKey = pathname === "/admin/alerts" ? params.get("alert") : null;
  const readCount = alerts.length - unread.length;

  return (
    <>
      <div className="flex items-center gap-2 px-4 pb-3 pt-5">
        <h2 className="v2-section-title">Alerts</h2>
        {unread.length ? (
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-[11px] font-bold tabular-nums text-white">
            {unread.length}
          </span>
        ) : null}
        <button
          type="button"
          onClick={refreshAlerts}
          className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-md text-v2-muted hover:bg-white hover:text-v2-ink"
          aria-label="Check for new alerts"
          title="Check for new alerts"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin motion-reduce:animate-none")} aria-hidden />
        </button>
        <button
          type="button"
          onClick={onCollapse}
          aria-expanded
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-v2-muted hover:bg-white hover:text-v2-ink"
          aria-label="Collapse alerts"
          title="Collapse alerts"
        >
          <PanelLeftClose className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-2">
        {unread.length ? (
          <ul className="space-y-0.5" aria-label="Unread alerts">
            {unread.map((a) => (
              <AlertRow key={a.key} alert={a} selected={a.key === selectedKey} onRead={() => markRead([a.key])} />
            ))}
          </ul>
        ) : loading ? (
          <div className="space-y-2 px-2" aria-hidden>
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 rounded-lg bg-white/70 motion-safe:animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center px-4 py-10 text-center">
            <CheckCircle2 className="h-7 w-7 text-v2-success-text" aria-hidden />
            <p className="mt-2 text-sm font-semibold text-v2-ink">You&apos;re all caught up.</p>
            <p className="mt-0.5 text-xs text-v2-muted">New problems show up here.</p>
          </div>
        )}
        {errors.length ? (
          <p className="px-3 py-2 text-xs text-red-700" role="alert">
            Couldn&apos;t check {errors.join("; ")}
          </p>
        ) : null}
      </div>

      <div className="flex items-center gap-3 border-t border-gray-200 px-4 py-3 text-xs font-semibold">
        <Link href="/admin/alerts" className="text-v2-link hover:underline">
          {readCount ? `All alerts (${readCount} read)` : "All alerts"}
        </Link>
        {unread.length > 1 ? (
          <button type="button" onClick={() => markRead(unread.map((a) => a.key))} className="ml-auto text-v2-muted hover:text-v2-ink">
            Mark all read
          </button>
        ) : null}
      </div>
    </>
  );
}

/** The collapsed column: a thin rail with the unread count; clicking anywhere on it opens the column again. */
function AlertsRail({ onExpand }: { onExpand: () => void }) {
  const { unread } = useAdminAlerts();
  const critical = unread.some((a) => a.tone === "critical");
  const n = unread.length;
  return (
    <button
      type="button"
      onClick={onExpand}
      aria-expanded={false}
      aria-label={n ? `Expand alerts, ${n} unread` : "Expand alerts"}
      title="Expand alerts"
      className="group flex flex-1 flex-col items-center gap-3 pt-5 text-v2-muted hover:bg-white/60 hover:text-v2-ink"
    >
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-md group-hover:bg-white">
        <PanelLeftOpen className="h-4 w-4" aria-hidden />
      </span>
      <span className="relative inline-flex h-8 w-8 items-center justify-center">
        <Bell className="h-4 w-4" aria-hidden />
        {n ? (
          <span
            className={cn(
              "absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold tabular-nums text-white",
              critical ? "bg-red-600" : "bg-amber-500",
            )}
            aria-hidden
          >
            {n}
          </span>
        ) : null}
      </span>
      <span className="text-[11px] font-semibold uppercase tracking-wider [writing-mode:vertical-rl]">Alerts</span>
    </button>
  );
}

/** The unread alerts, between the admin nav and the page, on wide screens. Collapses to a rail. */
export function AdminAlertsColumn() {
  const [collapsed, setCollapsed] = useAdminPaneCollapsed("alerts");
  return (
    <aside
      aria-label="Alerts"
      className={cn("hidden shrink-0 flex-col border-r border-gray-200 bg-v2-bg-subtle xl:flex", collapsed ? "w-12" : "w-80")}
    >
      {collapsed ? (
        <AlertsRail onExpand={() => setCollapsed(false)} />
      ) : (
        <Suspense fallback={null}>
          <ColumnBody onCollapse={() => setCollapsed(true)} />
        </Suspense>
      )}
    </aside>
  );
}
