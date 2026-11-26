"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, RotateCcw } from "lucide-react";
import { useAdminAlerts } from "@/components/v2/admin/AdminShell";
import { fullDateTime, relativeTime } from "@/components/v2/admin/format";
import { ALERT_TONE, alertHref } from "@/components/v2/admin/alerts/AdminAlertsColumn";
import { SOURCE_LABEL, type AdminAlert } from "@/components/v2/admin/alerts/adminAlerts";
import { EmptyState, PageHeader, PageLoading, RefreshButton, Section, StatusPill } from "@/components/v2/admin/ui";
import { cn } from "@/lib/cn";

function AlertList({ alerts, read }: { alerts: AdminAlert[]; read?: boolean }) {
  return (
    <ul className="v2-panel divide-y divide-gray-100 overflow-hidden">
      {alerts.map((a) => {
        const t = ALERT_TONE[a.tone];
        const Icon = t.icon;
        return (
          <li key={a.key}>
            <Link href={alertHref(a.key)} className="relative flex items-start gap-3 py-3 pl-5 pr-4 hover:bg-v2-bg-subtle">
              <span className={cn("absolute inset-y-0 left-0 w-[3px]", read ? "bg-gray-300" : t.bar)} aria-hidden />
              <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", read ? "text-v2-muted" : t.iconClass)} aria-label={t.label} />
              <span className="min-w-0 flex-1 text-sm">
                <span className="block text-xs text-v2-muted">
                  {SOURCE_LABEL[a.source]}
                  {a.at ? ` · ${relativeTime(a.at)}` : ""}
                </span>
                <span className={cn("block font-semibold", read ? "text-v2-muted" : "text-v2-ink")}>{a.title}</span>
                <span className="mt-0.5 block text-v2-muted">{a.summary}</span>
              </span>
              <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-v2-muted" aria-hidden />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Every open alert, unread first. The main view on phones, where the column is hidden. */
function AllAlerts() {
  const { alerts, unread, isRead, loading, errors, markRead, refreshAlerts } = useAdminAlerts();
  const read = alerts.filter((a) => isRead(a.key));
  return (
    <>
      <PageHeader
        title="Alerts"
        description="Everything across the admin pages that needs you. Mark an alert read to clear it; it comes back if the problem changes."
        actions={<RefreshButton onClick={refreshAlerts} loading={loading} />}
      />
      <div className="space-y-8">
        <Section
          title="Unread"
          action={
            unread.length > 1 ? (
              <button type="button" onClick={() => markRead(unread.map((a) => a.key))} className="text-sm font-semibold text-v2-link hover:underline">
                Mark all read
              </button>
            ) : null
          }
        >
          {unread.length ? (
            <AlertList alerts={unread} />
          ) : loading ? (
            <PageLoading label="Checking for alerts" />
          ) : (
            <div className="v2-panel">
              <EmptyState icon={CheckCircle2} title="You're all caught up." />
            </div>
          )}
        </Section>
        {read.length ? (
          <Section title="Read" description="Still open, but you've seen them.">
            <AlertList alerts={read} read />
          </Section>
        ) : null}
        {errors.length ? (
          <p className="text-sm text-red-700" role="alert">
            Some checks couldn&apos;t run: {errors.join("; ")}
          </p>
        ) : null}
      </div>
    </>
  );
}

function AlertDetail({ alertKey }: { alertKey: string }) {
  const { alerts, unread, isRead, markRead, markUnread, loading } = useAdminAlerts();
  const alert = alerts.find((a) => a.key === alertKey) ?? null;

  if (!alert) {
    if (loading) return <PageLoading label="Loading the alert" />;
    return (
      <div className="v2-panel">
        <EmptyState
          icon={CheckCircle2}
          title="This alert has cleared."
          action={
            <Link href="/admin/alerts" className="text-sm font-semibold text-v2-link hover:underline">
              See all alerts
            </Link>
          }
        >
          The problem behind it isn&apos;t open any more, or it changed and shows up as a new alert.
        </EmptyState>
      </div>
    );
  }

  const read = isRead(alert.key);
  const t = ALERT_TONE[alert.tone];
  const Icon = t.icon;
  const next = unread.find((a) => a.key !== alert.key) ?? null;

  return (
    <article aria-labelledby="alert-title" className="mx-auto max-w-3xl">
      <Link href="/admin/alerts" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-v2-muted hover:text-v2-ink xl:hidden">
        <ArrowLeft className="h-4 w-4" aria-hidden />
        All alerts
      </Link>

      <div className="v2-panel relative overflow-hidden p-6">
        <span className={cn("absolute inset-y-0 left-0 w-1", read ? "bg-gray-300" : t.bar)} aria-hidden />
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Icon className={cn("h-5 w-5", t.iconClass)} aria-hidden />
          <StatusPill tone={alert.tone === "critical" ? "bad" : "warn"}>{t.label}</StatusPill>
          <span className="font-semibold text-v2-muted">{SOURCE_LABEL[alert.source]}</span>
          {alert.at ? (
            <time dateTime={alert.at} title={fullDateTime(alert.at)} className="text-v2-muted">
              · {relativeTime(alert.at)}
            </time>
          ) : null}
          {read ? (
            <StatusPill tone="neutral" icon={Check} className="ml-auto">
              Read
            </StatusPill>
          ) : null}
        </div>

        <h1 id="alert-title" className="mt-3 text-xl font-bold text-v2-ink">
          {alert.title}
        </h1>

        <div className="mt-3 space-y-2 text-sm leading-relaxed text-v2-navy">
          {alert.body.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>

        {alert.facts.length ? (
          <dl className="mt-5 grid gap-x-6 gap-y-3 border-t border-gray-100 pt-5 text-sm sm:grid-cols-2">
            {alert.facts.map((f) => (
              <div key={f.label} className="min-w-0">
                <dt className="text-xs font-semibold uppercase tracking-wide text-v2-muted">{f.label}</dt>
                <dd className="mt-0.5 break-words text-v2-ink">{f.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Link href={alert.href} className="v2-btn-primary h-10 gap-2 py-0">
            {alert.actionLabel}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
          {read ? (
            <button type="button" onClick={() => markUnread(alert.key)} className="v2-btn-outline h-10 gap-2 py-0">
              <RotateCcw className="h-4 w-4" aria-hidden />
              Mark unread
            </button>
          ) : (
            <button type="button" onClick={() => markRead([alert.key])} className="v2-btn-outline h-10 gap-2 py-0">
              <Check className="h-4 w-4" aria-hidden />
              Mark as read
            </button>
          )}
          {next ? (
            <Link href={alertHref(next.key)} className="ml-auto inline-flex items-center gap-1 text-sm font-semibold text-v2-link hover:underline">
              Next alert <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function AdminAlertsScreen() {
  const params = useSearchParams();
  const key = params.get("alert");
  return key ? <AlertDetail alertKey={key} /> : <AllAlerts />;
}
