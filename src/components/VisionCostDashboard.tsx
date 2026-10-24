"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import type {
  VisionCostSessionSnapshot,
  VisionErrorKind,
} from "@/lib/visionCost/types";
import type { VisionPersistedSummary, VisionPeriodTotals } from "@/lib/visionCost/store";
import { authedFetch } from "@/lib/api/client";

type ApiPayload = VisionCostSessionSnapshot & { logTail: string; persisted?: VisionPersistedSummary };

const PERIODS: Array<{ key: keyof VisionPersistedSummary["periods"]; label: string }> = [
  { key: "today", label: "Today" },
  { key: "last7d", label: "Last 7 days" },
  { key: "last30d", label: "Last 30 days" },
  { key: "allTime", label: "All time" },
];

function usd(n: number) {
  return `$${n.toFixed(4)}`;
}

/** Persisted rows carry the user; in-memory session rows don't. */
function userLabel(event: object) {
  if (!("userId" in event)) return "—";
  const { userId, userEmail } = event as { userId: string | null; userEmail?: string | null };
  if (userEmail) return userEmail;
  return userId ? userId.slice(0, 8) : "Guest";
}

const ERROR_KIND_LABEL: Record<VisionErrorKind, string> = {
  billing: "Billing",
  quota: "Quota",
  auth: "Auth",
  safety: "Safety",
  other: "Error",
};

const ERROR_KIND_BADGE: Record<VisionErrorKind, string> = {
  billing: "v2-badge--danger",
  quota: "v2-badge--warn",
  auth: "v2-badge--danger",
  safety: "v2-badge--warn",
  other: "bg-gray-100 text-gray-700 border border-gray-200",
};

type VisionCostDashboardProps = {
  variant?: "default" | "v2";
};

export function VisionCostDashboard({
  variant = "default",
}: VisionCostDashboardProps) {
  const isV2 = variant === "v2";
  const [data, setData] = useState<ApiPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [periodKey, setPeriodKey] = useState<keyof VisionPersistedSummary["periods"]>("last30d");

  const load = useCallback(async () => {
    try {
      const response = await authedFetch("/api/vision-costs", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Could not load costs (${response.status})`);
      }
      const json = (await response.json()) as ApiPayload;
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 4000);
    return () => window.clearInterval(timer);
  }, [load]);

  if (error && !data) {
    return (
      <p
        className={cn(
          "text-lg text-red-700",
          isV2 ? "mt-4" : "mt-8 font-body",
        )}
        role="alert"
      >
        {error}
      </p>
    );
  }

  if (!data) {
    return (
      <p
        className={cn(
          isV2 ? "mt-4 text-v2-muted" : "mt-8 font-body text-lg text-ink-soft",
        )}
      >
        Loading session…
      </p>
    );
  }

  const sectionClass = isV2
    ? "v2-panel p-5 sm:p-6"
    : "rounded-2xl border border-ink/10 bg-white/70 p-6 shadow-sm";
  const headingClass = isV2
    ? "text-lg font-semibold text-slate-900 sm:text-xl"
    : "font-display text-2xl font-bold";
  const labelClass = isV2 ? "text-v2-muted" : "text-ink-soft";
  const bodyClass = isV2 ? "text-sm sm:text-base" : "font-body text-base";
  const statClass = isV2
    ? "text-2xl font-bold text-slate-900"
    : "text-2xl font-display";
  const rateItemClass = isV2
    ? "rounded-lg border border-slate-200/80 bg-v2-bg-subtle px-4 py-3"
    : "rounded-xl border border-ink/5 bg-cream/80 px-4 py-3";

  const persisted = data.persisted;
  const errors = persisted?.available ? persisted.recentErrors : (data.errors ?? []);
  const blockingError = [...errors]
    .sort((a, b) => a.at.localeCompare(b.at))
    .reverse()
    .find((e) => e.kind === "billing" || e.kind === "auth");
  const period: VisionPeriodTotals | null = persisted?.available ? persisted.periods[periodKey] : null;

  return (
    <div className={cn("space-y-6 sm:space-y-8", !isV2 && "mt-8 space-y-10")}>
      {blockingError ? (
        <div
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
          role="alert"
        >
          <p className="font-semibold">
            {ERROR_KIND_LABEL[blockingError.kind]} problem with the Gemini API
          </p>
          <p className="mt-1 break-words">{blockingError.message}</p>
          <p className="mt-1 text-xs text-red-800/80">
            Last seen {new Date(blockingError.at).toLocaleString()} ·{" "}
            {errors.length} error{errors.length === 1 ? "" : "s"} this session
          </p>
        </div>
      ) : null}

      {persisted?.available ? (
        <>
          <section className={sectionClass}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className={headingClass}>Spend</h2>
              <div className="inline-flex rounded-lg border border-gray-200 bg-v2-bg-subtle p-0.5" role="group" aria-label="Period">
                {PERIODS.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    aria-pressed={periodKey === p.key}
                    onClick={() => setPeriodKey(p.key)}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-xs font-semibold transition sm:text-sm",
                      periodKey === p.key ? "bg-white text-v2-primary shadow-sm" : "text-v2-muted hover:text-v2-ink",
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <dl className={cn("mt-4 grid gap-3 sm:grid-cols-4", bodyClass)}>
              <div>
                <dt className={labelClass}>Total cost</dt>
                <dd className={cn(statClass, "text-v2-success-text")}>{usd(period!.totalCostUsd)}</dd>
              </div>
              <div>
                <dt className={labelClass}>API calls</dt>
                <dd className={statClass}>
                  {period!.callCount}
                  {period!.errorCount > 0 ? (
                    <span className="ml-2 text-base font-semibold text-red-700">{period!.errorCount} failed</span>
                  ) : null}
                </dd>
              </div>
              <div>
                <dt className={labelClass}>Input tokens</dt>
                <dd className={statClass}>{period!.inputTokens.toLocaleString()}</dd>
              </div>
              <div>
                <dt className={labelClass}>Output tokens</dt>
                <dd className={statClass}>{period!.outputTokens.toLocaleString()}</dd>
              </div>
            </dl>
            <p className={cn("mt-3 text-xs", labelClass)}>
              Input {usd(period!.inputCostUsd)} · output {usd(period!.outputCostUsd)}. Persisted across every
              server instance; this is the number to trust on Vercel.
            </p>
            {persisted.byOperation.length > 0 ? (
              <div className="mt-4 overflow-x-auto">
                <table className={cn("min-w-full border-collapse text-sm", bodyClass)}>
                  <thead>
                    <tr className={cn("border-b text-left", isV2 ? "border-slate-200 text-v2-muted" : "border-ink/10 text-ink-soft")}>
                      <th className="py-2 pr-4">Operation (30 days)</th>
                      <th className="py-2 pr-4">Calls</th>
                      <th className="py-2 pr-4">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {persisted.byOperation.map((row) => (
                      <tr key={row.operation} className={isV2 ? "border-b border-slate-100" : "border-b border-ink/5"}>
                        <td className="py-2 pr-4">{row.operation}</td>
                        <td className="py-2 pr-4 tabular-nums">{row.callCount}</td>
                        <td className="py-2 pr-4 tabular-nums">{usd(row.totalCostUsd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>
        </>
      ) : (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="status">
          Persistent cost history isn&apos;t available (database not configured). Showing this server instance only.
        </div>
      )}

      <section className={sectionClass}>
        <h2 className={headingClass}>This server instance</h2>
        <p className={cn("mt-1 text-xs", labelClass)}>
          In-memory, per instance. On Vercel this resets on every cold start — use Spend above.
        </p>
        <dl className={cn("mt-4 grid gap-3 sm:grid-cols-2", bodyClass)}>
          <div>
            <dt className={labelClass}>Session ID</dt>
            <dd className="font-mono text-sm">{data.sessionId}</dd>
          </div>
          <div>
            <dt className={labelClass}>Started</dt>
            <dd>{new Date(data.startedAt).toLocaleString()}</dd>
          </div>
          <div>
            <dt className={labelClass}>Rates checked</dt>
            <dd>
              {data.ratesFetchedAt
                ? new Date(data.ratesFetchedAt).toLocaleString()
                : "Pending"}
            </dd>
          </div>
          <div>
            <dt className={labelClass}>Rates source</dt>
            <dd className="break-all">{data.ratesSource ?? "—"}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className={labelClass}>Log file</dt>
            <dd className="font-mono text-sm">{data.logFilePath}</dd>
          </div>
        </dl>
      </section>

      <section className={sectionClass}>
        <h2 className={headingClass}>Rates (USD / 1M tokens)</h2>
        <ul className={cn("mt-4 space-y-3", bodyClass)}>
          {data.modelRates.map((rate) => (
            <li key={rate.modelId} className={rateItemClass}>
              <p className="font-mono text-sm font-semibold">{rate.modelId}</p>
              <p className={cn("mt-1", labelClass)}>
                Input {usd(rate.inputUsdPerMTok)} · Text output{" "}
                {usd(rate.outputTextUsdPerMTok)}
                {rate.outputImageUsdPerMTok != null
                  ? ` · Image output ${usd(rate.outputImageUsdPerMTok)}`
                  : null}{" "}
                ·{" "}
                <span className={isV2 ? "text-slate-700" : "text-ink"}>
                  {rate.source}
                </span>
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className={sectionClass}>
        <h2 className={headingClass}>Session totals</h2>
        <dl className={cn("mt-4 grid gap-3 sm:grid-cols-3", bodyClass)}>
          <div>
            <dt className={labelClass}>API calls</dt>
            <dd className={statClass}>
              {data.totals.callCount}
              {data.totals.errorCount > 0 ? (
                <span className="ml-2 text-base font-semibold text-red-700">
                  {data.totals.errorCount} failed
                </span>
              ) : null}
            </dd>
          </div>
          <div>
            <dt className={labelClass}>Input tokens</dt>
            <dd className={statClass}>
              {data.totals.inputTokens.toLocaleString()}
            </dd>
          </div>
          <div>
            <dt className={labelClass}>Output tokens</dt>
            <dd className={statClass}>
              {data.totals.outputTokens.toLocaleString()}
            </dd>
          </div>
          <div>
            <dt className={labelClass}>Input cost</dt>
            <dd>{usd(data.totals.inputCostUsd)}</dd>
          </div>
          <div>
            <dt className={labelClass}>Output cost</dt>
            <dd>{usd(data.totals.outputCostUsd)}</dd>
          </div>
          <div>
            <dt className={labelClass}>Total cost</dt>
            <dd className={cn(statClass, isV2 ? "text-v2-success-text" : "text-like")}>
              {usd(data.totals.totalCostUsd)}
            </dd>
          </div>
        </dl>
      </section>

      <section className={sectionClass}>
        <h2 className={headingClass}>Errors</h2>
        {errors.length === 0 ? (
          <p className={cn("mt-4", labelClass)}>
            No failed vision API calls this session.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className={cn("min-w-full border-collapse text-sm", bodyClass)}>
              <thead>
                <tr className={cn("border-b text-left", isV2 ? "border-slate-200 text-v2-muted" : "border-ink/10 text-ink-soft")}>
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">User</th>
                  <th className="py-2 pr-4">Type</th>
                  <th className="py-2 pr-4">Operation</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Message</th>
                </tr>
              </thead>
              <tbody>
                {[...errors].reverse().map((event) => (
                  <tr
                    key={event.id}
                    className={isV2 ? "border-b border-slate-100 align-top" : "border-b border-ink/5 align-top"}
                  >
                    <td className="py-2 pr-4 whitespace-nowrap">
                      {new Date(event.at).toLocaleString()}
                    </td>
                    <td className="py-2 pr-4 whitespace-nowrap">{userLabel(event)}</td>
                    <td className="py-2 pr-4">
                      <span className={cn("v2-badge", ERROR_KIND_BADGE[event.kind])}>
                        {ERROR_KIND_LABEL[event.kind]}
                      </span>
                    </td>
                    <td className="py-2 pr-4 whitespace-nowrap">{event.operation}</td>
                    <td className="py-2 pr-4 tabular-nums">{event.httpStatus ?? "—"}</td>
                    <td className="min-w-[20rem] py-2 pr-4 break-words">{event.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={sectionClass}>
        <h2 className={headingClass}>Interactions</h2>
        {(persisted?.available ? persisted.recentEvents : data.events).length === 0 ? (
          <p className={cn("mt-4", labelClass)}>
            No vision API calls yet this session. Generate a photo coloring sheet
            to see entries here.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className={cn("min-w-full border-collapse text-sm", bodyClass)}>
              <thead>
                <tr className={cn("border-b text-left", isV2 ? "border-slate-200 text-v2-muted" : "border-ink/10 text-ink-soft")}>
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">User</th>
                  <th className="py-2 pr-4">Operation</th>
                  <th className="py-2 pr-4">Model</th>
                  <th className="py-2 pr-4">In</th>
                  <th className="py-2 pr-4">Out</th>
                  <th className="py-2 pr-4">Cost</th>
                </tr>
              </thead>
              <tbody>
                {(persisted?.available ? persisted.recentEvents : [...data.events].reverse()).map((event) => (
                  <tr
                    key={event.id}
                    className={isV2 ? "border-b border-slate-100" : "border-b border-ink/5"}
                  >
                    <td className="py-2 pr-4 whitespace-nowrap">
                      {new Date(event.at).toLocaleString()}
                    </td>
                    <td className="py-2 pr-4 whitespace-nowrap">{userLabel(event)}</td>
                    <td className="py-2 pr-4">{event.operation}</td>
                    <td className="py-2 pr-4 font-mono text-xs">
                      {event.modelId}
                    </td>
                    <td className="py-2 pr-4">{event.inputTokens}</td>
                    <td className="py-2 pr-4">{event.outputTokens}</td>
                    <td className="py-2 pr-4">{usd(event.totalCostUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section
        className={
          isV2
            ? "rounded-xl border border-slate-800 bg-slate-900 p-4 shadow-sm"
            : "rounded-2xl border border-ink/10 bg-ink p-4 shadow-sm"
        }
      >
        <h2
          className={
            isV2
              ? "text-lg font-semibold text-slate-100"
              : "font-display text-xl font-bold text-cream"
          }
        >
          Log tail
        </h2>
        <pre className="mt-3 max-h-96 overflow-auto font-mono text-xs leading-relaxed text-slate-300 whitespace-pre-wrap">
          {data.logTail || "(empty)"}
        </pre>
      </section>

      {error ? (
        <p className="text-sm text-red-700" role="status">
          Refresh issue: {error}
        </p>
      ) : null}
    </div>
  );
}
